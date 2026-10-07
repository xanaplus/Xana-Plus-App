---
name: Git provider authentication
description: Distinguishing source-control GitHub access from ordinary integration connections.
---

GitHub source-control connections are not ordinary connector/MCP connections.
When the runtime says Git authenticates automatically, use the workspace Git CLI,
but do not treat a healthy connection status as proof that a push will authenticate.

**Why:** the source-control connection reported healthy while GitHub rejected a
push, and generic connection/reconnection forms could not accept that provider.

**How to apply:** if Git rejects authentication and the secure connection prompt
cannot open for a source-control handle, consult current Replit documentation for
the Git Providers account-settings flow. Never retrieve tokens manually, put
credentials in remote URLs, or substitute a different GitHub account silently.

Do not direct a user to Push in an assigned task's Git pane: that view deliberately
does not sync remotes. Task changes need to be ready and applied to the main version;
the user then opens the main project's Git pane to sync.

**Why:** the owner repeatedly could not find Tools/Push because they were in a task
view; its Git panel explicitly directs remote synchronization to the main app.

**How to apply:** establish whether the user is in the task or main-project editor
before giving navigation instructions. Do not claim a local task commit is on
GitHub or included in the main project before apply/push succeeds.
