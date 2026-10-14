// Behavioral tests against an explicitly selected deployment. Creates only named,
// unpaid test requests/orders; never forges payment evidence or resets inventory.
// node scripts/live-tests.mjs --target=https://... --env-file=.env.production.local
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const flag = (name, fallback) => process.argv.find((v) => v.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const target = flag("target", "http://localhost:3000").replace(/\/$/, "");
const envFile = flag("env-file", ".env.local");
const output = resolve(flag("report", "../deployment-evidence/2026-10-15-live-tests.json"));
const env = Object.fromEntries(readFileSync(envFile, "utf8").split(/\r?\n/)
  .filter((l) => /^[A-Z_][A-Z0-9_]*\s*=/.test(l)).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
  }));
if (!env.HUB_KEY || !env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw new Error("Required test configuration is missing");
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const primaryDeal = "ace676b6-15f5-441a-9dd1-84c3cae4c036";
const primaryRequest = "85f42817-e5ba-46d0-910c-524fddd39eb5";
const report = { startedAt: new Date().toISOString(), target, tests: [], fixtures: [], notes: [
  "Live paid-path tests require actual provider capture; database integration tests are reported separately and always rolled back.",
  "No test assigns paid status or fabricates verified capture evidence.",
  "This harness creates named unpaid fixtures and unapproved PayPal sandbox orders; it never resets shared inventory.",
] };
const save = () => { mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`); };
const record = (name, status, detail = {}) => {
  report.tests.push({ name, status, ...detail });
  console.log(`${status.toUpperCase()} ${name}${detail.reason ? `: ${detail.reason}` : ""}`);
  save();
};
const check = (name, condition, detail = {}) => record(name, condition ? "pass" : "fail", detail);
const session = () => ({ cookie: "" });
const http = async (path, { method = "GET", body, actor, hub = false } = {}) => {
  const start = Date.now();
  const r = await fetch(`${target}${path}`, {
    method, signal: AbortSignal.timeout(45000),
    headers: { "Content-Type": "application/json", ...(hub ? { "x-hub-key": env.HUB_KEY } : {}), ...(actor?.cookie ? { Cookie: actor.cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const cookie = r.headers.get("set-cookie")?.match(/fb_buyer=([^;]+)/);
  if (actor && cookie) actor.cookie = `fb_buyer=${cookie[1]}`;
  return { status: r.status, data: await r.json().catch(() => ({})), elapsedMs: Date.now() - start };
};
const post = (path, body, actor, hub = false) => http(path, { method: "POST", body, actor, hub });
const summary = (r) => ({ httpStatus: r.status, ...(r.data.error ? { reason: r.data.error } : {}) });
const makeRequest = async (name, changes = {}) => {
  const actor = session();
  const r = await post("/api/requests", { buyer_name: `E2E Live ${name} ${report.startedAt}`, crop: "Mint", quantity_kg: 10000, delivery_days: 7, max_price: 9, scenario: "e2e-live-tests", ...changes }, actor);
  check(`create ${name} request`, r.status === 201 && !!r.data.request?.id, summary(r));
  if (!r.data.request?.id) throw new Error(`Cannot create ${name} fixture`);
  const fixture = { name, requestId: r.data.request.id };
  report.fixtures.push(fixture);
  save();
  return { actor, id: r.data.request.id, created: r, fixture };
};

try {
  // These requests are independent and must not mutate protected resources.
  const gates = [
    ["Hub queue rejects anonymous", "/api/hub/queue", undefined, 403],
    ["Request list rejects anonymous", "/api/requests", undefined, 403],
    ["Another buyer order rejects anonymous", `/api/requests/${primaryRequest}`, undefined, 403],
    ["Inspection requires Hub", "/api/quality", { allocationId: randomUUID(), weight_received_kg: 2000, moisture_pct: 10, visual_score: 5, condition: "Good" }, 403],
    ["Handover requires Hub", "/api/handover", { dealId: primaryDeal }, 403],
    ["Refund requires Hub", "/api/refunds", { dealId: primaryDeal, reason: "test" }, 403],
  ];
  const gateResults = await Promise.allSettled(gates.map(async ([name, path, body, expected]) => {
    const r = body ? await post(path, body) : await http(path);
    check(name, r.status === expected, summary(r));
  }));
  gateResults.forEach((r, i) => { if (r.status === "rejected") record(gates[i][0], "fail", { reason: String(r.reason) }); });
  const hub = await http("/api/hub/queue", { hub: true });
  check("Hub queue accepts configured key", hub.status === 200, summary(hub));
  const webhook = await post("/api/paypal/webhook", {});
  check("Unconfigured webhook fails honestly with 503", webhook.status === 503, summary(webhook));
  const invalid = await post("/api/requests", { buyer_name: "E2E invalid", crop: "Mint", quantity_kg: -1, delivery_days: 7, max_price: 9 });
  check("Negative request quantity rejected", invalid.status === 400, summary(invalid));

  const buyer = await makeRequest("baseline");
  check("Creation response does not expose HttpOnly ownership token", !Object.hasOwn(buyer.created.data.request, "owner_token"), { exposedField: Object.hasOwn(buyer.created.data.request, "owner_token") ? "owner_token" : null });
  const own = await http(`/api/requests/${buyer.id}`, { actor: buyer.actor });
  check("Buyer can read its own request", own.status === 200, summary(own));
  check("Request detail removes owner token", !Object.hasOwn(own.data.request ?? {}, "owner_token"));
  const other = await http(`/api/requests/${buyer.id}`, { actor: session() });
  check("Other session cannot read buyer request", other.status === 403, summary(other));
  const analysis = await post("/api/analyze?pool=full", { requestId: buyer.id }, buyer.actor);
  check("Persisted demo pool survives full-pool query parameter", analysis.status === 200 && analysis.data.analysis?.available_kg === 10000, { ...summary(analysis), availableKg: analysis.data.analysis?.available_kg });
  const quote = await post("/api/quote", { requestId: buyer.id }, buyer.actor);
  check("Eligible baseline quote is 78000 EGP", quote.status === 200 && quote.data.quote?.quotable && quote.data.quote.total === 78000, { ...summary(quote), totalEgp: quote.data.quote?.total });
  const accepted = await post("/api/deals", { requestId: buyer.id }, buyer.actor);
  const dealId = accepted.data.deal?.id;
  buyer.fixture.dealId = dealId;
  check("Standard quote accepted", accepted.status === 201 && !!dealId, summary(accepted));
  check("Accepted buyer DTO hides supplier cost pool", !Object.hasOwn(accepted.data.deal ?? {}, "supplier_cost"), { exposedField: Object.hasOwn(accepted.data.deal ?? {}, "supplier_cost") ? "supplier_cost" : null });
  const again = await post("/api/deals", { requestId: buyer.id }, buyer.actor);
  check("Repeated acceptance reuses the deal", again.status === 200 && again.data.deal?.id === dealId, summary(again));
  const pre = await post("/api/procure", { dealId }, buyer.actor);
  check("Procurement blocked without verified capture", pre.status === 403, summary(pre));
  const settle = await post("/api/settle", { dealId }, buyer.actor);
  check("Settlement blocked before inspections", settle.status === 403, summary(settle));
  const handover = await post("/api/handover", { dealId }, undefined, true);
  check("Handover blocked before settlement", handover.status === 409, summary(handover));
  const refund = await post("/api/refunds", { dealId, reason: "E2E no capture guard" }, undefined, true);
  check("Refund blocked when no capture exists", refund.status === 422, summary(refund));
  const before = await sb.from("deal_events").select("id", { count: "exact", head: true }).eq("deal_id", dealId);
  const reads = await Promise.all([http(`/api/settle?dealId=${dealId}`, { actor: buyer.actor }), http(`/api/settle?dealId=${dealId}`, { actor: buyer.actor })]);
  const after = await sb.from("deal_events").select("id", { count: "exact", head: true }).eq("deal_id", dealId);
  check("Settlement GET remains read-only", reads.every(r => r.status === 200) && before.count === after.count, { beforeEvents: before.count, afterEvents: after.count });

  for (const [name, changes] of [["short", { quantity_kg: 15000 }], ["budget", { max_price: 7 }], ["unsupported crop", { crop: "Mango" }]]) {
    const fixture = await makeRequest(name, changes);
    const q = await post("/api/quote", { requestId: fixture.id }, fixture.actor);
    check(`${name} request cannot obtain payable quote`, q.status === 200 && q.data.quote?.quotable === false, { ...summary(q), quoteReason: q.data.quote?.reason });
    const d = await post("/api/deals", { requestId: fixture.id }, fixture.actor);
    check(`${name} request cannot create a deal`, d.status === 422, summary(d));
  }

  const negotiation = await makeRequest("counteroffer");
  const low = await post("/api/counteroffers", { requestId: negotiation.id, offered: 1 }, negotiation.actor);
  check("Lowball counteroffer never falls below supplier floor", low.status === 200 && (low.data.revisionId === null || low.data.price >= 7.5), { ...summary(low), proposedPrice: low.data.price, floor: 7.5, revisionId: low.data.revisionId });
  if (low.data.revisionId) {
    const acceptLow = await post(`/api/quotes/${low.data.revisionId}/accept`, { requestId: negotiation.id }, negotiation.actor);
    check("Below-floor revision cannot become an accepted deal", low.data.price >= 7.5 || acceptLow.status >= 400, { ...summary(acceptLow), acceptedUnitPrice: acceptLow.data.deal?.per_kg });
  }
  const valid = await post("/api/counteroffers", { requestId: negotiation.id, offered: 7.7 }, negotiation.actor);
  check("Valid counteroffer creates a draft revision", valid.status === 200 && !!valid.data.revisionId && valid.data.price === 7.7, summary(valid));
  if (valid.data.revisionId) {
    const a = await post(`/api/quotes/${valid.data.revisionId}/accept`, { requestId: negotiation.id }, negotiation.actor);
    check("Accepted negotiated total is 77000 EGP", a.status === 200 && a.data.deal?.total_price === 77000, { ...summary(a), totalEgp: a.data.deal?.total_price });
  }

  const payment = await makeRequest("payment-race");
  const pd = await post("/api/deals", { requestId: payment.id }, payment.actor);
  const pid = pd.data.deal?.id;
  payment.fixture.dealId = pid;
  const orders = await Promise.allSettled([0, 1].map(() => post("/api/paypal/create-order", { dealId: pid, opKey: randomUUID() }, payment.actor)));
  const orderResults = orders.map(r => r.status === "fulfilled" ? { status: r.value.status, orderId: r.value.data.orderId, error: r.value.data.error } : { error: String(r.reason) });
  const attempts = await sb.from("payment_attempts").select("id,provider_order_id,status").eq("deal_id", pid).in("status", ["created", "approved"]);
  check("Concurrent checkout creates one active payment attempt", !attempts.error && attempts.data?.length === 1 && orderResults.every(r => r.status === 200), { responses: orderResults, activeAttempts: attempts.data?.length, reason: attempts.error?.message });
  const repeatOrder = await post("/api/paypal/create-order", { dealId: pid }, payment.actor);
  check("Sequential checkout retry reuses an existing order", repeatOrder.status === 200 && attempts.data?.some(a => a.provider_order_id === repeatOrder.data.orderId), summary(repeatOrder));
  const forbiddenCapture = await post("/api/paypal/capture-order", { orderId: "23M81863VE120800C" }, payment.actor);
  check("Other buyer cannot capture primary order", forbiddenCapture.status === 403, summary(forbiddenCapture));

  const run = await post("/api/runs", { requestId: buyer.id }, buyer.actor);
  check("Buyer can create a persisted AI run", run.status === 201 && !!run.data.runId, summary(run));
  if (run.data.runId) {
    const ai = await post(`/api/runs/${run.data.runId}/advance`, { opKey: randomUUID() }, buyer.actor);
    check("Live AI selects a grounded plan", ai.status === 200 && /^Live AI/.test(ai.data.provenance ?? "") && ["cost-first", "reliability-first"].includes(ai.data.selection?.candidate_id), { ...summary(ai), elapsedMs: ai.elapsedMs, provenance: ai.data.provenance, selection: ai.data.selection?.candidate_id });
    if (ai.status === 200) check("Buyer AI response hides supplier identifiers", !JSON.stringify(ai.data).includes("supplier_id"));
    const persisted = await http(`/api/runs/${run.data.runId}`, { actor: buyer.actor });
    check("AI decision/failure is persisted for refresh", persisted.status === 200 && (persisted.data.steps?.length ?? 0) > 0, { ...summary(persisted), runStatus: persisted.data.run?.status, steps: persisted.data.steps?.length });
  }

  const guardedRpc = await sb.rpc("reserve_paid_plan", { p_deal_id: dealId, p_request_id: buyer.id, p_attempt: 1, p_op_key: randomUUID(), p_items: [] });
  check("Database RPC independently rejects unpaid allocation", !!guardedRpc.error && /paid verification required/i.test(guardedRpc.error.message), { reason: guardedRpc.error?.message });
  const recover = await post("/api/recovery", { dealId, opKey: randomUUID() }, buyer.actor);
  check("Recovery rejects an unpaid deal before creating an incident", recover.status === 403, summary(recover));
  const incidents = await sb.from("shortage_incidents").select("id,status").eq("deal_id", dealId);
  check("Unpaid recovery leaves no shortage incident", !incidents.error && incidents.data?.length === 0, { incidentCount: incidents.data?.length, reason: incidents.error?.message });
  const allocations = await sb.from("allocations").select("id").eq("deal_id", dealId);
  check("Unpaid tests never commit allocations", !allocations.error && allocations.data?.length === 0, { allocationCount: allocations.data?.length });

  const queue = await http("/api/hub/queue", { hub: true });
  check("Hub queue includes the newly created test deal", queue.status === 200 && queue.data.deals?.some(d => d.id === dealId), { ...summary(queue), returnedDeals: queue.data.deals?.length });
  const dealTimestamp = await sb.from("deals").select("id,created_at").limit(0);
  check("Deployed schema supports Hub deal ordering", !dealTimestamp.error, { reason: dealTimestamp.error?.message });
  const fixtureActor = session();
  const noFixtureAccess = await post("/api/hub/fixtures", { scenario: "recovery" });
  check("Scenario fixture creation requires Hub", noFixtureAccess.status === 403, summary(noFixtureAccess));
  const recoveryFixture = await post("/api/hub/fixtures", { scenario: "recovery" }, fixtureActor, true);
  check("Hub can create an isolated unpaid recovery fixture", recoveryFixture.status === 201 && !!recoveryFixture.data.request?.id, summary(recoveryFixture));
  if (recoveryFixture.data.request?.id) {
    const rid = recoveryFixture.data.request.id;
    report.fixtures.push({ name: "isolated recovery", requestId: rid });
    const stored = await sb.from("buyer_requests").select("fixture_id,status").eq("id", rid).single();
    const stock = await sb.from("suppliers").select("quantity_kg,backup_only").eq("fixture_id", stored.data?.fixture_id);
    check("Recovery fixture has pre-existing isolated 2000kg standby", !stock.error && stock.data?.filter(s => s.backup_only).reduce((sum,s) => sum + Number(s.quantity_kg),0) === 2000 && stored.data?.status === "open");
    const baseline = await post("/api/quote", { requestId: rid }, fixtureActor);
    check("Standby stock preserves 78000 EGP baseline quote", baseline.status === 200 && baseline.data.quote?.total === 78000, summary(baseline));
    const isolated = await post("/api/analyze", { requestId: buyer.id }, buyer.actor);
    check("Separate fixture stock never inflates normal pool availability", isolated.status === 200 && isolated.data.analysis?.available_kg === 10000, summary(isolated));
  }

  for (const name of ["Paid procurement and inventory concurrency", "Reject 2000kg and verify accepted coverage", "Commit and inspect live AI replacement", "Finalize settlement and simulated handover", "Capture separate refund fixture and reconcile actual refund", "Replay a completed capture/refund without duplicate financial effects"]) {
    record(name, "blocked", { reason: "Primary sandbox order approved but capture rejected by PayPal COMPLIANCE_VIOLATION; no verified paid fixture exists." });
  }
} catch (e) {
  record("Harness execution", "fail", { reason: e instanceof Error ? e.message : String(e) });
} finally {
  report.finishedAt = new Date().toISOString();
  report.counts = Object.fromEntries(["pass", "fail", "blocked"].map(status => [status, report.tests.filter(t => t.status === status).length]));
  save();
  console.log(JSON.stringify({ ...report.counts, report: output }));
  process.exitCode = report.counts.fail ? 1 : 0;
}
