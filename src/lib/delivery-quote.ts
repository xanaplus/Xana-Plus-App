/**
 * Delivery quotes from the shared web-checkout function (see delivery-locate.ts): the
 * types and the rules that need no network, kept apart so tests can load them.
 */

/** Where a point came from; the two address ones re-measure a place looked up before. */
export type PointSource = 'device' | 'pin' | 'search' | 'address_exact' | 'address_area';

export type DeliveryQuote = {
  id: string;
  branchCode: string;
  branchName: string;
  lat: number;
  lng: number;
  locationSource: string;
  locationLabel: string;
  distanceKm: number;
  /** The fee before any free-delivery threshold. */
  deliveryFee: number;
  /** ISO time; the quote is refused after this (30 minutes). */
  expiresAt: string;
};

export type LocateRequest =
  | { address: { line: string; area: string } }
  | { point: { lat: number; lng: number; source: PointSource; label?: string } };

export type LocateResult =
  | { ok: true; precision: 'exact' | 'area'; quote: DeliveryQuote }
  | { ok: false; error: string };

/** A quote still good for an order (with a minute to spare for checkout). */
export const quoteIsFresh = (quote: DeliveryQuote | null, now = Date.now()): quote is DeliveryQuote =>
  quote != null && new Date(quote.expiresAt).getTime() - 60_000 > now;

/**
 * What to measure for a saved address. A quote made for the same place (a pin, the
 * phone's location, or this address looked up before) is measured again at its point,
 * so an expired quote keeps the exact place; otherwise the typed address and area go
 * to the lookup (the area alone when the address has none saved separately).
 */
const POINT_SOURCES: readonly PointSource[] = ['device', 'pin', 'search', 'address_exact', 'address_area'];

export function locateRequestFor(
  address: { line: string; area?: string },
  previous: DeliveryQuote | null,
): LocateRequest {
  if (previous) {
    const source = POINT_SOURCES.find(s => s === previous.locationSource);
    if (source) return { point: { lat: previous.lat, lng: previous.lng, source, label: previous.locationLabel } };
  }
  const area = address.area?.trim() || address.line.split(',').map(part => part.trim()).filter(Boolean).pop() || address.line.trim();
  return { address: { line: address.line.trim().slice(0, 200), area: area.slice(0, 100) } };
}

/**
 * The fee to show for a quote: free over the shop's free-delivery amount
 * (`delivery_free_over`, 0 = never), as web_order_fees() charges it on the server.
 */
export const deliveryFeeShown = (quote: DeliveryQuote, productsTotal: number, freeOver: number): number =>
  freeOver > 0 && productsTotal >= freeOver ? 0 : quote.deliveryFee;
