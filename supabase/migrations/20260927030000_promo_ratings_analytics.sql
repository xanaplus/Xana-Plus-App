-- Promo codes, "rate your order", and usage + crash tracking.
--
-- Promo codes are checked in the database only: the app asks check_promo()
-- for a preview, and place-order asks promo_quote() again with the server's
-- own subtotal, so a code can never be stretched past its rules.
-- Codes are added by the office (SQL editor) until there is an Offers page.
--
-- Usage tracking: the app writes small events (screen opened, added to cart,
-- order placed) and crash reports. Nobody but staff can read them back.

-- ---------------------------------------------------------------- promo codes

create table public.promo_codes (
  code              text primary key check (code = upper(code) and char_length(code) between 3 and 30),
  description       text not null check (char_length(description) between 1 and 120),
  kind              text not null check (kind in ('percent', 'fixed')),
  -- Percent (1..100) or KES off.
  value             numeric not null check (value > 0),
  -- Smallest items subtotal (KES) the code works on.
  min_spend         numeric not null default 0 check (min_spend >= 0),
  -- Cap on a percent discount, in KES; null = no cap.
  max_discount      numeric check (max_discount is null or max_discount > 0),
  starts_at         timestamptz not null default now(),
  ends_at           timestamptz,
  -- Total uses across everyone; null = unlimited.
  max_uses          integer check (max_uses is null or max_uses > 0),
  once_per_customer boolean not null default true,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  check (kind <> 'percent' or value <= 100)
);

alter table public.promo_codes enable row level security;
revoke all on public.promo_codes from anon, authenticated;

create policy "Staff read promo codes"
  on public.promo_codes for select
  to authenticated
  using ((select public.is_staff()));
grant select on public.promo_codes to authenticated;

alter table public.orders
  add column promo_code     text references public.promo_codes (code),
  add column promo_discount numeric not null default 0 check (promo_discount >= 0);

create index orders_promo_idx on public.orders (promo_code) where promo_code is not null;

-- The discount a code gives this customer on this subtotal, or why it doesn't
-- apply: { discount, code, description } or { error }. Cancelled orders don't
-- use up a code. Service role only; customers go through check_promo().
create function public.promo_quote(p_code text, p_user uuid, p_subtotal numeric)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.promo_codes%rowtype;
  used integer;
  discount numeric;
begin
  select * into p from public.promo_codes where code = upper(trim(p_code)) and active;
  if not found then
    return jsonb_build_object('error', 'promo_unknown');
  end if;
  if now() < p.starts_at or (p.ends_at is not null and now() >= p.ends_at) then
    return jsonb_build_object('error', 'promo_expired');
  end if;
  if p_subtotal < p.min_spend then
    return jsonb_build_object('error', 'promo_min_spend', 'min_spend', p.min_spend);
  end if;
  if p.once_per_customer and p_user is not null and exists (
    select 1 from public.orders
     where user_id = p_user and promo_code = p.code and status <> 'cancelled'
  ) then
    return jsonb_build_object('error', 'promo_used');
  end if;
  if p.max_uses is not null then
    select count(*) into used from public.orders where promo_code = p.code and status <> 'cancelled';
    if used >= p.max_uses then
      return jsonb_build_object('error', 'promo_limit');
    end if;
  end if;

  if p.kind = 'percent' then
    discount := floor(p_subtotal * p.value / 100);
    if p.max_discount is not null then
      discount := least(discount, p.max_discount);
    end if;
  else
    discount := p.value;
  end if;
  discount := least(discount, p_subtotal);

  return jsonb_build_object('code', p.code, 'description', p.description, 'discount', discount);
end;
$$;

revoke all on function public.promo_quote(text, uuid, numeric) from public, anon, authenticated;

-- Preview for the checkout "Apply" button, for the signed-in customer.
create function public.check_promo(p_code text, p_subtotal numeric)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.promo_quote(p_code, (select auth.uid()), p_subtotal);
$$;

revoke all on function public.check_promo(text, numeric) from public, anon;
grant execute on function public.check_promo(text, numeric) to authenticated;

-- One code to test with. Real codes are added by the office.
insert into public.promo_codes (code, description, kind, value, min_spend, max_discount)
values ('TEST10', '10% off (test code)', 'percent', 10, 500, 500);

-- ---------------------------------------------------------- rate your order

-- order_no is text so the demo's sample orders (not in the database) can be rated too.
create table public.order_ratings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid default auth.uid() references auth.users (id) on delete set null,
  order_no    text not null check (char_length(order_no) between 1 and 30),
  -- The rider, or the counter for a pickup order.
  service     text check (service in ('up', 'down')),
  packing     text check (packing in ('up', 'down')),
  missing_items boolean not null default false,
  comment     text check (comment is null or char_length(comment) <= 500),
  created_at  timestamptz not null default now(),
  unique (user_id, order_no),
  check (service is not null or packing is not null or missing_items or comment is not null)
);

create index order_ratings_created_idx on public.order_ratings (created_at desc);

alter table public.order_ratings enable row level security;

create policy "Customers rate their own orders"
  on public.order_ratings for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Customers read their own ratings"
  on public.order_ratings for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Staff read all ratings"
  on public.order_ratings for select
  to authenticated
  using ((select public.is_staff()));

revoke all on public.order_ratings from anon;
revoke update, delete on public.order_ratings from authenticated;
grant select, insert on public.order_ratings to authenticated;

-- ------------------------------------------------- usage and crash tracking

-- device_id is a random id the app makes on first open; user_id is filled in
-- when someone is signed in. Nothing here is shown to customers.
create table public.app_events (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  user_id     uuid default auth.uid() references auth.users (id) on delete set null,
  device_id   text not null check (char_length(device_id) between 8 and 64),
  name        text not null check (name ~ '^[a-z_]{2,40}$'),
  props       jsonb not null default '{}' check (jsonb_typeof(props) = 'object' and pg_column_size(props) <= 2000),
  platform    text check (platform in ('ios', 'android', 'web')),
  app_version text check (char_length(app_version) <= 20)
);

create index app_events_created_idx on public.app_events (created_at desc);
create index app_events_name_created_idx on public.app_events (name, created_at desc);

create table public.app_errors (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  user_id     uuid default auth.uid() references auth.users (id) on delete set null,
  device_id   text not null check (char_length(device_id) between 8 and 64),
  message     text not null check (char_length(message) between 1 and 500),
  stack       text check (char_length(stack) <= 4000),
  screen      text check (char_length(screen) <= 120),
  fatal       boolean not null default false,
  platform    text check (platform in ('ios', 'android', 'web')),
  app_version text check (char_length(app_version) <= 20)
);

create index app_errors_created_idx on public.app_errors (created_at desc);

alter table public.app_events enable row level security;
alter table public.app_errors enable row level security;

-- Anyone using the app may add rows (signed-out shoppers too), only as themselves.
create policy "App writes events"
  on public.app_events for insert
  to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));

create policy "App writes errors"
  on public.app_errors for insert
  to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));

create policy "Staff read events"
  on public.app_events for select
  to authenticated
  using ((select public.is_staff()));

create policy "Staff read errors"
  on public.app_errors for select
  to authenticated
  using ((select public.is_staff()));

revoke all on public.app_events, public.app_errors from anon, authenticated;
grant insert on public.app_events, public.app_errors to anon, authenticated;
grant select on public.app_events, public.app_errors to authenticated;

-- What Staff tools → Insights shows for the last p_days days: the shopping
-- funnel (distinct phones at each step), crashes, ratings and promo code use.
create function public.staff_insights(p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 90)));
  result jsonb;
begin
  if not public.is_staff() then
    raise exception 'not_staff' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'days', greatest(1, least(p_days, 90)),
    'funnel', (
      select jsonb_agg(jsonb_build_object('step', s.step, 'devices', (
        select count(distinct e.device_id) from public.app_events e where e.name = s.step and e.created_at >= since
      )) order by s.ord)
      from (values (1, 'app_open'), (2, 'product_view'), (3, 'add_to_cart'), (4, 'checkout_view'), (5, 'order_placed')) as s (ord, step)
    ),
    'order_failures', (
      select coalesce(jsonb_object_agg(reason, n), '{}'::jsonb) from (
        select coalesce(props ->> 'reason', 'unknown') as reason, count(*) as n
          from public.app_events where name = 'order_failed' and created_at >= since
         group by 1
      ) f
    ),
    'errors', jsonb_build_object(
      'count', (select count(*) from public.app_errors where created_at >= since),
      'devices', (select count(distinct device_id) from public.app_errors where created_at >= since),
      'latest', (
        select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) from (
          select created_at, message, screen, platform, fatal
            from public.app_errors where created_at >= since
           order by created_at desc limit 5
        ) x
      )
    ),
    'ratings', jsonb_build_object(
      'count', (select count(*) from public.order_ratings where created_at >= since),
      'service_up', (select count(*) from public.order_ratings where created_at >= since and service = 'up'),
      'service_down', (select count(*) from public.order_ratings where created_at >= since and service = 'down'),
      'packing_up', (select count(*) from public.order_ratings where created_at >= since and packing = 'up'),
      'packing_down', (select count(*) from public.order_ratings where created_at >= since and packing = 'down'),
      'missing', (select count(*) from public.order_ratings where created_at >= since and missing_items),
      'comments', (
        select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) from (
          select created_at, order_no, comment
            from public.order_ratings where created_at >= since and comment is not null
           order by created_at desc limit 5
        ) x
      )
    ),
    'promos', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.uses desc), '[]'::jsonb) from (
        select promo_code as code, count(*) as uses, sum(promo_discount) as discount
          from public.orders
         where promo_code is not null and status <> 'cancelled' and created_at >= since
         group by promo_code
      ) x
    )
  ) into result;

  return result;
end;
$$;

revoke all on function public.staff_insights(integer) from public, anon;
grant execute on function public.staff_insights(integer) to authenticated;
