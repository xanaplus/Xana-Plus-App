import { describe, expect, it } from 'vitest';

import { cleanKraPin, kraPinMalformed } from '../../src/lib/kra-pin.ts';

describe('KRA PIN', () => {
  it('accepts one letter, nine digits, one letter, trimmed and upper-cased', () => {
    expect(cleanKraPin('P051234567X')).toBe('P051234567X');
    expect(cleanKraPin('  p051234567x ')).toBe('P051234567X');
  });

  it('treats blank, malformed and non-text input as no PIN', () => {
    for (const input of ['', '   ', 'P05123456X', 'P0512345678X', '1051234567X', 'P051234567', 'P05 1234567X', null, undefined, 42]) {
      expect(cleanKraPin(input)).toBeNull();
    }
  });

  it('flags typed text that is not a PIN, but not a blank field', () => {
    expect(kraPinMalformed('')).toBe(false);
    expect(kraPinMalformed('P051234567X')).toBe(false);
    expect(kraPinMalformed('P0512')).toBe(true);
  });
});
