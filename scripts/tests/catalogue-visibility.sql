-- Rollback-only regression check. Does not invoke BC, SMS or order creation.
begin;

do $$
declare
  original_row public.products%rowtype;
  new_visible boolean;
begin
  select * into strict original_row from public.products where item_no='DEL0200';
  if original_row.show_on_website then raise exception 'listed_product_visible'; end if;

  -- Same explicit field set and conflict-update semantics as bc-items-sync.
  insert into public.products (
    item_no, description, item_category_code, last_direct_cost, unit_price,
    inventory, gtin, vat_prod_posting_group, inventory_posting_group,
    is_active, last_synced_at
  ) values (
    original_row.item_no, original_row.description, original_row.item_category_code,
    original_row.last_direct_cost, original_row.unit_price, original_row.inventory,
    original_row.gtin, original_row.vat_prod_posting_group, original_row.inventory_posting_group,
    true, clock_timestamp()
  ) on conflict(item_no) do update set
    description=excluded.description, item_category_code=excluded.item_category_code,
    last_direct_cost=excluded.last_direct_cost, unit_price=excluded.unit_price,
    inventory=excluded.inventory, gtin=excluded.gtin,
    vat_prod_posting_group=excluded.vat_prod_posting_group,
    inventory_posting_group=excluded.inventory_posting_group,
    is_active=excluded.is_active, last_synced_at=excluded.last_synced_at;
  if (select show_on_website from public.products where item_no=original_row.item_no) then
    raise exception 'bc_upsert_reset_visibility';
  end if;
  if exists(select 1 from public.catalogue where item_no=original_row.item_no) then
    raise exception 'bc_upsert_exposed_hidden_product';
  end if;

  insert into public.products(item_no,description,unit_price,inventory)
    values('__catalogue_visibility_test__','Synthetic rollback-only visibility test',1,1)
    returning show_on_website into new_visible;
  if not new_visible then raise exception 'new_product_not_visible_by_default'; end if;
  if not exists(select 1 from public.catalogue where item_no='__catalogue_visibility_test__') then
    raise exception 'new_eligible_product_missing_from_catalogue';
  end if;

  update public.products set show_on_website=true where item_no=original_row.item_no;
  if original_row.is_active and original_row.unit_price>0 and
    not exists(select 1 from public.catalogue where item_no=original_row.item_no) then
    raise exception 'visibility_cannot_be_restored';
  end if;
end $$;

select 'PASS: BC-shaped upserts preserve hidden status, new products default visible, and visibility is reversible. No changes committed.' as result;
rollback;
