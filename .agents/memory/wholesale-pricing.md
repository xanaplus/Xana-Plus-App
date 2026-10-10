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

The user says these quantity-based wholesale prices already work in their POS
and that they have already supplied BC API access.

**Why:** the user corrected an assumption that they needed to obtain new access
or ask the developer to expose a new endpoint before existing access was checked.

**How to apply:** investigate the existing BC/POS integration first. Do not ask
for replacement credentials or claim the tier endpoint is missing without
checking what the current integration exposes.

Only general-customer rules should be exposed to public shoppers; customer
price-group and customer-specific rates require a separately approved eligibility
mapping.

**Why:** the current requirement establishes per-product quantity qualification,
not permission to give every shopper negotiated customer prices.

**How to apply:** preserve that eligibility boundary when adding customer groups
or alternative selling units. Do not infer wholesale membership from a basket's
quantity or from ordinary staff/pharmacist access.
