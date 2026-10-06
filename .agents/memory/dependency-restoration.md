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
