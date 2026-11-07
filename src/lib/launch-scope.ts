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
} as const;
