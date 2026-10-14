-- Applied to the shared database by the website team on 14 Oct 2026; copied here from the live migration history so both repos share one history. Source and notes: xanaplus/Xana-Website docs/upstream/.
create table if not exists public.etims_items (
  item_no text primary key check (btrim(item_no) <> ''),
  registered_name text not null check (btrim(registered_name) <> ''),
  plu_no text,
  tax_type text,
  tax_code text check (tax_code is null or tax_code ~ '^[A-G]$'),
  item_cls_code text,
  pkg_unit_cd text,
  qty_unit_cd text,
  orgn_nat_cd text,
  ruiru_store boolean not null,
  name_conflict boolean not null default false,
  conflicting_names text[],
  plu_updated_at timestamptz,
  synced_at timestamptz not null
);

create table if not exists public.etims_items_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'failed')),
  trigger text not null default 'cron' check (trigger in ('cron', 'manual')),
  pages integer,
  received integer,
  result jsonb,
  error text
);
create index if not exists etims_items_sync_runs_started_at_idx on public.etims_items_sync_runs (started_at desc);

alter table public.etims_items enable row level security;
alter table public.etims_items_sync_runs enable row level security;
revoke all on public.etims_items, public.etims_items_sync_runs from anon, authenticated;
grant all on public.etims_items, public.etims_items_sync_runs to service_role;

create or replace function public.replace_etims_items(
  p_rows jsonb, p_started_at timestamptz, p_allow_short boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_last_count integer;
  v_last_synced timestamptz;
  v_received integer;
  v_inserted integer;
  v_updated integer;
  v_removed integer;
  v_conflicts integer;
  v_ruiru integer;
begin
  if p_started_at is null or jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'invalid_items_snapshot' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('etims-items-sync'));

  if exists (
    select 1 from jsonb_array_elements(p_rows) r
     where jsonb_typeof(r) is distinct from 'object'
        or jsonb_typeof(r -> 'item_no') is distinct from 'string' or btrim(r ->> 'item_no') = ''
        or jsonb_typeof(r -> 'registered_name') is distinct from 'string' or btrim(r ->> 'registered_name') = ''
        or jsonb_typeof(r -> 'ruiru_store') is distinct from 'boolean'
        or jsonb_typeof(r -> 'name_conflict') is distinct from 'boolean'
        or exists (
          select 1 from unnest(array['plu_no', 'tax_type', 'item_cls_code', 'pkg_unit_cd', 'qty_unit_cd', 'orgn_nat_cd', 'plu_updated_at']) k
           where r ? k and jsonb_typeof(r -> k) not in ('string', 'null'))
        or (r ? 'conflicting_names' and jsonb_typeof(r -> 'conflicting_names') not in ('array', 'null'))
  ) then
    raise exception 'invalid_items_snapshot' using errcode = '22023';
  end if;

  select count(*) into v_received from jsonb_array_elements(p_rows);
  if v_received = 0 then
    raise exception 'empty_items_snapshot' using errcode = '22023';
  end if;
  if v_received <> (select count(distinct btrim(r ->> 'item_no')) from jsonb_array_elements(p_rows) r) then
    raise exception 'duplicate_item_no' using errcode = '22023';
  end if;

  select count(*), max(synced_at) into v_last_count, v_last_synced from public.etims_items;
  if v_last_synced is not null and v_last_synced > p_started_at then
    raise exception 'stale_items_snapshot' using errcode = '22023';
  end if;
  if not p_allow_short and v_last_count > 0 and v_received < v_last_count * 0.8 then
    raise exception 'short_items_snapshot' using errcode = '22023',
      detail = format('%s rows received, %s held', v_received, v_last_count);
  end if;

  with incoming as (
    select btrim(r ->> 'item_no') as item_no,
           r ->> 'registered_name' as registered_name,
           r ->> 'plu_no' as plu_no,
           r ->> 'tax_type' as tax_type,
           case when upper(btrim(r ->> 'tax_type')) ~ '^[A-G]-' then left(upper(btrim(r ->> 'tax_type')), 1) end as tax_code,
           r ->> 'item_cls_code' as item_cls_code,
           r ->> 'pkg_unit_cd' as pkg_unit_cd,
           r ->> 'qty_unit_cd' as qty_unit_cd,
           r ->> 'orgn_nat_cd' as orgn_nat_cd,
           (r ->> 'ruiru_store')::boolean as ruiru_store,
           (r ->> 'name_conflict')::boolean as name_conflict,
           case when jsonb_typeof(r -> 'conflicting_names') = 'array'
                then array(select jsonb_array_elements_text(r -> 'conflicting_names')) end as conflicting_names,
           (r ->> 'plu_updated_at')::timestamptz as plu_updated_at
      from jsonb_array_elements(p_rows) r
  ), upserted as (
    insert into public.etims_items as e (item_no, registered_name, plu_no, tax_type, tax_code, item_cls_code, pkg_unit_cd,
                                         qty_unit_cd, orgn_nat_cd, ruiru_store, name_conflict, conflicting_names, plu_updated_at, synced_at)
    select item_no, registered_name, plu_no, tax_type, tax_code, item_cls_code, pkg_unit_cd,
           qty_unit_cd, orgn_nat_cd, ruiru_store, name_conflict, conflicting_names, plu_updated_at, clock_timestamp()
      from incoming
    on conflict (item_no) do update set
      registered_name = excluded.registered_name, plu_no = excluded.plu_no, tax_type = excluded.tax_type,
      tax_code = excluded.tax_code, item_cls_code = excluded.item_cls_code, pkg_unit_cd = excluded.pkg_unit_cd,
      qty_unit_cd = excluded.qty_unit_cd, orgn_nat_cd = excluded.orgn_nat_cd, ruiru_store = excluded.ruiru_store,
      name_conflict = excluded.name_conflict, conflicting_names = excluded.conflicting_names,
      plu_updated_at = excluded.plu_updated_at, synced_at = excluded.synced_at
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted) into v_inserted, v_updated from upserted;

  delete from public.etims_items e
   where not exists (select 1 from jsonb_array_elements(p_rows) r where btrim(r ->> 'item_no') = e.item_no);
  get diagnostics v_removed = row_count;

  select count(*) filter (where name_conflict), count(*) filter (where ruiru_store and not name_conflict)
    into v_conflicts, v_ruiru from public.etims_items;

  return jsonb_build_object('received', v_received, 'inserted', v_inserted, 'updated', v_updated,
    'removed', v_removed, 'conflicts', v_conflicts, 'signable_on_ruiru', v_ruiru);
end;
$$;

revoke execute on function public.replace_etims_items(jsonb, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.replace_etims_items(jsonb, timestamptz, boolean) to service_role;