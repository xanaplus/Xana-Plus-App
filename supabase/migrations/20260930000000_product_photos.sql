-- Product photos from the Xana POS. Only the photo's public address is kept
-- here, never the image itself (the business rule since 26 Sep 2026). The
-- product-images-sync Edge Function asks the POS image API for each item and
-- writes the answer through set_product_photos().
--
-- photo_checked_at is set even when the POS has no photo, which separates
-- "no photo" from "never asked". The POS renames a photo when it is
-- re-imported, so every address is re-asked after a week.

alter table public.products
  add column if not exists photo_url        text,
  add column if not exists photo_checked_at timestamptz;

create index if not exists idx_products_photo_checked_at
  on public.products (photo_checked_at nulls first, item_no)
  where is_active and unit_price > 0;

-- One call per batch instead of one UPDATE per item.
-- rows: [{"item_no": "AF0001", "photo_url": "https://…" | null}, …]
create or replace function public.set_product_photos(rows jsonb)
returns integer
language sql
security definer
set search_path = public
as $$
  with updated as (
    update public.products p
    set photo_url = r.photo_url,
        photo_checked_at = now()
    from jsonb_to_recordset(rows) as r(item_no text, photo_url text)
    where p.item_no = r.item_no
    returning 1
  )
  select count(*)::integer from updated;
$$;

revoke all on function public.set_product_photos(jsonb) from public, anon, authenticated;
grant execute on function public.set_product_photos(jsonb) to service_role;

-- Same view as 20260926010000, plus photo_url at the end.
create or replace view public.catalogue as
select
  item_no,
  description                            as name,
  unit_price                             as price,
  greatest(inventory, 0)                 as stock,
  inventory_posting_group                as category,
  item_category_code,
  gtin,
  (
    inventory_posting_group = 'CONTROLLED'
    or item_category_code in ('PHARMACY', 'POM', 'CHRONIC', 'CONTROLLED')
    or (item_category_code is null and inventory_posting_group = 'CHRONIC')
  )                                      as requires_rx,
  inventory_posting_group = 'WINES & SPIRITS' as age_restricted,
  photo_url
from public.products
where is_active
  and unit_price > 0;

-- Every 2 minutes the function takes the next ~600 items that were never
-- asked or were last asked over a week ago (about 75 s at the POS's 8 req/s).
-- A first pass over ~10,600 items takes about 40 minutes; after that most runs
-- find nothing due and return at once. Same Vault secret as the BC sync.
select cron.schedule(
  'product-images-sync',
  '*/2 * * * *',
  $$
  select net.http_post(
    url     := 'https://yinlbtldfojobuwddpsj.supabase.co/functions/v1/product-images-sync',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'bc_sync_secret')
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);
