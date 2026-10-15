// Transaction-isolated database integration tests. Provider proofs are explicit
// stubs, NEVER live payment evidence. Every fixture/write rolls back in finally.
// DATABASE_URL is preferred; optional --pooler=... uses the local credentials file.
import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import assert from "node:assert/strict";
import pg from "pg";

const flag = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const host = flag("pooler", "");
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i=l.indexOf("="); return [l.slice(0,i),l.slice(i+1).replace(/^"|"$/g, "")]; }));
const project = new URL(env.SUPABASE_URL).hostname.split(".")[0];
let config = process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : null;
if (!config && host) {
  const password = fs.readFileSync("../credentials.txt", "utf8").match(/supabase\s*\npassword\s+(\S+)/i)?.[1];
  config = { host, port: 5432, user: `postgres.${project}`, password, database: "postgres" };
}
if (!config) throw new Error("Set DATABASE_URL or --pooler with your project connection host.");
const db = new pg.Client({ ...config, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
const results = [];
const test = async (name, fn) => {
  await db.query("savepoint test_case");
  try { await fn(); results.push({ name, status: "pass" }); console.log(`PASS ${name}`); }
  catch (e) { await db.query("rollback to savepoint test_case"); results.push({ name, status: "fail", reason: e.message }); console.log(`FAIL ${name}: ${e.message}`); }
  finally { await db.query("release savepoint test_case"); }
};
const parameters = args => args.map(value => Array.isArray(value) ? JSON.stringify(value) : value);
const scalar = async (sql, args = []) => Object.values((await db.query(sql, parameters(args))).rows[0])[0];
const rejects = async (sql, args, pattern) => {
  await db.query("savepoint expected_rejection");
  let error;
  try { await db.query(sql, parameters(args)); } catch (e) { error = e; }
  await db.query("rollback to savepoint expected_rejection");
  await db.query("release savepoint expected_rejection");
  assert.ok(error && pattern.test(error.message), error?.message ?? "operation unexpectedly succeeded");
};
const fixture = async scenario => {
  const request = await scalar("select create_demo_fixture($1,$2)", [scenario, randomUUID()]);
  const scope = await scalar("select fixture_id from buyer_requests where id=$1", [request]);
  const lots = (await db.query("select * from suppliers where fixture_id=$1 order by min_price,id", [scope])).rows;
  const quote = await scalar(`insert into quote_revisions(request_id,version,per_kg,total_minor,usd_minor,fx,delivery_deadline,expires_at,snapshot)
   values($1,1,7.8,7800000,162500,'{}',current_date+7,now()+interval '30 minutes','{"clearing":7.5}') returning id`, [request]);
  const deal = await scalar("select accept_quote_contract($1,$2)", [quote, request]);
  return { request, scope, lots, quote, deal };
};
const payStub = async f => {
  const claim = await scalar("select claim_payment_attempt($1)", [f.deal.id]);
  const a = claim.attempt;
  const order = `TEST-STUB-${a.id}`;
  await db.query("update payment_attempts set status='created',provider_order_id=$1 where id=$2", [order, a.id]);
  const proof = { status: "COMPLETED", amount: "1625.00", currency: "USD", captureId: `TEST-STUB-${randomUUID()}`, orderId: order, payee: "test-stub@example.invalid" };
  await scalar("select record_verified_capture($1,$2)", [a.id, proof]);
  return { a, proof };
};
const reserve = async (f, lots, attempt=1, key=randomUUID()) => scalar("select reserve_paid_plan($1,$2,$3,$4,$5)", [f.deal.id, f.request, attempt, key, lots.map(s => ({ supplier_id: s.id, kg: Number(s.quantity_kg), cost: Number(s.quantity_kg) * Number(s.min_price) }))]);
const inspect = async (a, failed=false, weight=Number(a.allocated_kg), key=randomUUID()) => {
  const input = { weight_received_kg: weight, moisture_pct: failed ? 25 : 10, visual_score: 5, condition: "Good" };
  const decision = { decision: failed ? "failed" : "passed", grade: failed ? null : "A", usable_kg: failed ? 0 : Math.min(weight, Number(a.allocated_kg)) };
  return scalar("select record_lot_inspection($1,$2,$3,$4)", [a.id, input, decision, key]);
};
let rolledBack = false;
await db.connect();
try {
  await db.query("begin");
  if (process.argv.includes("--with-migrations")) {
    for (const file of fs.readdirSync("supabase/migrations").filter(f => /^(011|012|013|014|015|016|017)_/.test(f)).sort()) {
      await db.query(fs.readFileSync(path.join("supabase/migrations",file),"utf8"));
    }
  }
  const f = await fixture("recovery");
  const g = await fixture("refund");
  await test("Fixtures isolate stock and keep baseline math", async () => {
    assert.equal(f.lots.filter(s => !s.backup_only).reduce((n,s) => n+Number(s.quantity_kg),0),10000);
    assert.equal(f.lots.filter(s => s.backup_only).reduce((n,s) => n+Number(s.quantity_kg),0),2000);
    assert.equal(Number(f.deal.total_price),78000); assert.equal(Number(f.deal.supplier_cost),75000);
    assert.equal(g.lots.length,3);
  });
  await test("Database refuses unpaid incident without side effects", async () => {
    await rejects("select open_paid_shortage($1,$2)",[f.deal.id,randomUUID()],/paid verification/);
    assert.equal(await scalar("select count(*)::int from shortage_incidents where deal_id=$1",[f.deal.id]),0);
  });
  await test("Database refuses unpaid reservations", () => rejects("select reserve_paid_plan($1,$2,1,$3,$4)", [f.deal.id,f.request,randomUUID(),[]], /paid verification/));
  await test("Accepted contract replay returns same deal", async () => assert.equal((await scalar("select accept_quote_contract($1,$2)",[f.quote,f.request])).id,f.deal.id));
  const paid = await payStub(f);
  await test("Verified capture replay creates one receipt", async () => {
    await scalar("select record_verified_capture($1,$2)",[paid.a.id,paid.proof]);
    assert.equal(await scalar("select count(*)::int from ledger_entries where deal_id=$1 and kind='capture_receipt'",[f.deal.id]),1);
  });
  await test("Cross-fixture stock cannot satisfy paid order", () => rejects("select reserve_paid_plan($1,$2,1,$3,$4)",[f.deal.id,f.request,randomUUID(),g.lots.map(s=>({supplier_id:s.id,kg:Number(s.quantity_kg),cost:Number(s.quantity_kg)*Number(s.min_price)}))],/ineligible/));
  await test("Reservation rejects duplicate lots before writing", () => rejects("select reserve_paid_plan($1,$2,1,$3,$4)",[f.deal.id,f.request,randomUUID(),[{supplier_id:f.lots[0].id,kg:5000,cost:35000},{supplier_id:f.lots[0].id,kg:5000,cost:35000}]],/duplicate/));
  await test("Paid initial reservation succeeds and replays once", async () => {
    const key=randomUUID();await reserve(f,f.lots.filter(s=>!s.backup_only),1,key);
    assert.equal((await reserve(f,f.lots.filter(s=>!s.backup_only),1,key)).replayed,true);
    assert.equal(await scalar("select count(*)::int from allocations where deal_id=$1",[f.deal.id]),3);
  });
  await test("Recovery waits for completed inspections", () => rejects("select open_paid_shortage($1,$2)",[f.deal.id,randomUUID()],/inspect all/));
  const allocations=(await db.query("select * from allocations where deal_id=$1 order by allocated_kg",[f.deal.id])).rows;
  await test("Short received lot cannot masquerade as full coverage", async () => {
    await db.query("savepoint short_weight");
    await inspect(allocations[0],false,1900);
    for(const a of allocations.slice(1)) await inspect(a);
    await rejects("select complete_deal_phase($1,'settle')",[f.deal.id],/shortage/);
    assert.equal(Number(await scalar("select usable_kg from allocations where id=$1",[allocations[0].id])),1900);
    await db.query("rollback to savepoint short_weight");
  });
  await test("Reject 2T, accept 8T, quarantine rejected supplier", async () => {
    await inspect(allocations[0],true);
    for(const a of allocations.slice(1)) await inspect(a);
    assert.equal(await scalar("select quarantined from suppliers where id=$1",[allocations[0].supplier_id]),true);
    assert.equal(Number(await scalar("select sum(usable_kg) from allocations where deal_id=$1",[f.deal.id])),8000);
  });
  await test("Inspecting a final lot with a fresh key is rejected", () => rejects("select record_lot_inspection($1,$2,$3,$4)",[allocations[0].id,{weight_received_kg:2000,moisture_pct:10,visual_score:5,condition:'Good'},{decision:'passed',grade:'A',usable_kg:2000},randomUUID()],/locked/));
  await test("Settlement and handover refuse shortage", async () => {
    await rejects("select complete_deal_phase($1,'settle')",[f.deal.id],/shortage/);
    await rejects("select complete_deal_phase($1,'handover')",[f.deal.id],/shortage/);
  });
  const opened=await scalar("select open_paid_shortage($1,$2)",[f.deal.id,randomUUID()]);
  const incident=opened.incident.id;
  await test("Replacement uses real request binding and standby lot", async () => {
    const backup=f.lots.find(s=>s.backup_only);
    const key=randomUUID();
    const plan={id:'cost-first',items:[{supplier_id:backup.id,kg:2000,rate:Number(backup.min_price)}],total_kg:2000,cost_total:2000*Number(backup.min_price)};
    await scalar("select commit_recovery_plan($1,$2,$3,$4)",[incident,plan,'TEST-STUB-MODEL',key]);
    assert.equal((await scalar("select commit_recovery_plan($1,$2,$3,$4)",[incident,plan,'TEST-STUB-MODEL',key])).replayed,true);
    assert.equal((await scalar("select open_paid_shortage($1,$2)",[f.deal.id,randomUUID()])).replayed,true);
    const a=(await db.query("select * from allocations where deal_id=$1 and attempt=2",[f.deal.id])).rows[0];
    await inspect(a);
    assert.equal(await scalar("select status from shortage_incidents where id=$1",[incident]),'resolved');
    assert.equal(Number(await scalar("select sum(usable_kg) from allocations where deal_id=$1",[f.deal.id])),10000);
  });
  await test("Settlement and handover complete once after recovery", async () => {
    await scalar("select complete_deal_phase($1,'settle')",[f.deal.id]);
    await scalar("select complete_deal_phase($1,'settle')",[f.deal.id]);
    await scalar("select complete_deal_phase($1,'handover')",[f.deal.id]);
    await scalar("select complete_deal_phase($1,'handover')",[f.deal.id]);
    assert.equal(await scalar("select outcome from deals where id=$1",[f.deal.id]),'fulfilled');
    assert.equal(await scalar("select count(*)::int from deal_events where deal_id=$1 and type='handover_simulated'",[f.deal.id]),1);
    assert.equal(Number(await scalar("select sum(usable_kg)*7.5 from allocations where deal_id=$1",[f.deal.id])),75000);
  });
  await payStub(g);
  await db.query("insert into shortage_incidents(deal_id,missing_kg,status) values($1,2000,'refund_eligible')",[g.deal.id]);
  await test("Refund cap preserves one operation across retries", async () => {
    const one=await scalar("select claim_full_refund($1,'test stub')",[g.deal.id]);
    const two=await scalar("select claim_full_refund($1,'different retry')",[g.deal.id]);
    assert.equal(one.claimed,true);assert.equal(two.claimed,false);assert.equal(one.refund.id,two.refund.id);assert.equal(Number(one.refund.usd_minor),162500);
    await scalar("select record_provider_refund($1,'TEST-STUB-REFUND','PENDING')",[one.refund.id]);
    assert.equal(await scalar("select count(*)::int from ledger_entries where deal_id=$1 and kind='refund'",[g.deal.id]),0);
    await scalar("select record_provider_refund($1,'TEST-STUB-REFUND','COMPLETED')",[one.refund.id]);
    await scalar("select record_provider_refund($1,'TEST-STUB-REFUND','COMPLETED')",[one.refund.id]);
    assert.equal(await scalar("select count(*)::int from ledger_entries where deal_id=$1 and kind='refund'",[g.deal.id]),1);
    assert.equal(await scalar("select outcome from deals where id=$1",[g.deal.id]),'refunded');
  });
  await test("Refunded and fulfilled orders cannot reserve more stock", async () => {
    await rejects("select reserve_paid_plan($1,$2,2,$3,$4)",[g.deal.id,g.request,randomUUID(),[{supplier_id:g.lots[0].id,kg:2000,cost:14000}]],/no longer procurable/);
    await rejects("select reserve_paid_plan($1,$2,3,$3,$4)",[f.deal.id,f.request,randomUUID(),[{supplier_id:f.lots[0].id,kg:2000,cost:14000}]],/no longer procurable/);
  });
  await test("AI lease permits one worker and resumes paused runs", async () => {
    const id=await scalar("insert into agent_runs(request_id) values($1) returning id",[g.request]);
    assert.equal((await scalar("select claim_agent_run($1)",[id])).claimed,true);
    assert.equal((await scalar("select claim_agent_run($1)",[id])).claimed,false);
    await db.query("update agent_runs set status='paused' where id=$1",[id]);
    const retry=await scalar("select claim_agent_run($1)",[id]);assert.equal(retry.claimed,true);assert.equal(retry.run.attempts,2);
  });
  if (process.argv.includes("--release") || process.argv.includes("--with-migrations")) {

  // 2.x release gates. All provider/model values below are explicit TEST-STUB
  // evidence in this transaction; no positive live-provider claim is made.
  const boundFixture = async (overrides={}) => {
    const f=await fixture("happy-path");
    const req=(await db.query("select * from buyer_requests where id=$1",[f.request])).rows[0];
    const snap=await scalar("insert into planning_snapshots(request_id,spec_hash,snapshot) values($1,'TEST-STUB-SPEC',$2) returning id",[f.request,{
      crop:req.crop,quantity_kg:req.quantity_kg,delivery_days:req.delivery_days,max_price:Number(req.max_price),pool:req.pool,fixture_id:req.fixture_id
    }]);
    const items=f.lots.map(s=>({supplier_id:s.id,kg:Number(s.quantity_kg),rate:Number(s.min_price)})).sort((a,b)=>a.supplier_id<b.supplier_id?-1:1);
    if(overrides.belowFloor) items[0].rate=0.5;
    const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:1).map(([k,x])=>[k,canonical(x)])):v;
    const content={snapshot_id:snap,items,total_kg:10000};
    const hash=createHash("sha256").update(JSON.stringify(canonical(content))).digest("hex");
    const sqlHash=await scalar("select encode(sha256(convert_to(canonical_json($1::jsonb),'UTF8')),'hex')",[content]);
    assert.equal(hash,sqlHash,"SQL/Node canonical plan hashes agree");
    const cost=items.reduce((s,i)=>s+i.kg*i.rate,0);
    const plan=await scalar("insert into procurement_plans(snapshot_id,strategy,items,cost_total,plan_hash) values($1,'cost-first',$2,$3,$4) returning id",[snap,items,cost,hash]);
    const decision=await scalar("insert into decision_records(request_id,plan_id,plan_hash,candidate_hash,model,expires_at) values($1,$2,$3,'TEST-STUB-CANDIDATES','TEST-STUB-MODEL',now()+interval '30 minutes') returning id",[f.request,plan,hash]);
    await db.query("update quote_revisions set snapshot=snapshot||$1::jsonb where id=$2",[JSON.stringify({decision_id:decision,plan_hash:hash}),f.quote]);
    await payStub(f);
    return {...f,snap,plan,decision,hash};
  };
  const bf=await boundFixture();
  await test("2.x verified capture enqueues exactly one bound execution atomically",async()=>{
    assert.equal(Number(await scalar("select count(*) from commerce_jobs where kind='procure_bound' and scope=$1",[bf.deal.id])),1);
  });
  const execute=(f,key=randomUUID(),version=1)=>scalar("select execute_bound_plan($1,$2,$3,$4,$5,1,$6)",[key,f.deal.id,version,f.quote,f.decision,key]);
  await test("2.x snapshot scalar counts beyond 1000; transfer cap enforced",async()=>{
    await db.query("insert into suppliers(name,crop,quantity_kg,min_price,pool,fixture_id) select 'TEST-STUB-'||n,'Mint',1,7,'demo',$1 from generate_series(1,1001) n",[bf.scope]);
    const s=await scalar("select get_supply_snapshot('Mint','demo',$1,current_date+7,false,5000)",[bf.scope]);
    assert.equal(Number(s.feasible_total_kg),11001); assert.equal(Number(s.lot_count),1004);
    assert.equal(s.candidates.length,256);assert.equal(s.cap,256);assert.equal(s.truncated,true);
  });
  await test("2.x bound command rejects another quote",async()=>{
    await rejects("select execute_bound_plan($1,$2,1,$3,$4,1,$1)",[randomUUID(),bf.deal.id,g.quote,bf.decision],/quote binding mismatch/);
  });
  await test("2.x bound command rejects another request's decision",async()=>{
    const other=await boundFixture();
    await rejects("select execute_bound_plan($1,$2,1,$3,$4,1,$1)",[randomUUID(),bf.deal.id,bf.quote,other.decision],/decision quote binding mismatch/);
  });
  await test("2.x bound command requires verified capture",async()=>{
    await db.query("update deals set paypal_verified=null where id=$1",[bf.deal.id]);
    await rejects("select execute_bound_plan($1,$2,1,$3,$4,1,$1)",[randomUUID(),bf.deal.id,bf.quote,bf.decision],/paid verification required/);
    // Isolated test deliberately restores only its own explicit stub.
    await db.query("update deals set paypal_verified=$1 where id=$2",[JSON.stringify({status:"COMPLETED",source:"TEST-STUB"}),bf.deal.id]);
  });
  await test("2.x expired decision refuses execution",async()=>{
    await db.query("update decision_records set expires_at=now()-interval '1 second' where id=$1",[bf.decision]);
    await rejects("select execute_bound_plan($1,$2,1,$3,$4,1,$1)",[randomUUID(),bf.deal.id,bf.quote,bf.decision],/expired/);
    await db.query("update decision_records set expires_at=now()+interval '30 minutes' where id=$1",[bf.decision]);
  });
  await test("2.x content mutation breaks the plan hash",async()=>{
    const original=await scalar("select items from procurement_plans where id=$1",[bf.plan]);
    await db.query("update procurement_plans set items=jsonb_set(items,'{0,rate}','7.51') where id=$1",[bf.plan]);
    await rejects("select execute_bound_plan($1,$2,1,$3,$4,1,$1)",[randomUUID(),bf.deal.id,bf.quote,bf.decision],/hash or totals mismatch/);
    await db.query("update procurement_plans set items=$1 where id=$2",[JSON.stringify(original),bf.plan]);
  });

  await test("2.x selected lot below its current floor cannot commit",async()=>{
    const bad=await boundFixture({belowFloor:true});
    await rejects("select execute_bound_plan($1,$2,1,$3,$4,1,$1)",[randomUUID(),bad.deal.id,bad.quote,bad.decision],/below-floor/);
  });
  const command=randomUUID();
  await test("2.x selected plan commits with matching hash and atomic receipt",async()=>{
    const result=await execute(bf,command);
    assert.equal(result.plan_hash,bf.hash);assert.equal(Number(result.kg),10000);
    assert.equal(Number(await scalar("select version from deals where id=$1",[bf.deal.id])),2);
    assert.equal(Number(await scalar("select count(*) from allocations where deal_id=$1",[bf.deal.id])),3);
  });
  await test("2.x response-loss replay returns receipt before stale-version check",async()=>{
    assert.equal((await execute(bf,command)).replayed,true);
    assert.equal(Number(await scalar("select count(*) from command_receipts where command_id=$1",[command])),1);
    assert.equal(Number(await scalar("select count(*) from supply_reservations where deal_id=$1",[bf.deal.id])),3);
  });
  await test("2.x command key cannot be reused with altered input",async()=>{
    await rejects("select execute_bound_plan($1,$2,2,$3,$4,1,$1)",[command,bf.deal.id,bf.quote,bf.decision],/reused with different input/);
  });
  await test("2.x v1 entitlement stays 75000 through inspection and handover",async()=>{
    const allocations=(await db.query("select * from allocations where deal_id=$1",[bf.deal.id])).rows;
    for(const a of allocations) await inspect(a);
    assert.equal(Number(await scalar("select sum(entitlement_minor) from allocations where deal_id=$1",[bf.deal.id])),7500000);
    await scalar("select complete_deal_phase($1,'settle')",[bf.deal.id]);
    await scalar("select complete_deal_phase($1,'handover')",[bf.deal.id]);
    const snapshot=await scalar("select get_supply_snapshot('Mint','demo',$1,current_date+7,false,256)",[bf.scope]);
    // The 1001 test-only extra lots remain free; settled original lots do not.
    assert.equal(Number(snapshot.feasible_total_kg),1001);
  });
  await test("2.x retry backoff uses due time; creation time is immutable",async()=>{
    const id=await scalar("insert into commerce_jobs(op_key,scope,kind,payload,deadline) values($1,'TEST-STUB','projection','{}',now()+interval '1 hour') returning id",[randomUUID()]);
    const created=await scalar("select created_at from commerce_jobs where id=$1",[id]);
    const job=(await db.query("select * from claim_due_job('TEST-STUB',array['projection'])")).rows[0];assert.equal(job.id,id);
    assert.equal(await scalar("select finish_commerce_job($1,$2,null,'TEST-STUB transient failure')",[id,job.lease_token]),true);
    assert.equal((await scalar("select created_at from commerce_jobs where id=$1",[id])).toISOString(),created.toISOString());
    assert.equal(await scalar("select next_attempt_at>now() from commerce_jobs where id=$1",[id]),true);
    assert.equal((await db.query("select * from claim_due_job('TEST-STUB',array['projection'])")).rows.length,0);
    await db.query("update commerce_jobs set status='done' where id=$1",[id]);
  });
  await test("2.x expired lease is reclaimed and its old token is fenced",async()=>{
    const id=await scalar("insert into commerce_jobs(op_key,scope,kind,payload,deadline) values($1,'TEST-STUB','projection','{}',now()+interval '1 hour') returning id",[randomUUID()]);
    const one=(await db.query("select * from claim_due_job('TEST-STUB',array['projection'])")).rows[0];
    await db.query("update commerce_jobs set lease_expires_at=now()-interval '1 second' where id=$1",[id]);
    const two=(await db.query("select * from claim_due_job('TEST-STUB',array['projection'])")).rows[0];
    assert.equal(two.id,id);assert.notEqual(two.lease_token,one.lease_token);
    assert.equal(await scalar("select finish_commerce_job($1,$2,'{}',null)",[id,one.lease_token]),false);
    assert.equal(await scalar("select finish_commerce_job($1,$2,'{}',null)",[id,two.lease_token]),true);
  });
  await test("2.x AI admission permits two leases, not three",async()=>{
    for(let n=0;n<3;n++) await db.query("insert into commerce_jobs(op_key,scope,kind,payload,deadline) values($1,'TEST-STUB','ai_plan','{}',now()+interval '1 hour')",[randomUUID()]);
    const one=(await db.query("select * from claim_due_job('TEST-STUB',array['ai_plan'])")).rows;
    const two=(await db.query("select * from claim_due_job('TEST-STUB',array['ai_plan'])")).rows;
    const three=(await db.query("select * from claim_due_job('TEST-STUB',array['ai_plan'])")).rows;
    assert.equal(one.length,1);assert.equal(two.length,1);assert.equal(three.length,0);
  });
  await test("2.x verified inbox and job dedupe commit together",async()=>{
    const id="TEST-STUB-EVENT-"+randomUUID();const event={id,event_type:"CHECKOUT.ORDER.APPROVED",resource:{}};
    await scalar("select ingest_paypal_event($1,'TEST-STUB-VERIFIER')",[event]);
    await scalar("select ingest_paypal_event($1,'TEST-STUB-VERIFIER')",[event]);
    assert.equal(Number(await scalar("select count(*) from paypal_events where event_id=$1",[id])),1);
    assert.equal(Number(await scalar("select count(*) from commerce_jobs where op_key=$1",["paypal-event:"+id])),1);
    await db.query("update paypal_events set processed='processed' where event_id=$1",[id]);
    assert.equal((await scalar("select ingest_paypal_event($1,'TEST-STUB-VERIFIER')",[event])).replayed,true);
  });
  await test("2.x mutation RPCs cannot be invoked by anon/authenticated",async()=>{
    assert.equal(await scalar("select has_function_privilege('anon','execute_bound_plan(text,uuid,integer,uuid,uuid,integer,text)','EXECUTE')"),false);
    assert.equal(await scalar("select has_function_privilege('authenticated','claim_due_job(text,text[])','EXECUTE')"),false);
    assert.equal(await scalar("select has_function_privilege('anon','ingest_paypal_event(jsonb,text)','EXECUTE')"),false);
  });
  }
} finally {
  await db.query("rollback"); rolledBack=true; await db.end();
  const report={ kind:"database integration with provider stubs", rolledBack, tests:results, pass:results.filter(t=>t.status==='pass').length, fail:results.filter(t=>t.status==='fail').length };
  const output=path.resolve(flag('report','../deployment-evidence/2026-10-15-database-regressions-fixed.json'));
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({pass:report.pass,fail:report.fail,rolledBack}));
  process.exitCode=report.fail ? 1 : 0;
}
