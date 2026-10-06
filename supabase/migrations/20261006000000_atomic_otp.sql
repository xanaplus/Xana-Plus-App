-- Apply only to the existing backend with owner approval, before deploying the
-- matching request-otp and verify-otp functions. Never deploy handlers first.
-- Five retained send attempts per phone; code deletion cannot reset this ledger.
create table public.otp_requests (
  id bigint primary key,
  phone text not null,
  created_at timestamptz not null
);
create index otp_requests_phone_created_idx on public.otp_requests (phone, created_at desc);
create index otp_requests_created_idx on public.otp_requests (created_at);
alter table public.otp_requests enable row level security;
revoke all on public.otp_requests from public, anon, authenticated;

-- Preserve all available throttle evidence at rollout (deleted rows cannot be
-- reconstructed). Keep only the newest five entries per phone.
insert into public.otp_requests (id, phone, created_at)
select id, phone, created_at from (
  select id, phone, created_at,
    row_number() over (partition by phone order by created_at desc, id desc) as position
  from public.otp_codes where created_at > now() - interval '1 hour'
) retained where position <= 5;

alter table public.otp_codes add column delivery_pending boolean not null default false;

-- All OTP operations use the same transaction-scoped phone lock. Hash
-- collisions only serialize unrelated phones; they cannot weaken the limit.
create function public.reserve_otp(p_phone text, p_code_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz;
  v_count integer;
  v_latest timestamptz;
  v_id bigint;
begin
  if p_phone is null or p_phone !~ '^\+254[17][0-9]{8}$'
    or p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid OTP reservation';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_phone, 0));
  v_now := clock_timestamp();
  delete from public.otp_requests where phone = p_phone and created_at <= v_now - interval '1 hour';
  select count(*), max(created_at) into v_count, v_latest
    from public.otp_requests where phone = p_phone;
  if v_latest > v_now - interval '30 seconds' then
    return jsonb_build_object('error', 'too_soon');
  end if;
  if v_count >= 5 then return jsonb_build_object('error', 'too_many'); end if;

  -- Only the newest code can be used, even while delivery is in progress.
  delete from public.otp_codes where phone = p_phone;
  insert into public.otp_codes (phone, code_hash, expires_at, created_at, delivery_pending)
    values (p_phone, p_code_hash, v_now + interval '5 minutes', v_now, true)
    returning id into v_id;
  insert into public.otp_requests (id, phone, created_at) values (v_id, p_phone, v_now);
  return jsonb_build_object('id', v_id);
end;
$$;

-- Failure removes only this pending code, never its throttle evidence or a
-- newer request's code. A crash after reservation is also charged to the limit.
create function public.finish_otp_delivery(p_phone text, p_id bigint, p_sent boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_phone, 0));
  if p_sent then
    update public.otp_codes set delivery_pending = false
      where phone = p_phone and id = p_id and delivery_pending;
  else
    delete from public.otp_codes where phone = p_phone and id = p_id and delivery_pending;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Check, increment and consumption are one transaction. Only a single caller
-- can obtain ok=true, and only that caller may mint an Auth session.
create function public.consume_otp(p_phone text, p_code_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_code public.otp_codes%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_phone, 0));
  select * into v_code from public.otp_codes where phone = p_phone
    order by created_at desc, id desc limit 1 for update;
  if not found or v_code.expires_at <= clock_timestamp() or v_code.delivery_pending then
    return jsonb_build_object('error', 'expired');
  end if;
  if v_code.attempts >= 5 then
    return jsonb_build_object('error', 'too_many_attempts');
  end if;
  if p_code_hash is null or p_code_hash <> v_code.code_hash then
    update public.otp_codes set attempts = attempts + 1 where id = v_code.id;
    return jsonb_build_object('error', 'wrong_code');
  end if;
  delete from public.otp_codes where phone = p_phone;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.reserve_otp(text, text) from public, anon, authenticated;
revoke all on function public.finish_otp_delivery(text, bigint, boolean) from public, anon, authenticated;
revoke all on function public.consume_otp(text, text) from public, anon, authenticated;
grant execute on function public.reserve_otp(text, text) to service_role;
grant execute on function public.finish_otp_delivery(text, bigint, boolean) to service_role;
grant execute on function public.consume_otp(text, text) to service_role;

-- pg_cron is already installed by the existing BC-sync migration. Pruning
-- entries outside the hour cannot remove an attempt that still counts.
select cron.schedule(
  'otp-retention-cleanup', '15 * * * *',
  $$ delete from public.otp_requests where created_at <= now() - interval '1 hour';
     delete from public.otp_codes where expires_at <= now(); $$
);
