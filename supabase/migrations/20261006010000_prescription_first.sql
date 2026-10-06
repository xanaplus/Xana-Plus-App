-- Private, prescription-first ordering. Ordinary branch staff are not automatically
-- pharmacy reviewers. Add only authorised pharmacist accounts to this separate list.
begin;

create table public.pharmacy_reviewers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.pharmacy_reviewers enable row level security;
create policy "Reviewers see their own membership" on public.pharmacy_reviewers
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.pharmacy_reviewers from anon, authenticated;
grant select on public.pharmacy_reviewers to authenticated;

create function public.is_pharmacy_reviewer() returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.pharmacy_reviewers where user_id = (select auth.uid())); $$;
revoke all on function public.is_pharmacy_reviewer() from public, anon;
grant execute on function public.is_pharmacy_reviewer() to authenticated;

create table public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  patient_name text not null check (char_length(patient_name) between 1 and 100),
  patient_kind text not null check (patient_kind in ('myself', 'dependant')),
  doctor text not null default '' check (char_length(doctor) <= 100),
  notes text not null default '' check (char_length(notes) <= 1000),
  status text not null default 'draft' check (status in ('draft','submitted','quoted','rejected','ordered','cancelled')),
  files jsonb not null default '[]'::jsonb,
  quote_lines jsonb not null default '[]'::jsonb,
  review_note text not null default '',
  reviewer_id uuid references auth.users(id),
  valid_until date,
  quoted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  order_no text
);
create index prescriptions_owner_date on public.prescriptions(user_id, created_at desc);
create index prescriptions_review_queue on public.prescriptions(status, created_at);
alter table public.prescriptions enable row level security;
create policy "Customer owns prescription" on public.prescriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Pharmacy reviewers read prescriptions" on public.prescriptions for select to authenticated
  using ((select public.is_pharmacy_reviewer()) and status <> 'draft');
revoke all on public.prescriptions from anon, authenticated;
grant select on public.prescriptions to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('prescriptions','prescriptions',false,10485760,array['image/jpeg','image/png','image/webp']);
create policy "Customer uploads prescription draft photos" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'prescriptions'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.prescriptions p
      where p.id::text = (storage.foldername(name))[2] and p.user_id = (select auth.uid()) and p.status = 'draft')
  );
create policy "Owner and pharmacy reviewer read private prescription photos" on storage.objects
  for select to authenticated using (
    bucket_id = 'prescriptions'
    and exists (select 1 from public.prescriptions p
      where p.id::text = (storage.foldername(name))[2]
      and ((p.user_id = (select auth.uid()) and p.user_id::text = (storage.foldername(name))[1])
        or ((select public.is_pharmacy_reviewer()) and p.status <> 'draft')))
  );
create policy "Customer removes draft prescription photos" on storage.objects
  for delete to authenticated using (
    bucket_id = 'prescriptions' and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.prescriptions p
      where p.id::text = (storage.foldername(name))[2] and p.user_id = (select auth.uid()) and p.status = 'draft')
  );

create function public.create_prescription(p_patient text, p_kind text, p_doctor text, p_notes text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'signed_out'; end if;
  if nullif(trim(p_patient),'') is null or length(p_patient)>100 or p_kind not in ('myself','dependant')
    or p_kind is null or length(coalesce(p_doctor,''))>100 or length(coalesce(p_notes,''))>1000
    then raise exception 'invalid_prescription'; end if;
  insert into prescriptions(user_id,patient_name,patient_kind,doctor,notes)
    values(auth.uid(),trim(p_patient),p_kind,coalesce(trim(p_doctor),''),coalesce(trim(p_notes),'')) returning id into v_id;
  return v_id;
end; $$;

create function public.attach_prescription_photo(p_id uuid,p_path text,p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare v prescriptions;
begin
  select * into v from prescriptions where id=p_id and user_id=auth.uid() for update;
  if not found or v.status<>'draft' then raise exception 'not_editable'; end if;
  if jsonb_array_length(v.files)>=5 or split_part(p_path,'/',1)<>auth.uid()::text
    or split_part(p_path,'/',2)<>p_id::text or p_path is null
    or not exists (select 1 from storage.objects where bucket_id='prescriptions' and name=p_path)
    then raise exception 'invalid_file'; end if;
  if exists (select 1 from jsonb_array_elements(v.files) f where f->>'path'=p_path) then return; end if;
  update prescriptions set files=files||jsonb_build_array(jsonb_build_object('path',p_path,'name',left(coalesce(p_name,'Prescription photo'),100))),
    updated_at=now() where id=p_id;
end; $$;

create function public.remove_prescription_photo(p_id uuid,p_path text)
returns void language plpgsql security definer set search_path = public as $$
declare v prescriptions;
begin
  select * into v from prescriptions where id=p_id and user_id=auth.uid() for update;
  if not found or v.status<>'draft' then raise exception 'not_editable'; end if;
  update prescriptions set files=coalesce((select jsonb_agg(f) from jsonb_array_elements(v.files) f where f->>'path'<>p_path),'[]'::jsonb),
    updated_at=now() where id=p_id;
end; $$;

create function public.submit_prescription(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v prescriptions;
begin
  select * into v from prescriptions where id=p_id and user_id=auth.uid() for update;
  if not found or v.status<>'draft' then raise exception 'not_editable'; end if;
  if jsonb_array_length(v.files)=0 or exists(select 1 from jsonb_array_elements(v.files) f
    where not exists(select 1 from storage.objects where bucket_id='prescriptions' and name=f->>'path'))
    then raise exception 'photo_required'; end if;
  update prescriptions set status='submitted',updated_at=now() where id=p_id;
end; $$;

create function public.cancel_prescription(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from prescriptions where id=p_id and user_id=auth.uid() and status in ('draft','submitted','quoted','rejected') for update;
  if not found then raise exception 'not_editable'; end if;
  update prescriptions set status='cancelled',updated_at=now() where id=p_id;
end; $$;

create function public.review_prescription(p_id uuid,p_lines jsonb,p_note text,p_valid_until date,p_reject boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v prescriptions; v_line jsonb; v_row record; v_lines jsonb := '[]'::jsonb; v_qty integer;
begin
  if not is_pharmacy_reviewer() then raise exception 'not_reviewer'; end if;
  select * into v from prescriptions where id=p_id for update;
  if not found or v.status not in ('submitted','quoted') then raise exception 'not_reviewable'; end if;
  if p_note is null or length(p_note)>1000 then raise exception 'invalid_quote'; end if;
  if p_reject then
    if nullif(trim(p_note),'') is null then raise exception 'invalid_quote'; end if;
    update prescriptions set status='rejected',review_note=trim(p_note),quote_lines='[]'::jsonb,
      reviewer_id=auth.uid(),valid_until=null,quoted_at=null,updated_at=now() where id=p_id;
    return;
  end if;
  if p_valid_until is null or p_valid_until<current_date or p_valid_until>current_date+365
    or p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines) not between 1 and 50
    then raise exception 'invalid_quote'; end if;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    if (v_line->>'quantity') !~ '^[1-9][0-9]{0,2}$' or v_line->>'itemNo' is null
      or length(coalesce(v_line->>'instructions',''))>500 then raise exception 'invalid_quote'; end if;
    v_qty := (v_line->>'quantity')::integer;
    select item_no,name,price,stock into v_row from catalogue where item_no=v_line->>'itemNo';
    if not found or v_row.price<=0 or v_row.price is null or coalesce(v_row.stock,0)<v_qty
      or exists(select 1 from jsonb_array_elements(v_lines) l where l->>'item_no'=v_row.item_no)
      then raise exception 'invalid_quote'; end if;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('item_no',v_row.item_no,'name',v_row.name,
      'quantity',v_qty,'unit_price',v_row.price,'instructions',coalesce(v_line->>'instructions','')));
  end loop;
  update prescriptions set status='quoted',quote_lines=v_lines,review_note=trim(p_note),reviewer_id=auth.uid(),
    valid_until=p_valid_until,quoted_at=now(),updated_at=now() where id=p_id;
end; $$;

alter table public.orders add column prescription_id uuid references public.prescriptions(id);
create unique index orders_one_per_prescription on public.orders(prescription_id) where prescription_id is not null;

-- All order writers, including the older place-order Edge Function, must supply
-- a pharmacist-approved prescription for Rx lines. A client boolean is not approval.
create function public.guard_prescription_order_item() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_order orders; v prescriptions;
begin
  if new.requires_rx or exists(select 1 from catalogue c where c.item_no=new.item_no and c.requires_rx) then
    select * into v_order from orders where id=new.order_id;
    select * into v from prescriptions where id=v_order.prescription_id and user_id=v_order.user_id;
    if not found or v.status not in ('quoted','ordered') or v.valid_until<current_date
      or v.quoted_at<now()-interval '48 hours' or not exists(
        select 1 from jsonb_array_elements(v.quote_lines) l
        where l->>'item_no'=new.item_no and (l->>'quantity')::integer=new.quantity
          and (l->>'unit_price')::numeric=new.unit_price)
      then raise exception 'rx_missing'; end if;
  end if;
  return new;
end; $$;
create trigger prescription_order_item_gate before insert or update on public.order_items
  for each row execute function public.guard_prescription_order_item();

-- Customer checkout is one transaction and one prescription is redeemable once.
-- Quote validity and current stock/prices are rechecked under the prescription lock.
create function public.place_prescription_order(p_id uuid,p_details jsonb) returns jsonb
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
  if v.valid_until is null or v.valid_until<current_date or v.quoted_at<now()-interval '48 hours'
    then raise exception 'expired_quote'; end if;
  if p_details->>'paymentMethod' is null or p_details->>'paymentMethod' not in ('cod','mpesa')
    or nullif(trim(p_details->>'contact'),'') is null or length(p_details->>'contact')>100
    or nullif(trim(p_details->>'addressLine'),'') is null or length(p_details->>'addressLine')>300
    or nullif(trim(p_details->>'slotLabel'),'') is null or length(p_details->>'slotLabel')>100
    or nullif(trim(p_details->>'storeName'),'') is null or length(p_details->>'storeName')>100
    then raise exception 'invalid_order'; end if;
  for v_line in select * from jsonb_array_elements(v.quote_lines) loop
    select item_no,name,price,stock,age_restricted into v_row from catalogue where item_no=v_line->>'item_no';
    if not found or v_row.age_restricted or v_row.price<>(v_line->>'unit_price')::numeric
      or coalesce(v_row.stock,0)<(v_line->>'quantity')::integer then raise exception 'quote_changed'; end if;
    v_subtotal:=v_subtotal+(v_line->>'unit_price')::numeric*(v_line->>'quantity')::integer;
  end loop;
  v_total:=v_subtotal+20;
  for v_attempt in 1..10 loop
    v_order_no:='XN-'||(1000+floor(random()*9000)::integer)::text;
    begin
      insert into orders(order_no,user_id,is_test,payment_method,payment_status,contact,address_line,slot_label,store_name,
        substitution,items_subtotal,promo_discount,delivery_fee,platform_fee,total,points_redeemed,amount_due,points_earned,
        age_confirmed,rx_reference,prescription_id)
      values(v_order_no,auth.uid(),true,p_details->>'paymentMethod','simulated',trim(p_details->>'contact'),
        trim(p_details->>'addressLine'),trim(p_details->>'slotLabel'),trim(p_details->>'storeName'),'call',
        v_subtotal,0,0,20,v_total,0,v_total,floor(v_total/120)::integer,false,p_id::text,p_id)
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

revoke all on function public.create_prescription(text,text,text,text),
  public.attach_prescription_photo(uuid,text,text),public.remove_prescription_photo(uuid,text),
  public.submit_prescription(uuid),public.cancel_prescription(uuid),
  public.review_prescription(uuid,jsonb,text,date,boolean),public.place_prescription_order(uuid,jsonb)
  from public,anon;
grant execute on function public.create_prescription(text,text,text,text),
  public.attach_prescription_photo(uuid,text,text),public.remove_prescription_photo(uuid,text),
  public.submit_prescription(uuid),public.cancel_prescription(uuid),
  public.review_prescription(uuid,jsonb,text,date,boolean),public.place_prescription_order(uuid,jsonb)
  to authenticated;
commit;
