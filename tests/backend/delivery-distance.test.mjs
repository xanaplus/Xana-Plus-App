import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { cleanKraPin } from '../../src/lib/kra-pin.ts';
import { activeOffer, parseOffers } from '../../src/lib/branch-offers.ts';
import { lineTotal, quantityUnitPrice } from '../../src/lib/quantity-pricing.ts';
import { deliveryFeeShown, locateRequestFor } from '../../src/lib/delivery-quote.ts';

// Door delivery by distance in the app (21 Nov 2026): place-order charges the fee from
// the web-checkout quote's distance through web_order_fees(), never from the app.

const USER = 'synthetic-user';
const FUTURE = () => new Date(Date.now() + 20 * 60_000).toISOString();
const PAST = () => new Date(Date.now() - 60_000).toISOString();
const QUOTE_ID = '11111111-2222-4333-8444-555555555555';
const quoteRow = (extra = {}) => ({
  id: QUOTE_ID, user_id: USER, branch_code: 'SYOKIMAU', lat: -1.36, lng: 36.92, location_source: 'address_area',
  location_label: 'Syokimau', distance_m: 5400, distance_source: 'road', expires_at: FUTURE(), ...extra,
});
// The shared rule (owner, 17 Nov): KSh 200 up to 3 km, then KSh 100 a km, rounded; free over `freeOver`.
const feeFor = (distance, products, freeOver = 0) =>
  freeOver > 0 && products >= freeOver ? 0 : 200 + 100 * Math.max(0, Math.round(distance / 1000) - 3);

const compile = file => ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function checkout({ quotes = [quoteRow()], freeOver = 0, role = 'staff' } = {}) {
  let handler;
  const saved = { created: [], updates: [], feeCalls: [], quoteLookups: [] };
  const row = { item_no: 'BC-TEST', name: 'Synthetic', price: 500, stock: 100, requires_rx: false, age_restricted: false, price_tiers: [] };
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: USER } } }) },
    rpc: async (name, args) => {
      if (name === 'web_order_fees') {
        saved.feeCalls.push(args);
        return { data: { deliveryFee: feeFor(args.p_distance_m, args.p_products, freeOver) }, error: null };
      }
      if (name === 'create_order') {
        saved.created.push(args);
        const o = args.p_order;
        const products = o.lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
        return { data: { orderNo: 'WB-000001', status: 'awaiting-payment', itemsSubtotal: products, total: products + o.deliveryFee, amountDue: products + o.deliveryFee }, error: null };
      }
      throw Error('Unexpected rpc ' + name);
    },
    from(table) {
      if (table === 'catalogue') return { select: () => ({ in: async () => ({ data: [row], error: null }) }) };
      if (table === 'profiles') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { club_points: 0, role } }) }) }) };
      if (table === 'settings') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { value: false } }) }) }) };
      if (table === 'delivery_quotes') {
        const filters = {};
        const chain = {
          select: () => chain,
          eq: (column, value) => { filters[column] = value; return chain; },
          maybeSingle: async () => {
            saved.quoteLookups.push({ ...filters });
            return { data: quotes.find(q => q.id === filters.id && q.user_id === filters.user_id) ?? null, error: null };
          },
        };
        return chain;
      }
      if (table === 'orders') return { update: values => ({ eq: async (column, value) => { saved.updates.push({ values, [column]: value }); return { error: null }; } }), select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) };
      if (table === 'outbox') return { insert: async () => ({ error: null }) };
      throw Error('Unexpected table ' + table);
    },
  };
  const helpers = { adminClient: () => db, preflight: () => null, reply: (status, body) => Response.json(body, { status }) };
  const context = {
    exports: {}, Request, Response, Intl, Date, Math, Number, Map, Set, console: { log() {}, error() {} }, crypto: webcrypto,
    fetch: async () => new Response('ok'),
    Deno: { serve: fn => { handler = fn; }, env: { get: () => undefined } },
    require: path => path.includes('quantity-pricing') ? { lineTotal, quantityUnitPrice } : path.includes('kra-pin') ? { cleanKraPin } : path.includes('branch-offers') ? { activeOffer, parseOffers } : helpers,
  };
  vm.runInNewContext(compile('supabase/functions/place-order/index.ts'), context);
  return {
    saved,
    async run(extra = {}) {
      const response = await handler(new Request('https://test.invalid', {
        method: 'POST', headers: { Authorization: 'Bearer synthetic' },
        body: JSON.stringify({
          lines: [{ itemNo: 'BC-TEST', quantity: 2 }], paymentMethod: 'dpo', substitution: 'refund', contact: 'synthetic',
          addressLine: 'Door 14, Green Park, Syokimau', slotLabel: 'Today', storeName: 'Xana Plus Syokimau', branchCode: 'SYOKIMAU',
          pointsRedeemed: 0, fulfilment: 'delivery', deliveryQuoteId: QUOTE_ID, ...extra,
        }),
      }));
      return { status: response.status, body: await response.json() };
    },
  };
}

describe('place-order: delivery fee by distance', () => {
  it('charges the fee for the quote distance and saves the place on the order', async () => {
    const h = checkout();
    const result = await h.run();
    expect(result.status).toBe(200);
    // 5.4 km rounds to 5: KSh 200 + 2 × 100.
    expect(h.saved.feeCalls[0]).toMatchObject({ p_fulfilment: 'delivery', p_products: 1000, p_distance_m: 5400 });
    expect(h.saved.created[0].p_order).toMatchObject({ fulfilment: 'delivery', deliveryFee: 400, paymentMethod: 'dpo' });
    expect(result.body).toMatchObject({ deliveryFee: 400, total: 1400 });
    expect(h.saved.updates[0]).toMatchObject({
      order_no: 'WB-000001',
      values: { delivery_lat: -1.36, delivery_lng: 36.92, delivery_distance_m: 5400, delivery_quote_id: QUOTE_ID, delivery_location_source: 'address_area' },
    });
  });

  it('never takes a fee the app sends', async () => {
    const h = checkout();
    const result = await h.run({ deliveryFee: 0 });
    expect(h.saved.created[0].p_order.deliveryFee).toBe(400);
    expect(result.body.deliveryFee).toBe(400);
  });

  it('is free over the shop free-delivery amount (web_order_fees)', async () => {
    const h = checkout({ freeOver: 1000 });
    expect((await h.run()).body.deliveryFee).toBe(0);
  });

  it('only reads the customer own quote', async () => {
    const h = checkout({ quotes: [quoteRow({ user_id: 'someone-else' })] });
    expect(await h.run()).toMatchObject({ status: 400, body: { error: 'quote_missing' } });
    expect(h.saved.quoteLookups[0]).toMatchObject({ id: QUOTE_ID, user_id: USER });
    expect(h.saved.created).toHaveLength(0);
  });

  it('refuses a quote for another store, an expired one, a missing or malformed id', async () => {
    let h = checkout({ quotes: [quoteRow({ branch_code: 'RUIRU' })] });
    expect((await h.run()).body.error).toBe('quote_missing');
    h = checkout({ quotes: [quoteRow({ expires_at: PAST() })] });
    expect((await h.run()).body.error).toBe('quote_expired');
    h = checkout();
    expect((await h.run({ deliveryQuoteId: undefined })).body.error).toBe('quote_missing');
    expect((await h.run({ deliveryQuoteId: 'not-a-uuid' })).body.error).toBe('quote_missing');
    expect(h.saved.created).toHaveLength(0);
  });

  it('delivery is paid online only', async () => {
    const h = checkout();
    for (const paymentMethod of ['cod', 'counter']) expect((await h.run({ paymentMethod })).body.error).toBe('invalid_order');
    expect(h.saved.created).toHaveLength(0);
  });

  it('leaves pickup orders and older builds (no fulfilment sent) without a quote or a fee', async () => {
    const h = checkout();
    const pickup = await h.run({ fulfilment: 'pickup', deliveryQuoteId: undefined });
    expect(pickup.status).toBe(200);
    expect(h.saved.created[0].p_order).toMatchObject({ fulfilment: 'pickup', deliveryFee: 0 });
    expect(h.saved.quoteLookups).toHaveLength(0);
    expect(h.saved.updates).toHaveLength(0);
  });
});

describe('what the app measures and shows', () => {
  const quote = { id: QUOTE_ID, branchCode: 'SYOKIMAU', branchName: 'Syokimau', lat: -1.3, lng: 36.9, locationSource: 'pin', locationLabel: 'Pinned place', distanceKm: 4.2, deliveryFee: 300, expiresAt: FUTURE() };

  it('looks up a typed address with its area', () => {
    expect(locateRequestFor({ line: 'Door 14, Green Park, Syokimau', area: 'Syokimau' }, null))
      .toEqual({ address: { line: 'Door 14, Green Park, Syokimau', area: 'Syokimau' } });
  });

  it('takes the last part of the line as the area for addresses saved without one', () => {
    expect(locateRequestFor({ line: 'Block C, Kamakis' }, null)).toEqual({ address: { line: 'Block C, Kamakis', area: 'Kamakis' } });
  });

  it('measures a pin or a looked-up place again at the same point', () => {
    expect(locateRequestFor({ line: 'x', area: 'y' }, quote)).toEqual({ point: { lat: -1.3, lng: 36.9, source: 'pin', label: 'Pinned place' } });
    expect(locateRequestFor({ line: 'x', area: 'y' }, { ...quote, locationSource: 'address_area' }).point.source).toBe('address_area');
  });

  it('shows the fee, or free over the free-delivery amount', () => {
    expect(deliveryFeeShown(quote, 900, 0)).toBe(300);
    expect(deliveryFeeShown(quote, 900, 1000)).toBe(300);
    expect(deliveryFeeShown(quote, 1000, 1000)).toBe(0);
  });
});
