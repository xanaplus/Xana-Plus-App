import type { OrderSummary } from '@/data/types';

type SavingsOrder = { status: string; summary: Pick<OrderSummary, 'wholesaleSavings' | 'promoDiscount'> };
const cents = (value: number | undefined) => Number.isFinite(value) ? Math.max(0, Math.round(value! * 100)) : 0;

/** Actual recorded discounts, never current basket prices or assumed delivery fees. */
export function recordedSavings(orders: readonly SavingsOrder[]) {
  let wholesale = 0;
  let promo = 0;
  for (const order of orders) {
    if (order.status === 'cancelled') continue;
    wholesale += cents(order.summary.wholesaleSavings);
    promo += cents(order.summary.promoDiscount);
  }
  return { wholesaleSavings: wholesale / 100, promoSavings: promo / 100, totalSaved: (wholesale + promo) / 100 };
}
