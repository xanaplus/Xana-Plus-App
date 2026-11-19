import { useSyncExternalStore } from 'react';

import { activeOffer, pricingBranch, subscribePricingBranch, type BranchOffer, type BranchOffers } from '@/lib/branch-offers';

/** The store prices follow, as React state (re-renders when the customer changes store). */
export const usePricingBranch = () => useSyncExternalStore(subscribePricingBranch, pricingBranch, pricingBranch);

/** The running offer for a product at the customer's chosen store. */
export function useOffer(product: { price: number; offers?: BranchOffers }): BranchOffer | null {
  const at = usePricingBranch();
  return activeOffer(product, at);
}
