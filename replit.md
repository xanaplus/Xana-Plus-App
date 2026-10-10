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

## Checks and limitations

- `npm run typecheck` checks TypeScript.
- `npm run lint` runs Expo's ESLint configuration.
- M-Pesa payment confirmation is simulated in the imported app; it does not capture real payments.
- The user has deferred real M-Pesa integration until they have Daraja API access. Leave the simulated flow unchanged unless they ask to resume that work.
- Web preview does not verify native camera, push notifications, or Android/iOS builds.
- No Supabase migrations or Edge Function deployments are performed as part of environment setup.

## Pharmacy

- Prescription ordering is upload-first: pharmacist review and a priced quote precede customer confirmation.
- The `pharmacy_reviewers` membership is separate from ordinary staff. Only grant it to an account explicitly designated as an authorised pharmacist.
- Prescription documents use private storage and short-lived signed URLs. Never expose them in public catalogue or summary screens.
- Pharmacy checkout currently creates labelled test orders with simulated payment and no points redemption or earning. It does not initiate real M-Pesa payments.
- Redemption checks cover this app's prescriptions, not in-store/Collabmed dispensing. Do not claim cross-channel duplicate prevention or live dispensing integration.
- `scripts/tests/prescription-first.sql` uses synthetic fixtures and must run in a transaction ending in rollback. It must never be run without rollback against the shared backend.
- Do not activate SMS configuration or apply unrelated migrations as part of Pharmacy work.

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
