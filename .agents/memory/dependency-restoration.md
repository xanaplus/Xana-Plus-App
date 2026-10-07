---
name: Restoring test dependencies
description: Avoid React peer-version conflicts when restoring absent test packages.
---

When a declared test dependency is missing locally, restore its locked,
React-compatible version rather than resolving the newest version in its range.

**Why:** a caret range for the React test renderer resolved a newer minor whose
React peer requirement did not match this project's installed React, blocking
installation even though the committed lockfile had a compatible renderer.

**How to apply:** inspect the lockfile and React peer requirements before restoring
test packages; do not force or ignore peer conflicts merely to unblock tests.

A successful post-merge setup does not establish that a previously failed
preview workflow has recovered.

**Why:** installing the merged lockfile can remove modules while Expo is running,
causing it to fail. Workflow reconciliation restarts running workflows but can
leave an already failed workflow stopped, even when setup reports success.

**How to apply:** check the existing preview workflow after dependency restoration
and restart it if necessary. Confirm that it serves the app before reporting the
environment restored; do not configure a duplicate service.
