/** BC prices in the product's base selling unit, already inclusive of VAT. */
export type PriceTier = {
  minQty: number;
  unitPrice: number;
  startsOn?: string | null;
  endsOn?: string | null;
  uom?: string;
};

export const pricingDate = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

export function activePriceTiers(tiers: readonly PriceTier[] = [], date = pricingDate()): PriceTier[] {
  return tiers.filter(tier =>
    Number.isFinite(tier.minQty) && tier.minQty > 1 &&
    Number.isFinite(tier.unitPrice) && tier.unitPrice > 0 &&
    (!tier.startsOn || tier.startsOn <= date) && (!tier.endsOn || tier.endsOn >= date),
  ).sort((a, b) => a.minQty - b.minQty || a.unitPrice - b.unitPrice);
}

/** BC best eligible price; thresholds count units of this item only. */
export function quantityUnitPrice(basePrice: number, quantity: number, tiers: readonly PriceTier[] = [], date = pricingDate()): number {
  const eligible = activePriceTiers(tiers, date).filter(tier => quantity >= tier.minQty);
  return Math.round(Math.min(basePrice, ...eligible.map(tier => tier.unitPrice)) * 100) / 100;
}
