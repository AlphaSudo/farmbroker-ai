begin;
alter table buyer_requests drop constraint if exists buyer_requests_status_check;
alter table buyer_requests add constraint buyer_requests_status_check check
 (status in ('open','quoted','paid','procuring','covered','short','settled','completed','refunded'));
alter table agent_runs drop constraint if exists agent_runs_status_check;
alter table agent_runs add constraint agent_runs_status_check check(status in ('open','running','decided','executed','paused','failed'));
alter table agent_runs add column if not exists lease_token uuid;
alter table refunds add column if not exists lease_until timestamptz;

create or replace function claim_agent_run(p_run uuid)
returns jsonb language plpgsql as $$
declare r agent_runs;
begin
 select * into r from agent_runs where id=p_run for update;
 if r.id is null then raise exception 'run not found'; end if;
 if r.status in ('decided','executed','failed') or (r.status='running' and r.lease_expires_at>now()) then
   return jsonb_build_object('claimed',false,'run',to_jsonb(r));
 end if;
 if r.attempts>=3 then
   update agent_runs set status='failed' where id=r.id returning * into r;
   return jsonb_build_object('claimed',false,'run',to_jsonb(r));
 end if;
 update agent_runs set status='running',attempts=attempts+1,lease_token=gen_random_uuid(),lease_expires_at=now()+interval '2 minutes'
 where id=r.id returning * into r;
 return jsonb_build_object('claimed',true,'run',to_jsonb(r));
end $$;

create or replace function claim_full_refund(p_deal uuid,p_reason text)
returns jsonb language plpgsql as $$
declare d deals; r refunds; captured int;
begin
 select * into d from deals where id=p_deal for update;
 if d.id is null or d.paypal_capture_id is null or d.paypal_verified is null then raise exception 'no verified capture to refund'; end if;
 if d.outcome='fulfilled' then raise exception 'fulfilled order cannot refund under shortage policy'; end if;
 select * into r from refunds where capture_id=d.paypal_capture_id and status in ('requested','pending','completed','needs_review') for update;
 if found then return jsonb_build_object('claimed',false,'refund',to_jsonb(r)); end if;
 if d.status<>'short' and not exists(select 1 from shortage_incidents where deal_id=d.id and status='refund_eligible') then raise exception 'refund policy requires unresolved shortage'; end if;
 select usd_minor into captured from payment_attempts where deal_id=d.id and status='captured';
 if captured is null or captured<=0 or captured<>(d.paypal_verified->>'amount')::numeric*100 then raise exception 'capture amount invalid'; end if;
 insert into refunds(deal_id,capture_id,usd_minor,status,reason,op_key,lease_until)
 values(d.id,d.paypal_capture_id,captured,'requested',p_reason,gen_random_uuid()::text,now()+interval '2 minutes') returning * into r;
 return jsonb_build_object('claimed',true,'refund',to_jsonb(r));
end $$;

create or replace function record_provider_refund(p_refund uuid,p_provider_id text,p_status text)
returns jsonb language plpgsql as $$
declare r refunds; d deals; final_status text;
begin
 select * into r from refunds where id=p_refund;
 if r.id is null then raise exception 'refund not found'; end if;
 select * into d from deals where id=r.deal_id for update;
 select * into r from refunds where id=p_refund for update;
 if r.status='completed' then return to_jsonb(r); end if;
 final_status := case p_status when 'COMPLETED' then 'completed' when 'PENDING' then 'pending' when 'FAILED' then 'failed' when 'CANCELLED' then 'failed' else 'needs_review' end;
 if p_provider_id='' then raise exception 'provider refund ID required'; end if;
 if r.provider_refund_id is not null and r.provider_refund_id<>p_provider_id then raise exception 'provider refund binding mismatch'; end if;
 update refunds set status=final_status,provider_refund_id=p_provider_id,lease_until=null where id=r.id returning * into r;
 if final_status='completed' then
   update deals set outcome='refunded',completed_at=now() where id=d.id;
   update buyer_requests set status='refunded' where id=d.request_id;
   update shortage_incidents set status='refunded' where deal_id=d.id and status in ('open','recovering','refund_eligible');
   insert into ledger_entries(deal_id,kind,usd_minor,note) values(d.id,'refund',r.usd_minor,'Sandbox refund '||p_provider_id);
   insert into deal_events(deal_id,type,payload,op_key) values(d.id,'refunded',jsonb_build_object('refundId',p_provider_id),'refund:'||r.id) on conflict(op_key) do nothing;
 end if;
 return to_jsonb(r);
end $$;
revoke all on function claim_agent_run(uuid),claim_full_refund(uuid,text),record_provider_refund(uuid,text,text) from public,anon,authenticated;
grant execute on function claim_agent_run(uuid),claim_full_refund(uuid,text),record_provider_refund(uuid,text,text) to service_role;
notify pgrst,'reload schema';
commit;
