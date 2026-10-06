---
name: Owner-approved SMS safeguards
description: Approved aggregate caps, demo exemption, and live-rollout approval boundary.
---

The owner approved 10 accepted SMS send attempts per rolling minute, 30 per
rolling hour, and 60 per rolling 24 hours, with an owner-controlled emergency
pause. Failed delivery counts. Configured demo sign-in stays exempt.

**Why:** the owner selected these limits instead of higher proposed limits to
bound SMS abuse spread across many numbers.

**How to apply:** preserve the approved limits and demo exemption unless the
owner changes them. Implementation approval was for staged changes and offline
tests, not shared-backend deployment or provider-account changes. Obtain separate
approval for live rollout and for any real-recipient SMS test. Do not assume
Supabase Auth SMS limits cover a direct Edge Function provider call or that
forwarded headers identify a trusted client.
