-- Run only inside a transaction ending in ROLLBACK on the existing backend.
-- Synthetic users and metadata; no SMS, physical files, stock changes or real charges.
insert into auth.users(id,aud,role,email) values
 ('10000000-0000-4000-8000-000000000001','authenticated','authenticated','rx-owner@example.invalid'),
 ('10000000-0000-4000-8000-000000000002','authenticated','authenticated','rx-other@example.invalid'),
 ('10000000-0000-4000-8000-000000000003','authenticated','authenticated','rx-reviewer@example.invalid');
insert into public.pharmacy_reviewers(user_id) values('10000000-0000-4000-8000-000000000003');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $test$
declare v_id uuid; v_denied boolean:=false;
begin
  begin perform public.create_prescription('Test patient','myself','','',false);
  exception when others then if sqlerrm='consent_required' then v_denied:=true; else raise; end if; end;
  if not v_denied then raise exception 'TEST FAIL: consent required'; end if;
  v_id:=public.create_prescription('Synthetic pharmacy test','myself','','Test only',true);
  perform set_config('rx.test_id',v_id::text,true);
  v_denied:=false;
  begin perform public.submit_prescription(v_id);
  exception when others then if sqlerrm='photo_required' then v_denied:=true; else raise; end if; end;
  if not v_denied then raise exception 'TEST FAIL: photo required'; end if;
  insert into storage.objects(bucket_id,name,owner_id)
    values('prescriptions',auth.uid()::text||'/'||v_id::text||'/synthetic.jpg',auth.uid()::text);
  perform public.attach_prescription_photo(v_id,auth.uid()::text||'/'||v_id::text||'/synthetic.jpg','Synthetic metadata only');
  perform public.submit_prescription(v_id);
end; $test$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $test$
declare v_denied boolean:=false;
begin
  if exists(select 1 from public.prescriptions where id=current_setting('rx.test_id')::uuid) then
    raise exception 'TEST FAIL: cross-user record visibility'; end if;
  if exists(select 1 from storage.objects where bucket_id='prescriptions' and name like '%synthetic.jpg') then
    raise exception 'TEST FAIL: cross-user photo visibility'; end if;
  begin perform public.review_prescription(current_setting('rx.test_id')::uuid,'[]','',current_date);
  exception when others then if sqlerrm='not_reviewer' then v_denied:=true; else raise; end if; end;
  if not v_denied then raise exception 'TEST FAIL: reviewer permission'; end if;
  v_denied:=false;
  begin insert into public.pharmacy_reviewers(user_id) values(auth.uid());
  exception when insufficient_privilege then v_denied:=true; end;
  if not v_denied then raise exception 'TEST FAIL: self-escalation'; end if;
end; $test$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
do $test$
declare v_item text; v_denied boolean:=false;
begin
  if not public.is_pharmacy_reviewer() then raise exception 'TEST FAIL: reviewer membership'; end if;
  if not exists(select 1 from public.prescriptions where id=current_setting('rx.test_id')::uuid) then
    raise exception 'TEST FAIL: reviewer queue visibility'; end if;
  perform public.set_prescription_review_status(current_setting('rx.test_id')::uuid,'clarification','Please confirm the date.');
end; $test$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select public.respond_to_prescription(current_setting('rx.test_id')::uuid,'The date is today.');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
do $test$
declare v_item text; v_denied boolean:=false;
begin
  perform public.set_prescription_review_status(current_setting('rx.test_id')::uuid,'held','Checking with prescriber.');
  select item_no into v_item from public.catalogue where category='CONTROLLED' and price>0 and stock>=1 limit 1;
  if v_item is not null then
    begin perform public.review_prescription(current_setting('rx.test_id')::uuid,
      jsonb_build_array(jsonb_build_object('itemNo',v_item,'quantity',1)),'',current_date+10);
    exception when others then if sqlerrm='restricted_item' then v_denied:=true; else raise; end if; end;
    if not v_denied then raise exception 'TEST FAIL: controlled medicine gate'; end if;
  end if;
  select item_no into v_item from public.catalogue where category in ('GENERAL','CHRONIC','OVER THE COUNTER')
    and price>0 and stock>=1 and not age_restricted and name !~* '(digoxin|lithium|carbamazepine)' limit 1;
  if v_item is null then raise exception 'TEST FAIL: no suitable catalogue test item'; end if;
  perform public.review_prescription(current_setting('rx.test_id')::uuid,
    jsonb_build_array(jsonb_build_object('itemNo',v_item,'quantity',1,'instructions','Synthetic test instructions')),
    'Synthetic quote; never dispense.',current_date+10);
end; $test$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $test$
declare v_details jsonb; v_result jsonb; v_again jsonb; v_denied boolean:=false; v_order uuid;
begin
  v_details:=jsonb_build_object('paymentMethod','cod','contact','Synthetic test',
    'addressLine','DO NOT FULFIL - rollback test','slotLabel','Test only','storeName','Test only',
    'quoteVersion',(select quoted_at from public.prescriptions where id=current_setting('rx.test_id')::uuid));
  begin update public.prescriptions set status='ordered' where id=current_setting('rx.test_id')::uuid;
  exception when insufficient_privilege then v_denied:=true; end;
  if not v_denied then raise exception 'TEST FAIL: client direct approval'; end if;
  v_denied:=false;
  begin perform public.place_prescription_order(current_setting('rx.test_id')::uuid,v_details||'{"quoteVersion":"2020-01-01T00:00:00Z"}');
  exception when others then if sqlerrm='quote_updated' then v_denied:=true; else raise; end if; end;
  if not v_denied then raise exception 'TEST FAIL: stale displayed quote'; end if;
  v_result:=public.place_prescription_order(current_setting('rx.test_id')::uuid,v_details);
  v_again:=public.place_prescription_order(current_setting('rx.test_id')::uuid,v_details);
  if v_result<>v_again then raise exception 'TEST FAIL: one-time ordering'; end if;
  select id into v_order from public.orders where order_no=v_result->>'orderNo';
  if (select count(*) from public.orders where prescription_id=current_setting('rx.test_id')::uuid)<>1
    then raise exception 'TEST FAIL: duplicate order'; end if;
  if not exists(select 1 from public.orders where id=v_order and is_test and payment_status='simulated'
    and points_redeemed=0 and points_earned=0) then raise exception 'TEST FAIL: test payment and no loyalty side effects'; end if;
  if (select count(*) from public.prescription_events where prescription_id=current_setting('rx.test_id')::uuid)<7
    then raise exception 'TEST FAIL: audit history'; end if;
end; $test$;
reset role;
-- The service-role/legacy writer also cannot create an unapproved Rx line.
do $test$
declare v_order uuid; v_denied boolean:=false; v_line record;
begin
  select * into v_line from public.order_items where order_id=(select id from public.orders
    where prescription_id=current_setting('rx.test_id')::uuid) limit 1;
  insert into public.orders(order_no,user_id,is_test,payment_method,payment_status,contact,address_line,slot_label,
    store_name,substitution,items_subtotal,delivery_fee,platform_fee,total,amount_due)
    values('XN-TEST-GATE','10000000-0000-4000-8000-000000000001',true,'cod','simulated','Test',
    'DO NOT FULFIL','Test','Test','call',1,0,0,1,1) returning id into v_order;
  begin insert into public.order_items(order_id,item_no,name,unit_price,quantity,line_total,requires_rx)
    values(v_order,v_line.item_no,'Test',v_line.unit_price,1,v_line.unit_price,true);
  exception when others then if sqlerrm='rx_missing' then v_denied:=true; else raise; end if; end;
  if not v_denied then raise exception 'TEST FAIL: legacy writer bypass'; end if;
  -- Historical reference-only Rx orders cannot advance to delivery either.
  alter table public.order_items disable trigger prescription_order_item_gate;
  insert into public.order_items(order_id,item_no,name,unit_price,quantity,line_total,requires_rx)
    values(v_order,v_line.item_no,'Synthetic historical line',v_line.unit_price,1,v_line.unit_price,true);
  alter table public.order_items enable trigger prescription_order_item_gate;
  v_denied:=false;
  begin update public.orders set status='out-for-delivery' where id=v_order;
  exception when others then if sqlerrm='rx_missing' then v_denied:=true; else raise; end if; end;
  if not v_denied then raise exception 'TEST FAIL: historical Rx dispatch bypass'; end if;
end; $test$;
set local role anon;
do $test$
declare v_denied boolean:=false;
begin
  begin perform public.create_prescription('Test','myself','','',true);
  exception when insufficient_privilege then v_denied:=true; end;
  if not v_denied then raise exception 'TEST FAIL: anonymous RPC'; end if;
end; $test$;
reset role;
select 'PASS: consent, uploads, owner privacy, reviewer isolation, clarification, hold, restricted medicines, quote snapshot, one-time test ordering, audit and legacy Rx gate' as result;
