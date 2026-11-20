import { supabase } from '@/lib/supabase';

/**
 * Where a door delivery goes, measured by the shared `web-checkout` function
 * (action 'locate'), the same one the website uses (William's note, 17 Nov 2026:
 * website repo docs/upstream/roy-notes/2026-11-17-delivery-by-distance.md). The
 * function finds the place, measures the road distance from the branch and saves a
 * quote for 30 minutes. Fee rule (owner, 17 Nov): KSh 200 for the first 3 km, then
 * KSh 100 per further km, distance rounded. The app never works the fee out itself.
 */

export type PointSource = 'device' | 'pin' | 'search';

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

export async function locateDelivery(where: LocateRequest, branchCode?: string): Promise<LocateResult> {
  const body = { action: 'locate', ...where, ...(branchCode ? { branchCode: branchCode.toUpperCase() } : {}) };
  const { data, error } = await supabase.functions.invoke<
    { located: true; precision: 'exact' | 'area'; quote: DeliveryQuote } | { located: false; reason: string }
  >('web-checkout', { body });
  if (!error && data) {
    if (data.located) return { ok: true, precision: data.precision, quote: data.quote };
    return { ok: false, error: data.reason };
  }
  const context = (error as { context?: Response } | null)?.context;
  const reply = context ? await context.json().catch(() => null) : null;
  return { ok: false, error: reply?.error ?? (context ? 'server_error' : 'network') };
}

/** Plain words for a locate failure. */
export function locateMessage(code: string): string {
  switch (code) {
    case 'signed_out':
      return 'Log in to see the delivery fee for your place.';
    case 'not_found':
      return "We couldn't find that place. Try a nearby landmark, or move the map to your gate.";
    case 'search_unavailable':
      return "We can't look up addresses right now. Move the map to your gate instead.";
    case 'invalid_address':
      return 'Type the area, for example "Syokimau" or "Kamakis".';
    case 'outside_kenya':
      return 'That place is outside Kenya. Move the map to your gate.';
    case 'delivery_off':
      return 'Door delivery is not open yet. You can collect from the store.';
    case 'too_many_quotes':
      return 'Too many tries for now. Wait a minute, then try again.';
    case 'network':
      return 'No connection. Check your internet and try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

/** A quote still good for an order (with a minute to spare for checkout). */
export const quoteIsFresh = (quote: DeliveryQuote | null, now = Date.now()): quote is DeliveryQuote =>
  quote != null && new Date(quote.expiresAt).getTime() - 60_000 > now;
