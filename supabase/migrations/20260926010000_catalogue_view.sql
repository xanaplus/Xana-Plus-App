-- Customer-facing catalogue. products stays service-role only (it holds costs
-- and margins); the app reads this view instead, which exposes only what a
-- customer may see. The view runs with its owner's rights, which is what lets
-- anon read it while products itself has no RLS policies.
--
-- requires_rx: BC doesn't flag prescription medicines reliably, so the default
-- is safe — every PHARMACY / POM / CHRONIC / CONTROLLED item needs an Rx. The
-- pharmacy team clears an item by changing its Item Category Code in BC to OTC;
-- the next sync picks that up. CONTROLLED posting group always needs an Rx.
--
-- age_restricted: alcohol. The app asks for an 18+ confirmation before checkout.
--
-- unit_price includes VAT (confirmed with the business 26 Sep 2026).

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
  inventory_posting_group = 'WINES & SPIRITS' as age_restricted
from public.products
where is_active
  and unit_price > 0;

grant select on public.catalogue to anon, authenticated;
