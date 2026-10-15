---
name: Mobile browser display scaling
description: Browser zoom and input sizing constraints that normal phone-width emulation can miss.
---

Validate mobile grids with browser display scaling as well as ordinary viewport
sizes. Base card sizing on the actual available layout width, allowing for
fractional-pixel rounding.

**Why:** a reported single-column mobile search layout did not reproduce at an
ordinary phone viewport, but did reproduce with display scaling. Window-based
card widths then exceeded the actual available row width.

**How to apply:** include increased and reduced scaling in browser layout tests,
checking column alignment and document overflow. Avoid disabling user zoom to
address iOS input focus zoom; web search inputs should instead use at least 16px
text. Emulation is not verification on a physical iPhone with its software keyboard.
