-- Permissions, grouped by category so the website and the app each own theirs.
-- Status: PROPOSED, not applied to the shared database. Runs after
-- 20261013010000_user_roles.sql. Safe to run twice.
-- Roles are shared; permissions are not. Each permission belongs to one
-- category ('website' or 'app') and is checked with has_permission(category, key).
-- An admin holds every permission that exists, with no rows needed, except
-- those marked admin_holds = false (prescription review needs a pharmacist).
-- Tested by tests/db-roles.test.cjs in the website repo (xanaplus/Xana-Website).

begin;

create table if not exists public.permissions (
  category text not null check (category in ('website', 'app')),
  key text not null check (key ~ '^[a-z_]+(\.[a-z_]+)+$' and char_length(key) <= 60),
  description text not null check (char_length(description) between 1 and 200),
  created_at timestamptz not null default now(),
  primary key (category, key)
);

-- False for the few permissions that need a professional role, not seniority.
alter table public.permissions add column if not exists admin_holds boolean not null default true;

create table if not exists public.role_permissions (
  role text not null references public.roles (key) on delete cascade,
  category text not null,
  permission_key text not null,
  created_at timestamptz not null default now(),
  primary key (role, category, permission_key),
  foreign key (category, permission_key)
    references public.permissions (category, key) on delete cascade
);

alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
revoke all on public.permissions from anon, authenticated;
revoke all on public.role_permissions from anon, authenticated;
grant select on public.permissions to authenticated;
grant select on public.role_permissions to authenticated;

-- Internal users can see the whole map; everyone else asks my_permissions().
drop policy if exists "Staff read permissions" on public.permissions;
create policy "Staff read permissions" on public.permissions
  for select to authenticated using ((select public.is_staff()));

drop policy if exists "Staff read role permissions" on public.role_permissions;
create policy "Staff read role permissions" on public.role_permissions
  for select to authenticated using ((select public.is_staff()));

-- Does the signed-in user hold this permission? Unknown keys are always false.
create or replace function public.has_permission(p_category text, p_key text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case
    when public.user_role() = 'admin' then exists (
      select 1 from public.permissions where category = p_category and key = p_key and admin_holds
    )
    else exists (
      select 1 from public.role_permissions
       where role = public.user_role() and category = p_category and permission_key = p_key
    )
  end;
$$;

-- The signed-in user's permissions in one category, for showing and hiding
-- screens. The database still checks every action.
create or replace function public.my_permissions(p_category text)
returns setof text
language sql stable security definer set search_path = ''
as $$
  select p.key from public.permissions p
   where p.category = p_category
     and (
       (public.user_role() = 'admin' and p.admin_holds)
       or exists (
         select 1 from public.role_permissions rp
          where rp.role = public.user_role() and rp.category = p.category and rp.permission_key = p.key
       )
     )
   order by p.key;
$$;

revoke execute on function public.has_permission(text, text) from public, anon;
revoke execute on function public.my_permissions(text) from public, anon;
grant execute on function public.has_permission(text, text) to authenticated, service_role;
grant execute on function public.my_permissions(text) to authenticated, service_role;

-- Website permissions. The app adds its own under category 'app'.
insert into public.permissions (category, key, description) values
  ('website', 'admin.access',         'Open the website admin section.'),
  ('website', 'orders.view',          'See every order and its items.'),
  ('website', 'orders.update_status', 'Mark an order ready, collected or unable to fulfil.'),
  ('website', 'payments.view',        'See the payment attempts on an order.'),
  ('website', 'refunds.manage',       'Set and clear refund flags on orders and payments.'),
  ('website', 'kpis.view',            'See sales and activity reports.'),
  ('website', 'customers.view',       'Look up a customer and their profile.'),
  ('website', 'memberships.view',     'See customers'' memberships.'),
  ('website', 'prescriptions.review', 'Review prescriptions on the website (screens come after launch).'),
  ('website', 'users.manage_roles',   'Change a user''s role and read the role history.'),
  ('website', 'settings.manage',      'Change website and app settings.'),
  ('website', 'audit.view',           'Read the audit log.')
on conflict (category, key) do update set description = excluded.description;

update public.permissions set admin_holds = false
 where category = 'website' and key = 'prescriptions.review';

-- Who holds what. Admin is not listed: it holds everything marked admin_holds.
insert into public.role_permissions (role, category, permission_key)
select r.role, 'website', k.key
  from (values ('staff'), ('pharmacist')) as r (role)
 cross join (values
   ('admin.access'), ('orders.view'), ('orders.update_status'), ('payments.view'),
   ('kpis.view'), ('customers.view'), ('memberships.view')
 ) as k (key)
on conflict do nothing;

insert into public.role_permissions (role, category, permission_key)
values ('pharmacist', 'website', 'prescriptions.review')
on conflict do nothing;

commit;
