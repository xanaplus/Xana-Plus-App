-- Account self-service: customers can set their own name and app settings,
-- keep delivery addresses on their account, and delete the account.

-- Name and settings. Customers may update only these two columns; points and
-- tier stay writable by the service role alone.
alter table public.profiles
  add column preferences jsonb not null default '{}'::jsonb,
  add constraint profiles_name_length check (name is null or char_length(name) between 1 and 60);

grant update (name, preferences) on public.profiles to authenticated;

create policy "Customers update their own name and settings"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Saved delivery addresses, one row each. Deleted with the account.
create table public.addresses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label       text not null check (char_length(label) between 1 and 40),
  contact     text not null check (char_length(contact) between 1 and 80),
  line        text not null check (char_length(line) between 1 and 300),
  phone       text not null check (char_length(phone) between 1 and 30),
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);

create index addresses_user_created_idx on public.addresses (user_id, created_at);

alter table public.addresses enable row level security;

create policy "Customers manage their own addresses"
  on public.addresses for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.addresses from anon;
grant select, insert, update, delete on public.addresses to authenticated;

-- Deleting an account keeps its orders for the books but detaches them; the
-- delete-account function blanks the name and address on them first.
alter table public.orders alter column user_id drop not null;
alter table public.orders drop constraint orders_user_id_fkey;
alter table public.orders
  add constraint orders_user_id_fkey foreign key (user_id) references auth.users (id) on delete set null;
