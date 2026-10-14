-- Applied to the shared database by the website team on 14 Oct 2026; copied here from the live migration history so both repos share one history. Source and notes: xanaplus/Xana-Website docs/upstream/.
create table if not exists public.stock_locations (
  code text primary key check (code = upper(code) and code ~ '^[A-Z0-9_-]{1,20}$'),
  name text not null check (char_length(name) between 1 and 60),
  sync boolean not null default true,
  pickup boolean not null default false,
  last_synced_at timestamptz,
  last_item_count integer check (last_item_count is null or last_item_count >= 0),
  created_at timestamptz not null default now()
);

insert into public.stock_locations (code, name, sync, pickup) values
  ('SYOKIMAU', 'Syokimau', true, true),
  ('RUIRU', 'Ruiru', true, true)
on conflict (code) do nothing;

create table if not exists public.product_location_stock (
  location_code text not null references public.stock_locations (code) on delete cascade,
  item_no text not null references public.products (item_no) on delete cascade on update cascade,
  quantity numeric not null,
  synced_at timestamptz not null,
  primary key (location_code, item_no)
);
create index if not exists product_location_stock_item_no_idx on public.product_location_stock (item_no);

create table if not exists public.bc_stock_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),
  trigger text not null default 'cron' check (trigger in ('cron', 'manual')),
  locations jsonb not null default '{}'::jsonb,
  duration_ms integer,
  error text
);
create index if not exists bc_stock_sync_runs_started_at_idx on public.bc_stock_sync_runs (started_at desc);

alter table public.stock_locations enable row level security;
alter table public.product_location_stock enable row level security;
alter table public.bc_stock_sync_runs enable row level security;
revoke all on public.stock_locations, public.product_location_stock, public.bc_stock_sync_runs from anon, authenticated;
grant all on public.stock_locations, public.product_location_stock, public.bc_stock_sync_runs to service_role;

create or replace function public.replace_bc_location_stock(
  p_location text, p_rows jsonb, p_started_at timestamptz, p_allow_short boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_location public.stock_locations%rowtype;
  v_received integer;
  v_written integer;
  v_unknown integer;
  v_zeroed integer;
begin
  if p_location is null or p_started_at is null or jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'invalid_stock_snapshot' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('bc-stock-sync:' || upper(p_location)));

  select * into v_location from public.stock_locations where code = upper(p_location) for update;
  if not found or not v_location.sync then
    raise exception 'unknown_location' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_rows) r
     where jsonb_typeof(r) is distinct from 'object'
        or jsonb_typeof(r -> 'item_no') is distinct from 'string'
        or btrim(r ->> 'item_no') = ''
        or jsonb_typeof(r -> 'quantity') is distinct from 'number'
  ) then
    raise exception 'invalid_stock_snapshot' using errcode = '22023';
  end if;

  select count(*) into v_received from jsonb_array_elements(p_rows);
  if v_received = 0 then
    raise exception 'empty_stock_snapshot' using errcode = '22023';
  end if;
  if v_received <> (select count(distinct btrim(r ->> 'item_no')) from jsonb_array_elements(p_rows) r) then
    raise exception 'duplicate_stock_item' using errcode = '22023';
  end if;

  if v_location.last_synced_at is not null and v_location.last_synced_at > p_started_at then
    raise exception 'stale_stock_snapshot' using errcode = '22023';
  end if;

  if not p_allow_short and coalesce(v_location.last_item_count, 0) > 0
     and v_received < v_location.last_item_count * 0.8 then
    raise exception 'short_stock_snapshot' using errcode = '22023',
      detail = format('%s rows received, %s last time', v_received, v_location.last_item_count);
  end if;

  select count(*) into v_unknown
    from jsonb_array_elements(p_rows) r
   where not exists (select 1 from public.products p where p.item_no = btrim(r ->> 'item_no'));

  insert into public.product_location_stock (location_code, item_no, quantity, synced_at)
  select v_location.code, p.item_no, (r ->> 'quantity')::numeric, clock_timestamp()
    from jsonb_array_elements(p_rows) r
    join public.products p on p.item_no = btrim(r ->> 'item_no')
  on conflict (location_code, item_no)
    do update set quantity = excluded.quantity, synced_at = excluded.synced_at;
  get diagnostics v_written = row_count;

  update public.product_location_stock pls
     set quantity = 0, synced_at = clock_timestamp()
   where pls.location_code = v_location.code
     and pls.quantity <> 0
     and not exists (select 1 from jsonb_array_elements(p_rows) r where btrim(r ->> 'item_no') = pls.item_no);
  get diagnostics v_zeroed = row_count;

  update public.stock_locations
     set last_synced_at = clock_timestamp(), last_item_count = v_received
   where code = v_location.code;

  return jsonb_build_object(
    'location', v_location.code, 'received', v_received, 'written', v_written,
    'unknown', v_unknown, 'zeroed', v_zeroed);
end;
$$;

revoke execute on function public.replace_bc_location_stock(text, jsonb, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.replace_bc_location_stock(text, jsonb, timestamptz, boolean) to service_role;

create or replace view public.catalogue as
 SELECT item_no,
    description AS name,
    unit_price AS price,
    GREATEST(inventory, 0::numeric) AS stock,
    inventory_posting_group AS category,
    item_category_code,
    gtin,
    COALESCE(inventory_posting_group = 'CONTROLLED'::text, false) AS requires_rx,
    inventory_posting_group = 'WINES & SPIRITS'::text AS age_restricted,
    photo_url,
    photo_url IS NOT NULL AS has_photo,
    COALESCE(inventory, 0::numeric) > 0::numeric AS in_stock,
    wholesale_tiers AS price_tiers,
    ( SELECT jsonb_object_agg(l.code,
               CASE WHEN l.last_synced_at IS NULL THEN NULL
                    ELSE GREATEST(COALESCE(s.quantity, 0::numeric), 0::numeric) END
               ORDER BY l.code)
        FROM public.stock_locations l
        LEFT JOIN public.product_location_stock s ON s.location_code = l.code AND s.item_no = products.item_no
       WHERE l.pickup) AS stock_by_location
   FROM public.products
  WHERE is_active AND unit_price > 0::numeric AND show_on_website;