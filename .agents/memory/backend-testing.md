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
