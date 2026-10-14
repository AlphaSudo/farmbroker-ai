begin;
-- Close the invalid unpaid incident created by the old recovery endpoint; retain audit.
with invalid as (
 update shortage_incidents i set status='resolved' from deals d where d.id=i.deal_id
 and d.paypal_verified is null and i.status in ('open','recovering','refund_eligible') returning i.id,i.deal_id
)
insert into deal_events(deal_id,type,payload,op_key)
select deal_id,'invalid_unpaid_incident_closed',jsonb_build_object('incident',id),'close-invalid:'||id from invalid on conflict(op_key) do nothing;

create or replace function open_paid_shortage(p_deal uuid,p_op_key text)
returns jsonb language plpgsql as $$
declare d deals; i shortage_incidents; accepted numeric; target numeric;
begin
 select * into d from deals where id=p_deal for update;
 if d.id is null then raise exception 'deal not found'; end if;
 if d.paypal_verified is null then raise exception 'paid verification required before recovery'; end if;
 if d.outcome<>'pending' or d.status not in ('paid','procuring','covered','short') then raise exception 'recovery closed'; end if;
 if exists(select 1 from refunds where deal_id=d.id and status in ('requested','pending','completed','needs_review')) then raise exception 'refund in progress'; end if;
 select * into i from shortage_incidents where deal_id=d.id and status in ('open','recovering','refund_eligible') order by created_at limit 1 for update;
 if i.status='recovering' and exists(select 1 from allocations where deal_id=d.id and inspection_status='pending') then
   return jsonb_build_object('incident',to_jsonb(i),'missing',i.missing_kg,'replayed',true);
 end if;
 if exists(select 1 from allocations where deal_id=d.id and inspection_status='pending') then raise exception 'inspect all current lots before recovery'; end if;
 select quantity_kg into target from buyer_requests where id=d.request_id;
 select coalesce(sum(case when inspection_status in ('passed','partial') then greatest(0,least(allocated_kg,coalesce(usable_kg,0),coalesce(weight_received_kg,0))) else 0 end),0) into accepted from allocations where deal_id=d.id;
 if accepted>=target then return jsonb_build_object('incident',null,'missing',0); end if;
 if i.id is not null then return jsonb_build_object('incident',to_jsonb(i),'missing',target-accepted,'replayed',true); end if;
 insert into shortage_incidents(deal_id,missing_kg,status,op_key) values(d.id,target-accepted,'open',p_op_key) returning * into i;
 update deals set status='short' where id=d.id;
 update buyer_requests set status='short' where id=d.request_id;
 insert into deal_events(deal_id,type,payload,op_key) values(d.id,'shortage_opened',jsonb_build_object('missing_kg',target-accepted),p_op_key||':event');
 return jsonb_build_object('incident',to_jsonb(i),'missing',target-accepted);
end $$;

create or replace function commit_recovery_plan(p_incident uuid,p_plan jsonb,p_model text,p_op_key text)
returns jsonb language plpgsql as $$
declare i shortage_incidents; d deals; attempt int; items jsonb;
begin
 select * into i from shortage_incidents where id=p_incident;
 select * into d from deals where id=i.deal_id for update;
 select * into i from shortage_incidents where id=p_incident for update;
 if i.id is null then raise exception 'incident not found'; end if;
 if exists(select 1 from recovery_attempts where incident_id=i.id and op_key=p_op_key) then return jsonb_build_object('replayed',true); end if;
 if i.status<>'open' then raise exception 'recovery incident no longer open'; end if;
 if coalesce(p_model,'')='' then raise exception 'live model selection required'; end if;
 select coalesce(max(a.attempt),1)+1 into attempt from allocations a where a.deal_id=d.id;
 select jsonb_agg(jsonb_build_object('supplier_id',x->>'supplier_id','kg',(x->>'kg')::numeric,'cost',round((x->>'kg')::numeric*(x->>'rate')::numeric))) into items from jsonb_array_elements(p_plan->'items') x;
 perform reserve_paid_plan(d.id,d.request_id,attempt,p_op_key,items);
 insert into recovery_attempts(incident_id,plan,status,op_key) values(i.id,p_plan,'committed',p_op_key);
 update shortage_incidents set status='recovering' where id=i.id;
 insert into deal_events(deal_id,type,payload,op_key) values(d.id,'recovery_committed',jsonb_build_object('incident',i.id,'plan',p_plan->>'id','model',p_model),p_op_key||':event');
 return jsonb_build_object('replayed',false,'plan',p_plan->>'id');
end $$;
revoke all on function open_paid_shortage(uuid,text),commit_recovery_plan(uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function open_paid_shortage(uuid,text),commit_recovery_plan(uuid,jsonb,text,text) to service_role;
notify pgrst,'reload schema';
commit;
