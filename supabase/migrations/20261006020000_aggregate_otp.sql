-- STAGED ONLY. Owner-approved caps: 10/minute, 30/hour, 60/rolling 24h.
-- Apply after atomic_otp, with non-demo traffic paused and old calls drained.
create table public.otp_sms_policy (
  singleton boolean primary key default true check (singleton),
  paused boolean not null default false,
  minute_limit integer not null check (minute_limit > 0),
  hour_limit integer not null check (hour_limit > 0),
  day_limit integer not null check (day_limit > 0),
  check (minute_limit <= hour_limit and hour_limit <= day_limit)
);
insert into public.otp_sms_policy (minute_limit, hour_limit, day_limit)
  values (10, 30, 60);

-- Independent of the per-phone ledger, whose cleanup retains just one hour.
-- No recipient or code is needed to account for aggregate SMS reservations.
create table public.otp_sms_requests (
  id bigint primary key,
  created_at timestamptz not null
);
create index otp_sms_requests_created_idx on public.otp_sms_requests (created_at);
alter table public.otp_sms_policy enable row level security;
alter table public.otp_sms_requests enable row level security;
revoke all on public.otp_sms_policy, public.otp_sms_requests from public, anon, authenticated, service_role;

-- Preserve available reservations on upgrade; older/deleted evidence cannot be
-- recovered. Full continuous 24h enforcement needs a 24h non-demo traffic pause.
insert into public.otp_sms_requests (id, created_at)
  select id, created_at from public.otp_requests
  where created_at > clock_timestamp() - interval '24 hours';

-- The old per-phone operation remains private to this security-definer wrapper.
-- No service-role caller may bypass the aggregate check through its old body.
alter function public.reserve_otp(text, text) rename to reserve_otp_per_phone;
revoke all on function public.reserve_otp_per_phone(text, text) from public, anon, authenticated, service_role;

create function public.reserve_otp(p_phone text, p_code_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_policy public.otp_sms_policy%rowtype;
  v_now timestamptz;
  v_minute bigint;
  v_hour bigint;
  v_day bigint;
  v_result jsonb;
begin
  -- One shared row lock serializes all instances and policy/pause updates.
  -- Always take it before the existing per-phone lock.
  select * into v_policy from public.otp_sms_policy where singleton for update;
  if not found then raise exception 'Missing SMS policy'; end if;
  if v_policy.paused then
    return jsonb_build_object('error', 'sms_paused');
  end if;
  v_now := clock_timestamp();
  delete from public.otp_sms_requests where created_at <= v_now - interval '24 hours';
  select count(*) filter (where created_at > v_now - interval '1 minute'),
         count(*) filter (where created_at > v_now - interval '1 hour'),
         count(*)
    into v_minute, v_hour, v_day from public.otp_sms_requests;
  if v_minute >= v_policy.minute_limit or v_hour >= v_policy.hour_limit
    or v_day >= v_policy.day_limit then
    return jsonb_build_object('error', 'sms_limit');
  end if;

  v_result := public.reserve_otp_per_phone(p_phone, p_code_hash);
  if v_result ? 'id' then
    insert into public.otp_sms_requests (id, created_at)
      values ((v_result->>'id')::bigint, clock_timestamp());
  end if;
  -- Both ledgers and the pending code commit or roll back together. Delivery
  -- failure, consumption, finalization failure or a worker crash never refund.
  return v_result;
end;
$$;
revoke all on function public.reserve_otp(text, text) from public, anon, authenticated;
grant execute on function public.reserve_otp(text, text) to service_role;

select cron.schedule(
  'otp-sms-retention-cleanup', '20 * * * *',
  $$ delete from public.otp_sms_requests where created_at <= now() - interval '24 hours'; $$
);
