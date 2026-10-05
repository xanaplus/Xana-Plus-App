# XanaPlus

Mobile app for **XanaPlus** — the Xana LIFE retail experience (groceries, fresh, deli,
pharmacy, liquor and wholesale) with M-Pesa checkout and Nairobi express delivery.

Built with **Expo SDK 57 + Expo Router + TypeScript**, rendered to match the
`XanaPlusApp` Figma file frame for frame.

## Run

```bash
npm install
npm start          # Expo dev server (press w for web, a/i for devices)
npm run web        # web only
npm run typecheck  # tsc --noEmit
npm run lint       # expo lint
```

## Design source

The 22 Figma frames are versioned in `design/`:

- `design/reference/<slug>.png` — exported frame, the visual reference
- `design/specs/<slug>.json` — node tree with exact boxes, fills, radii and strings
- `design/specs/_index.json` — slug ↔ frame name ↔ size

Product photography and category artwork are the design's own image fills, exported to
`assets/figma/` (84 assets) and addressed through `figmaAsset('kenyan-organic-hass-avocados')`
in `src/data/images.ts`. Brand assets (icon, adaptive icon, favicon, splash lockup) are in
`assets/brand/`.

## Layout

```
src/app            expo-router routes (typed routes enabled)
  (tabs)/          Home · Categories · Pharmacy · Cart · Profile
  product/[id]     grocery + pharmacy product detail
  checkout/        standard/COD/card/Rx-blocked + M-Pesa STK pending
  search, login    search results (+ empty state), OTP sign-in
src/components/ui  design-system kit (Txt, Button, Card, ProductCard, BottomSheet, …)
src/components/nav custom bottom navigation with the raised Pharmacy action
src/theme          colour ramp, spacing, radii, elevation, Inter type ramp
src/data           catalogue, categories, verticals, deals, types, image manifest
src/store          cart, session, fulfilment providers
src/lib            money and count formatting
```

Screen copy in `src/data/catalog.ts` is the Figma copy verbatim, so the Figma prices drive the
cart maths: the seeded cart reproduces Screen 5 exactly (3 items · 8 units, subtotal
KES 1,650, wholesale saving KES 240, platform KES 20, total KES 1,670).

## Not backed by a server yet

- `src/store/session.tsx` — OTP sign-in is mocked: `requestOtp` accepts any `+254…`/`07…`
  number and the code is **123456**. Swap `requestOtp`/`verify` for the real API.
- Orders, payment capture (M-Pesa STK push), prescriptions and notifications are UI flows only —
  they navigate and update local state, they do not call a backend.
- Catalogue data is static in `src/data/catalog.ts`.
