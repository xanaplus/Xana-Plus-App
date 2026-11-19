-- Best sellers per pickup branch, for Home's "Picked for your week" (owner, 18 Nov 2026:
-- past orders first, topped up with best sellers at that branch).
--
-- Filled nightly by the best-sellers-sync function from Business Central's till sales
-- (salesLinesBuffer), ranked by the number of receipts an item was on in the last 30 days.
-- Counts only, no customers: safe for anyone to read.

create table public.branch_best_sellers (
  branch       text not null,      -- BC location code, e.g. SYOKIMAU, RUIRU
  item_no      text not null,
  receipts     integer not null,
  rank         integer not null,
  refreshed_at timestamptz not null default now(),
  primary key (branch, item_no)
);

create index branch_best_sellers_rank on public.branch_best_sellers (branch, rank);

alter table public.branch_best_sellers enable row level security;
revoke all on public.branch_best_sellers from anon, authenticated;
grant select on public.branch_best_sellers to anon, authenticated;

create policy "best sellers are public" on public.branch_best_sellers
  for select to anon, authenticated
  using (true);

-- Nightly at 06:45 Nairobi (03:45 UTC), after the 06:30 item sync. Same caller and secret.
select cron.schedule(
  'best-sellers-sync-daily',
  '45 3 * * *',
  $$
  select net.http_post(
    url     := 'https://yinlbtldfojobuwddpsj.supabase.co/functions/v1/best-sellers-sync',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'bc_sync_secret')
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);
