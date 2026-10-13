---
name: Canvas preview setup
description: Handling user-triggered design variants when no sandbox artifact exists yet.
---

User-triggered design variants can write components and mark frames live before the mockup sandbox has been scaffolded. A live canvas state alone does not prove that a preview renders.

**Why:** automatic design runs created component files without a preview server, and artifact creation then rejected the already-existing sandbox directory.

**How to apply:** verify the sandbox artifact and managed preview server when a design run reports completion. If scaffolding is needed, preserve all existing prototype files and assets before creating the artifact, then restore them. Verify the preview without changing the user's main app or restoring frames they removed.
