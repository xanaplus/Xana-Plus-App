# Product

<!-- impeccable:product-schema 1 -->

## Platform

android

(Android and iPhone ship from one Expo / React Native codebase with one shared design; Android launches first through Google Play. Web is a developer preview only.)

## Users

Customers of Xana Life (pharmacy + supermarket) living or working around the Syokimau and Ruiru branches, Kenya. They buy medicines and groceries in one basket from their phone. Pickup is the default in the app as on the website (owner, 19 Nov 2026: "Collect from <shop>"); the app also offers delivery with cash on delivery when the customer picks it. Many pay with M-Pesa. Staff, pharmacist and admin accounts use the same app to test features before customers see them.

## Product Purpose

Make everyday health and household shopping at Xana Life quick and trustworthy from a phone: find an item, see the real price and stock at your shop, order, pay (cash, or online through DPO: M-Pesa, Airtel Money, card), and collect or receive it. Success is customers ordering again, and pharmacy orders handled safely.

## Positioning

The only app that puts a licensed Xana pharmacy and a full supermarket in one basket, with a pharmacist checking every prescription order and prices that match the till at your own branch.

## Operating Context

- Branches: Syokimau (default) and Ruiru are the pickup branches; more join later (Katani, Lumumba, Githurai, TRM).
- Prices and stock come from Business Central and the POS; each branch can run its own POS offers (`catalogue.offers_by_location`).
- Prescription medicines (GENERAL / CHRONIC / CONTROLLED, medicine class B) need a photo of the prescription and a pharmacist's approval in the admin app. No liquor online.
- Shares one Supabase database with the website (www.xanalife.com) and the admin app (William, the lead developer). Owner decisions arrive as notes (e.g. `app-home-membership-wellness.md`, 18 Nov 2026).
- Push notifications, SMS (Africa's Talking) and KRA eTIMS receipts are live.

## Capabilities and Constraints

- Live: catalogue with real photos, per-branch stock, quantity (wholesale) prices, cart, checkout (cash; Pay online for staff accounts since 19 Nov 2026), orders with live status, prescription upload, Xana Club points (to be replaced by the POS balance), push.
- Five tabs: Home, Shop, Pharmacy, Wellness, Cart (19 Nov 2026: Pharmacy got a tab because it was too hard to find; Orders moved into the account; first set 18 Nov had Orders instead of Pharmacy). Owner, 18 Nov 2026: Home is the first screen; "Picked for your week" = the customer's past orders, then the branch's best sellers; never prescription-only or age-restricted items on Home.
- Membership (owner): Associate free, Member KSh 200/month, KSh 2,000/year, VAT included. Payment, member prices (BC customer price group) and POS points sync are NOT built: they wait on BC, finance and William. Until then show plans as information and never show a "Member price" or "You save" that isn't real.
- Wellness check-ins (water, mood, movement) are health data under Kenya's Data Protection Act 2019: kept on the phone unless the user agrees to save them to the account. Community Groups stay a preview until pharmacists moderate.
- Undecided: free health check details (owner), membership BC item numbers (finance), how redeemed points show on KRA receipts (finance).

## Brand Commitments

- Name in copy: "Xana Plus" (app) and "Xana Life" (the company); logo in `assets/brand/`.
- Owner's home line: "Good for you, good for home." / "Everyday health and fresh groceries, together." Wellness line: "Wellness, your way."
- Plain, warm, honest words; no invented offers, ratings, stats or badges (removed before store review, 15 Nov 2026).

## Evidence on Hand

- Real product photos for part of the catalogue (POS image API); items without a photo show a clean placeholder, never stock photos.
- No testimonials, customer counts or ratings exist; none may be invented.
- Owner's design screens (home, membership, health) described in `app-home-membership-wellness.md`.

## Product Principles

1. Tell the truth: real prices, real stock at the chosen shop, and fulfilment shown as it really is for this customer.
2. Pharmacy safety first: pharmacist review for prescription items; health data private by default.
3. Familiar and fast: borrow patterns customers know from Jumia, Carrefour and other retail apps; the cart is always reachable.
4. One basket for health and home.
5. Nothing promised that isn't built: "coming soon" stays labelled.

## Accessibility & Inclusion

Used outdoors and on lower-end Android phones on mobile data: large tap targets, readable contrast in light and dark mode, fast first screen without loading the whole catalogue.
