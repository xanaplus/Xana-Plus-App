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

For signed-in-only layout checks, render the real focused component with its real
shared UI primitives in an isolated browser fixture.

**Why:** flex wrapping and font metrics need a browser, but verifying account-row
clipping should not require a live login, account changes or SMS. Do not bypass
production authentication just to expose the component.

**How to apply:** use synthetic masked data, actual app fonts and style tokens;
stub only context/native boundaries such as unused icons or animations. Clearly
distinguish component verification from verification of the live signed-in page.
