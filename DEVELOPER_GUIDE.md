# XanaPlus Developer Guide

## Overview and tech stack

XanaPlus is the Xana Life customer app — groceries, fresh, deli, pharmacy, liquor and
wholesale, with M-Pesa checkout and Nairobi delivery. One **Expo / React Native** codebase
for **Android and iOS**; the web build is a development preview only, never a shipped
platform. TypeScript throughout, **expo-router** for file-based navigation.

| Layer | What it is |
| --- | --- |
| App | Expo SDK 57, React Native 0.86, React 19, expo-router, TypeScript |
| Backend | **Supabase** — Postgres, Auth, Edge Functions (Deno), Realtime, Storage |
| Catalogue | **Microsoft Dynamics 365 Business Central** is the source of truth (stock, price, items) |
| Sign-in SMS | **Africa's Talking**, called from our own Edge Functions |
| Notifications | **Expo push** (expo-notifications), delivered through FCM on Android |
| Builds | **EAS Build** (APKs / store builds) and **EAS Update** (over-the-air JS updates) |
| Design | Figma, mirrored into `design/` (see *Where to find things*) |

Supabase project **"Xana Plus App"**, ref `yinlbtldfojobuwddpsj`, region eu-west-1
(Ireland), free plan. Dashboard: https://supabase.com/dashboard/project/yinlbtldfojobuwddpsj

EAS project **`@xana_plus/xanaplus`**, project id `bacdd557-2635-4341-b310-5c681f0b470c`.

### What is real, and what is not

Real: sign-in (Supabase + SMS), the live Business Central catalogue and search, barcode
lookup, cart and checkout, orders saved to Postgres (as **test** orders), customer accounts
and addresses, Staff tools, return requests, clinic bookings, Xana Club points, product
photos from the POS, promo codes, order ratings, usage/crash analytics, and push
notifications.

Not real yet: **M-Pesa is a countdown timer** with an "I've paid" button, not Safaricom
Daraja. Prescription photos are not stored anywhere. The Home hero and Trending Deals copy
is invented and hard-coded. There is no telehealth, no lab ordering, no insurance/SHA, no
longitudinal health record, no paid membership, no business accounts for wholesale, no
wellness or community features, no Swahili localisation, and no App Store / Play Store
submission.

## Project structure

| Path | What's there |
| --- | --- |
| `src/app/` | Every screen and route — expo-router file-based, folders map to URL paths |
| `src/components/ui/` | The shared design-system kit — `Screen`, `Card`, `Button`, `Chip`, `BottomSheet`, `Icon`, `Txt`, etc. |
| `src/store/` | React Context stores — `session`, `cart`, `fulfilment`, `orders` |
| `src/data/` | `catalog.ts` (sample products, categories, verticals), `live-catalogue.ts` (the Business Central queries and hooks), `images.ts` (the Figma asset manifest), `types.ts` |
| `src/lib/` | `supabase.ts` (the one client), `storage.ts` (AsyncStorage), `notifications.ts` (push), `analytics.ts`, `haptics.ts`, `format.ts` |
| `src/features/` | Small cross-screen feature bundles (auth sheet, name sheet, order rating, staff insights) |
| `supabase/migrations/` | The database schema, in order. Applied with `supabase db push` |
| `supabase/functions/` | Edge Functions (Deno). `_shared/otp.ts` holds the shared reply/CORS/SMS helpers |
| `design/specs/`, `design/reference/` | A local mirror of the Figma file — per-frame JSON + PNGs, refreshed by `npm run sync:design` |
| `scripts/sync-design.mjs` | Pulls the Figma file via REST into `design/` (separate quota from the Figma MCP) |
| `scripts/setup-push-notifications.sh` | Guided setup for the Expo account, EAS project, FCM key and development build |
| `SRS.md` | The requirements specification — FR/NFR codes, status, the D-1..D-5 decisions |

## Backend

**Migrations** (`supabase/migrations/`, applied in order):

| Migration | Adds |
| --- | --- |
| `20260924000000_accounts_and_otp` | `profiles`, `otp_codes` |
| `20260926000000_products_catalogue` | `products` (upsert key `item_no`), `bc_sync_runs` |
| `20260926010000_catalogue_view` | The `catalogue` view the app reads (anon-accessible) |
| `20260926020000_orders` | `orders`, `order_items` |
| `20260927000000_bc_sync_schedule` | pg_cron: nightly BC sync, weekly cron-log cleanup |
| `20260927010000_account_self_service` | `profiles.preferences`, `addresses` |
| `20260927020000_staff_returns_bookings_points` | `staff`, `is_staff()`, `staff_set_order_status()`, `return_requests`, `clinic_bookings`, realtime on `orders` |
| `20260927030000_promo_ratings_analytics` | `promo_codes`, `order_ratings`, `app_events`, `app_errors`, `staff_insights()` |
| `20260930000000_product_photos` | `products.photo_url`, `set_product_photos()`, pg_cron photo refresh |
| `20261001000000_catalogue_photo_first` | `has_photo` / `in_stock` on the catalogue view |
| `20261005000000_push_notifications` | `push_tokens`, the `orders` status trigger |
| `20261006000000_atomic_otp` | Staged: service-only durable OTP request ledger, atomic reservation/delivery/consumption RPCs and hourly retention cleanup |

The OTP hardening migration and matching handlers are **not deployed by this
change**. See `docs/backend-verification.md` for the owner-approved coordinated
rollout; handlers must not be deployed before their RPCs or mixed with legacy
handlers during live traffic.

**Edge Functions** (`supabase/functions/`): `request-otp` and `verify-otp` (sign-in),
`place-order` (re-prices every line from `catalogue` and refuses unknown/sold-out/Rx/18+
orders), `delete-account`, `bc-items-sync` (nightly catalogue pull), `product-images-sync`
(POS photo URLs, every 2 minutes), `send-push` (Expo push). All are deployed with
`verify_jwt = false` and check the caller themselves — see `supabase/config.toml`.

**Scheduled jobs** (pg_cron): `bc-items-sync-daily` at 03:30 UTC, `product-images-sync`
every 2 minutes, `cron-history-cleanup` weekly. They call the Edge Functions through
`pg_net` with the `x-sync-secret` header; the secret lives in Vault.

**Deploying:**

```
export SUPABASE_ACCESS_TOKEN="$(tr -d '[:space:]' < 'C:/Users/user/.secrets/Xana Plus App/superbase-xanaplusapp.txt')"
export SUPABASE_DB_PASSWORD="$(tr -d '[:space:]' < 'C:/Users/user/.secrets/Xana Plus App/superbase-db-password.txt')"

npx supabase@latest migration list                 # local vs remote
npx supabase@latest db push --dry-run              # what would apply
npx supabase@latest db push
npx supabase@latest functions deploy <name> --project-ref yinlbtldfojobuwddpsj --use-api
```

Server secrets (Africa's Talking key, OTP pepper, Business Central credentials, the sync
secret) live in Supabase, not in the repo: `npx supabase secrets list` shows the names.
Local copies are single-line files under `C:/Users/user/.secrets/Xana Plus App/` — never
commit them, never print them.

### Two rules that have bitten us

- **Staff can read every order.** Any customer-side query must filter
  `.eq('user_id', userId)` or it will leak other customers' orders.
- **supabase-js queries only run when awaited or `.then`'d.** `void query` silently does
  nothing.

## Running it

```
npx expo start --port 8090
```

from the project root. **Port 8090 is pinned deliberately** — `.claude/launch.json` sets it
because port 8081 is often occupied (e.g. by Docker), and Expo's non-interactive mode skips
the dev server entirely if it has to prompt for a different port.

- **On a phone:** Expo Go, scan the QR, same Wi-Fi. `npx expo start --port 8090 --tunnel`
  when the firewall blocks the LAN (the office Wi-Fi is Private, Node is allowed on Public
  only).
- **Sign in:** the demo number **0700 000 000** with code **`123456`** never sends an SMS.
  Any other Kenyan number gets a real code by text. You land as *Amina Odhiambo*, Gold tier.
- **Push notifications do not work in Expo Go on Android** (SDK 53 and later). Use a
  development build — see *Builds and updates*.

**What survives a reload:** the session, cart, orders, fulfilment and the product cache are
persisted to AsyncStorage (`src/lib/storage.ts`), so reloading does not sign you out.
The Supabase session and profile are checked before the app exposes authenticated data;
a cached profile alone is not a sign-in. Orders use `xanaplus.orders.v2` with an owner ID;
unowned legacy caches and other customers' caches are never restored. Other app stores
still use `xanaplus.*.v1`. To sign out, use the app's sign-out action, which also clears
Supabase's separately stored tokens; deleting the profile cache alone is not enough.

The current OTP provider sends **SMS only**. WhatsApp is not offered until a matching
server-side delivery implementation exists.

### Backend regression checks

```
npm run test:backend
npm run typecheck
npm run lint
```

`tests/backend/` runs isolated customer-store, client-error, and real Edge Function
handler checks with stubbed database/SMS responses. It never contacts Supabase, sends
SMS, or triggers payments. This suite complements Storybook without requiring Chrome.
See `docs/backend-verification.md` for the live verification results and limitations.

## Builds and updates

`eas.json` holds three profiles:

| Profile | Produces | Channel | Use |
| --- | --- | --- | --- |
| `development` | APK with `expo-dev-client` | development | Your own phone, loads JS from the dev server |
| `preview` | Standalone APK, internal distribution | preview | Management / team phones; receives OTA updates |
| `production` | Store build | production | App Store / Play Store |

```
npx eas-cli@latest build --profile preview --platform android --non-interactive
npx eas-cli@latest update --branch preview --message "Price fix" --non-interactive
```

**Over-the-air updates** carry JavaScript and assets only. Anything native — a new native
module, a new permission, the icon, an SDK upgrade, or a changed `EXPO_PUBLIC_*` value —
needs a new build. `runtimeVersion` follows the app version (`app.json`), so bumping the
version makes previously installed builds stop taking updates: bump deliberately.

**Environment variables.** `.env` is gitignored, so EAS Build never sees it. The two
`EXPO_PUBLIC_SUPABASE_*` values are set per EAS environment instead
(`eas env:list --environment preview`); they are inlined into the JS bundle at build time.
If a build ever ships without them, sign-in fails on that device.

### Three traps that cost us a build each

1. **Lockfile format.** EAS Build runs `npm ci` with **npm 10**, which rejects a lockfile
   written by **npm 12** (npm 12 adds `libc` fields npm 10 does not understand; the failure
   reads `Missing: <pkg> from lock file`). After any `npm install` on a machine with
   npm 12, regenerate before building:
   ```
   npx --yes npm@10.9.4 install --package-lock-only --no-audit --no-fund
   ```
2. **Assets must be what they claim.** `assets/figma/*` are JPEGs. A JPEG named `.png`
   works in development (Metro serves either) and fails only at release time, in
   `:app:mergeReleaseResources`, with `AAPT: error: file failed to compile`. Keep the
   extensions honest.
3. **A new native package needs a Metro restart.** Installing one while the dev server is
   running leaves a stale resolver cache; restart with `--clear`.

Run `npx expo-doctor@latest` before a build — it should report **21/21**.

`google-services.json` (Firebase, for Android push) is kept locally and **not committed**,
because the repository is public. It is not in `.gitignore`, so EAS Build still uploads it
from the working directory. The FCM *service-account key* is a real secret and lives
outside the repo; `.gitignore` blocks `*firebase-adminsdk*.json`.

## Push notifications

Order updates reach the phone through Expo's push service. Three parts, all in this repo:

| Part | Where |
| --- | --- |
| Client — asks permission, gets the Expo push token, saves it | `src/lib/notifications.ts`, mounted as `PushBridge` in `src/app/_layout.tsx` |
| Store — one row per device | `public.push_tokens` (migration `20261005000000_push_notifications.sql`) |
| Sender — reads the tokens and posts to Expo | `supabase/functions/send-push` |

The `orders` table fires the sender whenever staff change an order's status
(`staff_set_order_status`), so the customer gets "Out for delivery" and the rest with no app
code involved. The wording lives in `send-push` (`ORDER_MESSAGES`); a tapped notification
opens `/orders/<order_no>`.

Two rules the sender enforces: it skips a message when the matching switch under Profile >
Notifications is off (`profiles.preferences.alerts`, plus the `pushEnabled` master switch,
mapped by `STATUS_ALERT`), and signing out deletes this device's token row first
(`unregisterPush`, called from `signOut` while the session is still valid) so a signed-out
phone stops receiving that account's order updates.

`bash scripts/setup-push-notifications.sh` walks the whole setup: Expo account → EAS
project → Firebase FCM key → development build.

Send a test push by hand:

```
curl -X POST "https://yinlbtldfojobuwddpsj.supabase.co/functions/v1/send-push" \
  -H "Content-Type: application/json" \
  -H "x-sync-secret: <BC_SYNC_SECRET>" \
  -d '{"userIds":["<user-uuid>"],"title":"Test","body":"Hello"}'
```

The `orderNo` shape (`{"orderNo":"XN-7704","status":"out-for-delivery"}`) exercises the
real path and reports `{"skipped":"muted"}` when the customer has that switch off.

## Component tests (Storybook)

Each shared component has a `*.stories.tsx` file beside it: `src/components/ui/` plus
`features/orders/rate-order` and `features/staff/insights`. A story shows one state; a
`play` function taps and checks it like a test.

```
npm run storybook:dev   # browse the components at http://localhost:6006
npm run test:stories    # run every story as a test, headless, in the installed Chrome
```

- Stories run in the browser through react-native-web, not on a phone.
- The database is fake: `.storybook/mocks/supabase.ts`. A story sets answers with
  `mockSupabase.table()` / `.rpc()` in its `beforeEach` and checks what was sent in
  `mockSupabase.calls`. `expo-router` is faked too.
- Every story is signed in as a fake customer. Set `parameters: { session: { user: null } }`
  to show the signed-out state, or `{ isStaff: true }` for staff.
- The first run after installing packages can fail with a React `useContext` error while
  Vite rebuilds its cache. Run it again.
- Full screens (`src/app`) have no stories: they depend on too many real services.

**Known local blocker:** on this machine Vitest can fail before running anything with
`listen EACCES ::1:63xxx` — Windows (Hyper-V/WSL) reserves those TCP port ranges. Fix with
`net stop winnat && net start winnat` as admin, or a reboot. It is an environment problem,
not a code one.

## State and data

Four React Context providers, each with its own hook, composed in the root layout:

| Store | Hook | Holds |
| --- | --- | --- |
| `session.tsx` | `useSession()` | The signed-in customer, the real OTP flow, `preferences`, `isStaff`, `deleteAccount`, `spendPoints` |
| `cart.tsx` | `useCart()` | Basket lines, quantities, wholesale-tier pricing, substitution preference |
| `fulfilment.tsx` | `useFulfilment()` | Delivery mode, addresses, slot, store, payment method, M-Pesa number, points redeemed |
| `orders.tsx` | `useOrders()` | Saved orders loaded from Supabase (plus the three demo orders), status, substitution resolution |

All four persist to AsyncStorage and are restored on launch. Two sources feed the product
list: `src/data/catalog.ts` (the sample products the demo orders and prescriptions use) and
`src/data/live-catalogue.ts`, which queries the Business Central `catalogue` view and caches
what it sees under `xanaplus.products.v1`. `productById` checks the sample list first, then
the cache.

## Design system

`src/theme/tokens.ts` exports `colors`, `gradients`, `spacing`, `radius`, `elevation`,
`layout` and `motion` — extracted from the Figma file, so a value like `colors.primary` or
`spacing.lg` always matches the design. `typography.ts` exports named `type` variants
(`titleLg`, `bodySm`, `overline`, …) consumed through the `<Txt variant="...">` component
rather than raw font sizes.

`src/components/ui/` is the shared kit every screen builds from — `Screen`, `TopBar`,
`Card`, `Button`, `Chip`, `BottomSheet`, `SelectableOption`, `SectionHeader`, `Icon` (a
fixed name-to-glyph map, `icon.tsx`), and more. New screens should compose from this kit
rather than writing raw `View`/`Text` styling, to keep visual consistency without
re-deriving tokens by hand.

## Routing conventions

Standard `expo-router` file-based routing under `src/app/`: `(tabs)/` for the bottom-tab
group, `[id].tsx` for dynamic segments, nested folders for sub-flows
(`pharmacy/clinical/index.tsx` + `pharmacy/clinical/[serviceId].tsx`).

**Known gotcha:** when a folder has both an `index.tsx` and a `[dynamic].tsx` sibling, the
auto-generated typed-routes file (`.expo/types/router.d.ts`) doesn't always alias the bare
folder path (e.g. `/pharmacy/clinical`) — only the literal `/pharmacy/clinical/index`.
Worse, navigating to `/pharmacy/clinical/index` at runtime can resolve through the dynamic
route instead (with `index` read as the param), not the actual index screen. The bare folder
path (`/pharmacy/clinical`) is the one that works correctly at runtime; if TypeScript
complains it isn't a recognised route, cast rather than rename the call:
`router.push('/pharmacy/clinical' as Parameters<typeof router.push>[0])`.

## Open decisions

The five commercial questions **D-1 to D-5** were answered on 23 Sep 2026 and implemented
(hold the item rather than substitute, refunds by credit note, suggest an alternative,
never show the packaging fee, 1 point per KES 120). FR-C.7 is the "Item on hold" card in
`src/app/orders/[id].tsx`. `SRS.md` (version 1.2) records the answers in section 8.

Still genuinely open: whether to keep the KES 20 platform fee hidden, the D-1 cut-off
(30 minutes, then next slot, then refund), the D-3 substitution wording, and whether the
Business Central sync runs nightly or hourly (matters for price offers).

## Where to find things

| What | Where |
| --- | --- |
| Supabase dashboard | https://supabase.com/dashboard/project/yinlbtldfojobuwddpsj |
| EAS project | https://expo.dev/accounts/xana_plus/projects/xanaplus |
| Figma design file | [figma.com/design/G4iVN6s7cWFkkl2oCXuhb8/XanaPlusApp](https://www.figma.com/design/G4iVN6s7cWFkkl2oCXuhb8/XanaPlusApp) — `NN[letter] · Object — State` naming |
| Local design mirror | `design/specs/*.json` + `design/reference/*.png`, refreshed with `npm run sync:design` (a separate, often rate-limited quota from the Figma MCP) |
| Requirements spec | `SRS.md` in the repo root — FR/NFR codes, priorities, status, the D-1..D-5 table |
| Living management doc | Two tabs: *Where we are* (the management brief) and *Requirements* (the full SRS, kept in sync with `SRS.md`) |
| Local secrets | `C:/Users/user/.secrets/Xana Plus App/` — single-line files, never committed, never printed |

Writing to Figma (renames, layout, wiring) goes through a **Scripter plugin script** — plain
Figma Plugin API JavaScript that runs inside the Figma desktop app, bypassing both the MCP
and REST quotas. Reading via Scripter (since it has no visible console output in this setup)
means dumping results onto the canvas as a text layer rather than relying on `console.log`.
