Hi Roy,

The website now shows and charges each branch's offers from the POS (owner, 18 Nov). It went live today at 14:33. One part affects app orders right away (see "What it means for app orders"). Nothing the app sends is refused that worked before.

**What an offer is:** a promotion staff set on the POS for one store: a price lock below the BC price, with an end date or none (no end date means it runs until staff remove it). One store per branch: 401 Syokimau, 408 Ruiru. Online, an item on offer is sold at the offer price at every quantity, with no quantity prices, the same as the POS Retail sales screen. Locks at or above the BC price are not offers and are ignored. Nothing about how the POS sells changed; the POS only got a read-only endpoint, `GET /api/inventory/web-offers`, with its own token.

**What changed in the shared database** (migration `branch_offers`, applied 18 Nov; source in the admin repo, `supabase/migrations/20261118010000_branch_offers.sql`):
- **New Edge Function `pos-offers-sync`:** copies the offers from the POS every 15 minutes (at :07, :22, :37 and :52), and once more at 03:40 just after the POS ends expired offers at 03:30. Cron jobs `pos-offers-sync`, `pos-offers-sync-after-expiry` and `pos-offers-sync-cleanup`.
- **New tables `branch_offers` and `pos_offers_sync_runs`:** server only, no app access.
- **New column on the `catalogue` view, `offers_by_location`** (the last column), for example `{"SYOKIMAU": {"price": 308.00, "ends_on": "2026-11-23"}}`. It is null when the item has no offer. It lists only offers that are running (end date today or later, Nairobi time), from a branch synced in the last 2 hours, and below the BC price. So an ended offer, or a stalled sync, drops back to the BC price on its own. `price` stays the BC price.
- **New columns:** `order_items.offer_price` (null when the line had no offer) and `orders.offer_saving` (0 when none), kept apart from `wholesale_savings` so finance can see offers separately.
- **`create_order()`:** for the order's branch, an item on offer is charged the offer price. It accepts the line whether you send the offer price, the BC price or a quantity price for that quantity, and charges the offer in all three cases, as the till does. Any other price is still refused with `price_mismatch`. An order with no branch (no `branchCode` and no `storeName`) gets no offers. The answer now also has `offerSaving`.
- **The pharmacist's quote** on prescription orders (`pharmacist_review_order()`) uses the offer for the order's branch too.

**What it means for app orders today:** if an app customer orders an item that is on offer at the store they picked, they are charged the offer price, even though the app shows and sends the BC price. They pay less, never more. But the total the app showed is then higher than the order's `amountDue`. Please read the amount from `create_order()`'s answer (or the order row), not from the basket, for anything you show or take payment for.

**For the app, when you're ready:**
1. Read `offers_by_location` from `catalogue` and, for the store the customer picked, show `price` with the BC price struck through. Hide quantity prices while an item is on offer there. With no store picked, the website shows the BC price with "Offer at Syokimau".
2. Send the offer price as the line's `unitPrice` (the BC price also works, as above).
3. Optionally show `ends_on` ("Offer ends 23 Nov"); no end date means no end shown.

The other four stores (Katani, Lumumba, Githurai, TRM) join when they become pickup branches: one line in the POS config and one row in `stock_locations`.

The spec is in the website repo (`docs/upstream/pos-offers.md`), and the migration and its tests are in the admin repo (`db/tests/branch-offers.test.cjs`).

Thanks!
