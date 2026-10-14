---
name: Legacy Expo publishing configuration
description: Why working Metro previews do not prove this project's publishing settings are valid.
---

Treat the legacy Expo app's publishing pipeline separately from its managed development workflow and the registered design sandbox.

**Why:** publishing used a generic shell command referencing an unset `$file`, with no build command. It exited successfully without a listener, so the build reached promotion but failed HTTP health checks despite a working preview. The only registered artifact was a design sandbox, which did not supply a production app route.

**How to apply:** inspect the actual publishing build/run settings and metadata when diagnosing deployment failures. Verify the exported production bundle and its HTTP startup probe, not just Metro. Preserve the existing deployment target and Supabase backend unless the user requests otherwise.

Production exports must not be excluded by deployment ignore rules, even when the publishing build recreates them.

**Why:** the subsequent publishing build exported successfully, but the runtime repeatedly reported a missing web build. The production export directory was deployment-ignored, so the files were absent from the runtime image. A local build/start test did not reproduce this packaging boundary.

**How to apply:** keep production output Git-ignored but included in the deployment package. Check that build and server paths agree and that no deployment exclusion covers that path. Use the ignored generated-artifacts directory only for outputs not needed at runtime.
