-- Tidy-ups the website team's security check found (note to Roy, 15 Oct 2026).
-- Neither was reachable in practice; both just remove permissions nobody uses.

-- 1. Trigger functions only run as triggers, so the API roles never need to call them.
revoke execute on function public.notify_order_status() from public, anon, authenticated;
revoke execute on function public.guard_prescription_dispatch() from public, anon, authenticated;
revoke execute on function public.guard_prescription_order_item() from public, anon, authenticated;
revoke execute on function public.audit_prescription_change() from public, anon, authenticated;

-- 2. Same as was done on orders on 14 Oct: truncate skips row security, and the
--    app and website never need truncate, references or trigger on profiles.
revoke truncate, references, trigger on public.profiles from anon, authenticated;
