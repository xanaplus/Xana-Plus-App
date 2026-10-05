# XanaPlus Developer Guide

## Overview and tech stack

XanaPlus is an **Expo / React Native app** (one codebase for iOS, Android; web is a dev-preview convenience only, not a shipped platform), written in **TypeScript**, using **expo-router** for file-based navigation. It is front-end only: **there is no backend**. Every screen is real and runs on-device, but the catalogue, cart, orders, sign-in and payments are all sample data and in-memory React state — a reload wipes everything.

Key facts:
- Sign-in accepts any valid Kenyan number; the OTP is hardcoded to `123456`.
- M-Pesa is a countdown timer, not a real Safaricom integration.
- The catalogue is a static TypeScript file (`src/data/catalog.ts`), not a live inventory feed.
- No persistence layer of any kind — no database, no API calls, no auth backend.

## Project structure

| Path | What's there |
| --- | --- |
| `src/app/` | Every screen and route — expo-router file-based, folders map to URL paths |
| `src/components/ui/` | The shared design-system kit — `Screen`, `Card`, `Button`, `Chip`, `BottomSheet`, `Icon`, `Txt`, etc. |
| `src/store/` | React Context stores — `session`, `cart`, `fulfilment`, `orders` |
| `src/data/` | Static sample data — `catalog.ts` (products, categories), `orders.ts`, `clinical.ts`, `prescriptions.ts`, `types.ts` |
| `src/theme/` | Design tokens — `tokens.ts` (colors, spacing, radius), `typography.ts` |
| `src/features/` | Small cross-screen feature bundles (e.g. the shared auth sheet) |
| `design/specs/`, `design/reference/` | A local mirror of the Figma file — per-frame JSON + PNGs, refreshed by `npm run sync:design` |
| `scripts/sync-design.mjs` | Pulls the Figma file via REST into `design/` (separate quota from the Figma MCP) |
| `SRS.md` | The requirements specification — FR/NFR codes, status, the D-1..D-5 open decisions |

## Running it

```
npx expo start --port 8090
```

from the project root. **Port 8090 is pinned deliberately** — `.claude/launch.json` sets it because port 8081 is often occupied (e.g. by Docker), and Expo's non-interactive mode skips the dev server entirely if it has to prompt for a different port.

- **On a phone:** Expo Go, scan the QR code, same Wi-Fi (`--tunnel` if the firewall blocks it).
- **Sign in:** any Kenyan mobile number (e.g. `712345678`), code **`123456`**. You land as *Amina Odhiambo*, Gold tier, 2,480 points.
- **The demo trap:** session, cart and orders are in-memory only. A hard reload signs you out and re-seeds the basket — navigating inside the app is fine, reloading is not.

## Push notifications

Order updates reach the phone through Expo's push service. Three parts, all in this repo:

| Part | Where |
| --- | --- |
| Client — asks permission, gets the Expo push token, saves it | `src/lib/notifications.ts`, mounted as `PushBridge` in `src/app/_layout.tsx` |
| Store — one row per device | `public.push_tokens` (migration `20261005000000_push_notifications.sql`) |
| Sender — reads the tokens and posts to Expo | `supabase/functions/send-push` |

The `orders` table fires the sender whenever staff change an order's status (`staff_set_order_status`), so the customer gets "Out for delivery" and the rest with no app code involved. The wording lives in `send-push` (`ORDER_MESSAGES`); a tapped notification opens `/orders/<order_no>`.

Two rules the sender enforces: it skips a message when the matching switch under Profile > Notifications is off (`profiles.preferences.alerts`, plus the `pushEnabled` master switch, mapped by `STATUS_ALERT`), and signing out deletes this device's token row first (`unregisterPush`) so a signed-out phone stops receiving that account's order updates.

**Push does not work in Expo Go on Android from SDK 53.** A development build is required, which needs a free Expo account and `eas init` — that writes `extra.eas.projectId` into `app.json`, which `getExpoPushTokenAsync` requires. Until then `registerForPush` returns `{ ok: false, error: 'no-project' }` and the app runs unchanged.

`bash scripts/setup-push-notifications.sh` walks the whole setup: Expo account → EAS project → Firebase FCM key → development build. A development build needs `expo-dev-client` (the wizard installs it); `eas.json` holds the `development` profile (APK, internal distribution).

**Lockfile gotcha.** EAS Build runs `npm ci` with **npm 10**, which rejects a lockfile written by **npm 12** (npm 12 adds `libc` fields npm 10 does not understand, and `npm ci` then fails with `Missing: <pkg> from lock file`). After any `npm install` on a machine with npm 12, regenerate before building:

```
npx --yes npm@10.9.4 install --package-lock-only --no-audit --no-fund
```

`package.json` pins `"packageManager": "npm@10.9.4"` for the same reason. `google-services.json` is committed on purpose (Firebase API keys ship inside every APK); the FCM service-account key is not, and `.gitignore` blocks `*firebase-adminsdk*.json`.

Send a test push by hand:

```
curl -X POST "https://yinlbtldfojobuwddpsj.supabase.co/functions/v1/send-push" \
  -H "Content-Type: application/json" \
  -H "x-sync-secret: <BC_SYNC_SECRET>" \
  -d '{"userIds":["<user-uuid>"],"title":"Test","body":"Hello"}'
```

## Component tests (Storybook)

Each shared component has a `*.stories.tsx` file beside it: `src/components/ui/` plus `features/orders/rate-order` and `features/staff/insights`. A story shows one state; a `play` function taps and checks it like a test.

```
npm run storybook:dev   # browse the components at http://localhost:6006
npm run test:stories    # run every story as a test, headless, in the installed Chrome
```

- Stories run in the browser through react-native-web, not on a phone.
- The database is fake: `.storybook/mocks/supabase.ts`. A story sets answers with `mockSupabase.table()` / `.rpc()` in its `beforeEach` and checks what was sent in `mockSupabase.calls`. `expo-router` is faked too.
- Every story is signed in as a fake customer. Set `parameters: { session: { user: null } }` to show the signed-out state, or `{ isStaff: true }` for staff.
- The first run after installing packages can fail with a React `useContext` error while Vite rebuilds its cache. Run it again.
- Full screens (`src/app`) have no stories: they depend on too many real services.

## State and data

Four React Context providers, each with its own hook, composed in the root layout:

| Store | Hook | Holds |
| --- | --- | --- |
| `session.tsx` | `useSession()` | Current user, OTP flow (mock), `spendPoints` |
| `cart.tsx` | `useCart()` | Basket lines, quantities, wholesale-tier pricing, substitution preference |
| `fulfilment.tsx` | `useFulfilment()` | Delivery mode, address collection (`addresses`, `addAddress`), slot, store, payment method, M-Pesa number, points redeemed at checkout |
| `orders.tsx` | `useOrders()` | Placed orders (seeded from `src/data/orders.ts`), status advancement, substitution resolution |

All four reset on a hard reload — nothing survives outside the running JS context. `src/data/catalog.ts` is the single source of truth for products, categories and department (`verticalForProduct`).

## Design system

`src/theme/tokens.ts` exports `colors`, `gradients`, `spacing`, `radius`, `elevation`, `layout` and `motion` — extracted from the Figma file, so a value like `colors.primary` or `spacing.lg` always matches the design. `typography.ts` exports named `type` variants (`titleLg`, `bodySm`, `overline`, …) consumed through the `<Txt variant="...">` component rather than raw font sizes.

`src/components/ui/` is the shared kit every screen builds from — `Screen`, `TopBar`, `Card`, `Button`, `Chip`, `BottomSheet`, `SelectableOption`, `SectionHeader`, `Icon` (a fixed name-to-glyph map, `icon.tsx`), and more. New screens should compose from this kit rather than writing raw `View`/`Text` styling, to keep visual consistency without re-deriving tokens by hand.

## Routing conventions

Standard `expo-router` file-based routing under `src/app/`: `(tabs)/` for the bottom-tab group, `[id].tsx` for dynamic segments, nested folders for sub-flows (`pharmacy/clinical/index.tsx` + `pharmacy/clinical/[serviceId].tsx`).

**Known gotcha:** when a folder has both an `index.tsx` and a `[dynamic].tsx` sibling, the auto-generated typed-routes file (`.expo/types/router.d.ts`) doesn't always alias the bare folder path (e.g. `/pharmacy/clinical`) — only the literal `/pharmacy/clinical/index`. Worse, navigating to `/pharmacy/clinical/index` at runtime can resolve through the dynamic route instead (with `index` read as the param), not the actual index screen. The bare folder path (`/pharmacy/clinical`) is the one that works correctly at runtime; if TypeScript complains it isn't a recognised route, cast rather than rename the call: `router.push('/pharmacy/clinical' as Parameters<typeof router.push>[0])`.

## What's not built

The single biggest gap: **no backend at all**. Specifically missing:

- A server, live product/stock feed, real accounts, real OTP delivery
- A real M-Pesa (Safaricom Daraja) integration — today it's a client-side countdown
- Any persistence — everything lives in React state and is lost on reload
- The pharmacist-side tooling (dispensing, verification queue)

Five business decisions are also still open and gate specific requirements — tracked as **D-1 through D-5** in `SRS.md` § 8 (out-of-stock handling, refund timing, substitution value rule, packaging-fee display, points accrual rate). Don't implement copy or logic in those areas against a guessed default — surface the open decision instead.

Current status: 52 of 53 functional requirements are Built; the one remaining (FR-C.7, what happens when a customer doesn't answer about an out-of-stock item) is blocked on D-1.

## Where to find things

| What | Where |
| --- | --- |
| Figma design file | [figma.com/design/G4iVN6s7cWFkkl2oCXuhb8/XanaPlusApp](https://www.figma.com/design/G4iVN6s7cWFkkl2oCXuhb8/XanaPlusApp) — 36+ frames, `NN[letter] · Object — State` naming |
| Local design mirror | `design/specs/*.json` + `design/reference/*.png`, refreshed with `npm run sync:design` (a separate, often rate-limited quota from the Figma MCP) |
| Requirements spec | `SRS.md` in the repo root — FR/NFR codes, priorities, Built/Designed/Open status, the D-1..D-5 decision table |
| Living management doc | Two tabs: *Where we are* (the management brief) and *Requirements* (the full SRS, kept in sync with `SRS.md`) |

Writing to Figma (renames, layout, wiring) goes through a **Scripter plugin script** — plain Figma Plugin API JavaScript that runs inside the Figma desktop app, bypassing both the MCP and REST quotas. Reading via Scripter (since it has no visible console output in this setup) means dumping results onto the canvas as a text layer rather than relying on `console.log`.
