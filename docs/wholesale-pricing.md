# BC quantity-based wholesale pricing

## Activated

The existing Nexus/artemis `itemSalesPrice` endpoint was inspected using the
existing backend credentials. No new BC key or endpoint was required.
The first complete sync imported 4,365 rules for 4,363 product records.
It reported 53 rules for other selling units and 10 zero-price records excluded
from the public base-unit catalogue. These figures describe the first sync, not
fixed commercial thresholds or prices.

The explicitly applied wholesale migration adds private-writer/public-reader
price rules to the existing catalogue, a service-only atomic snapshot replacement,
and a daily 03:35 UTC sync following the existing 03:30 item sync.
The temporary schema-inspection function was removed.

## Pricing rules

- Qualifying quantity is per SKU. Different items never combine to meet a tier.
- The app sells the item's base unit. Only matching/blank unit codes, local KES
  rules, blank variants and BC `All Customers` rules are included.
- Negotiated customer/customer-group prices are not exposed to all shoppers.
- A qualified product uses BC's best eligible price, not a price higher than its
  ordinary retail price. The unit price applies to that entire product line.
- Start/end dates are inclusive and evaluated using Nairobi's business date.
  BC's unlimited-date sentinel is normalized to no date restriction.
- VAT-inclusive rules are not taxed again. Ex-VAT rules require an unambiguous
  BC VAT configuration; rates are never hardcoded.
- Zero-price rules are excluded rather than turning a basket into free stock.
- A complete successful snapshot clears rules removed from BC. Failed reads do
  not partially replace tiers. Overlapping older snapshots are rejected.

## Customer and checkout behavior

Product detail shows beneficial tiers, selected pricing and the next threshold.
The basket updates when quantity changes or catalogue records refresh.
Savings are already reflected in the subtotal, and the packaging fee is shown
separately.

The deployed order function recalculates prices from the synced catalogue,
rejects duplicate SKU lines and insufficient stock, and rejects a supplied
stale/tampered unit price before writing any order. The app refreshes the affected
products and asks the customer to review the price before trying again.

Payments remain simulated. Rx orders still require a pharmacist quote and do
not use this general-cart path. No SMS or existing clinical quote settings were
changed.

## Verification and remaining boundaries

- Typecheck and lint passed.
- Backend suite: 124 tests passed, including 16 focused quantity/checkout tests.
- A guest browser used real BC-backed products to verify threshold crossing,
  decreasing quantities, cached add-to-cart navigation and mixed-SKU isolation.
  It sent no SMS, signed into no account and created no live order.
- The live product screen was checked at a phone viewport.
- Signed-in live order creation and native-device behavior were not tested as
  part of this change; handler persistence behavior was tested with local mocks.
- Prices are refreshed on the daily BC sync, not queried live from BC at every
  basket change. A failure leaves the last complete snapshot in place; staff
  alerting/freshness enforcement remains a follow-up.
- Alternate box/pack selling units require explicit unit-selection/fulfilment
  behavior before their BC rules can safely be enabled.
