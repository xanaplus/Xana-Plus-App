-- No packaging fee on prescription orders either (owner, 15 Oct 2026; app orders dropped it then).
-- Same function as 20261006010000_prescription_first.sql, with the KSh 20 fee set to 0. Grants are kept.
create or replace function public.place_prescription_order(p_id uuid,p_details jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v prescriptions; v_line jsonb; v_row record; v_order_id uuid; v_order_no text;
  v_subtotal numeric:=0; v_total numeric; v_attempt integer; v_due numeric;
begin
  if auth.uid() is null then raise exception 'signed_out'; end if;
  select * into v from prescriptions where id=p_id and user_id=auth.uid() for update;
  if not found then raise exception 'not_approved'; end if;
  -- Repeated confirmation returns the same order without a second charge/order.
  if v.status='ordered' then return jsonb_build_object('orderNo',v.order_no); end if;
  if v.status<>'quoted' then raise exception 'not_approved'; end if;
  if v.reviewer_id is null or v.valid_until is null or v.valid_until<current_date or v.quoted_at is null or v.quoted_at<now()-interval '48 hours'
    then raise exception 'expired_quote'; end if;
  if p_details->>'quoteVersion' is null or (p_details->>'quoteVersion')::timestamptz<>v.quoted_at
    then raise exception 'quote_updated'; end if;
  if p_details->>'paymentMethod' is null or p_details->>'paymentMethod' not in ('cod','mpesa')
    or nullif(trim(p_details->>'contact'),'') is null or length(p_details->>'contact')>100
    or nullif(trim(p_details->>'addressLine'),'') is null or length(p_details->>'addressLine')>300
    or nullif(trim(p_details->>'slotLabel'),'') is null or length(p_details->>'slotLabel')>100
    or nullif(trim(p_details->>'storeName'),'') is null or length(p_details->>'storeName')>100
    then raise exception 'invalid_order'; end if;
  for v_line in select * from jsonb_array_elements(v.quote_lines) loop
    select item_no,name,price,stock,age_restricted,category into v_row from catalogue where item_no=v_line->>'item_no';
    if not found or v_row.age_restricted or v_row.price is null or v_row.price<=0 or v_row.price<>(v_line->>'unit_price')::numeric
      or coalesce(v_row.stock,0)<(v_line->>'quantity')::integer then raise exception 'quote_changed'; end if;
    if coalesce(v_row.category,'') not in ('GENERAL','OVER THE COUNTER','CHRONIC','SUPPLEMENT','COSMETICS & BEAUTY P')
      or v_row.name ~* '(digoxin|lithium|carbamazepine)' then raise exception 'restricted_item'; end if;
    v_subtotal:=v_subtotal+(v_line->>'unit_price')::numeric*(v_line->>'quantity')::integer;
  end loop;
  v_total:=v_subtotal;
  for v_attempt in 1..10 loop
    v_order_no:='XN-'||(1000+floor(random()*9000)::integer)::text;
    begin
      insert into orders(order_no,user_id,is_test,payment_method,payment_status,contact,address_line,slot_label,store_name,
        substitution,items_subtotal,promo_discount,delivery_fee,platform_fee,total,points_redeemed,amount_due,points_earned,
        age_confirmed,rx_reference,prescription_id)
      values(v_order_no,auth.uid(),true,p_details->>'paymentMethod','simulated',trim(p_details->>'contact'),
        trim(p_details->>'addressLine'),trim(p_details->>'slotLabel'),trim(p_details->>'storeName'),'call',
         v_subtotal,0,0,0,v_total,0,v_total,0,false,p_id::text,p_id)
      returning id into v_order_id;
      exit;
    exception when unique_violation then
      if v_attempt=10 then raise; end if;
    end;
  end loop;
  for v_line in select * from jsonb_array_elements(v.quote_lines) loop
    insert into order_items(order_id,item_no,name,unit_price,quantity,line_total,requires_rx,age_restricted)
    values(v_order_id,v_line->>'item_no',v_line->>'name',(v_line->>'unit_price')::numeric,
      (v_line->>'quantity')::integer,(v_line->>'unit_price')::numeric*(v_line->>'quantity')::integer,true,false);
  end loop;
  update prescriptions set status='ordered',order_no=v_order_no,updated_at=now() where id=p_id;
  return jsonb_build_object('orderNo',v_order_no);
end; $$;
