-- First backend slice: customer accounts and SMS sign-in codes.

-- One row per customer, keyed to the Supabase Auth user. Written only by the
-- verify-otp Edge Function (service role); customers can read their own row
-- but never edit it, so Xana Club points and tier cannot be self-assigned.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  phone text not null unique,
  name text,
  club_tier text not null default 'Bronze' check (club_tier in ('Bronze', 'Silver', 'Gold')),
  club_points integer not null default 0 check (club_points >= 0),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Customers read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

revoke insert, update, delete on public.profiles from anon, authenticated;

-- Hashed one-time codes. No policies and no grants: only the Edge Functions,
-- using the service role, can read or write them.
create table public.otp_codes (
  id bigint generated always as identity primary key,
  phone text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts smallint not null default 0,
  created_at timestamptz not null default now()
);

create index otp_codes_phone_created_idx on public.otp_codes (phone, created_at desc);

alter table public.otp_codes enable row level security;

revoke all on public.otp_codes from anon, authenticated;
