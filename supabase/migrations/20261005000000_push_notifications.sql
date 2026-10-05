-- Push notifications. One row per device that has granted permission; the
-- send-push Edge Function reads them and posts to Expo's push service.
--
-- A token is not a secret, but it is personal: a customer may only touch their
-- own rows. The service role (the sender) bypasses RLS.

create table public.push_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  token      text not null unique,
  platform   text not null check (platform in ('ios', 'android', 'web')),
  device     text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

create policy "Customers manage their own push tokens"
  on public.push_tokens for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.push_tokens from anon;
grant select, insert, update, delete on public.push_tokens to authenticated;

-- An order moving along tells the customer's devices. pg_net posts to the
-- send-push Edge Function with the same Vault secret the cron jobs use; the
-- message wording lives in the function so copy can change without a migration.
create function public.notify_order_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is null then
    return new;
  end if;
  perform net.http_post(
    url     := 'https://yinlbtldfojobuwddpsj.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'bc_sync_secret')
               ),
    body    := jsonb_build_object('orderNo', new.order_no, 'status', new.status),
    timeout_milliseconds := 10000
  );
  return new;
end;
$$;

drop trigger if exists orders_notify_status on public.orders;
create trigger orders_notify_status
  after update of status on public.orders
  for each row
  when (old.status is distinct from new.status)
  execute function public.notify_order_status();
