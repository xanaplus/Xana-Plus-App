---
name: BC wholesale quantity pricing
description: The user's requirement for wholesale prices sourced from Business Central.
---

Wholesale tier prices must come from Business Central and switch when the
qualifying quantity of the same product is picked. Quantities of different
products must not be combined to qualify.

**Why:** the user requested BC-sourced quantity-based wholesale pricing and
confirmed that thresholds count units of the same product.

**How to apply:** use BC as the source of pricing rules rather than inventing or
hardcoding commercial thresholds. Evaluate each product's quantity independently.
