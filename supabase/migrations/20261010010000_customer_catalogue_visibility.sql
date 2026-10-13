-- App-owned visibility; never sent to or overwritten by Business Central.
-- Exact item list supplied by the Xana website handoff: docs/hide-from-website.csv.
alter table public.products
  add column if not exists show_on_website boolean not null default true;

update public.products set show_on_website = false where item_no in (
  'DEL0200', 'DEL0202', 'DEL0203', 'DEL0204', 'DEL0205',
  'DEL0102', 'DEL0110', 'DEL0164', 'DEL0187', 'DEL0193',
  'DEL0206', 'DEL0207', 'DEL0208', 'DEL0209', 'DEL0210',
  'DEL0212', 'DEL0213', 'DEL0214', 'DEL0215', 'DEL0216',
  'DEL0217', 'DEL0218', 'DEL0219', 'DEL0220', 'DEL0221',
  'DEL0222', 'DEL0223', 'DEL0224', 'DEL0226', 'DEL0227',
  'DEL0228', 'DEL0229', 'DEL0230', 'DEL0237', 'DEL0238',
  'DEL0239', 'DEL0240', 'DEL0246', 'DEL0247', 'DEL0248',
  'DEL0249', 'DEL0251', 'DEL0252', 'DEL0253', 'DEL0254',
  'DEL0255', 'DEL0261', 'DEL0263', 'DEL0264', 'DEL0265',
  'DEL0266', 'DEL0267', 'DEL0268',
  'FS0299', 'FS0300', 'FS0398', 'FS0399', 'FS0400', 'FS0401', 'FS0520'
);

-- Preserve all existing columns, order, types and regulatory/stock/price rules.
-- Neither the visibility flag nor private cost/margin columns are exposed.
create or replace view public.catalogue as
select item_no, description as name, unit_price as price, greatest(inventory,0::numeric) as stock,
  inventory_posting_group as category, item_category_code, gtin,
  (inventory_posting_group='CONTROLLED' or item_category_code=any(array['PHARMACY','POM','CHRONIC','CONTROLLED'])
    or item_category_code is null and inventory_posting_group='CHRONIC') as requires_rx,
  inventory_posting_group='WINES & SPIRITS' as age_restricted,
  photo_url, photo_url is not null as has_photo, coalesce(inventory,0::numeric)>0 as in_stock,
  wholesale_tiers as price_tiers
from public.products where is_active and unit_price>0::numeric and show_on_website;

-- The website/app may read the view, but cannot mutate products through it.
revoke insert, update, delete, truncate, references, trigger on public.catalogue
  from public, anon, authenticated;
grant select on public.catalogue to anon, authenticated;

