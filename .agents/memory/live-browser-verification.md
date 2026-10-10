---
name: Live browser verification boundaries
description: Avoid mistaking browser selectors or full reloads for live application behavior.
---

Use in-app navigation when verifying a transition between prescription confirmation
and existing order screens; a full page reload can hide stale shared state.

**Why:** the prescription flow saves independently of the cart flow. Reloading
resets providers and can make a broken live navigation look correct.

**How to apply:** create a synthetic quote/order, follow the real order link without
reloading, and assert the destination's unique heading. Test cached transitions
alongside direct-entry routes.

Treat timeout failures as unclassified until the exact action is known. Match a
destination-specific element instead of the first substring match across the page.

**Why:** Expo Router keeps previous screens mounted but hidden. A first text match
can select a hidden source screen; icon text can also change accessible button names,
and dialog close animations outlive the click that dismissed them.

**How to apply:** wait for backend responses and dialog closure, use role/label
selectors appropriate to the rendered component, and log safe action/line identifiers
without session values, raw backend errors or private page contents.
