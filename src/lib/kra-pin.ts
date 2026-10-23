/**
 * The buyer's KRA PIN, by the shared rule (website `orders-and-payments.md`,
 * "Buyer's KRA PIN", and `clean_kra_pin()` in the database): one letter, nine
 * digits, one letter. Trimmed and upper-cased; blank means no PIN. Shared by
 * the app and `place-order`.
 */
export const KRA_PIN_ERROR = 'A KRA PIN looks like P051234567X: one letter, nine digits, one letter. Leave it blank if you do not have one.';

/** The PIN as stored, or null when blank or malformed. */
export function cleanKraPin(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const pin = input.trim().toUpperCase();
  return /^[A-Z][0-9]{9}[A-Z]$/.test(pin) ? pin : null;
}

/** Typed something that isn't a PIN yet. Shown as a hint; it never stops an order. */
export const kraPinMalformed = (input: string) => input.trim() !== '' && cleanKraPin(input) === null;
