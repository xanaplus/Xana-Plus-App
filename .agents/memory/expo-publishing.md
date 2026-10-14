---
name: Legacy Expo publishing configuration
description: Why working Metro previews do not prove this project's publishing settings are valid.
---

Treat the legacy Expo app's publishing pipeline separately from its managed development workflow and the registered design sandbox.

**Why:** publishing used a generic shell command referencing an unset `$file`, with no build command. It exited successfully without a listener, so the build reached promotion but failed HTTP health checks despite a working preview. The only registered artifact was a design sandbox, which did not supply a production app route.

**How to apply:** inspect the actual publishing build/run settings and metadata when diagnosing deployment failures. Verify the exported production bundle and its HTTP startup probe, not just Metro. Preserve the existing deployment target and Supabase backend unless the user requests otherwise.
