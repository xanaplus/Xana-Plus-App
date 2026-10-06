---
name: Screen test boundaries
description: Keeping Node-based Expo screen regressions isolated and focused on customer-visible behavior.
---

In Node-based Expo screen tests, isolate native modules and live-data dependencies,
even when the screen itself only reads presentation data. Assert visible text and
actions rather than serializing arbitrary React element props.

**Why:** indirect catalogue imports can initialize native polyfills and backend
clients before a test renders anything. React elements passed as action or footer
props can include circular renderer metadata, which is not customer-visible state.

**How to apply:** use controlled fixtures at external boundaries while rendering
the actual screen logic; check loading, failure, retry, and recovery through the
text and event handlers customers use. Keep these tests independent of shared
backend credentials and SMS delivery.
