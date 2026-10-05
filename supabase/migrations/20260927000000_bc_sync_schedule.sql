-- Nightly Business Central item sync. pg_cron posts to the bc-items-sync Edge
-- Function through pg_net; the shared secret it sends lives in Vault as
-- 'bc_sync_secret' (created by hand, never committed — see DEVELOPER notes).
--
-- 03:30 UTC = 06:30 EAT, staggered after Xana Ledger's 03:00 UTC job on the
-- same BC tenant so the two don't compete for BC's rate limits.
-- pg_net is fire-and-forget: the real outcome of each run is in bc_sync_runs.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'bc-items-sync-daily',
  '30 3 * * *',
  $$
  select net.http_post(
    url     := 'https://yinlbtldfojobuwddpsj.supabase.co/functions/v1/bc-items-sync',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'bc_sync_secret')
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
  $$
);

-- cron.job_run_details grows forever; keep a month.
select cron.schedule(
  'cron-history-cleanup',
  '0 4 * * 0',
  $$ delete from cron.job_run_details where end_time < now() - interval '30 days' $$
);
