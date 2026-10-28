/** Money and quantity formatting shared across screens. */

/** "KES 1,650" — whole-shilling display used on cards and summaries. */
/**
 * How the app writes a price: "KES 1,000" when whole, "KES 1,000.10" / "KES 67.50" when it
 * has cents (as Jumia and Naivas do). Never rounded, so a shelf, the cart and the bill agree.
 */
export const formatKes = (value: number): string => {
  const cents = Math.round(value * 100);
  const whole = cents % 100 === 0;
  return `KES ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 })}`;
};

/** "KES 1,000.00": receipt form, kept for the order bill where every line shows cents. */
export const formatKesDecimal = (value: number): string =>
  `KES ${value.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "3 items · 8 units" — cart masthead summary. */
export const formatCartCounts = (itemCount: number, unitCount: number): string =>
  `${itemCount} ${itemCount === 1 ? 'item' : 'items'} · ${unitCount} ${unitCount === 1 ? 'unit' : 'units'}`;

/** Percentage saved between a struck-through price and the current price. */
export const discountPercent = (price: number, wasPrice: number): number => Math.round(((wasPrice - price) / wasPrice) * 100);

/**
 * Card name without a trailing size that the card already shows underneath:
 * "XanaLife Brown Bread - 400 G" with pack "400 G" → "XanaLife Brown Bread".
 * Spacing and case are ignored; a size in the middle of the name is left alone.
 */
export const nameWithoutPack = (name: string, pack?: string): string => {
  const size = pack?.replace(/\s+/g, '');
  if (!size) return name;
  const pattern = size.split('').map(ch => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
  const trimmed = name.replace(new RegExp(`[\\s,(-]*${pattern}\\)?\\s*$`, 'i'), '').trim();
  return trimmed || name;
};
