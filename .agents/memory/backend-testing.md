---
name: Safe customer backend verification
description: Boundaries for verifying this app against its shared Supabase backend.
---

Use the existing server-authenticated demo flow for non-SMS backend checks. A demo
session does not prove actual SMS delivery. Real handset verification requires a
controlled test recipient; never infer one from sample numbers in the source.

**Why:** the connected backend is shared and most valid Kenyan numbers trigger real
Africa's Talking messages, while demo requests intentionally skip delivery.

**How to apply:** keep test orders clearly marked not to fulfil, use simulated COD
without points redemption, and preserve shared demo profile settings. Customer
permissions do not allow deleting orders; do not seek privileged access merely for
test cleanup. Report remaining labelled test data and real-SMS limitations explicitly.

Do not assume an available test OTP is the configured fixed code for the shared
backend's demo account.

**Why:** a no-SMS demo verification attempt failed despite a test-code secret
being present. Secret existence does not establish that the two backend
configurations match.

**How to apply:** do not guess codes or switch to real phone numbers to continue
testing. Use rollback-only SQL role tests where appropriate, and clearly separate
those results from live signed-in UI or storage verification.

When owner approval explicitly permits temporary synthetic accounts, use confirmed
email/password creation without delivery or OTP calls. Keep sessions ephemeral,
preserve the full designated reviewer membership snapshot, and discover storage
objects by exact temporary-owner prefixes even when a run fails before attachment.
Retain labelled simulated orders only with their synthetic owner disabled, then
verify cleanup by reading state back rather than trusting deletion acknowledgements.

**Why:** live retry and confirmation checks can fail after creating an object or
order. Removing only attached images misses orphan uploads, while deleting an order
owner destroys audit attribution.

**How to apply:** use the approved live harness sparingly, not routine CI. A failed
run after confirmation can retain valid audit orders; report aggregate leftovers
across diagnostic runs as well as the successful final run.
