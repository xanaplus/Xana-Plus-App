/**
 * Past baskets. Priced from the live catalogue at render time so every total
 * on Profile, Order History and Spending agrees with the cart's own maths.
 *
 * Extracted from the Profile screen so the Spending screen can derive from the
 * same records rather than keeping a second copy.
 */

import type { ChipTone } from '@/components/ui';

export type OrderLine = { productId: string; quantity: number };

export type OrderRecord = {
  id: string;
  /** Display date, e.g. "20 Sep 2026". */
  placed: string;
  status: string;
  tone: ChipTone;
  lines: OrderLine[];
};

export const ORDER_HISTORY: OrderRecord[] = [
  {
    id: 'XN-2481',
    placed: '20 Sep 2026',
    status: 'Out for delivery',
    tone: 'amber',
    lines: [
      { productId: 'hass-avocados-3pc', quantity: 2 },
      { productId: 'sukuma-wiki', quantity: 1 },
      { productId: 'brookside-milk-500ml', quantity: 2 },
    ],
  },
  {
    id: 'XN-2402',
    placed: '12 Sep 2026',
    status: 'Delivered',
    tone: 'mint',
    lines: [
      { productId: 'panadol-extra-16s', quantity: 1 },
      { productId: 'vitamin-c-1000mg', quantity: 2 },
      { productId: 'harpic-detergent-1kg', quantity: 6 },
    ],
  },
  {
    id: 'XN-2318',
    placed: '28 Aug 2026',
    status: 'Delivered',
    tone: 'mint',
    lines: [
      { productId: 'basmati-rice-5kg', quantity: 1 },
      { productId: 'cooking-oil-2l', quantity: 2 },
      { productId: 'sugar-2kg', quantity: 1 },
    ],
  },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "20 Sep 2026" → Date. Returns the epoch if the string is malformed. */
export const parseOrderDate = (placed: string): Date => {
  const [day, month, year] = placed.split(' ');
  const monthIndex = MONTHS.indexOf(month);
  if (monthIndex < 0) return new Date(0);
  return new Date(Number(year), monthIndex, Number(day));
};

/** "Sep 2026" — the bucket label used by the spending trend. */
export const orderMonthLabel = (placed: string): string => {
  const [, month, year] = placed.split(' ');
  return `${month} ${year}`;
};
