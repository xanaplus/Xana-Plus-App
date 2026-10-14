# XanaPlus on Replit

## Run

- Keep the imported Expo SDK 57 / Expo Router / React Native structure.
- Use Node.js 22 or newer; the existing Supabase SDK requires it.
- Dependencies are installed with npm using the existing package manifest and lockfile.
- Click **Run** to start the **XanaPlus web** workflow.
- The workflow runs `EXPO_UNSTABLE_HEADLESS=1 npm run web -- --port 5000 --host lan`.
- Expo/Metro serves the web preview on port 5000, exposed through Replit's proxy. Headless mode avoids launching the native desktop debugger in this container; hot reload remains enabled.
- For native development, the original `npm start`, `npm run android`, and `npm run ios` scripts remain unchanged.

## Backend settings

The existing Supabase backend is retained; no replacement database was created. Pharmacy-specific tables, private storage and approval checks were added with an explicitly applied prescription migration.
Set these through Replit Secrets and restart the workflow after changes:

- `EXPO_PUBLIC_SUPABASE_URL`: existing Supabase project URL.
- `EXPO_PUBLIC_SUPABASE_KEY`: publishable (or anon) client key, never a service-role key.

These are public client configuration values and are included in Expo's client bundle despite being stored in Secrets. Backend-only credentials must remain in Supabase Edge Function secrets.

Sign-in, the live catalogue, saved orders, and account data depend on that project's schema and Edge Functions. See `DEVELOPER_GUIDE.md` for current backend details; the README's statement that there is no backend is outdated.

## Publishing

- Keep the existing Autoscale target. Build with `npm run build:web`, then run `npm run start:production`.
- The Expo single-page web export goes to `dist/`. It is Git-ignored but must NOT be deployment-ignored: publishing filters the image after the build, so ignoring the production output removes the files the server needs. Reserve deployment-ignored `generated-artifacts/` for disposable non-runtime outputs.
- The production server binds to `0.0.0.0` using `PORT` or 5000. It serves only the web export, supports Expo Router deep links and responds to `/` without waiting for Supabase or sign-in.
- Do not use the Metro development workflow or a generic shell `$file` command for publishing. Keep the separate design sandbox out of the production app.
- The two `EXPO_PUBLIC_SUPABASE_*` client settings must exist during the production build, because Expo embeds them in the client bundle. Never embed backend-only credentials.
- `tests/backend/production-server.test.mjs` checks startup probes, deep links, assets, HEAD, missing files and path/write protections. Publishing settings changes require another user-initiated publish.

## Checks and limitations

- `npm run typecheck` checks TypeScript.
- `npm run lint` runs Expo's ESLint configuration.
- M-Pesa payment confirmation is simulated in the imported app; it does not capture real payments.
- The user has deferred real M-Pesa integration until they have Daraja API access. Leave the simulated flow unchanged unless they ask to resume that work.
- Web preview does not verify native camera, push notifications, or Android/iOS builds.
- No Supabase migrations or Edge Function deployments are performed as part of environment setup.

## Pharmacy

- Only BC's `CONTROLLED` inventory posting group requires a prescription. Generic `PHARMACY`, `POM`, `CHRONIC` or `CONTROLLED` item-category codes do not require one outside that posting group; the owner explicitly approved this rule.
- Prescription ordering is upload-first: pharmacist review and a priced quote precede customer confirmation.
- The `pharmacy_reviewers` membership is separate from ordinary staff. Only grant it to an account explicitly designated as an authorised pharmacist.
- Prescription documents use private storage and short-lived signed URLs. Never expose them in public catalogue or summary screens.
- Pharmacy checkout currently creates labelled test orders with simulated payment and no points redemption or earning. It does not initiate real M-Pesa payments.
- Redemption checks cover this app's prescriptions, not in-store/Collabmed dispensing. Do not claim cross-channel duplicate prevention or live dispensing integration.
- `scripts/tests/prescription-first.sql` uses synthetic fixtures and must run in a transaction ending in rollback. It must never be run without rollback against the shared backend.
- Do not activate SMS configuration or apply unrelated migrations as part of Pharmacy work.
- The scoped Controlled-only catalogue migration was explicitly applied to the existing Supabase backend. It preserves catalogue fields, prices, stock, visibility, age restrictions and read-only permissions; existing server-side prescription guards remain in place.
- The product cache version was advanced to discard old broad prescription flags. Publish the updated frontend for existing live clients to get this cache invalidation; the backend rule is already active.
- `node scripts/tests/catalogue-prescription-rule.mjs` checks rollback-only classification fixtures and public flag counts. `node scripts/tests/prescription-rule-browser.mjs` checks Controlled and OTC product labels as a guest, without SMS or orders.

## BC wholesale pricing

- BC quantity rules apply independently to each product, never the combined basket.
- The existing BC `itemSalesPrice` API supplies the rules; credentials remain backend-only.
- Only general-customer, KES/base-unit rules are public. Customer-specific prices, other selling units and zero-price records are excluded and counted in sync results.
- Prices are VAT-inclusive. Ex-VAT rules are converted only when BC VAT configuration gives an unambiguous rate; ambiguous tax configuration fails the sync.
- The separately deployed `bc-wholesale-sync` function updates a complete snapshot atomically. Its daily job follows the item sync at 03:35 UTC, and uses the existing Vault authentication.
- The wholesale migration was explicitly applied, and the updated `place-order` function was explicitly deployed. Post-merge setup must still never apply migrations or deploy functions.
- Product and basket pricing share the checkout quantity-price resolver. Checkout rejects a supplied stale unit price and refreshes catalogue data for review before retry.
- Prescription orders continue to use the pharmacist's fixed quote; this work does not change clinical quote pricing, SMS or simulated payments.
- `node scripts/tests/wholesale-browser.mjs` checks real catalogue/PDP/basket interactions as a guest and never invokes login, SMS or order creation.

## Customer catalogue visibility

- The owner approved hiding the 60 item numbers in `docs/hide-from-website.csv` from both the website and app through their shared catalogue.
- `products.show_on_website` is app-owned and defaults to true. Neither BC sync may write/reset it.
- The public `catalogue` must retain its visibility filter, existing safe columns, wholesale tiers and regulatory rules in future view migrations.
- The view is read-only for public clients. Keep the visibility flag and costs/margins private.
- The scoped visibility migration was explicitly applied to the existing shared Supabase backend. No frontend publishing is required for this database change.
- `node scripts/tests/catalogue-visibility.mjs` verifies exclusions/public permissions and runs only rollback-only database fixtures; it must never commit test changes.

## Recorded savings

- Profile Savings and Spending use recorded wholesale and promo discounts on non-cancelled orders, not the current basket or guessed delivery charges.
- General checkout records the exact wholesale discount in `orders.wholesale_savings` and returns it for immediate display. History retains the saved value and line-price snapshots after reload.
- Older wholesale savings were not stored. Their new column remains null; do not fabricate a backfill using current BC prices or tiers.
- Spending opens at All time to agree with the profile counter; period filters remain available.
- The scoped order-savings migration and updated checkout function were explicitly applied/deployed. Prescription quotes, SMS, payments and existing order totals were not changed.
- Monthly spending bars use paid order totals. The department donut uses recorded item amounts before order-level fees/discounts, not guessed allocations; unavailable departments are grouped as unclassified and missing legacy prices are disclosed.
- `node scripts/tests/spending-donut-browser.mjs` renders the real component with isolated fixtures, without bypassing app auth or writing shared orders. It checks both themes, phone layouts, legend navigation, grouped departments, single-category and empty states.

## Deli catalogue and design previews

- The Deli kitchen shelf reads the public catalogue across BC posting groups. Customer department mapping must not rewrite BC groups, prescription/age flags, prices, stock, wholesale tiers or visibility exclusions.
- Existing cached Deli products are reclassified without discarding their offline financial data.
- `npm run test:backend -- tests/backend/deli-catalogue.test.mjs` covers classification, cache restoration, shelf/search queries and regulatory/financial preservation. `node scripts/tests/deli-browser.mjs` checks guest-only Deli navigation and cached product restoration.
- This is a frontend catalogue change; publish the updated app for live customers to receive it.
- The separately managed mockup sandbox hosts user-requested design options only. Do not replace the Expo app or integrate prototype data without explicit approval. Its TypeScript configuration is independent of the Expo app's aliases.

## Appearance

- Profile → Settings places Appearance above Fulfilment store. Options are Light, Dark and Use device setting; a new device defaults to its system preference.
- Appearance is a device preference, available to guests and retained through sign-out. It is deliberately separate from synced account preferences.
- Use the resolved semantic palette and memoized theme styles for screens and nested components. Keep store selection, product imagery and business logic independent of appearance.
- `node scripts/tests/appearance-browser.mjs` checks guest-only theme changes, persistence, live device changes, contrast and store switching without login, SMS, orders or payments.
- Native interface style is automatic. Changes to native app configuration require a new native build; web preview does not verify Android/iOS builds.
- Product cards/rows and category rails share a 44px “+ Add” pill. Optional pack and old-price slots must not shift adjacent card footers. Keep card navigation and add controls as sibling pressables, and preserve existing quantity/Rx/stock checks.
- `node scripts/tests/product-card-browser.mjs` checks public card alignment and guest-local cart interactions in both themes without login, shared orders or payments.
