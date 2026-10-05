/** Money and quantity formatting shared across screens. */

/** "KES 1,650" — whole-shilling display used on cards and summaries. */
export const formatKes = (value: number): string => `KES ${Math.round(value).toLocaleString('en-KE')}`;

/** "KES 120.00" — the two-decimal form used on search results and receipts. */
export const formatKesDecimal = (value: number): string =>
  `KES ${value.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "3 items · 8 units" — cart masthead summary. */
export const formatCartCounts = (itemCount: number, unitCount: number): string =>
  `${itemCount} ${itemCount === 1 ? 'item' : 'items'} · ${unitCount} ${unitCount === 1 ? 'unit' : 'units'}`;

/** Percentage saved between a struck-through price and the current price. */
export const discountPercent = (price: number, wasPrice: number): number => Math.round(((wasPrice - price) / wasPrice) * 100);
