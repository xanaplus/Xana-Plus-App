-- Synthetic fixtures only, always rolled back. No SMS or committed orders.
begin;

insert into public.products(item_no,description,unit_price,inventory,inventory_posting_group,item_category_code)
values
  ('__rx_rule_controlled__','Synthetic controlled fixture',1,10,'CONTROLLED','PHARMACY'),
  ('__rx_rule_controlled_null__','Synthetic controlled without category',1,10,'CONTROLLED',null),
  ('__rx_rule_otc__','Synthetic OTC fixture',1,10,'OVER THE COUNTER','PHARMACY'),
  ('__rx_rule_chronic__','Synthetic chronic fixture',1,10,'CHRONIC','CHRONIC'),
  ('__rx_rule_general_pom__','Synthetic general POM fixture',1,10,'GENERAL','POM'),
  ('__rx_rule_supplement__','Synthetic supplement fixture',1,10,'SUPPLEMENT','PHARMACY'),
  ('__rx_rule_category_only__','Synthetic item category is not the BC group',1,10,'GENERAL','CONTROLLED'),
  ('__rx_rule_null_group__','Synthetic unclassified fixture',1,10,null,'PHARMACY'),
  ('__rx_rule_wine__','Synthetic age-restricted fixture',1,10,'WINES & SPIRITS',null);

do $$
begin
  if (select count(*) from public.catalogue where item_no like '__rx_rule_%') <> 9 then
    raise exception 'prescription_fixtures_missing';
  end if;
  if exists(select 1 from public.catalogue where item_no like '__rx_rule_%'
    and requires_rx is distinct from coalesce(category='CONTROLLED',false)) then
    raise exception 'prescription_mapping_incorrect';
  end if;
  if (select count(*) from public.catalogue where item_no like '__rx_rule_%' and requires_rx) <> 2 then
    raise exception 'only_controlled_should_require_prescriptions';
  end if;
  if not (select age_restricted from public.catalogue where item_no='__rx_rule_wine__') then
    raise exception 'age_restriction_changed';
  end if;

  -- Simulate BC changing the authoritative posting group, without changing
  -- the generic item category. The view must pick it up immediately.
  update public.products set inventory_posting_group='CONTROLLED' where item_no='__rx_rule_otc__';
  if not (select requires_rx from public.catalogue where item_no='__rx_rule_otc__') then
    raise exception 'bc_group_change_did_not_require_prescription';
  end if;
  update public.products set inventory_posting_group='OVER THE COUNTER' where item_no='__rx_rule_otc__';
  if (select requires_rx from public.catalogue where item_no='__rx_rule_otc__') then
    raise exception 'bc_group_change_did_not_clear_prescription';
  end if;

  update public.products set item_category_code='SUPPLEMENT' where item_no='__rx_rule_controlled__';
  if not (select requires_rx from public.catalogue where item_no='__rx_rule_controlled__') then
    raise exception 'item_category_bypassed_controlled_group';
  end if;
  update public.products set show_on_website=false where item_no='__rx_rule_controlled__';
  if exists(select 1 from public.catalogue where item_no='__rx_rule_controlled__') then
    raise exception 'prescription_rule_bypassed_visibility';
  end if;
  if has_table_privilege('anon','public.catalogue','INSERT') or
    has_table_privilege('anon','public.catalogue','UPDATE') or
    has_table_privilege('anon','public.catalogue','DELETE') then
    raise exception 'public_catalogue_is_not_read_only';
  end if;
end $$;

select 'PASS: only the BC Controlled group requires prescriptions; category changes, visibility and age restrictions remain correct. No changes committed.' as result;
rollback;
