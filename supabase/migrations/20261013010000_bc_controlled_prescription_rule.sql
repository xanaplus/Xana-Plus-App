-- Owner-approved rule: only BC's CONTROLLED inventory posting group needs Rx.
-- Item category codes (including PHARMACY/POM/CHRONIC/CONTROLLED) are not
-- prescription authority. Keep every other public field and visibility rule.
create or replace view public.catalogue as
select item_no, description as name, unit_price as price, greatest(inventory,0::numeric) as stock,
  inventory_posting_group as category, item_category_code, gtin,
  coalesce(inventory_posting_group='CONTROLLED',false) as requires_rx,
  inventory_posting_group='WINES & SPIRITS' as age_restricted,
  photo_url, photo_url is not null as has_photo, coalesce(inventory,0::numeric)>0 as in_stock,
  wholesale_tiers as price_tiers
from public.products where is_active and unit_price>0::numeric and show_on_website;

-- CREATE OR REPLACE preserves the existing read-only grants and ownership.
-- Existing checkout and prescription-order guards read requires_rx from this
-- view; no clinical approval checks, order records or BC product rows change.
