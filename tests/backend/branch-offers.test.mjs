import { describe, expect, it } from 'vitest';

import { activeOffer, offerEndsLabel, parseOffers } from '../../src/lib/branch-offers.ts';

describe('POS branch offers (18 Nov 2026)', () => {
  const product = { price: 590, offers: parseOffers({ syokimau: { price: 515, ends_on: '2026-11-20' }, RUIRU: { price: 600 } }) };

  it('reads offers per branch, upper-casing the code', () => {
    expect(product.offers).toEqual({ SYOKIMAU: { price: 515, endsOn: '2026-11-20' }, RUIRU: { price: 600, endsOn: null } });
    expect(parseOffers(null)).toBeUndefined();
    expect(parseOffers({ SYOKIMAU: { price: 'x' } })).toBeUndefined();
  });

  it('applies only at that branch, while running, and only below the BC price', () => {
    expect(activeOffer(product, 'syokimau', '2026-11-20')?.price).toBe(515);
    expect(activeOffer(product, 'SYOKIMAU', '2026-11-21')).toBeNull();
    expect(activeOffer(product, 'RUIRU', '2026-11-20')).toBeNull();
    expect(activeOffer({ price: 100 }, 'SYOKIMAU')).toBeNull();
  });

  it('says when an offer ends, and nothing when it has no end date', () => {
    expect(offerEndsLabel({ price: 1, endsOn: '2026-11-20' })).toBe('Ends 20 Nov');
    expect(offerEndsLabel({ price: 1, endsOn: null })).toBeNull();
  });
});
