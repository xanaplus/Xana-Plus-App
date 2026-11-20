/**
 * What ships at the 19 Dec 2026 launch (L10 tracker). Features switched off here are
 * made-up content or not connected to anything yet; they stay in the code, ready to
 * switch back on (Roystone, 1 Nov 2026).
 */
export const LAUNCH_SCOPE = {
  /** Home's sample content: the bell's alerts, Trending Deals and the 1-Tap M-Pesa banner. Waits for marketing's offers and DPO. */
  homeOffers: false,
  /** Checkout promo codes: only a test code exists until marketing sets offers. */
  promoCodes: false,
  /** The Pharmacy tab's "Free Skin Analysis" promo. */
  skinAnalysis: false,
  /** In-app pharmacist chat (sample replies); Ask a Pharmacist opens the WhatsApp pharmacist list instead. */
  pharmacistChat: false,
  /** Consult Doctor and clinic bookings: Care comes after launch, and no one handles bookings yet. */
  clinicalServices: false,
  /** Return requests and the Returns & bookings list: the admin site has no Returns screen yet, so requests reach no one. Customers return at the counter. */
  returns: false,
  /** M-Pesa at checkout: simulated until DPO Pay is live (it said "We sent the PIN prompt" and sent nothing). Cash only until then (7 Nov 2026). */
  mpesa: false,
  /**
   * "Pay online" (DPO's page: M-Pesa, Airtel Money or card). Real money since 19 Nov 2026.
   * Off = only staff, pharmacist and admin accounts see it, for the first KSh 5 tests;
   * place-order refuses it for everyone else unless its APP_PAY_ONLINE secret is `all`.
   */
  payOnline: false,
  /**
   * Play release check, 20 Nov 2026 (owner: "fix each"). Each of these is off because
   * nothing real stands behind it yet; switch back on when it does.
   */
  /** Paid Member plans (KSh 200 / 2,000): nothing can be bought, no member prices or health checks yet. */
  memberPlans: false,
  /** Door delivery: the website's distance fee is still off for customers; the app's slots were invented. Pickup only. */
  delivery: false,
  /** "Upload a prescription" on its own: no admin screen reads these. Prescriptions are attached at checkout. */
  rxUploadAlone: false,
  /** Wellness Community Groups and Family Health Records previews. */
  wellnessPreviews: false,
  /** Order ratings and the "if an item is unavailable" choice: the admin app shows neither. */
  orderFeedback: false,
  /** Club tiers (Silver, Gold…): nothing ever changes a customer's tier. Points only. */
  clubTiers: false,
} as const;
