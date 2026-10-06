---
name: Verify temporary secret cleanup
description: Environment deletion acknowledgements do not prove secret entries were removed.
---

After attempting temporary-secret cleanup, check secret existence before confirming
removal. A successful `deleteEnvVars` result can leave the secret entry present.

**Why:** removal acknowledgements for shared, development, and production environments
left a temporary OTP secret visible to `viewEnvVars`. The used code was already consumed,
but that did not mean its secret entry had been deleted.

**How to apply:** never print or read the value to verify cleanup. Check existence only.
If it remains and no secret-deletion operation is available, direct the user to
Tools > Secrets, the entry's three-dot menu, then Delete. Do not promise automatic
secret removal based solely on an environment-variable deletion result.
