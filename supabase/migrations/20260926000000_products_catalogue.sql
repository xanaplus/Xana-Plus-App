-- Catalogue mirrored from Business Central. Schema follows the Xana Ledger
-- bc-items-sync guide so the nightly sync can take over from the Excel import
-- without changes. item_no (BC "No.") is the upsert key; rows are never
-- deleted, only set is_active = false.

create table if not exists public.products (
  id                         uuid primary key default gen_random_uuid(),
  item_no                    text unique,
  description                text,
  item_category_code         text,
  last_direct_cost           numeric default 0,
  unit_price                 numeric default 0,
  inventory                  numeric default 0,    -- total across all locations
  gtin                       text,
  vat_prod_posting_group     text,
  inventory_posting_group    text,

  -- Not provided by the BC artemis API; filled only by the Excel import.
  -- The sync must never write these.
  profit_percent             numeric default 0,
  vendor_no                  text,
  shopify_synced             boolean default false,
  item_category_code_1       text,
  inventory_posting_group_1  text,
  default_deferral_template  text,

  is_active                  boolean not null default true,
  last_synced_at             timestamptz,
  created_at                 timestamptz default now()
);

create index if not exists idx_products_is_active on public.products (is_active) where is_active;

-- RLS on with no policies: only the service role can read or write. Costs and
-- margins live in this table, so the app gets access later through a view or
-- policy that exposes customer-facing columns only.
alter table public.products enable row level security;

create table if not exists public.bc_sync_runs (
  id                 uuid primary key default gen_random_uuid(),
  started_at         timestamptz not null default now(),
  finished_at        timestamptz,
  status             text not null default 'running',  -- running | success | partial | failed
  trigger            text not null default 'cron',     -- cron | manual | excel_import
  bc_item_count      integer,
  created_count      integer,
  updated_count      integer,
  deactivated_count  integer,
  pages_fetched      integer,
  duration_ms        integer,
  error              text
);

create index if not exists idx_bc_sync_runs_started_at on public.bc_sync_runs (started_at desc);

alter table public.bc_sync_runs enable row level security;
