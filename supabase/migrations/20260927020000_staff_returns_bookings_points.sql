-- Staff tools, return requests, clinic bookings and real Xana Club points.
--
-- Staff are ordinary signed-in accounts listed in public.staff. They can read
-- every order, return and booking, and move them along; customers still see
-- only their own. Order status changes go through staff_set_order_status(),
-- which is also where points are earned (on delivery) and given back (on
-- cancellation), so the two can never drift apart.

-- Staff list. Rows are added by an admin (SQL editor / service role) only.
create table public.staff (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);

alter table public.staff enable row level security;

create policy "Staff read their own staff row"
  on public.staff for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.staff from anon, authenticated;

create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff where user_id = (select auth.uid()));
$$;

revoke all on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;

-- Staff read every order, its lines and the customer's profile (for the phone number).
create policy "Staff read all orders"
  on public.orders for select
  to authenticated
  using ((select public.is_staff()));

create policy "Staff read all order items"
  on public.order_items for select
  to authenticated
  using ((select public.is_staff()));

create policy "Staff read customer profiles"
  on public.profiles for select
  to authenticated
  using ((select public.is_staff()));

-- Points bookkeeping on each order, so earning and refunding happen once.
alter table public.orders
  add column updated_at      timestamptz not null default now(),
  add column points_awarded  boolean not null default false,
  add column points_refunded boolean not null default false;

-- Takes points off a balance only if it holds enough. Called by place-order (service role).
create function public.spend_club_points(p_user uuid, p_points integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_points <= 0 then
    return true;
  end if;
  update public.profiles
     set club_points = club_points - p_points
   where id = p_user and club_points >= p_points;
  return found;
end;
$$;

revoke all on function public.spend_club_points(uuid, integer) from public, anon, authenticated;

-- Staff move an order to its next state. Delivered adds the points earned;
-- cancelled gives back any points spent. Returns the new status.
create function public.staff_set_order_status(p_order_no text, p_status text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders%rowtype;
begin
  if not public.is_staff() then
    raise exception 'not_staff' using errcode = '42501';
  end if;
  if p_status not in ('received', 'shopping', 'out-for-delivery', 'delivered', 'cancelled') then
    raise exception 'bad_status' using errcode = '22023';
  end if;

  select * into o from public.orders where order_no = p_order_no for update;
  if not found then
    raise exception 'no_order' using errcode = 'P0002';
  end if;
  if o.status in ('delivered', 'cancelled') then
    raise exception 'order_closed' using errcode = '22023';
  end if;

  update public.orders set status = p_status, updated_at = now() where id = o.id;

  if p_status = 'delivered' and not o.points_awarded and o.user_id is not null and o.points_earned > 0 then
    update public.profiles set club_points = club_points + o.points_earned where id = o.user_id;
    update public.orders set points_awarded = true where id = o.id;
  end if;

  if p_status = 'cancelled' and not o.points_refunded and o.user_id is not null and o.points_redeemed > 0 then
    update public.profiles set club_points = club_points + o.points_redeemed where id = o.user_id;
    update public.orders set points_refunded = true where id = o.id;
  end if;

  return p_status;
end;
$$;

revoke all on function public.staff_set_order_status(text, text) from public, anon;
grant execute on function public.staff_set_order_status(text, text) to authenticated;

-- Return requests from a delivered order. order_no is text so returns on the
-- app's sample orders (not in the database) can still be recorded.
create table public.return_requests (
  id           uuid primary key default gen_random_uuid(),
  -- Short reference the customer and branch quote, e.g. RET-4F2A9C.
  ref          text not null unique default ('RET-' || upper(substr(md5(gen_random_uuid()::text), 1, 6))),
  user_id      uuid default auth.uid() references auth.users (id) on delete set null,
  order_no     text not null check (char_length(order_no) between 1 and 30),
  items        jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 100),
  reason       text not null check (reason in ('wrong-item', 'damaged', 'expired', 'no-longer-needed', 'other')),
  notes        text check (notes is null or char_length(notes) <= 1000),
  refund_to    text not null check (refund_to in ('mpesa', 'club-credit')),
  refund_estimate numeric not null check (refund_estimate >= 0),
  status       text not null default 'requested' check (status in ('requested', 'approved', 'rejected', 'refunded')),
  staff_note   text check (staff_note is null or char_length(staff_note) <= 500),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index return_requests_created_idx on public.return_requests (created_at desc);

alter table public.return_requests enable row level security;

create policy "Customers create their own returns"
  on public.return_requests for insert
  to authenticated
  with check ((select auth.uid()) = user_id and status = 'requested' and staff_note is null);

create policy "Customers read their own returns"
  on public.return_requests for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Staff read all returns"
  on public.return_requests for select
  to authenticated
  using ((select public.is_staff()));

create policy "Staff update returns"
  on public.return_requests for update
  to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

revoke all on public.return_requests from anon;
revoke update on public.return_requests from authenticated;
grant select, insert on public.return_requests to authenticated;
grant update (status, staff_note, updated_at) on public.return_requests to authenticated;

-- Clinic bookings (blood pressure checks, vaccinations and so on).
create table public.clinic_bookings (
  id           uuid primary key default gen_random_uuid(),
  ref          text not null unique default ('BK-' || upper(substr(md5(gen_random_uuid()::text), 1, 6))),
  user_id      uuid default auth.uid() references auth.users (id) on delete set null,
  service_id   text not null check (char_length(service_id) between 1 and 60),
  service_name text not null check (char_length(service_name) between 1 and 120),
  price        numeric not null check (price >= 0),
  store_name   text not null check (char_length(store_name) between 1 and 120),
  slot_label   text not null check (char_length(slot_label) between 1 and 120),
  notes        text check (notes is null or char_length(notes) <= 1000),
  status       text not null default 'requested' check (status in ('requested', 'confirmed', 'completed', 'cancelled')),
  staff_note   text check (staff_note is null or char_length(staff_note) <= 500),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index clinic_bookings_created_idx on public.clinic_bookings (created_at desc);

alter table public.clinic_bookings enable row level security;

create policy "Customers create their own bookings"
  on public.clinic_bookings for insert
  to authenticated
  with check ((select auth.uid()) = user_id and status = 'requested' and staff_note is null);

create policy "Customers read their own bookings"
  on public.clinic_bookings for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Staff read all bookings"
  on public.clinic_bookings for select
  to authenticated
  using ((select public.is_staff()));

create policy "Staff update bookings"
  on public.clinic_bookings for update
  to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

revoke all on public.clinic_bookings from anon;
revoke update on public.clinic_bookings from authenticated;
grant select, insert on public.clinic_bookings to authenticated;
grant update (status, staff_note, updated_at) on public.clinic_bookings to authenticated;

-- Live updates: customers see their order move without refreshing.
alter publication supabase_realtime add table public.orders;
