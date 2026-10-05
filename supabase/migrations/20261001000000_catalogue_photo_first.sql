-- Shelves and search list products that have a photo first (Roystone, 1 Oct
-- 2026). PostgREST can only sort by columns, so the view gains two flags:
-- has_photo, and in_stock so search can keep in-stock items above
-- out-of-stock ones before applying the photo order.

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
  photo_url,
  photo_url is not null                  as has_photo,
  coalesce(inventory, 0) > 0             as in_stock
from public.products
where is_active
  and unit_price > 0;
