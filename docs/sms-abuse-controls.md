# Aggregate SMS abuse controls

## Assessment (2026-10-06)

The public `request-otp` Edge Function calls Africa's Talking directly. Gateway
JWT verification is disabled intentionally because sign-in precedes a session.
The app's public API key and permissive CORS are not caller authentication or
spending controls. No verified client-IP contract, ingress challenge, or account
budget configuration is recorded in this repository.

Supabase's local `auth.rate_limit.sms_sent = 30` covers **Auth SMS endpoints**, not
this direct provider call. The existing staged atomic OTP migration provides
five accepted attempts per phone per hour and a 30-second resend wait, but does
not bound requests spread across many phones.

Africa's Talking documents insufficient-balance failures. That is not an
app-specific spending cap: other services can use the same balance and funding
can extend exposure. Provider-account balance, funding arrangements, alerts,
account limits, and hosted Supabase ingress settings were **not verified**.
No provider-account setting was changed, no recipients were contacted, and no
live backend migration or function deployment was performed.

References:
- https://supabase.com/docs/guides/auth/rate-limits
- https://supabase.com/docs/guides/functions/examples/rate-limiting
- https://help.africastalking.com/en/articles/742491-why-did-my-messages-fail

## Owner-approved policy

The owner approved **10 accepted send attempts per rolling minute, 30 per rolling
hour, and 60 per rolling 24 hours**, plus an emergency SMS pause. The configured
demo number remains exempt: it sends no SMS, uses no budget, and works even if the
SMS policy is missing or paused. No provider change or new integration is needed.

`20261006020000_aggregate_otp.sql` adds a private singleton policy and an aggregate
reservation ledger on the existing database. The aggregate ledger retains 24
hours independently of per-phone OTP history, so phone cleanup, successful
verification, or exhausted code attempts cannot reset the shared budget.

`reserve_otp` locks the policy row before reserving a per-phone code. The aggregate
check, phone reservation, and aggregate insert commit together. This serializes
all phones and function instances, not just requests on a single worker. Failed
delivery, finalization errors, and worker crashes are charged conservatively;
invalid input and per-phone rejections never allocate an aggregate reservation.
Accounting errors or missing policy fail closed before SMS is attempted.

The old per-phone reservation implementation is private, including to
`service_role`, so clients cannot call it to bypass the wrapper. Customer roles
cannot read or edit the ledgers or policy. Policy changes require the database
owner; the function service role is not granted policy-update access.

All forwarding headers are ignored for abuse enforcement. Neither `X-Forwarded-For`,
`Forwarded`, `X-Real-IP`, nor vendor-named headers establish trustworthy identity
without an independently verified gateway that overwrites them and cannot be
bypassed. Rotating phones, headers, networks, or client keys does not change the
shared cap.

The function returns HTTP 429 `sms_limit` at capacity and HTTP 503 `sms_paused`
while paused. The login page and checkout sign-in sheet show temporary
unavailability, without misleading customers that their number is at fault.
Already-issued codes remain verifiable.

## Owner operation and staged rollout

These protections are **staged only**, not claimed active on the shared backend.
Follow the coordinated rollout in `backend-verification.md` for the existing
Supabase project:

1. Verify actual provider funding, alerts, and any hosted ingress controls with
   the account owner. Review pending migrations; do not replace the database.
2. Pause non-demo traffic and drain old calls. For uninterrupted aggregate
   24-hour accounting across cutover, leave traffic paused for **24 hours**:
   migration can seed only still-retained reservations, not deleted history.
3. Apply `atomic_otp` then `aggregate_otp` before deploying the matching OTP
   handlers. Do not reopen with legacy handlers. Legacy code can bypass the new
   reservation path.
4. Confirm service-only grants, the policy values, both retention jobs, and demo
   sign-in. Real SMS tests require separate approval for a controlled recipient.

In the existing project's privileged SQL console, the owner can pause new sends:

```sql
update public.otp_sms_policy set paused = true where singleton;
```

Resume only when appropriate:

```sql
update public.otp_sms_policy set paused = false where singleton;
```

Pausing preserves all counters. It serializes with reservations but cannot recall
already-committed/in-flight sends; pause ingress and drain workers for a full
stop. Never reset the ledger to resume. Any later limit increase requires owner
approval and an assessment of expected volume and cost.

## Limits of the protection

This bounds **send attempts**, not currency or all Supabase compute. An attacker
can exhaust the shared quota and deny legitimate SMS sign-in until capacity
recovers. There is no automatic sender identification, CAPTCHA, or abuse alert.
Provider rates, message segmentation, other applications sharing the same
provider account, and other code paths using provider credentials can affect
actual spending. Keep provider-level funding controls as defense in depth.

Run `npm run test:backend` for isolated PostgreSQL tests using real migrations and
handlers with mocked SMS/Auth. They exercise concurrent multi-phone limits,
rolling-window recovery, forwarded-header spoofing, failed delivery and
finalization, per-phone rejection, transaction rollback, retention, migration
seeding, role permissions, missing-policy fail-closed behavior, pause/resume,
demo exemptions, and error-code preservation. No live recipient is used.
