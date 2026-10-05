-- Orders slice. Customers read their own orders; only the place-order Edge
-- Function (service role) creates them, after re-pricing every line from the
-- catalogue so the app cannot set its own prices.
--
-- is_test: M-Pesa is still simulated, so every order is a test order until
-- real payment is connected. Staff tools must filter these out.
-- Prescriptions: only the reference the customer typed is kept. No files are
-- stored until the business decides where prescription photos live.

create table public.orders (
  id               uuid primary key default gen_random_uuid(),
  order_no         text not null unique,                 -- "XN-4821", shown to the customer
  user_id          uuid not null references auth.users (id) on delete restrict,
  created_at       timestamptz not null default now(),
  status           text not null default 'received'
                   check (status in ('received', 'shopping', 'out-for-delivery', 'delivered', 'cancelled')),
  is_test          boolean not null default true,

  payment_method   text not null check (payment_method in ('mpesa', 'cod', 'card')),
  payment_status   text not null default 'simulated'
                   check (payment_status in ('simulated', 'pending', 'paid', 'failed', 'refunded')),
  payment_reference text,

  contact          text not null,
  address_line     text not null,
  slot_label       text not null,
  store_name       text not null,
  substitution     text not null check (substitution in ('similar', 'refund', 'call')),

  -- Money in KES, prices incl. VAT as Business Central holds them.
  items_subtotal   numeric not null,
  delivery_fee     numeric not null,
  platform_fee     numeric not null,
  total            numeric not null,
  points_redeemed  integer not null default 0 check (points_redeemed >= 0),
  amount_due       numeric not null,
  points_earned    integer not null default 0,

  age_confirmed    boolean not null default false,
  rx_reference     text
);

create index orders_user_created_idx on public.orders (user_id, created_at desc);

create table public.order_items (
  id              bigint generated always as identity primary key,
  order_id        uuid not null references public.orders (id) on delete cascade,
  item_no         text not null,         -- BC item number at the time of the order
  name            text not null,
  unit_price      numeric not null,
  quantity        integer not null check (quantity > 0),
  line_total      numeric not null,
  requires_rx     boolean not null default false,
  age_restricted  boolean not null default false
);

create index order_items_order_idx on public.order_items (order_id);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy "Customers read their own orders"
  on public.orders for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Customers read their own order items"
  on public.order_items for select
  to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())));

revoke insert, update, delete on public.orders from anon, authenticated;
revoke insert, update, delete on public.order_items from anon, authenticated;
