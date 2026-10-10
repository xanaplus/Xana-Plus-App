-- Only general-customer BC prices, in the base selling unit and inclusive of VAT.
alter table public.products add column if not exists wholesale_tiers jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists wholesale_synced_at timestamptz;

create or replace function public.replace_bc_wholesale_tiers(p_rows jsonb, p_started_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_products integer; v_tiers integer;
begin
  perform pg_advisory_xact_lock(hashtext('bc-wholesale-sync'));
  if p_started_at is null or jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'invalid_tier_snapshot'; end if;
  if exists(select 1 from products where wholesale_synced_at > p_started_at) then raise exception 'stale_tier_snapshot'; end if;
  if exists(select 1 from jsonb_array_elements(p_rows) r
    where coalesce(r->>'item_no','')='' or jsonb_typeof(r->'tiers') is distinct from 'array')
    or (select count(*) from jsonb_array_elements(p_rows)) <> (select count(distinct r->>'item_no') from jsonb_array_elements(p_rows) r)
  then raise exception 'invalid_tier_snapshot'; end if;
  if exists(select 1 from jsonb_array_elements(p_rows) r cross join lateral jsonb_array_elements(r->'tiers') t
    where jsonb_typeof(t->'minQty') is distinct from 'number' or jsonb_typeof(t->'unitPrice') is distinct from 'number'
      or (t->>'minQty')::numeric <= 1 or (t->>'unitPrice')::numeric <= 0)
  then raise exception 'invalid_tier_snapshot'; end if;
  -- Complete snapshots also clear tiers removed from BC. Never partially apply a page.
  with snapshot as (
    select r->>'item_no' as item_no, r->'tiers' as tiers from jsonb_array_elements(p_rows) r
  ), complete_snapshot as (
    select p.item_no, coalesce(s.tiers,'[]'::jsonb) as tiers from products p left join snapshot s using(item_no)
  )
  update products p set wholesale_tiers = s.tiers, wholesale_synced_at = clock_timestamp()
    from complete_snapshot s where s.item_no=p.item_no;
  select count(*), coalesce(sum(jsonb_array_length(wholesale_tiers)),0) into v_products,v_tiers
    from products where jsonb_array_length(wholesale_tiers)>0;
  return jsonb_build_object('products',v_products,'tiers',v_tiers);
end $$;
revoke all on function public.replace_bc_wholesale_tiers(jsonb,timestamptz) from public, anon, authenticated;
grant execute on function public.replace_bc_wholesale_tiers(jsonb,timestamptz) to service_role;

-- Preserve existing column order and access; append only safe, public price rules.
create or replace view public.catalogue as
select item_no, description as name, unit_price as price, greatest(inventory,0::numeric) as stock,
  inventory_posting_group as category, item_category_code, gtin,
  (inventory_posting_group='CONTROLLED' or item_category_code=any(array['PHARMACY','POM','CHRONIC','CONTROLLED'])
    or item_category_code is null and inventory_posting_group='CHRONIC') as requires_rx,
  inventory_posting_group='WINES & SPIRITS' as age_restricted,
  photo_url, photo_url is not null as has_photo, coalesce(inventory,0::numeric)>0 as in_stock,
  wholesale_tiers as price_tiers
from public.products where is_active and unit_price>0::numeric;

-- Separate from the existing item sync; follows its 03:30 UTC refresh.
select cron.schedule('bc-wholesale-sync-daily','35 3 * * *',$job$
  select net.http_post(
    url := 'https://yinlbtldfojobuwddpsj.supabase.co/functions/v1/bc-wholesale-sync',
    headers := jsonb_build_object('Content-Type','application/json','x-sync-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='bc_sync_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 300000
  );
$job$);
