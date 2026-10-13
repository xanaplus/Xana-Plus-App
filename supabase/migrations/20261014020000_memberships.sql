-- Paid memberships behind the 'member' role.
-- Status: PROPOSED, not applied to the shared database. Runs after
-- 20261014010000_user_roles.sql. Safe to run twice.
-- The plan, price and period are the owner's to decide; this holds whatever
-- the payment pipeline records. Tested by tests/db-roles.test.cjs in the website repo (xanaplus/Xana-Website).

begin;

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan text not null check (char_length(plan) between 1 and 40),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'expired', 'cancelled')),
  starts_at timestamptz,
  ends_at timestamptz,
  amount numeric not null check (amount >= 0),
  channel text not null check (channel in ('web', 'app')),
  payment_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memberships_active_has_dates
    check (status <> 'active' or (starts_at is not null and ends_at is not null and ends_at > starts_at))
);

-- At most one active membership per user.
create unique index if not exists memberships_one_active
  on public.memberships (user_id) where status = 'active';

alter table public.memberships enable row level security;
revoke all on public.memberships from anon, authenticated;
grant all on public.memberships to service_role;
grant select on public.memberships to authenticated;

drop policy if exists "Customers read their own memberships" on public.memberships;
create policy "Customers read their own memberships" on public.memberships
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Staff read all memberships" on public.memberships;
create policy "Staff read all memberships" on public.memberships
  for select to authenticated using ((select public.is_staff()));

-- True for anyone with a paid, unexpired membership, internal roles included.
-- Use this for benefit checks, not the role.
create or replace function public.is_member()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
     where user_id = (select auth.uid()) and status = 'active' and ends_at > now()
  );
$$;

revoke execute on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated, service_role;

-- Server only. Called when a membership is paid and when one lapses.
-- Never touches an internal role.
create or replace function public.refresh_member_role(p_user uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_role text;
begin
  update public.profiles
     set role = case when exists (
           select 1 from public.memberships
            where user_id = p_user and status = 'active' and ends_at > now()
         ) then 'member' else 'customer' end
   where id = p_user and role in ('customer', 'member')
  returning role into v_role;
  return v_role;
end;
$$;

revoke execute on function public.refresh_member_role(uuid) from public, anon, authenticated;
grant execute on function public.refresh_member_role(uuid) to service_role;

-- Someone leaving an internal role keeps a membership they paid for.
create or replace function public.admin_set_role(p_user uuid, p_role text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_old text;
  v_new text := p_role;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('customer', 'staff', 'pharmacist', 'admin') then
    raise exception 'bad_role' using errcode = '22023';
  end if;
  if p_user = (select auth.uid()) then
    raise exception 'own_role' using errcode = '42501';
  end if;

  select role into v_old from public.profiles where id = p_user for update;
  if not found then
    raise exception 'no_profile' using errcode = 'P0002';
  end if;

  if p_role = 'customer' and exists (
    select 1 from public.memberships
     where user_id = p_user and status = 'active' and ends_at > now()
  ) then
    v_new := 'member';
  end if;

  if v_old is distinct from v_new then
    update public.profiles set role = v_new where id = p_user;
  end if;
  return v_new;
end;
$$;

revoke execute on function public.admin_set_role(uuid, text) from public, anon;
grant execute on function public.admin_set_role(uuid, text) to authenticated, service_role;

commit;
