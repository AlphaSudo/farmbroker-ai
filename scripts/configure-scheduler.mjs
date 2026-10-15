// Provision one native scheduler; secret is encrypted in Supabase Vault.
// DATABASE_URL=... node scripts/configure-scheduler.mjs [--pooler=HOST] [--enable]
// Without --enable the job is installed inactive for deployment verification.
import fs from "node:fs";
import pg from "pg";
const env = Object.fromEntries(fs.readFileSync(".env.production.local","utf8").split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1).replace(/^"|"$/g,"")];}));
if (!env.CRON_SECRET) throw new Error("CRON_SECRET is missing");
const pooler=process.argv.find(a=>a.startsWith("--pooler="))?.slice(9);
const ref=new URL(env.SUPABASE_URL).hostname.split(".")[0];
const password=process.env.DATABASE_URL?undefined:fs.readFileSync("../credentials.txt","utf8").match(/supabase\s*\npassword\s+(\S+)/i)?.[1];
const config=process.env.DATABASE_URL?{connectionString:process.env.DATABASE_URL}:{host:pooler??"db."+ref+".supabase.co",port:5432,user:pooler?"postgres."+ref:"postgres",password,database:"postgres"};
const db=new pg.Client({...config,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:15000});
await db.connect();
try {
 await db.query("begin");
 await db.query("set local lock_timeout='3s'; set local statement_timeout='30s'");
 const installed=await db.query("select to_regprocedure('finish_commerce_job(uuid,uuid,jsonb,text)') as fn");
 if(!installed.rows[0].fn) throw new Error("Apply the release migrations before configuring workers");
 await db.query("create extension if not exists pg_cron; create extension if not exists pg_net; create schema if not exists private");
 const secret=await db.query("select id from vault.secrets where name='farmbroker_cron_secret'");
 if(secret.rows[0]) await db.query("select vault.update_secret($1,$2)",[secret.rows[0].id,env.CRON_SECRET]);
 else await db.query("select vault.create_secret($1,'farmbroker_cron_secret','FarmBroker bounded worker trigger')",[env.CRON_SECRET]);
 await db.query(`
 create or replace function private.farmbroker_wake() returns bigint language plpgsql security definer set search_path=pg_catalog as $$
 declare token text; request_id bigint;
 begin
  select decrypted_secret into token from vault.decrypted_secrets where name='farmbroker_cron_secret';
  if token is null then raise exception 'Scheduler secret missing'; end if;
  select net.http_post(url:='https://farmbroker-aii.vercel.app/api/internal/wake',
   headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',token),body:='{}'::jsonb,timeout_milliseconds:=55000) into request_id;
  return request_id;
 end $$;
 revoke all on function private.farmbroker_wake() from public,anon,authenticated,service_role;
 `);
 const job=await db.query("select cron.schedule('farmbroker-wake-1min','* * * * *','select private.farmbroker_wake();') as id");
 await db.query("select cron.alter_job($1,active:=$2)",[job.rows[0].id,process.argv.includes("--enable")]);
 await db.query("commit");
 const state=await db.query("select jobid,jobname,schedule,active from cron.job where jobname='farmbroker-wake-1min'");
 console.log(JSON.stringify({scheduler:state.rows,secretStorage:"Supabase Vault (value not printed)",workerBatch:1}));
} catch(e) { await db.query("rollback"); throw e; }
finally { await db.end(); }
