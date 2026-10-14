-- Applied to the shared database by the website team on 14 Oct 2026; copied here from the live migration history so both repos share one history. Source and notes: xanaplus/Xana-Website docs/upstream/.
update public.products
   set show_on_website = false
 where show_on_website
   and item_no in (
     'GC0061',
     'FS0904', 'FS0905', 'FS0906',
     'CH0180', 'LUG0010', 'LUG0011', 'LUG0044', 'LUG0050', 'LUG0051'
   );

create or replace view public.catalogue as
 SELECT item_no,
    description AS name,
    unit_price AS price,
    GREATEST(inventory, 0::numeric) AS stock,
    inventory_posting_group AS category,
    item_category_code,
    gtin,
    (COALESCE(upper(btrim(inventory_posting_group)) = 'CONTROLLED'::text, false)
      OR upper(item_no) LIKE 'CONTR%'::text) AS requires_rx,
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
       WHERE l.pickup) AS stock_by_location,
    vat_prod_posting_group AS vat_group
   FROM public.products
  WHERE is_active AND unit_price > 0::numeric AND show_on_website;