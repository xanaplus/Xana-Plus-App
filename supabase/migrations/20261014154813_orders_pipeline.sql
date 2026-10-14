-- Applied to the shared database by the website team on 14 Oct 2026; copied here from the live migration history so both repos share one history. Source and notes: xanaplus/Xana-Website docs/upstream/.
-- The shared order pipeline for the website and the app: database part.
-- Design and decisions: docs/upstream/orders-and-payments.md.
--
-- Additive and safe to run twice. The app keeps working unchanged:
--  * existing orders become channel 'app', fulfilment 'delivery';
--  * delivery orders keep their statuses and staff_set_order_status() rules;
--  * nothing the app writes or reads is renamed or removed.
-- Online payment (DPO), KRA signing and BC posting come in later migrations; this
-- one prepares their rows (payments, outbox) and records counter payments.

-- 1. Hygiene: the API roles never need these on orders (truncate skips row security).
revoke truncate, references, trigger on public.orders, public.order_items from anon, authenticated;

-- 2. Settings that admins change, read by the website, the app and the functions.
create table if not exists public.settings (
  key text primary key check (key ~ '^[a-z0-9_]+$'),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
alter table public.settings enable row level security;
revoke all on public.settings from anon, authenticated;
grant all on public.settings to service_role;
grant select on public.settings to authenticated;
drop policy if exists "Admins read settings" on public.settings;
create policy "Admins read settings" on public.settings for select to authenticated using ((select public.is_admin()));

-- Branch managers' phone numbers are private: they are added to pickup_branches by
-- hand on the live database, never in a migration.
insert into public.settings (key, value) values
  ('checkout_enabled', 'false'),
  ('pay_at_pickup_enabled', 'true'),
  ('pay_at_pickup_max', '10000'),
  ('pay_at_pickup_max_open', '2'),
  ('pickup_branches', '[{"code":"SYOKIMAU","name":"Syokimau","opens":"07:00","closes":"21:00"},{"code":"RUIRU","name":"Ruiru","opens":"07:00","closes":"21:00"}]'),
  ('stock_buffer', '2'),
  ('order_expiry_minutes', '30'),
  ('collection_hours', '24'),
  ('platform_fee_app', '20'),
  ('promo_on_web', 'false'),
  ('points_on_web', 'false'),
  ('etims_mode', '"test"'),
  ('bc_mode', '"test"'),
  ('bc_customer_web', '"WEB-CUSTOMER"'),
  ('bc_customer_app', '"APP-CUSTOMER"')
on conflict (key) do nothing;

create or replace function public.setting(p_key text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select value from public.settings where key = p_key
$$;
revoke execute on function public.setting(text) from public, anon, authenticated;
grant execute on function public.setting(text) to service_role;

-- 3. Audit log: who changed what, written only by the functions below.
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb
);
create index if not exists audit_log_entity_idx on public.audit_log (entity, entity_id);
alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
grant all on public.audit_log to service_role;
grant select on public.audit_log to authenticated;
drop policy if exists "Admins read the audit log" on public.audit_log;
create policy "Admins read the audit log" on public.audit_log for select to authenticated using ((select public.is_admin()));

-- 4. Orders: new columns and statuses.
alter table public.orders
  add column if not exists channel text not null default 'app',
  add column if not exists fulfilment text not null default 'delivery',
  add column if not exists branch_code text references public.stock_locations (code),
  add column if not exists idempotency_key uuid,
  add column if not exists basket_hash text,
  add column if not exists collection_code text,
  add column if not exists expires_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists ready_at timestamptz,
  add column if not exists collected_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists buyer_kra_pin text,
  add column if not exists receipt_no text,
  add column if not exists amount_paid numeric not null default 0,
  add column if not exists amount_refunded numeric not null default 0,
  add column if not exists rounding numeric not null default 0,
  add column if not exists etims_status text not null default 'not_required',
  add column if not exists bc_status text not null default 'not_required';

alter table public.orders drop constraint if exists orders_channel_check;
alter table public.orders add constraint orders_channel_check check (channel in ('web', 'app'));
alter table public.orders drop constraint if exists orders_fulfilment_check;
alter table public.orders add constraint orders_fulfilment_check check (fulfilment in ('pickup', 'delivery'));
alter table public.orders drop constraint if exists orders_collection_code_check;
alter table public.orders add constraint orders_collection_code_check check (collection_code is null or collection_code ~ '^[0-9]{4}$');
alter table public.orders drop constraint if exists orders_cancel_reason_check;
alter table public.orders add constraint orders_cancel_reason_check check (cancel_reason is null or cancel_reason in
  ('payment_timeout', 'customer_cancelled', 'cannot_fulfil', 'not_collected', 'staff'));
alter table public.orders drop constraint if exists orders_buyer_kra_pin_check;
alter table public.orders add constraint orders_buyer_kra_pin_check check (buyer_kra_pin is null or buyer_kra_pin ~ '^[A-Z][0-9]{9}[A-Z]$');
alter table public.orders drop constraint if exists orders_rounding_check;
alter table public.orders add constraint orders_rounding_check check (rounding between -0.5 and 0.5);
alter table public.orders drop constraint if exists orders_money_check;
alter table public.orders add constraint orders_money_check check (amount_paid >= 0 and amount_refunded >= 0 and amount_refunded <= amount_paid);
alter table public.orders drop constraint if exists orders_etims_status_check;
alter table public.orders add constraint orders_etims_status_check check (etims_status in
  ('not_required', 'pending', 'waiting_registration', 'signed', 'failed'));
alter table public.orders drop constraint if exists orders_bc_status_check;
alter table public.orders add constraint orders_bc_status_check check (bc_status in
  ('not_required', 'pending', 'posted', 'failed', 'skipped_test'));
alter table public.orders drop constraint if exists orders_pickup_branch_check;
alter table public.orders add constraint orders_pickup_branch_check check (fulfilment <> 'pickup' or branch_code is not null);
alter table public.orders drop constraint if exists orders_web_is_pickup_check;
alter table public.orders add constraint orders_web_is_pickup_check check (channel <> 'web' or fulfilment = 'pickup');

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (status in
  ('awaiting-payment', 'received', 'shopping', 'ready', 'collected', 'out-for-delivery', 'delivered', 'cancelled'));
alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders add constraint orders_payment_status_check check (payment_status in
  ('simulated', 'pending', 'paid', 'failed', 'expired', 'refund-due', 'refunded', 'partly-refunded'));
alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check check (payment_method in ('mpesa', 'cod', 'card', 'dpo', 'counter'));

create unique index if not exists orders_user_idempotency_idx on public.orders (user_id, idempotency_key) where idempotency_key is not null;
create unique index if not exists orders_open_collection_code_idx on public.orders (branch_code, collection_code)
  where collection_code is not null and status in ('awaiting-payment', 'received', 'shopping', 'ready');
create index if not exists orders_branch_status_idx on public.orders (branch_code, status);

-- 5. Order lines: new columns.
alter table public.order_items
  add column if not exists unit_label text,
  add column if not exists list_price numeric,
  add column if not exists fulfilled_quantity integer,
  add column if not exists vat_group text,
  add column if not exists etims_name text,
  add column if not exists etims_tax_code text;
alter table public.order_items drop constraint if exists order_items_fulfilled_quantity_check;
alter table public.order_items add constraint order_items_fulfilled_quantity_check
  check (fulfilled_quantity is null or (fulfilled_quantity >= 0 and fulfilled_quantity <= quantity));
alter table public.order_items drop constraint if exists order_items_etims_tax_code_check;
alter table public.order_items add constraint order_items_etims_tax_code_check check (etims_tax_code is null or etims_tax_code ~ '^[A-G]$');

-- 6. The buyer's KRA PIN on the profile (owner, 14 Oct 2026), written only through functions.
alter table public.profiles add column if not exists kra_pin text;
alter table public.profiles drop constraint if exists profiles_kra_pin_check;
alter table public.profiles add constraint profiles_kra_pin_check check (kra_pin is null or kra_pin ~ '^[A-Z][0-9]{9}[A-Z]$');

-- A KRA PIN as the POS accepts it: trimmed and upper-cased, one letter, nine digits,
-- one letter. Returns null for blank or malformed (the caller decides what that means).
create or replace function public.clean_kra_pin(p_pin text) returns text
language sql immutable set search_path = '' as $$
  select case when upper(btrim(coalesce(p_pin, ''))) ~ '^[A-Z][0-9]{9}[A-Z]$' then upper(btrim(p_pin)) end
$$;

create or replace function public.set_my_kra_pin(p_pin text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_pin text := public.clean_kra_pin(p_pin);
begin
  if auth.uid() is null then
    raise exception 'signed_out' using errcode = '42501';
  end if;
  if btrim(coalesce(p_pin, '')) <> '' and v_pin is null then
    raise exception 'invalid_kra_pin' using errcode = '22023',
      hint = 'A KRA PIN looks like P051234567X: one letter, nine digits, one letter.';
  end if;
  update public.profiles set kra_pin = v_pin where id = auth.uid();
  return v_pin;
end;
$$;
revoke execute on function public.set_my_kra_pin(text) from public, anon;
grant execute on function public.set_my_kra_pin(text) to authenticated, service_role;

-- 7. Payments: one row per attempt.
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  channel text not null check (channel in ('web', 'app')),
  provider text not null check (provider in ('dpo', 'counter', 'points')),
  attempt integer not null check (attempt >= 1),
  company_ref text unique,
  provider_token text unique,
  provider_ref text,
  method text check (method is null or method in ('mpesa', 'airtel', 'card', 'cash', 'other')),
  amount numeric not null check (amount > 0),
  currency text not null default 'KES' check (currency = 'KES'),
  paid_amount numeric check (paid_amount is null or paid_amount >= 0),
  status text not null default 'creating' check (status in
    ('creating', 'pending', 'paid', 'failed', 'expired', 'cancelled', 'refund-due', 'refunded')),
  result_code text,
  result_text text,
  customer_phone text,
  recorded_by uuid references auth.users (id) on delete set null,
  requested_at timestamptz,
  responded_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (order_id, attempt)
);
create unique index if not exists payments_one_live_attempt_idx on public.payments (order_id) where status in ('creating', 'pending');
alter table public.payments enable row level security;
revoke all on public.payments from anon, authenticated;
grant all on public.payments to service_role;
grant select on public.payments to authenticated;
drop policy if exists "Customers read their own payments" on public.payments;
create policy "Customers read their own payments" on public.payments for select to authenticated
  using (exists (select 1 from public.orders o where o.id = payments.order_id and o.user_id = (select auth.uid())));
drop policy if exists "Staff read all payments" on public.payments;
create policy "Staff read all payments" on public.payments for select to authenticated using ((select public.is_staff()));

-- 8. Every provider notification and verification, raw and append-only.
create table if not exists public.payment_events (
  id bigint generated always as identity primary key,
  payment_id uuid references public.payments (id) on delete set null,
  provider_token text,
  kind text not null check (kind in ('notification', 'verification', 'return')),
  result_code text,
  provider_ref text,
  body text,
  source_ip text,
  received_at timestamptz not null default now(),
  unique nulls not distinct (provider_token, kind, result_code, provider_ref)
);
alter table public.payment_events enable row level security;
revoke all on public.payment_events from anon, authenticated;
grant all on public.payment_events to service_role;
grant select on public.payment_events to authenticated;
drop policy if exists "Staff read payment events" on public.payment_events;
create policy "Staff read payment events" on public.payment_events for select to authenticated using ((select public.is_staff()));

-- 9. Refunds: due, approved by an admin, paid by finance (never the same person).
create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  payment_id uuid references public.payments (id) on delete restrict,
  order_item_id bigint references public.order_items (id) on delete restrict,
  amount numeric not null check (amount > 0),
  reason text not null check (reason in ('customer_cancelled', 'cannot_fulfil', 'short_pick', 'shelf_price_lower',
    'not_collected', 'duplicate_payment', 'late_payment', 'amount_mismatch', 'return', 'staff')),
  status text not null default 'due' check (status in ('due', 'approved', 'paid', 'rejected')),
  note text check (note is null or char_length(note) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  paid_by uuid references auth.users (id) on delete set null,
  paid_at timestamptz,
  paid_reference text,
  created_at timestamptz not null default now(),
  check (approved_by is null or paid_by is null or approved_by <> paid_by)
);
create index if not exists refunds_order_idx on public.refunds (order_id);
alter table public.refunds enable row level security;
revoke all on public.refunds from anon, authenticated;
grant all on public.refunds to service_role;
grant select on public.refunds to authenticated;
drop policy if exists "Customers read their own refunds" on public.refunds;
create policy "Customers read their own refunds" on public.refunds for select to authenticated
  using (exists (select 1 from public.orders o where o.id = refunds.order_id and o.user_id = (select auth.uid())));
drop policy if exists "Staff read all refunds" on public.refunds;
create policy "Staff read all refunds" on public.refunds for select to authenticated using ((select public.is_staff()));

-- 10. Outbox: everything sent to a person or another system, once each.
create table if not exists public.outbox (
  id bigint generated always as identity primary key,
  order_id uuid references public.orders (id) on delete cascade,
  kind text not null check (kind in ('sms_paid', 'sms_ready', 'sms_reminder', 'sms_short_pick', 'sms_cancelled',
    'sms_refund_paid', 'branch_new_order', 'push_status', 'etims_sign', 'etims_credit_note', 'bc_post', 'bc_credit_memo')),
  dedupe_key text not null default '',
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped_test')),
  attempts integer not null default 0,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (order_id, kind, dedupe_key)
);
create index if not exists outbox_due_idx on public.outbox (next_attempt_at) where status = 'pending';
alter table public.outbox enable row level security;
revoke all on public.outbox from anon, authenticated;
grant all on public.outbox to service_role;
grant select on public.outbox to authenticated;
drop policy if exists "Staff read the outbox" on public.outbox;
create policy "Staff read the outbox" on public.outbox for select to authenticated using ((select public.is_staff()));

-- 11. Items to push to the Ruiru KRA device (never blocks a sale).
create table if not exists public.etims_registration_requests (
  id bigint generated always as identity primary key,
  item_no text not null,
  first_order_id uuid references public.orders (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'requested', 'registered', 'failed')),
  attempts integer not null default 0,
  last_error text,
  requested_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists etims_registration_open_idx on public.etims_registration_requests (item_no) where status in ('pending', 'requested');
alter table public.etims_registration_requests enable row level security;
revoke all on public.etims_registration_requests from anon, authenticated;
grant all on public.etims_registration_requests to service_role;
grant select on public.etims_registration_requests to authenticated;
drop policy if exists "Staff read registration requests" on public.etims_registration_requests;
create policy "Staff read registration requests" on public.etims_registration_requests for select to authenticated using ((select public.is_staff()));

-- 12. Internal: what happens when an order's payment is recorded (online or at the
-- counter). One transaction with the payment: the sale is done; KRA, BC and the SMS
-- are worked later from the outbox and can never undo it.
create or replace function public.order_paid_effects(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order_id;
  insert into public.outbox (order_id, kind) values (o.id, 'etims_sign'), (o.id, 'bc_post')
    on conflict (order_id, kind, dedupe_key) do nothing;
  if o.payment_method = 'dpo' then
    insert into public.outbox (order_id, kind) values (o.id, 'sms_paid'), (o.id, 'branch_new_order')
      on conflict (order_id, kind, dedupe_key) do nothing;
  end if;
  update public.orders
     set etims_status = case when etims_status = 'not_required' then 'pending' else etims_status end,
         bc_status = case when bc_status = 'not_required' then 'pending' else bc_status end
   where id = o.id;
end;
$$;
revoke execute on function public.order_paid_effects(uuid) from public, anon, authenticated;

-- 13. create_order(): the one place an order is saved. Called only by the server
-- (the place-order Edge Function), which signs the caller in, prices the basket with
-- the app's tier rules, and decides the channel. Everything that must happen
-- together happens here, in one transaction.
create or replace function public.create_order(p_user uuid, p_channel text, p_order jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_key uuid;
  v_hash text;
  v_existing public.orders%rowtype;
  v_fulfilment text := coalesce(p_order ->> 'fulfilment', 'delivery');
  v_branch text := upper(nullif(btrim(p_order ->> 'branchCode'), ''));
  v_method text := p_order ->> 'paymentMethod';
  v_is_test boolean := coalesce((p_order ->> 'isTest')::boolean, false);
  v_lines jsonb := p_order -> 'lines';
  v_line jsonb;
  v_cat record;
  v_unavailable text[] := '{}';
  v_not_online text[] := '{}';
  v_subtotal numeric := 0;
  v_wholesale numeric := 0;
  v_promo numeric := coalesce((p_order ->> 'promoDiscount')::numeric, 0);
  v_points integer := coalesce((p_order ->> 'pointsRedeemed')::integer, 0);
  v_platform numeric;
  v_delivery numeric := coalesce((p_order ->> 'deliveryFee')::numeric, 0);
  v_total numeric;
  v_exact_due numeric;
  v_due numeric;
  v_pin text;
  v_order_id uuid;
  v_order_no text;
  v_code text;
  v_status text;
  v_payment_status text;
  v_expires timestamptz;
  v_available numeric;
  v_held numeric;
  v_branch_stock numeric;
  v_buffer numeric := coalesce((public.setting('stock_buffer'))::text::numeric, 0);
  v_waiting boolean := false;
  v_attempt integer;
  v_item record;
begin
  -- Who and what.
  if p_user is null or not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'signed_out' using errcode = '42501';
  end if;
  if p_channel not in ('web', 'app') then
    raise exception 'invalid_order' using errcode = '22023', detail = 'channel';
  end if;
  begin
    v_key := (p_order ->> 'idempotencyKey')::uuid;
  exception when others then
    raise exception 'invalid_order' using errcode = '22023', detail = 'idempotencyKey';
  end;
  if v_key is null or jsonb_typeof(v_lines) is distinct from 'array' then
    raise exception 'invalid_order' using errcode = '22023';
  end if;
  v_hash := md5(p_channel || '|' || v_fulfilment || '|' || coalesce(v_branch, '') || '|' || coalesce(v_method, '') || '|' ||
    (select coalesce(string_agg((l ->> 'itemNo') || 'x' || (l ->> 'quantity'), ',' order by l ->> 'itemNo'), '') from jsonb_array_elements(v_lines) l));

  -- A repeated request (double tap, retry) returns the same order; the same key with a
  -- different basket is refused.
  perform pg_advisory_xact_lock(hashtext('create_order:' || p_user::text || ':' || v_key::text));
  select * into v_existing from public.orders where user_id = p_user and idempotency_key = v_key;
  if found then
    if v_existing.basket_hash is distinct from v_hash then
      raise exception 'attempt_reused' using errcode = '22023';
    end if;
    return jsonb_build_object('orderNo', v_existing.order_no, 'repeat', true, 'status', v_existing.status,
      'paymentStatus', v_existing.payment_status, 'amountDue', v_existing.amount_due, 'collectionCode', v_existing.collection_code,
      'expiresAt', v_existing.expires_at);
  end if;

  -- Checkout switch (test orders still work, so the pipeline can be tested before launch).
  if not v_is_test and coalesce((public.setting('checkout_enabled'))::text::boolean, false) is not true then
    raise exception 'checkout_off' using errcode = '22023';
  end if;

  -- Fulfilment, branch and payment method.
  if v_fulfilment not in ('pickup', 'delivery') or (p_channel = 'web' and v_fulfilment <> 'pickup') then
    raise exception 'invalid_order' using errcode = '22023', detail = 'fulfilment';
  end if;
  if v_fulfilment = 'pickup' then
    if v_branch is null or not exists (select 1 from jsonb_array_elements(public.setting('pickup_branches')) b where b ->> 'code' = v_branch)
       or not exists (select 1 from public.stock_locations where code = v_branch and pickup) then
      raise exception 'invalid_branch' using errcode = '22023';
    end if;
    if v_method not in ('dpo', 'counter') then
      raise exception 'invalid_order' using errcode = '22023', detail = 'paymentMethod';
    end if;
    if v_method = 'counter' and coalesce((public.setting('pay_at_pickup_enabled'))::text::boolean, false) is not true then
      raise exception 'pay_at_pickup_off' using errcode = '22023';
    end if;
  else
    v_branch := null;
    if v_method not in ('mpesa', 'cod', 'card') then
      raise exception 'invalid_order' using errcode = '22023', detail = 'paymentMethod';
    end if;
  end if;

  -- Lines: 1 to 100, whole quantities 1 to 999, no item twice.
  if jsonb_array_length(v_lines) not between 1 and 100
     or exists (select 1 from jsonb_array_elements(v_lines) l
                 where jsonb_typeof(l -> 'itemNo') is distinct from 'string' or btrim(l ->> 'itemNo') = ''
                    or jsonb_typeof(l -> 'quantity') is distinct from 'number'
                    or (l ->> 'quantity')::numeric <> floor((l ->> 'quantity')::numeric)
                    or (l ->> 'quantity')::numeric not between 1 and 999
                    or jsonb_typeof(l -> 'unitPrice') is distinct from 'number')
     or jsonb_array_length(v_lines) <> (select count(distinct l ->> 'itemNo') from jsonb_array_elements(v_lines) l) then
    raise exception 'invalid_order' using errcode = '22023', detail = 'lines';
  end if;

  -- Web orders: no promo codes or points in version 1 (owner, 14 Oct 2026); no fee.
  if p_channel = 'web' then
    if (v_promo <> 0 or nullif(p_order ->> 'promoCode', '') is not null)
       and coalesce((public.setting('promo_on_web'))::text::boolean, false) is not true then
      raise exception 'not_available' using errcode = '22023', detail = 'promo';
    end if;
    if v_points <> 0 and coalesce((public.setting('points_on_web'))::text::boolean, false) is not true then
      raise exception 'not_available' using errcode = '22023', detail = 'points';
    end if;
    v_platform := 0;
  else
    v_platform := coalesce((p_order ->> 'platformFee')::numeric, (public.setting('platform_fee_app'))::text::numeric, 0);
  end if;
  if v_fulfilment = 'pickup' then
    v_delivery := 0;
  end if;

  -- Each line against the catalogue, with stock held for this branch. Stock is locked
  -- per branch and item, in item order, so two shoppers cannot both take the last unit.
  for v_line in select l from jsonb_array_elements(v_lines) l order by l ->> 'itemNo' loop
    perform pg_advisory_xact_lock(hashtext('stock:' || coalesce(v_branch, '*') || ':' || (v_line ->> 'itemNo')));
    select item_no, name, price, stock, requires_rx, age_restricted, price_tiers, stock_by_location, vat_group
      into v_cat from public.catalogue where item_no = v_line ->> 'itemNo';
    if not found or v_cat.price is null or v_cat.price <= 0 then
      v_unavailable := v_unavailable || (v_line ->> 'itemNo');
      continue;
    end if;
    if v_cat.requires_rx or (v_cat.age_restricted and p_channel = 'web') then
      v_not_online := v_not_online || (v_line ->> 'itemNo');
      continue;
    end if;
    if v_cat.age_restricted and coalesce((p_order ->> 'ageConfirmed')::boolean, false) is not true then
      raise exception 'age_unconfirmed' using errcode = '22023';
    end if;
    -- The price must be the catalogue price or one of its quantity prices for this
    -- quantity (the server priced it; this only catches a pricing bug).
    if (v_line ->> 'unitPrice')::numeric <> v_cat.price and not exists (
         select 1 from jsonb_array_elements(coalesce(v_cat.price_tiers, '[]'::jsonb)) t
          where (t ->> 'unitPrice')::numeric = (v_line ->> 'unitPrice')::numeric
            and (t ->> 'minQty')::numeric <= (v_line ->> 'quantity')::numeric) then
      raise exception 'price_mismatch' using errcode = '22023', detail = v_line ->> 'itemNo';
    end if;
    v_branch_stock := case when v_branch is not null then (v_cat.stock_by_location ->> v_branch)::numeric end;
    select coalesce(sum(i.quantity), 0) into v_held
      from public.order_items i join public.orders o on o.id = i.order_id
     where i.item_no = v_cat.item_no
       and (v_branch is null or o.branch_code = v_branch)
       and (o.status in ('received', 'shopping', 'ready')
            or (o.status = 'awaiting-payment' and (o.expires_at is null or o.expires_at > now())));
    v_available := coalesce(v_branch_stock, v_cat.stock, 0) - v_buffer - v_held;
    if (v_line ->> 'quantity')::numeric > v_available then
      v_unavailable := v_unavailable || (v_line ->> 'itemNo');
      continue;
    end if;
    v_subtotal := v_subtotal + round((v_line ->> 'unitPrice')::numeric * (v_line ->> 'quantity')::numeric, 2);
    v_wholesale := v_wholesale + greatest(0, v_cat.price - (v_line ->> 'unitPrice')::numeric) * (v_line ->> 'quantity')::numeric;
  end loop;
  if array_length(v_not_online, 1) > 0 then
    raise exception 'not_sold_online' using errcode = '22023', detail = array_to_string(v_not_online, ',');
  end if;
  if array_length(v_unavailable, 1) > 0 then
    raise exception 'unavailable' using errcode = '22023', detail = array_to_string(v_unavailable, ',');
  end if;

  -- Totals: lines exact, the final total rounded to the nearest shilling once (owner).
  v_total := v_subtotal - v_promo + v_delivery + v_platform;
  v_exact_due := greatest(0, v_total - v_points / 10.0);
  v_due := round(v_exact_due, 0);

  -- Pay at pickup: at most N open orders per customer, and a maximum amount (owner).
  if v_method = 'counter' then
    if v_due > coalesce((public.setting('pay_at_pickup_max'))::text::numeric, 10000) then
      raise exception 'pay_at_pickup_max' using errcode = '22023';
    end if;
    if (select count(*) from public.orders where user_id = p_user and payment_method = 'counter'
          and payment_status = 'pending' and status in ('received', 'shopping', 'ready'))
       >= coalesce((public.setting('pay_at_pickup_max_open'))::text::integer, 2) then
      raise exception 'pay_at_pickup_limit' using errcode = '22023';
    end if;
  end if;

  -- Points spent come off now, only if the balance still holds them.
  if v_points > 0 then
    update public.profiles set club_points = club_points - v_points where id = p_user and club_points >= v_points;
    if not found then
      raise exception 'points_unavailable' using errcode = '22023';
    end if;
  end if;

  -- The buyer's KRA PIN: a well-formed one goes on the order and is saved for next
  -- time; a malformed one is dropped, never saved; blank leaves the saved PIN alone.
  v_pin := public.clean_kra_pin(p_order ->> 'buyerKraPin');
  if v_pin is not null then
    update public.profiles set kra_pin = v_pin where id = p_user and kra_pin is distinct from v_pin;
  end if;

  -- Status and expiry.
  if v_method = 'dpo' then
    v_status := 'awaiting-payment';
    v_payment_status := 'pending';
    v_expires := now() + make_interval(mins => coalesce((public.setting('order_expiry_minutes'))::text::integer, 30));
  elsif v_method = 'counter' then
    v_status := 'received';
    v_payment_status := 'pending';
  else
    v_status := 'received';
    v_payment_status := 'simulated';  -- app delivery orders, as today, until their payment is real
  end if;

  -- Order number: WB- or AP- and 6 random digits (owner), retried on a clash.
  for v_attempt in 1..20 loop
    v_order_no := case p_channel when 'web' then 'WB-' else 'AP-' end || lpad((floor(random() * 900000) + 100000)::integer::text, 6, '0');
    v_code := case when v_fulfilment = 'pickup' then lpad(floor(random() * 10000)::integer::text, 4, '0') end;
    begin
      insert into public.orders (order_no, user_id, is_test, status, payment_method, payment_status, contact, address_line,
        slot_label, store_name, substitution, items_subtotal, delivery_fee, platform_fee, total, points_redeemed, amount_due,
        points_earned, age_confirmed, promo_code, promo_discount, wholesale_savings, channel, fulfilment, branch_code,
        idempotency_key, basket_hash, collection_code, expires_at, buyer_kra_pin, rounding, etims_status, bc_status)
      values (v_order_no, p_user, v_is_test, v_status, v_method, v_payment_status,
        coalesce(nullif(btrim(p_order ->> 'contact'), ''), (select phone from public.profiles where id = p_user)),
        case when v_fulfilment = 'pickup' then (select b ->> 'name' from jsonb_array_elements(public.setting('pickup_branches')) b where b ->> 'code' = v_branch)
             else coalesce(nullif(btrim(p_order ->> 'addressLine'), ''), '') end,
        case when v_fulfilment = 'pickup' then 'Pickup' else coalesce(nullif(btrim(p_order ->> 'slotLabel'), ''), '') end,
        case when v_fulfilment = 'pickup' then (select b ->> 'name' from jsonb_array_elements(public.setting('pickup_branches')) b where b ->> 'code' = v_branch)
             else coalesce(nullif(btrim(p_order ->> 'storeName'), ''), '') end,
        coalesce(nullif(p_order ->> 'substitution', ''), 'call'),
        v_subtotal, v_delivery, v_platform, v_total, v_points, v_due,
        coalesce((p_order ->> 'pointsEarned')::integer, 0), coalesce((p_order ->> 'ageConfirmed')::boolean, false),
        nullif(p_order ->> 'promoCode', ''), v_promo, round(v_wholesale, 2), p_channel, v_fulfilment, v_branch,
        v_key, v_hash, v_code, v_expires, v_pin, v_due - v_exact_due, 'not_required', 'not_required')
      returning id into v_order_id;
      exit;
    exception when unique_violation then
      if v_attempt = 20 then raise; end if;
    end;
  end loop;

  -- Lines, with KRA readiness: a line that cannot yet be signed on Ruiru is queued for
  -- registration on the device and never stops the order (owner, 14 Oct 2026).
  for v_item in
    select l ->> 'itemNo' as item_no, (l ->> 'quantity')::integer as quantity, (l ->> 'unitPrice')::numeric as unit_price,
           c.name, c.price, c.requires_rx, c.age_restricted, c.vat_group,
           e.registered_name, e.tax_code, (e.item_no is not null and e.ruiru_store and not e.name_conflict) as ready
      from jsonb_array_elements(v_lines) l
      join public.catalogue c on c.item_no = l ->> 'itemNo'
      left join public.etims_items e on e.item_no = c.item_no
  loop
    insert into public.order_items (order_id, item_no, name, unit_price, quantity, line_total, requires_rx, age_restricted,
      list_price, vat_group, etims_name, etims_tax_code)
    values (v_order_id, v_item.item_no, coalesce(v_item.name, v_item.item_no), v_item.unit_price, v_item.quantity,
      round(v_item.unit_price * v_item.quantity, 2), v_item.requires_rx, v_item.age_restricted, v_item.price, v_item.vat_group,
      case when v_item.ready then v_item.registered_name end,
      case when v_item.ready then coalesce(v_item.tax_code, case v_item.vat_group when 'STD' then 'B' when 'ZERO' then 'C' when 'EXEMPTED' then 'A' end) end);
    if not v_item.ready then
      v_waiting := true;
      insert into public.etims_registration_requests (item_no, first_order_id) values (v_item.item_no, v_order_id)
        on conflict (item_no) where status in ('pending', 'requested') do nothing;
    end if;
  end loop;
  if v_waiting then
    update public.orders set etims_status = 'waiting_registration' where id = v_order_id;
  end if;

  -- Pay at pickup: the branch hears about it now (online orders: once paid).
  if v_method = 'counter' then
    insert into public.outbox (order_id, kind) values (v_order_id, 'branch_new_order');
  end if;

  insert into public.audit_log (actor, action, entity, entity_id, details)
  values (p_user, 'order.created', 'order', v_order_no,
    jsonb_build_object('channel', p_channel, 'fulfilment', v_fulfilment, 'branch', v_branch, 'method', v_method, 'amountDue', v_due, 'test', v_is_test));

  return jsonb_build_object('orderNo', v_order_no, 'repeat', false, 'status', v_status, 'paymentStatus', v_payment_status,
    'itemsSubtotal', v_subtotal, 'total', v_total, 'amountDue', v_due, 'rounding', v_due - v_exact_due,
    'collectionCode', v_code, 'expiresAt', v_expires, 'etimsReady', not v_waiting, 'buyerKraPin', v_pin);
end;
$$;
revoke execute on function public.create_order(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_order(uuid, text, jsonb) to service_role;

-- 14. Staff take payment at the counter (pay at pickup). The sale is recorded here.
create or replace function public.record_counter_payment(p_order_no text, p_method text, p_reference text, p_buyer_kra_pin text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders%rowtype;
  v_pin text := public.clean_kra_pin(p_buyer_kra_pin);
  v_payment_id uuid;
begin
  if not public.is_staff() then
    raise exception 'not_staff' using errcode = '42501';
  end if;
  if p_method not in ('cash', 'mpesa', 'card') then
    raise exception 'invalid_payment' using errcode = '22023';
  end if;
  if p_method <> 'cash' and nullif(btrim(p_reference), '') is null then
    raise exception 'reference_required' using errcode = '22023';
  end if;
  select * into o from public.orders where order_no = p_order_no for update;
  if not found then
    raise exception 'no_order' using errcode = 'P0002';
  end if;
  if o.payment_method <> 'counter' then
    raise exception 'not_pay_at_pickup' using errcode = '22023';
  end if;
  if o.payment_status = 'paid' then
    return jsonb_build_object('orderNo', o.order_no, 'paymentStatus', 'paid', 'repeat', true);
  end if;
  if o.status not in ('received', 'shopping', 'ready') or o.payment_status <> 'pending' then
    raise exception 'order_closed' using errcode = '22023';
  end if;

  insert into public.payments (order_id, channel, provider, attempt, method, amount, paid_amount, status, provider_ref,
    recorded_by, verified_at)
  values (o.id, o.channel, 'counter', coalesce((select max(attempt) from public.payments where order_id = o.id), 0) + 1,
    p_method, o.amount_due, o.amount_due, 'paid', nullif(btrim(p_reference), ''), auth.uid(), now())
  returning id into v_payment_id;

  update public.orders
     set payment_status = 'paid', paid_at = now(), amount_paid = o.amount_due, updated_at = now(),
         buyer_kra_pin = coalesce(v_pin, buyer_kra_pin)
   where id = o.id;
  if v_pin is not null and o.user_id is not null then
    update public.profiles set kra_pin = v_pin where id = o.user_id and kra_pin is distinct from v_pin;
  end if;
  perform public.order_paid_effects(o.id);

  insert into public.audit_log (actor, action, entity, entity_id, details)
  values (auth.uid(), 'payment.recorded', 'order', o.order_no,
    jsonb_build_object('method', p_method, 'amount', o.amount_due, 'payment', v_payment_id, 'kraPinChanged', v_pin is not null));
  return jsonb_build_object('orderNo', o.order_no, 'paymentStatus', 'paid', 'repeat', false);
end;
$$;
revoke execute on function public.record_counter_payment(text, text, text, text) from public, anon;
grant execute on function public.record_counter_payment(text, text, text, text) to authenticated, service_role;

-- 15. Order status changes. Pickup orders follow the allowed moves below; delivery
-- orders keep exactly the rules staff_set_order_status() had.
create table if not exists public.order_status_transitions (
  from_status text not null,
  to_status text not null,
  actor text not null check (actor in ('staff', 'customer', 'system')),
  primary key (from_status, to_status, actor)
);
alter table public.order_status_transitions enable row level security;
revoke all on public.order_status_transitions from anon, authenticated;
grant all on public.order_status_transitions to service_role;
insert into public.order_status_transitions (from_status, to_status, actor) values
  ('awaiting-payment', 'received', 'system'),
  ('awaiting-payment', 'cancelled', 'system'),
  ('awaiting-payment', 'cancelled', 'customer'),
  ('received', 'shopping', 'staff'),
  ('received', 'ready', 'staff'),
  ('shopping', 'ready', 'staff'),
  ('ready', 'collected', 'staff'),
  ('received', 'cancelled', 'staff'),
  ('shopping', 'cancelled', 'staff'),
  ('ready', 'cancelled', 'staff'),
  ('received', 'cancelled', 'customer'),
  ('shopping', 'cancelled', 'customer'),
  ('ready', 'cancelled', 'system')
on conflict do nothing;

create or replace function public.set_order_status(p_order_no text, p_status text, p_reason text default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders%rowtype;
  v_actor text;
  v_reason text;
begin
  if public.is_staff() then
    v_actor := 'staff';
  elsif auth.role() = 'service_role' then
    v_actor := 'system';
  else
    raise exception 'not_staff' using errcode = '42501';
  end if;
  select * into o from public.orders where order_no = p_order_no for update;
  if not found then
    raise exception 'no_order' using errcode = 'P0002';
  end if;
  if o.status = p_status then
    return p_status;  -- a repeated tap changes nothing
  end if;

  if o.fulfilment = 'delivery' then
    -- As staff_set_order_status() always worked for the app's delivery orders.
    if p_status not in ('received', 'shopping', 'out-for-delivery', 'delivered', 'cancelled') then
      raise exception 'bad_status' using errcode = '22023';
    end if;
    if o.status in ('delivered', 'cancelled') then
      raise exception 'order_closed' using errcode = '22023';
    end if;
  else
    if not exists (select 1 from public.order_status_transitions where from_status = o.status and to_status = p_status and actor = v_actor) then
      raise exception 'bad_transition' using errcode = '22023', detail = o.status || ' -> ' || p_status;
    end if;
    if p_status = 'collected' and o.payment_status <> 'paid' then
      raise exception 'not_paid' using errcode = '22023';
    end if;
  end if;

  v_reason := case when p_status = 'cancelled' then coalesce(p_reason, 'staff') end;
  update public.orders
     set status = p_status, updated_at = now(),
         ready_at = case when p_status = 'ready' then now() else ready_at end,
         collected_at = case when p_status = 'collected' then now() else collected_at end,
         cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end,
         cancel_reason = coalesce(v_reason, cancel_reason)
   where id = o.id;

  -- Points: earned when the customer has the goods, given back on a cancellation.
  if p_status in ('delivered', 'collected') and not o.points_awarded and o.user_id is not null and o.points_earned > 0 then
    update public.profiles set club_points = club_points + o.points_earned where id = o.user_id;
    update public.orders set points_awarded = true where id = o.id;
  end if;
  if p_status = 'cancelled' and not o.points_refunded and o.user_id is not null and o.points_redeemed > 0 then
    update public.profiles set club_points = club_points + o.points_redeemed where id = o.user_id;
    update public.orders set points_refunded = true where id = o.id;
  end if;

  if o.fulfilment = 'pickup' then
    if p_status = 'ready' then
      insert into public.outbox (order_id, kind) values (o.id, 'sms_ready') on conflict (order_id, kind, dedupe_key) do nothing;
    end if;
    if p_status = 'cancelled' then
      if o.payment_status = 'paid' then
        insert into public.refunds (order_id, payment_id, amount, reason, created_by)
        values (o.id, (select id from public.payments where order_id = o.id and status = 'paid' order by created_at desc limit 1),
          o.amount_paid - o.amount_refunded, case v_reason when 'staff' then 'staff' else v_reason end, auth.uid());
        update public.orders set payment_status = 'refund-due' where id = o.id;
      elsif o.payment_status = 'pending' then
        update public.orders set payment_status = case when o.payment_method = 'dpo' then 'expired' else payment_status end where id = o.id;
      end if;
      insert into public.outbox (order_id, kind) values (o.id, 'sms_cancelled') on conflict (order_id, kind, dedupe_key) do nothing;
    end if;
  end if;

  insert into public.audit_log (actor, action, entity, entity_id, details)
  values (auth.uid(), 'order.status', 'order', o.order_no, jsonb_build_object('from', o.status, 'to', p_status, 'reason', v_reason, 'by', v_actor));
  return p_status;
end;
$$;
revoke execute on function public.set_order_status(text, text, text) from public, anon;
grant execute on function public.set_order_status(text, text, text) to authenticated, service_role;

-- The app's existing call keeps its name and arguments.
create or replace function public.staff_set_order_status(p_order_no text, p_status text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then
    raise exception 'not_staff' using errcode = '42501';
  end if;
  return public.set_order_status(p_order_no, p_status, null);
end;
$$;

-- 16. A customer cancels their own order: before payment, or after payment until it
-- is ready (owner: full refund).
create or replace function public.cancel_my_order(p_order_no text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders%rowtype;
begin
  if auth.uid() is null then
    raise exception 'signed_out' using errcode = '42501';
  end if;
  select * into o from public.orders where order_no = p_order_no and user_id = auth.uid() for update;
  if not found then
    raise exception 'no_order' using errcode = 'P0002';
  end if;
  if o.status = 'cancelled' then
    return 'cancelled';
  end if;
  if o.fulfilment <> 'pickup' or not exists (
       select 1 from public.order_status_transitions where from_status = o.status and to_status = 'cancelled' and actor = 'customer') then
    raise exception 'cannot_cancel' using errcode = '22023';
  end if;

  update public.orders set status = 'cancelled', cancelled_at = now(), cancel_reason = 'customer_cancelled', updated_at = now(),
         payment_status = case when o.payment_status = 'paid' then 'refund-due'
                               when o.payment_method = 'dpo' and o.payment_status = 'pending' then 'expired'
                               else o.payment_status end
   where id = o.id;
  if o.payment_status = 'paid' then
    insert into public.refunds (order_id, payment_id, amount, reason, created_by)
    values (o.id, (select id from public.payments where order_id = o.id and status = 'paid' order by created_at desc limit 1),
      o.amount_paid - o.amount_refunded, 'customer_cancelled', auth.uid());
  end if;
  if not o.points_refunded and o.points_redeemed > 0 then
    update public.profiles set club_points = club_points + o.points_redeemed where id = o.user_id;
    update public.orders set points_refunded = true where id = o.id;
  end if;
  insert into public.audit_log (actor, action, entity, entity_id, details)
  values (auth.uid(), 'order.cancelled_by_customer', 'order', o.order_no, jsonb_build_object('from', o.status, 'paid', o.payment_status = 'paid'));
  return 'cancelled';
end;
$$;
revoke execute on function public.cancel_my_order(text) from public, anon;
grant execute on function public.cancel_my_order(text) to authenticated, service_role;
