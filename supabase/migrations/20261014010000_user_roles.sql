-- User roles for the shared Xana database (Xana Plus App + Xana Life website).
-- Status: PROPOSED, not applied to the shared database.
-- Written against the schema as read on 13 Oct 2026 (Postgres 17).
-- Additive and safe to run twice. No existing column, policy or function
-- signature is removed. Tested by tests/db-roles.test.cjs in the website repo (xanaplus/Xana-Website).

begin;

-- 1. The roles. A pharmacist is staff who also reviews prescriptions. An admin
--    has everything staff has and can manage roles, but does not review
--    prescriptions: that needs a pharmacist (agreed with the app team).
create table if not exists public.roles (
  key text primary key check (key ~ '^[a-z_]{2,30}$'),
  label text not null,
  is_internal boolean not null,
  sort_order smallint not null unique,
  description text not null
);

insert into public.roles (key, label, is_internal, sort_order, description) values
  ('customer',   'Customer',   false, 10, 'A signed-in shopper. The default for every new account.'),
  ('member',     'Member',     false, 20, 'A customer with a paid subscription.'),
  ('staff',      'Staff',      true,  50, 'A Xana employee who can view KPIs and orders.'),
  ('pharmacist', 'Pharmacist', true,  60, 'A staff user who can also review prescriptions.'),
  ('admin',      'Admin',      true, 100, 'Access to everything, including other users'' roles.')
on conflict (key) do update
  set label = excluded.label, is_internal = excluded.is_internal,
      sort_order = excluded.sort_order, description = excluded.description;

alter table public.roles enable row level security;
revoke all on public.roles from anon, authenticated;
grant all on public.roles to service_role;
grant select on public.roles to authenticated;

drop policy if exists "Signed-in users read roles" on public.roles;
create policy "Signed-in users read roles" on public.roles
  for select to authenticated using (true);

-- 2. One role per user. Signed-in users hold UPDATE on profiles (name, preferences)
--    only, so they cannot write this column. Do not widen that grant.
alter table public.profiles
  add column if not exists role text not null default 'customer' references public.roles (key);

create index if not exists profiles_internal_role_idx
  on public.profiles (role) where role in ('staff', 'pharmacist', 'admin');

-- 3. Backfill from the membership tables. A pharmacist is staff, so reviewers win.
--    The demo phone's sign-in code is public, so it is never more than a
--    customer: it is skipped here, removed from both tables, and held there by
--    a constraint.
delete from public.staff where user_id in (select id from public.profiles where phone = '+254700000000');
delete from public.pharmacy_reviewers where user_id in (select id from public.profiles where phone = '+254700000000');

update public.profiles p set role = 'staff'
  from public.staff s
 where s.user_id = p.id and p.role = 'customer' and p.phone <> '+254700000000';

update public.profiles p set role = 'pharmacist'
  from public.pharmacy_reviewers r
 where r.user_id = p.id and p.role in ('customer', 'staff') and p.phone <> '+254700000000';

alter table public.profiles drop constraint if exists profiles_demo_phone_is_customer;
alter table public.profiles add constraint profiles_demo_phone_is_customer
  check (phone <> '+254700000000' or role = 'customer');

-- 4. Helpers. is_staff() and is_pharmacy_reviewer() keep their names and
--    signatures, so every existing policy and function keeps working.
create or replace function public.user_role()
returns text
language sql stable security definer set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid());
$$;

create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.user_role() in ('staff', 'pharmacist', 'admin'), false);
$$;

create or replace function public.is_pharmacy_reviewer()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.user_role() = 'pharmacist', false);
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.user_role() = 'admin', false);
$$;

-- Stated outright, so these do not depend on the project's default grants.
revoke execute on function public.is_staff() from public, anon;
revoke execute on function public.is_pharmacy_reviewer() from public, anon;
grant execute on function public.is_staff() to authenticated, service_role;
grant execute on function public.is_pharmacy_reviewer() to authenticated, service_role;
revoke execute on function public.user_role() from public, anon;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.user_role() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;

-- 5. History of every role change, whichever route made it.
create table if not exists public.role_changes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  old_role text,
  new_role text not null,
  changed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists role_changes_user_idx on public.role_changes (user_id, created_at desc);

alter table public.role_changes enable row level security;
revoke all on public.role_changes from anon, authenticated;
grant all on public.role_changes to service_role;
grant usage on sequence public.role_changes_id_seq to service_role;
grant select on public.role_changes to authenticated;

drop policy if exists "Admins read role changes" on public.role_changes;
create policy "Admins read role changes" on public.role_changes
  for select to authenticated using ((select public.is_admin()));

-- 6. On every role change: record it, and keep the old membership tables in
--    step until the app reads profiles.role. changed_by is null for server work.
create or replace function public.on_profile_role_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.role is not distinct from new.role then
      return new;
    end if;
    insert into public.role_changes (user_id, old_role, new_role, changed_by)
    values (new.id, old.role, new.role, (select auth.uid()));
  elsif new.role <> 'customer' then
    insert into public.role_changes (user_id, old_role, new_role, changed_by)
    values (new.id, null, new.role, (select auth.uid()));
  end if;

  if new.role in ('staff', 'pharmacist', 'admin') then
    insert into public.staff (user_id, name)
    values (new.id, coalesce(new.name, 'Staff'))
    on conflict (user_id) do nothing;
  else
    delete from public.staff where user_id = new.id;
  end if;

  if new.role = 'pharmacist' then
    insert into public.pharmacy_reviewers (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  else
    delete from public.pharmacy_reviewers where user_id = new.id;
  end if;

  return new;
end;
$$;

revoke execute on function public.on_profile_role_change() from public, anon, authenticated;

drop trigger if exists profiles_role_change on public.profiles;
create trigger profiles_role_change
  after insert or update of role on public.profiles
  for each row execute function public.on_profile_role_change();

-- The backfill above ran before the trigger existed, so bring the old tables
-- in step once (the current reviewer gains a staff row).
insert into public.staff (user_id, name)
select p.id, coalesce(p.name, 'Staff') from public.profiles p
 where p.role in ('staff', 'pharmacist', 'admin')
on conflict (user_id) do nothing;

insert into public.pharmacy_reviewers (user_id)
select p.id from public.profiles p
 where p.role = 'pharmacist'
on conflict (user_id) do nothing;

-- 6b. Admins may read submitted prescriptions, their history and their photos,
--     but review stays with pharmacists: is_pharmacy_reviewer() is false for an
--     admin, so review_prescription() and set_prescription_review_status()
--     refuse them. Drafts stay private to the customer, as they are for reviewers.
drop policy if exists "Admins read prescriptions" on public.prescriptions;
create policy "Admins read prescriptions" on public.prescriptions
  for select to authenticated using ((select public.is_admin()) and status <> 'draft');

drop policy if exists "Admins read prescription history" on public.prescription_events;
create policy "Admins read prescription history" on public.prescription_events
  for select to authenticated using (
    (select public.is_admin()) and exists (
      select 1 from public.prescriptions p
       where p.id = prescription_events.prescription_id and p.status <> 'draft'
    )
  );

-- Storage is absent from a local database started without it, hence the check.
do $do$
begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists "Admins read prescription photos" on storage.objects;
    create policy "Admins read prescription photos" on storage.objects
      for select to authenticated using (
        bucket_id = 'prescriptions' and (select public.is_admin()) and exists (
          select 1 from public.prescriptions p
           where p.id::text = (storage.foldername(objects.name))[2] and p.status <> 'draft'
        )
      );
  end if;
end
$do$;

-- 7. Granting roles. Admin only, never your own, never 'member' (that follows
--    a paid subscription; see the memberships migration).
create or replace function public.admin_set_role(p_user uuid, p_role text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_old text;
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

  if v_old is distinct from p_role then
    update public.profiles set role = p_role where id = p_user;
  end if;
  return p_role;
end;
$$;

revoke execute on function public.admin_set_role(uuid, text) from public, anon;
grant execute on function public.admin_set_role(uuid, text) to authenticated, service_role;

commit;

-- First admin: run once by hand with the owner's chosen account. Nothing else
-- can create an admin when none exists.
--   update public.profiles set role = 'admin' where id = '<user id>';
