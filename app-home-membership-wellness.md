# Xana Plus app: landing page, membership and wellness

Status: **notes and spec, not started** (18 Nov 2026). **Owner's answers to section 7 recorded the same day** (answers page https://claude.ai/artifact/RceNArGozULeMAoNDnTnws); sections 2 to 6 follow them. For the Xana Plus App (Expo / React Native, https://xana-plus-app.replit.app/, Roy's repo, not in this one). Sources:

- the workshop write-up `~/Desktop/App/Xana_App_Product_Vision_and_Meeting_Notes.pdf` (5 pages, "does not constitute an approved product specification"), summarised in section 1;
- the owner's eight screens of the design, `~/Desktop/App/home_1-3.png`, `membership_1-2.png`, `health_1-3.png` (18 Nov), described in sections 2 to 4;
- the shared database, read on 18 Nov.

Nothing here is decided unless it says "owner". Decisions and what is still open are in section 7.

## 1. The vision, in short

From the workshop:

- **Experience:** frictionless, efficient, fast-loading, clear navigation, simple design, stable, customer-focused ("recognised, seen and supported"). Interactive ideas: a chatbot and an "Ask" feature (written next to "Trust").
- **Values:** ethics, shalom, honesty, trust with data, privacy and confidentiality (especially pharmacy data), community, personal experiences.
- **Content beyond shopping:** recipes, wellness, lessons ("WeChat lessons" to be clarified), relationships, pharmacy tips (Dr. Mumbi).
- **Commerce:** one basket for Pharmacy and Retail; delivery by zones around hubs; delivery hours 7:00 AM to 9:00 PM unless a 24-hour decision is made; DPO for payment; Google Play publication.
- **Membership:** member pricing or discount; loyalty points; **no points for non-members**.
- **Partners:** Tibu telemedicine to investigate; AI for logistics to explore.

The design screens turn three of these into screens: a landing page (home), membership benefits, and wellness with community groups.

## 2. Landing page (Home)

### What the design shows (`home_1` to `home_3`)

Top to bottom:

1. **Logo** and heading **"Good for you, good for home."** with the line "Everyday health and fresh groceries, together."
2. **Location row:** "DELIVERING TO Westlands, Nairobi" with a picker, and two round buttons: account and cart.
3. **Three entry cards, each leading to another page:**
   - **Sign up for Member Plans** ("Start with your name and mobile number.") → sign-up / membership plans.
   - **Shop Now** ("Browse pharmacy, food and everyday essentials") → Shop.
   - **Member Services and Benefits** → the benefits page (section 3).
4. **Search:** "Search medicines, food and more", with a filter button.
5. **What do you need?** three tiles: **Pharmacy**, **Fresh food**, **Wellness**, and "See all".
6. **Picked for your week:** a two-column product grid, each card with photo, name, pack ("Pack of 20 tablets"), **Member Price**, a **You Save** badge, and an add button. "Browse" links to Shop.
7. **Your daily check-in:** a green card, "A small sip goes a long way. 0 of 8 glasses logged today" → Wellness water check-in.
8. **Notice:** "Medicine orders are subject to pharmacist review."
9. **Tab bar:** Home, Shop, Health and Wellness, Community Groups, Orders, Cart.

### What to build

- **Make this the first screen** for everyone, signed in or not. Each card goes to a page that already exists or is listed here: membership plans and sign-up, Shop, Member Services and Benefits, Pharmacy, Fresh food, Wellness, Orders, Cart.
- **Location row must tell the truth.** Today the shop is **pickup only** at Syokimau and Ruiru; web delivery is built but switched off (`web_delivery_enabled`). So the row reads "Collect from **Syokimau** ▾" and lists the pickup branches, and only says "Delivering to <area>" once delivery is on for the app. The branch choice also sets prices and stock (per-branch stock is live; branch offers are specified in `pos-offers.md`). Never a hard-coded "Westlands".
- **The sign-up card hides once the user is a member;** for a signed-in customer it reads "Become a Member".
- **"Picked for your week" uses real catalogue items** (`public.catalogue`), in stock at the chosen branch, never prescription-only (`requires_rx`) or age-restricted items, and never stock photos for a real product. Until member prices exist (section 3), show the normal price and leave out "Member Price" and "You Save". **Owner (18 Nov): picked from the customer's past orders and from best sellers**, mixed: items the customer bought before first, topped up with best sellers at that branch. A signed-out visitor sees best sellers only.
- **Tab bar (owner, 18 Nov): five tabs, Community inside Wellness:** Home, Shop, Wellness, Orders, Cart. Today "Health and Wellness" and "Community Groups" are cut off on the home screens ("Com munity Gr…"); the Wellness screens already hold Community Groups.
- **Speed** (workshop: fast-loading): the home screen must not wait for the full catalogue. Load a small home payload first (the website's catalogue is 3.9 MB; see `CLAUDE.md` "Known problems").

## 3. Member Services and Benefits

### What the design shows (`membership_1`, `membership_2`)

- Heading "Member Services and Benefits", "Discover what comes with Membership", and an intro: "Join Xana Plus for Member-only prices on supermarket and pharmacy products, plus health and wellness services for you and your family."
- **Member-only prices:** "Pay the Member price and see how much you save compared with the regular price", with two examples: Paracetamol 500 mg, Pack of 20, **Member KSh 72, You Save KSh 13, Regular KSh 85**; Red onions 500 g, **Member KSh 78, You Save KSh 12, Regular KSh 90**.
- **Free health checks:** "The types of checks and how to access them will be added here later."
- **More Member services:** track purchases and member savings, wellness check-ins and recipe suggestions, Member Health Services. Coming soon: Family Health Records, Group Bulk Buy, AI basket-building.
- **Membership levels:**
  - **Associate, free:** regular prices, no paid plan.
  - **Member, monthly, KSh 200 a month:** member prices and member services.
  - **Member, annual, KSh 2,000 a year:** the same for a year.
- Button **Sign up for Member Plans**. Note: "No payment is taken in this prototype."

### What exists today (shared database, 18 Nov)

- **`memberships`** (plan, status, starts_at, ends_at, amount, channel, payment_reference) with `is_member()` and `refresh_member_role()`: built 13 Oct as a sketch (`roles-and-access.md` section 5). Nothing writes to it yet.
- **Points in the shared database:** `profiles.club_points` and `club_tier` (Bronze, Silver, Gold); `orders.points_earned`, `points_redeemed`, `points_awarded`, `points_refunded`; `spend_club_points()`. Points are earned when the customer has the goods and given back on a cancellation (`set_order_status()`). Website orders take no points (`points_on_web`, off; owner, 14 Oct). Two things differ from the owner's rule below:
  - **A redeemed point is worth KSh 0.10 there,** not KSh 1: `create_order()` and `recalculate_unpaid_order()` take `points_redeemed / 10.0` off the total.
  - **`points_earned` is whatever the app sends** (`p_order ->> 'pointsEarned'`); the server does not work it out, so a tampered request could claim any number.
- **Points on the POS:** XanaPlus loyalty earns 1 point per KSh 110 (`csr_customer_points` migration notes: "earns at /110").
- **DPO** is live-ready for orders (`dpo-integration.md`); it has no subscription or recurring charge.
- **No member price anywhere:** not in BC's published prices, not in the catalogue view, not in `create_order()`.

### What to build

1. **Plans (owner, 18 Nov: confirmed, prices include VAT):** Associate (free, the default for every account), Member Monthly KSh 200, Member Annual KSh 2,000. Store plans and prices in the database (settings or a `membership_plans` table the admin app edits), not in app code.
2. **Paying for a plan:** one DPO payment per period, through the same `dpo` function and the same payment record as orders, with `memberships.channel` = `app` and the DPO reference. No automatic renewal at first (DPO has no subscription here): remind before `ends_at` by SMS and in the app, and the member pays again. On payment, `refresh_member_role()` makes the user `member`; a nightly job returns lapsed users to `customer`. **Owner (18 Nov): finance adds a new BC item (SKU) for each membership package**, so a plan payment is posted to BC and signed by KRA like any sale line, through the existing `etims-sign` and `bc-post`. Each plan in the database carries its BC item number; the item must also be registered on the KRA device (the POS's `etims-items` feed) before the first sale.
3. **Member prices (owner, 18 Nov): a member price per item in BC, as a customer price group** (for example `MEMBER`), so the till charges it too. Synced into the catalogue like `price_tiers`, and charged by `create_order()` when `is_member()` is true, the same way it checks tier prices. The POS applies them at the counter for a member's phone number (POS change). Which items carry a member price is set in BC; an item without one sells at the normal price to members too.
4. **Savings shown honestly:** "You Save" = regular price minus member price, from the catalogue, never a made-up number. "Track your Member savings" = the sum of those savings on the member's paid orders (store the regular price on each order line; `order_items.list_price` already does this for the website).
5. **Points (owner, 18 Nov), replacing the workshop's "no points for non-members":**
   - **Who earns:** signed-up customers (`customer` and `member`; the roles are in `roles-and-access.md`). Anonymous shoppers (no account, on the website or at the till) earn none. **Staff, pharmacists and admins earn none** (owner, 18 Nov). Members get the benefits and discounts on top.
   - **One balance, the POS's (owner, 18 Nov):** the app uses the same loyalty points as the POS, one balance per customer. The POS keeps the ledger: one row per earn or redemption in its points table (`Ignite\Finance\Entities\Point`, keyed by the POS customer), the balance is their sum (`PointsController@getCustomerPoints`), and the KSh value of a point is the POS setting `finance.points_amount`. A customer's POS record and their app profile are matched by phone number, or by email when the phone doesn't match.
   - **Rate:** 1 point for every KSh 110 spent, the same as the POS.
   - **Value:** 1 point = KSh 1 when redeemed.
   - **Sync (owner, 18 Nov: an Edge Function, by phone or email):** a new read-only POS endpoint with its own token (the `etims-items` pattern) answers a customer's balance by phone or email; an Edge Function writes it to `profiles.club_points`, for one customer when the app opens their account and for everyone with an account on a schedule. The POS stays the source; `club_points` becomes a copy.
   - **Redeeming online (owner, 18 Nov):** the website and the app take M-Pesa and card only, so points are used **as a deduction from the order total before payment**: the customer chooses how many points to use at checkout, the total drops by KSh 1 a point, and M-Pesa or card pays the rest. Rules:
     - at most the order's goods total (delivery and payment fees are always paid in money), never more than the balance;
     - the points come off the balance when the order is placed and go back if it is cancelled, expires unpaid or is refused by the pharmacist (`create_order()`, `cancel_my_order()`, `payment_expire_order()`, `pharmacist_review_order()` already do this);
     - the payment fee is worked out on the amount left to pay, not on the full total;
     - points are earned only on the part paid in money, as on the POS (`LoyaltyPointsObserver`: earnable = amount paid minus `loyalty_amount`).
   - **How it is recorded (to confirm with finance):** at the till, points are a way of paying, not a discount: the KRA receipt shows the full sale and its full VAT, with the points counted in the cash amount (`EtimArtemis::getSignStructure()`, `loyalty_amount` in `$rawCash`). Online the customer sees the same thing (total, minus points, pay the rest). Proposal: record it the POS way, so the KRA receipt and BC match the till and VAT is unchanged; a true discount would lower each line's price and the VAT. See question 4 below.
   - **Online earning and redeeming must reach the POS ledger,** or the two balances drift apart. Proposal: a second POS endpoint (same token) that records an earn or a redemption for an order, keyed by the order number so a repeat is ignored; `set_order_status()` (earn when the customer has the goods, give back on cancellation) and `create_order()` (redeem) queue it through the outbox, as KRA and BC posting already are. To design with the POS sync.
   - **To change in the shared database:** `create_order()` works out `points_earned` itself (floor of the amount paid for goods / 110, excluding delivery and payment fees) and ignores any number the app sends; redemption uses the POS rate (KSh 1 per point today) instead of `/ 10.0` in `create_order()`, `recalculate_unpaid_order()` and the review functions. Points on website orders stay off until the owner switches `points_on_web` on.
   - **Existing app balances:** one account holds app points today (2,483, 18 Nov), most likely a test account. The POS balance replaces it at the first sync; confirm with Roy whose it is first.
6. **Free health checks:** a list of checks per branch clinic and how to book (call or WhatsApp at first, like "Ask a pharmacist"). **Owner (18 Nov): details to follow**; the page keeps "will be added here later" until then.
7. **"Coming soon" items** stay labelled as coming soon until built: Family Health Records, Group Bulk Buy, AI basket-building.
8. **Wording:** "Associate" and "Member" are used consistently; "Xana Plus" is the app name pending confirmation (workshop item 12).

## 4. Health and Wellness

### What the design shows (`health_1` to `health_3`)

- Heading **"Wellness, your way."**, "A moment for you", "Little check-ins can help you notice how your day is going."
- **Family Health Records:** coming soon.
- **Diabetes and Hypertension Help:** "Information, nutrition and everyday support".
- **Today's water check-in:** 0 / 8 glasses, a progress bar, "A gentle reminder to take a sip.", button **Log a glass**.
- **How are you feeling?** "A private daily check-in": Great, Okay, Low.
- **I made time to move:** "A walk, stretch or something you enjoy", a tick box.
- **Community Groups (Preview):** "Explore planned, moderated support groups. Joining and discussions are not live yet." Diabetes Support and Maternal Health, each "Moderation planned" with "View group preview".
- Notice: "These are simple personal check-ins, not medical advice or a substitute for care from a qualified health professional."

### What to build

- **Check-ins:** water (count per day, goal 8 by default and editable), feeling (one per day), movement (one tick per day).
- **Synced to the account, with the user's consent (owner, 18 Nov).** Mood and condition data are health data, sensitive personal data under Kenya's Data Protection Act, 2019 (workshop: trust with data, privacy, confidentiality). So:
  - **Consent first:** the first check-in asks once, in plain words, whether to save check-ins to the account so they show on other devices. The answer and its date are stored. "No" keeps check-ins on the phone only, and everything else works.
  - **Its own table** in the shared database (for example `wellness_checkins`: user, day, kind, value), readable and writable only by that user. Not readable by staff, pharmacists or admins; not used for marketing, recommendations or anything else without a separate consent.
  - **Withdraw and delete:** a setting turns syncing off and deletes the synced history; deleting the account deletes it too (`delete-account.html`).
  - **Privacy policy:** a paragraph on wellness check-ins before this goes live (with the owner's sign-off on the policy).
  - Tested like every shared-database change: signed out and as each role, another user's rows unreadable.
- **No streaks, scores or nudges that shame** ("Low" is a valid answer); a reminder is optional and off by default.
- **Diabetes and Hypertension Help:** reviewed content (pharmacist-written; Dr. Mumbi named in the workshop for pharmacy tips), with links to relevant products only where they are not prescription-only. Stored as content the admin app manages, not in app code.
- **Community Groups stay a preview until moderation is in place (owner, 18 Nov). Our internal pharmacists moderate.** Before joining opens: group rules, reporting a post, removing posts and users, and a moderator role (pharmacists, through `has_permission('app', …)`). No joining or posting until then.
- **Home link:** the home "daily check-in" card reads the same water count.
- **Keep the disclaimer** on every wellness screen.

## 5. Alignment with what is already live (website and shared pipeline)

| Topic | Live today | App design / vision | To align |
| --- | --- | --- | --- |
| Fulfilment | Pickup only, Syokimau and Ruiru; delivery built, off | "Delivering to Westlands" | Location row per section 2 |
| Prices | BC price, quantity tiers; branch offers specified (`pos-offers.md`) | Member Price / You Save | Section 3 point 3 |
| Prescription medicines | Prescription upload and pharmacist approval built (`prescription-upload.md`); controlled medicines never online | "Medicine orders are subject to pharmacist review" | Same rules in the app; never show prescription-only items on Home |
| Liquor | Not sold on the website or the app (owner, 17 Oct 2026) | Workshop: "Hold", "Match MyDawa" | Stays off until the owner decides |
| Payment | DPO live account 43844, service type 114430 (website); app's service type open | DPO | App uses the shared `dpo` function; app service type with DPO |
| One basket | Pharmacy and Retail in one basket on the website | Unified basket | Same in the app (`create_order()` is shared) |
| Points | Earned on app orders (number sent by the app); a point redeems KSh 0.10; none on website orders | Every signed-up account, 1 point per KSh 110, 1 point = KSh 1, as on the POS (owner) | Section 3 point 5 |
| Ask a pharmacist | WhatsApp links to six pharmacies | "Ask / Trust", chatbot | Start with the same WhatsApp links; chatbot later |

## 6. Suggested order

1. Owner answers section 7.
2. Landing page with real data (no member prices yet), honest location row, tab labels.
3. Wellness check-ins with the consent step and the synced table, with the disclaimer; Community Groups as a preview.
4. Member Services and Benefits page as information (plans, benefits, "coming soon"), no payment.
5. Membership payment through `dpo`, `memberships`, `refresh_member_role()`, renewal reminders.
6. Member prices end to end (BC price group, catalogue, `create_order()`, POS), and points worked out on the server at the owner's rate.

Each step is tested as `AGENTS.md` "Testing" requires; anything touching money (plan payment, member prices, points) is also tested for misuse: a non-member sending a member price, a lapsed member, a forged payment, an app request claiming extra points.

## 7. Owner's answers (18 Nov 2026) and what is still open

Answered on https://claude.ai/artifact/RceNArGozULeMAoNDnTnws.

| # | Question | Answer |
| --- | --- | --- |
| 1 | Member prices | A member price per item in BC (customer price group), so the till charges it too |
| 2 | Points | Signed-up accounts earn points; anonymous shoppers don't; members get benefits and discounts on top. 1 point per KSh 110, 1 point = KSh 1, as on the POS |
| 3 | Plans | Associate free, KSh 200 a month, KSh 2,000 a year, prices include VAT |
| 4 | "Picked for your week" | Past orders and best sellers |
| 5 | Free health checks | Details to follow from the owner |
| 6 | Community Groups | Internal pharmacists moderate; preview until moderation is in place |
| 7 | Membership fee in BC and KRA | A new BC item (SKU) per membership package |
| 8 | Wellness data | Synced to the account, with the user's consent |
| 9 | Tabs | Five, Community inside Wellness |

Still open:

1. **Free health checks:** which checks, at which clinics, how often, how to book (owner to share).
2. **Membership SKUs:** the BC item numbers, once finance creates them.
3. **The 2,483-point app balance:** Roy to confirm whose account it is before the POS balance replaces it.
4. **Points on the KRA receipt and in BC:** record redeemed points the POS way (a way of paying; full sale and VAT on the receipt) as proposed, or as a discount that lowers the prices and the VAT? Finance to confirm.

Answered in chat on 18 Nov: the app uses the POS's loyalty points, one balance per customer, synced by an Edge Function matching phone or email to the profile; staff, pharmacists and admins earn no points; existing app balances follow the POS balance.
