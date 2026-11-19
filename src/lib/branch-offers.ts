
/**
 * POS branch offers (William, 18 Nov 2026; `catalogue.offers_by_location`): a price a
 * shop sets on the till, below the BC price, for one branch. Online an item on offer
 * sells at that price for every quantity, with no quantity prices. create_order()
 * charges it for the order's branch, so the app shows and sends it too.
 */
export type BranchOffer = { price: number; endsOn: string | null };
export type BranchOffers = Record<string, BranchOffer>;

/** Today in Nairobi as YYYY-MM-DD (no imports: place-order loads this file in Deno). */
const today = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

/** The branch prices are worked out for: the customer's chosen store, set by FulfilmentProvider. */
let branch = 'SYOKIMAU';
const listeners = new Set<() => void>();

export const pricingBranch = () => branch;
export const subscribePricingBranch = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export function setPricingBranch(next: string) {
  const code = next.toUpperCase();
  if (code === branch) return;
  branch = code;
  listeners.forEach(listener => listener());
}

/** The running offer for this product at a branch (the chosen one by default), or null. */
export function activeOffer(
  product: { price: number; offers?: BranchOffers },
  at: string = branch,
  date: string = today(),
): BranchOffer | null {
  const offer = product.offers?.[at.toUpperCase()];
  if (!offer || !Number.isFinite(offer.price) || offer.price <= 0 || offer.price >= product.price) return null;
  if (offer.endsOn && offer.endsOn < date) return null;
  return offer;
}

/** "Ends 30 Nov", or null for an offer with no end date. */
export function offerEndsLabel(offer: BranchOffer): string | null {
  if (!offer.endsOn) return null;
  const [y, m, d] = offer.endsOn.split('-').map(Number);
  if (!y || !m || !d) return null;
  const when = new Date(Date.UTC(y, m - 1, d, 12));
  return `Ends ${when.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`;
}

/** Reads `offers_by_location` ({"SYOKIMAU": {"price": 308, "ends_on": "2026-11-23"}}). */
export function parseOffers(raw: unknown): BranchOffers | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const offers: BranchOffers = {};
  for (const [code, value] of Object.entries(raw as Record<string, unknown>)) {
    const entry = value as { price?: unknown; ends_on?: unknown } | null;
    const price = Number(entry?.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    offers[code.toUpperCase()] = { price, endsOn: typeof entry?.ends_on === 'string' ? entry.ends_on : null };
  }
  return Object.keys(offers).length ? offers : undefined;
}

