-- Wellness check-ins saved to the account, with the user's consent (owner, 18 Nov 2026,
-- app-home-membership-wellness.md section 4).
--
-- Mood and condition data are health data, sensitive personal data under Kenya's Data
-- Protection Act 2019. So: only the user can read or write their own rows. There is no
-- staff, pharmacist or admin policy on purpose, and nothing else reads these tables.
-- Deleting the account deletes both (on delete cascade from auth.users).

create table public.wellness_consent (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  -- true = save check-ins to the account; false = keep them on the phone only.
  sync       boolean not null,
  decided_at timestamptz not null default now(),
  water_goal smallint check (water_goal between 1 and 20)
);

create table public.wellness_checkins (
  user_id    uuid not null references auth.users (id) on delete cascade,
  day        date not null,
  water      smallint not null default 0 check (water between 0 and 20),
  mood       text check (mood in ('great', 'okay', 'low')),
  moved      boolean,
  weekly     text check (weekly in ('yes', 'notToday')),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.wellness_consent enable row level security;
alter table public.wellness_checkins enable row level security;

revoke all on public.wellness_consent, public.wellness_checkins from anon, authenticated;
grant select, insert, update, delete on public.wellness_consent, public.wellness_checkins to authenticated;

create policy "own wellness consent" on public.wellness_consent
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Rows can only be saved while the user's consent says sync = true.
create policy "own wellness check-ins" on public.wellness_checkins
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.wellness_consent c where c.user_id = (select auth.uid()) and c.sync)
  );

-- "Stop saving to my account": consent off and every saved check-in deleted, together.
create or replace function public.wellness_stop_sync()
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'signed_out';
  end if;
  insert into public.wellness_consent (user_id, sync, decided_at)
  values (auth.uid(), false, now())
  on conflict (user_id) do update set sync = false, decided_at = now();
  delete from public.wellness_checkins where user_id = auth.uid();
end;
$$;

revoke all on function public.wellness_stop_sync() from public, anon;
grant execute on function public.wellness_stop_sync() to authenticated;
