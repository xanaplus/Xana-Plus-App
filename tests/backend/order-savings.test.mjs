import { describe, expect, it } from 'vitest';
import { recordedSavings } from '../../src/lib/order-savings.ts';

const order = (wholesaleSavings, promoDiscount=0, status='delivered') => ({status,summary:{wholesaleSavings,promoDiscount}});
describe('recorded customer savings',()=>{
  it('sums actual wholesale and promo discounts across orders, not the basket',()=>{
    expect(recordedSavings([order(30,5),order(60,10,'received')])).toEqual({wholesaleSavings:90,promoSavings:15,totalSaved:105});
  });
  it('excludes cancelled orders and supports an empty history',()=>{
    expect(recordedSavings([order(30,5,'cancelled')]).totalSaved).toBe(0);
    expect(recordedSavings([]).totalSaved).toBe(0);
  });
  it('does not invent missing legacy wholesale savings or free-delivery savings',()=>{
    expect(recordedSavings([order(undefined,5)])).toEqual({wholesaleSavings:0,promoSavings:5,totalSaved:5});
  });
  it('keeps cents stable and rejects negative/non-finite savings',()=>{
    expect(recordedSavings([order(0.1,0.2),order(-3,NaN)]).totalSaved).toBe(0.3);
  });
});
