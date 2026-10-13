---
name: Semantic appearance theming
description: Why XanaPlus dark mode must use reactive semantic palettes rather than remapping rendered color values.
---

Use reactive semantic palette hooks and palette-specific styles for the whole component tree. Do not theme the app by reverse-mapping literal colors or cloning the children of the screen shell.

**Why:** XanaPlus light tokens share color values for different meanings, including white surfaces and text over green actions. A literal-color lookup cannot distinguish them. A screen-level child transformer also misses styles produced inside nested components, press-state callbacks, modals and footers.

**How to apply:** When adding or editing themed UI, resolve tokens by their semantic names inside the component or its memoized style factory. Check text/action contrast and cached navigation transitions, not just the page background.

**Web accessibility:** This project's React Native Web does not project the aggregate `accessibilityState` into the browser's checked state. Explicit `aria-checked` is supported by both its web renderer and React Native.

**Why:** A visibly selected radio otherwise has no checked state in the browser accessibility tree.

**How to apply:** Use explicit cross-platform ARIA state for radio controls and verify the rendered accessibility tree, not just component props.
