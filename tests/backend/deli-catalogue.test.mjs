import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ rows: [], calls: [], snapshot: { products: null }, error: null }));
vi.mock('@/lib/storage', () => ({
  persisted: () => state.snapshot,
  parsePersisted: (raw, guard) => {
    if (!raw) return null;
    const value = JSON.parse(raw);
    return guard(value) ? value : null;
  },
  save: vi.fn(),
  STORAGE_KEYS: { products: 'products' },
}));
vi.mock('expo-image', () => ({ Image: { prefetch: vi.fn(() => Promise.resolve(true)) } }));
vi.mock('@/lib/supabase', () => ({
  supabase: { from: table => {
    state.calls.push(['from', table]);
    const request = {
      then: (resolve, reject) => Promise.resolve({ data: state.rows, error: state.error }).then(resolve, reject),
    };
    for (const method of ['select', 'in', 'gt', 'order', 'limit', 'or', 'not', 'ilike', 'eq']) {
      request[method] = (...args) => { state.calls.push([method, ...args]); return request; };
    }
    return request;
  } },
}));

const row = (id, group, overrides = {}) => ({
  item_no: id, name: 'Deli fixture 250g', category: group, price: '125.50', stock: '10',
  requires_rx: false, age_restricted: false, photo_url: null,
  price_tiers: [{ minQty: 3, unitPrice: 100 }], ...overrides,
});
let live;
beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  state.rows = []; state.calls = []; state.snapshot.products = null; state.error = null;
  live = await import('@/data/live-catalogue');
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('owner-approved DEL department', () => {
  it.each(['FOODSTUFFS', 'MEAT PRODUCTS', 'BREADS & BREAD SPREA', 'DAIRIES', 'GENERAL', 'CONTROLLED', null])(
    'puts DEL items under Deli independently of BC group %s', async group => {
      state.rows = [row('DEL0101', group)];
      const product = await live.fetchProduct('DEL0101');
      expect(product.category).toBe('deli-cold-cuts');
      expect(product).toMatchObject({ price: 125.5, inStock: true, rxRequired: false, ageRestricted: false });
      expect(product.priceTiers).toEqual(state.rows[0].price_tiers);
    },
  );
  it('preserves authoritative prescription and age flags, including on DEL items', async () => {
    state.rows = [row('DEL9999', 'CONTROLLED', { requires_rx: true, age_restricted: true, stock: 0 })];
    expect(await live.fetchProduct('DEL9999')).toMatchObject({
      category: 'deli-cold-cuts', rxRequired: true, ageRestricted: true, inStock: false,
    });
  });
  it('does not reclassify other codes or names merely containing DEL', async () => {
    state.rows = [row('FS0101', 'FOODSTUFFS'), row('AF0101', 'GENERAL'), row('XDEL0101', 'MEAT PRODUCTS')];
    const products = await live.fetchProducts(state.rows.map(value => value.item_no));
    expect(products.map(product => product.category)).toEqual(['staples', 'medicines', 'meat-poultry']);
  });
  it('reclassifies existing cached DEL products without losing price, tiers, flags or stock', () => {
    const cached = {
      id: 'del0101', name: 'Cached deli', category: 'bakery', price: 150, pack: '1pc', image: '',
      priceTiers: [{ minQty: 2, unitPrice: 120 }], rxRequired: true, ageRestricted: false, inStock: true,
    };
    state.snapshot.products = JSON.stringify([cached]);
    expect(live.liveProductById(cached.id)).toEqual({ ...cached, category: 'deli-cold-cuts' });
    expect(live.liveProductsByCategory('bakery')).toEqual([]);
    expect(live.liveProductsByCategory('deli-cold-cuts')).toHaveLength(1);
  });
  it('fetches all DEL groups from the public view rather than an empty BC group list', async () => {
    await live.fetchShelf({ groups: [], deli: 'only' });
    expect(state.calls).toContainEqual(['from', 'catalogue']);
    expect(state.calls).toContainEqual(['ilike', 'item_no', 'DEL%']);
    expect(state.calls).toContainEqual(['gt', 'stock', 0]);
    expect(state.calls.some(([method]) => method === 'in' || method === 'not')).toBe(false);
  });
  it('keeps DEL items out of unrelated BC aisles', async () => {
    await live.fetchShelf({ groups: ['BREADS & BREAD SPREA'] });
    expect(state.calls).toContainEqual(['not', 'item_no', 'ilike', 'DEL%']);
  });
  it('keeps the existing cold-cut and cheese cross-listings inside Deli', async () => {
    await live.fetchShelf({ groups: ['MEAT PRODUCTS'], deli: 'include', nameHas: ['sausage'] });
    expect(state.calls).toContainEqual(['in', 'category', ['MEAT PRODUCTS']]);
    expect(state.calls).toContainEqual(['or', 'name.ilike.*sausage*']);
    expect(state.calls.some(([method]) => method === 'not')).toBe(false);
  });
  it('finds DEL codes and Deli word searches without weakening other search terms', async () => {
    await live.searchCatalogue('deli rice');
    expect(state.calls.find(([method]) => method === 'or')[1]).toContain('item_no.ilike.DEL*');
    expect(state.calls.find(([method]) => method === 'or')[1]).toContain('or(name.ilike.*rice*,category.ilike.*rice*)');
    state.calls = [];
    await live.searchCatalogue('DEL0101');
    expect(state.calls.find(([method]) => method === 'or')[1]).toContain('item_no.ilike.del0101*');
  });
  it('surfaces backend errors instead of falling back to hidden or demo products', async () => {
    state.error = { message: 'offline' };
    await expect(live.fetchShelf({ groups: [], deli: 'only' })).rejects.toThrow('offline');
  });
  it('wires Home, department, See All and product reporting to Deli', async () => {
    const catalogue = await import('@/data/catalog');
    for (const term of ['Deli', 'Deli Kitchen', 'Deli & Cold Cuts', 'Deli Counter & Kitchen']) {
      expect(catalogue.shelfForTerm(term)).toMatchObject({ groups: [], deli: 'only' });
    }
    expect(catalogue.verticalForProduct({ category: 'deli-cold-cuts' })).toBe('deli');
    expect(catalogue.homeCategoryTiles.find(tile => tile.slug === 'deli-cold-cuts')).toMatchObject({ name: 'Deli', vertical: 'deli' });
    expect(catalogue.verticalBySlug('deli').subcategories.find(tile => tile.slug === 'deli-cold-cuts'))
      .toMatchObject({ name: 'Deli Kitchen' });
  });
});
