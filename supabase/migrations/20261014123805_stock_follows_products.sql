-- Applied to the shared database by the website team on 14 Oct 2026; copied here from the live migration history so both repos share one history. Source and notes: xanaplus/Xana-Website docs/upstream/.
alter table public.bc_stock_sync_runs drop constraint if exists bc_stock_sync_runs_trigger_check;
alter table public.bc_stock_sync_runs add constraint bc_stock_sync_runs_trigger_check
  check (trigger in ('cron', 'manual', 'items'));

create or replace function public.replace_bc_location_stock(
  p_location text, p_rows jsonb, p_started_at timestamptz, p_allow_short boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_location public.stock_locations%rowtype;
  v_received integer;
  v_written integer;
  v_unknown integer;
  v_inactive integer;
  v_zeroed integer;
  v_removed integer;
begin
  if p_location is null or p_started_at is null or jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'invalid_stock_snapshot' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('bc-stock-sync:' || upper(p_location)));

  select * into v_location from public.stock_locations where code = upper(p_location) for update;
  if not found or not v_location.sync then
    raise exception 'unknown_location' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_rows) r
     where jsonb_typeof(r) is distinct from 'object'
        or jsonb_typeof(r -> 'item_no') is distinct from 'string'
        or btrim(r ->> 'item_no') = ''
        or jsonb_typeof(r -> 'quantity') is distinct from 'number'
  ) then
    raise exception 'invalid_stock_snapshot' using errcode = '22023';
  end if;

  select count(*) into v_received from jsonb_array_elements(p_rows);
  if v_received = 0 then
    raise exception 'empty_stock_snapshot' using errcode = '22023';
  end if;
  if v_received <> (select count(distinct btrim(r ->> 'item_no')) from jsonb_array_elements(p_rows) r) then
    raise exception 'duplicate_stock_item' using errcode = '22023';
  end if;

  if v_location.last_synced_at is not null and v_location.last_synced_at > p_started_at then
    raise exception 'stale_stock_snapshot' using errcode = '22023';
  end if;

  if not p_allow_short and coalesce(v_location.last_item_count, 0) > 0
     and v_received < v_location.last_item_count * 0.8 then
    raise exception 'short_stock_snapshot' using errcode = '22023',
      detail = format('%s rows received, %s last time', v_received, v_location.last_item_count);
  end if;

  select count(*) filter (where p.item_no is null), count(*) filter (where p.item_no is not null and not p.is_active)
    into v_unknown, v_inactive
    from jsonb_array_elements(p_rows) r
    left join public.products p on p.item_no = btrim(r ->> 'item_no');

  insert into public.product_location_stock (location_code, item_no, quantity, synced_at)
  select v_location.code, p.item_no, (r ->> 'quantity')::numeric, clock_timestamp()
    from jsonb_array_elements(p_rows) r
    join public.products p on p.item_no = btrim(r ->> 'item_no') and p.is_active
  on conflict (location_code, item_no)
    do update set quantity = excluded.quantity, synced_at = excluded.synced_at;
  get diagnostics v_written = row_count;

  delete from public.product_location_stock pls
   using public.products p
   where pls.location_code = v_location.code
     and p.item_no = pls.item_no
     and not p.is_active;
  get diagnostics v_removed = row_count;

  update public.product_location_stock pls
     set quantity = 0, synced_at = clock_timestamp()
   where pls.location_code = v_location.code
     and pls.quantity <> 0
     and not exists (select 1 from jsonb_array_elements(p_rows) r where btrim(r ->> 'item_no') = pls.item_no);
  get diagnostics v_zeroed = row_count;

  update public.stock_locations
     set last_synced_at = clock_timestamp(), last_item_count = v_received
   where code = v_location.code;

  return jsonb_build_object(
    'location', v_location.code, 'received', v_received, 'written', v_written,
    'unknown', v_unknown, 'inactive', v_inactive, 'removed', v_removed, 'zeroed', v_zeroed);
end;
$$;

revoke execute on function public.replace_bc_location_stock(text, jsonb, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.replace_bc_location_stock(text, jsonb, timestamptz, boolean) to service_role;

create or replace function public.request_bc_stock_sync(p_trigger text default 'items')
returns bigint
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_secret text;
begin
  if p_trigger not in ('cron', 'manual', 'items') then
    raise exception 'invalid_trigger' using errcode = '22023';
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'bc_sync_secret';
  if v_secret is null then
    raise exception 'missing_bc_sync_secret' using errcode = '22023';
  end if;
  return net.http_post(
    url := 'https://yinlbtldfojobuwddpsj.supabase.co/functions/v1/bc-stock-sync',
    body := jsonb_build_object('trigger', p_trigger),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-secret', v_secret),
    timeout_milliseconds := 300000
  );
end;
$$;

revoke execute on function public.request_bc_stock_sync(text) from public, anon, authenticated;
grant execute on function public.request_bc_stock_sync(text) to service_role;

create or replace function public.bc_items_sync_finished()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if old.status = 'running' and new.status in ('success', 'partial') then
    begin
      perform public.request_bc_stock_sync('items');
    exception when others then
      raise warning 'bc-stock-sync was not requested after products sync %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

revoke execute on function public.bc_items_sync_finished() from public, anon, authenticated;

drop trigger if exists bc_items_sync_finished on public.bc_sync_runs;
create trigger bc_items_sync_finished
  after update of status on public.bc_sync_runs
  for each row execute function public.bc_items_sync_finished();