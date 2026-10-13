-- Launch caps, owner-approved 13 Oct 2026: at KES 0.8 per SMS the daily cap
-- bounds abuse at KES 800 a day. Raise them here, never by deleting the row.
update public.otp_sms_policy
  set minute_limit = 30, hour_limit = 300, day_limit = 1000
  where singleton;

-- The demo number and code are published in the public repo, so the demo
-- account must never see other customers' orders. Demos run as a customer.
delete from public.staff
  where user_id in (select id from public.profiles where phone = '+254700000000');
