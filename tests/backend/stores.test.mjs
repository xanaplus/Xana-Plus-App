import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  snapshot: { session: null, orders: null },
  save: vi.fn(),
  tables: {},
  calls: [],
  session: null,
  authListener: null,
  invoke: vi.fn(),
  callFunction: vi.fn(),
}));

vi.mock('@/lib/storage', () => ({
  persisted: () => mocks.snapshot,
  save: mocks.save,
  STORAGE_KEYS: { session: 'session', orders: 'orders' },
  parsePersisted: (raw, guard) => {
    try { const value = JSON.parse(raw); return guard(value) ? value : null; } catch { return null; }
  },
}));
vi.mock('@/lib/notifications', () => ({ unregisterPush: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('@/lib/haptics', () => ({ successFeedback: vi.fn() }));
vi.mock('@/data/catalog', () => ({ productById: () => ({ price: 100 }) }));
vi.mock('@/data/live-catalogue', () => ({ fetchProducts: async () => [] }));
vi.mock('@/store/cart', () => ({ unitPrice: product => product.price }));
vi.mock('@/lib/supabase', () => ({
  callFunction: mocks.callFunction,
  supabase: {
    from: table => {
      const call = { table, filters: [], action: 'select' };
      mocks.calls.push(call);
      const q = {
        select: () => q,
        update: payload => { call.action = 'update'; call.payload = payload; return q; },
        eq: (key, value) => { call.filters.push([key, value]); return q; },
        order: () => q,
        limit: () => q,
        maybeSingle: () => q,
        then: (resolve, reject) => Promise.resolve(mocks.tables[table] ?? { data: null, error: null }).then(resolve, reject),
      };
      return q;
    },
    functions: { invoke: mocks.invoke },
    auth: {
      getSession: async () => ({ data: { session: mocks.session } }),
      onAuthStateChange: cb => {
        mocks.authListener = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      setSession: async () => ({ data: { session: mocks.session }, error: null }),
      signOut: async () => { mocks.session = null; mocks.authListener?.('SIGNED_OUT'); return { error: null }; },
    },
    channel: () => { const c = { on: () => c, subscribe: () => c }; return c; },
    removeChannel: vi.fn(),
  },
}));

import { SessionContext, SessionProvider, useSession } from '@/store/session';
import { OrdersProvider, useOrders } from '@/store/orders';

const user = id => ({ id, name: 'Test customer', phone: '+254 700 000 001', clubTier: 'Bronze', clubPoints: 0 });
const order = id => ({
  id, placed: '06 Oct 2026', status: 'received', lines: [{ productId: 'item', quantity: 1 }],
  summary: { total: 120 }, paymentMethod: 'cod', contact: 'Test',
  addressLine: 'Test only', slotLabel: 'Test', storeName: 'Test', substitution: 'refund', pointsEarned: 1,
});
const input = {
  lines: [{ productId: 'item', quantity: 1 }], paymentMethod: 'cod', contact: 'Test',
  addressLine: 'Test only', slotLabel: 'Test', storeName: 'Test', substitution: 'refund',
  pointsRedeemed: 0, ageConfirmed: false, rxSupplied: false,
};
const reply = {
  data: { orderNo: 'XN-test', createdAt: '2026-10-06T10:00:00Z', itemsSubtotal: 100, promoDiscount: 0,
    deliveryFee: 0, platformFee: 20, total: 120, pointsEarned: 1 }, error: null,
};
const deferred = () => { let resolve, reject; const promise = new Promise((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; };
const profile = (id, preferences = {}) => ({
  data: { id, name: 'Test', phone: '+254700000001', club_tier: 'Bronze', club_points: 0, preferences }, error: null,
});
const savedOrder = id => ({
  order_no: id, created_at: '2026-10-06T10:00:00Z', status: 'received', order_items: [],
  items_subtotal: 100, delivery_fee: 0, platform_fee: 20, total: 120, points_earned: 1,
});
let root, session, orders;
function SessionProbe() { session = useSession(); return null; }
function OrdersProbe() { orders = useOrders(); return null; }
const ordersTree = account => React.createElement(SessionContext.Provider,
  { value: { user: account ? user(account) : null, isDemo: false, refreshProfile: async () => {} } },
  React.createElement(OrdersProvider, null, React.createElement(OrdersProbe)));

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  mocks.snapshot = { session: null, orders: null };
  mocks.tables = { orders: { data: [], error: null } };
  mocks.calls = [];
  mocks.session = null;
  mocks.authListener = null;
  mocks.save.mockClear();
  mocks.invoke.mockReset();
  mocks.callFunction.mockReset();
});
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

describe('customer order isolation and persistence', () => {
  it('never shows a legacy cache to a signed-out customer', async () => {
    mocks.snapshot.orders = JSON.stringify([order('other')]);
    await act(async () => { root = create(ordersTree(null)); });
    expect(orders.orders).toEqual([]);
  });
  it('never restores another account cache even when the backend is offline', async () => {
    mocks.snapshot.orders = JSON.stringify({ userId: 'A', orders: [order('private')] });
    mocks.tables.orders = { data: null, error: { message: 'offline' } };
    await act(async () => { root = create(ordersTree('B')); });
    expect(orders.orders).toEqual([]);
  });
  it('restores only the matching account and scopes staff-readable queries', async () => {
    mocks.snapshot.orders = JSON.stringify({ userId: 'A', orders: [order('mine')] });
    mocks.tables.orders = { data: null, error: { message: 'offline' } };
    await act(async () => { root = create(ordersTree('A')); });
    expect(orders.orders.map(o => o.id)).toEqual(['mine']);
    expect(mocks.calls.find(c => c.table === 'orders').filters).toContainEqual(['user_id', 'A']);
    expect(mocks.save).toHaveBeenCalledWith('orders', { userId: 'A', orders: [order('mine')] });
  });
  it('rejects signed-out placement without calling a function', async () => {
    await act(async () => { root = create(ordersTree(null)); });
    expect(await orders.placeOrder(input)).toEqual({ ok: false, error: 'signed_out' });
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it('does not show or save an old account response after switching accounts', async () => {
    const pending = deferred();
    mocks.invoke.mockReturnValue(pending.promise);
    await act(async () => { root = create(ordersTree('A')); });
    const placing = orders.placeOrder(input);
    await act(async () => root.update(ordersTree('B')));
    await act(async () => pending.resolve(reply));
    expect(await placing).toEqual({ ok: false, error: 'signed_out' });
    expect(orders.orders).toEqual([]);
  });
  it('saves server totals as a test order and keeps them on reload', async () => {
    mocks.invoke.mockResolvedValue(reply);
    await act(async () => { root = create(ordersTree('A')); });
    let result;
    await act(async () => { result = await orders.placeOrder(input); });
    expect(result).toEqual({ ok: true, id: 'XN-test' });
    expect(orders.orders[0]).toMatchObject({ isTest: true, summary: { total: 120 } });
    const cached = mocks.save.mock.calls.filter(([key]) => key === 'orders').at(-1)[1];
    await act(async () => root.unmount());
    mocks.snapshot.orders = JSON.stringify(cached);
    mocks.tables.orders = { data: null, error: { message: 'offline' } };
    await act(async () => { root = create(ordersTree('A')); });
    expect(orders.orders[0].id).toBe('XN-test');
  });
  it('preserves meaningful order rejection codes', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ error: 'unavailable', items: ['item'] })) } });
    await act(async () => { root = create(ordersTree('A')); });
    expect(await orders.placeOrder(input)).toMatchObject({ ok: false, error: 'unavailable', items: ['item'] });
  });
});

describe('session authority', () => {
  it('does not treat a cached profile as authenticated', async () => {
    mocks.snapshot.session = JSON.stringify({ user: user('A'), lastSeenAt: Date.now() });
    await act(async () => { root = create(React.createElement(SessionProvider, null, React.createElement(SessionProbe))); });
    expect(session.isAuthenticated).toBe(false);
  });
  it('restores a server-backed profile and saves a customer name', async () => {
    mocks.session = { user: { id: 'A' } };
    mocks.tables.profiles = { data: { id: 'A', name: 'Test', phone: '+254700000001', club_tier: 'Bronze', club_points: 0, preferences: { pushEnabled: false } }, error: null };
    await act(async () => { root = create(React.createElement(SessionProvider, null, React.createElement(SessionProbe))); });
    expect(session.isAuthenticated).toBe(true);
    expect(session.preferences).toEqual({ pushEnabled: false });
    await act(async () => expect(await session.updateName('  Test  customer ')).toBe(true));
    expect(session.user.name).toBe('Test customer');
    expect(mocks.calls.find(c => c.action === 'update')).toMatchObject({ filters: [['id', 'A']], payload: { name: 'Test customer' } });
  });
  it('does not restore a delayed profile after signing out', async () => {
    const pending = deferred();
    mocks.session = { user: { id: 'A' } };
    mocks.tables.profiles = pending.promise;
    await act(async () => { root = create(React.createElement(SessionProvider, null, React.createElement(SessionProbe))); });
    await act(async () => session.signOut());
    await act(async () => pending.resolve({ data: { id: 'A', phone: '+254700000001', name: 'Test', club_tier: 'Bronze', club_points: 0 }, error: null }));
    expect(session.isAuthenticated).toBe(false);
  });
  it('returns OTP rate-limit errors without changing the pending phone', async () => {
    mocks.callFunction.mockResolvedValue({ error: 'too_soon' });
    await act(async () => { root = create(React.createElement(SessionProvider, null, React.createElement(SessionProbe))); });
    expect(await session.requestOtp('0700000001')).toMatchObject({ ok: false, error: 'too_soon' });
    expect(session.pendingPhone).toBeNull();
    expect(await session.verify('000000')).toEqual({ ok: false, error: 'expired' });
  });
});

describe('preferences sync feedback', () => {
  const mount = async () => {
    mocks.session = { user: { id: 'A' } };
    mocks.tables.profiles = profile('A', { pushEnabled: true, privacy: { analytics: true } });
    await act(async () => { root = create(React.createElement(SessionProvider, null, React.createElement(SessionProbe))); });
  };

  it('marks optimistic settings unsaved on backend error and retries the merged choices', async () => {
    await mount();
    mocks.tables.profiles = { data: null, error: { message: 'offline' } };
    await act(async () => session.updatePreferences({ pushEnabled: false }));
    expect(session.preferences.pushEnabled).toBe(false);
    expect(session.preferencesSaving).toBe(false);
    expect(session.preferencesError).toContain('not been saved');
    mocks.tables.profiles = profile('A');
    await act(async () => session.retryPreferences());
    expect(session.preferencesError).toBeNull();
    expect(session.preferencesSaving).toBe(false);
    expect(mocks.calls.filter(c => c.action === 'update').at(-1)).toMatchObject({
      filters: [['id', 'A']], payload: { preferences: { pushEnabled: false, privacy: { analytics: true } } },
    });
  });

  it('handles rejected requests and zero-row updates as failed saves', async () => {
    await mount();
    const pending = deferred();
    mocks.tables.profiles = pending.promise;
    await act(async () => session.updatePreferences({ pushEnabled: false }));
    expect(session.preferencesSaving).toBe(true);
    await act(async () => pending.reject(new Error('network')));
    expect(session.preferencesError).not.toBeNull();
    mocks.tables.profiles = { data: null, error: null };
    await act(async () => session.retryPreferences());
    expect(session.preferencesError).not.toBeNull();
  });

  it('serializes rapid changes and saves the newest merged preferences', async () => {
    await mount();
    const pending = deferred();
    mocks.tables.profiles = pending.promise;
    await act(async () => session.updatePreferences({ pushEnabled: false }));
    await act(async () => session.updatePreferences({ privacy: { analytics: false } }));
    expect(mocks.calls.filter(c => c.action === 'update')).toHaveLength(1);
    mocks.tables.profiles = profile('A');
    await act(async () => pending.resolve(profile('A')));
    const writes = mocks.calls.filter(c => c.action === 'update');
    expect(writes).toHaveLength(2);
    expect(writes[1].payload.preferences).toMatchObject({ pushEnabled: false, privacy: { analytics: false } });
    expect(session.preferencesSaving).toBe(false);
    expect(session.preferencesError).toBeNull();
  });

  it('does not let a profile refresh hide pending unsaved changes', async () => {
    await mount();
    mocks.tables.profiles = { data: null, error: { message: 'offline' } };
    await act(async () => session.updatePreferences({ pushEnabled: false }));
    mocks.tables.profiles = profile('A', { pushEnabled: true });
    await act(async () => session.refreshProfile());
    expect(session.preferences.pushEnabled).toBe(false);
    expect(session.preferencesError).not.toBeNull();
  });

  it('does not let a delayed profile refresh overwrite choices saved after the refresh began', async () => {
    await mount();
    const pending = deferred();
    mocks.tables.profiles = pending.promise;
    let refreshing;
    await act(async () => { refreshing = session.refreshProfile(); });
    mocks.tables.profiles = profile('A');
    await act(async () => session.updatePreferences({ pushEnabled: false }));
    await act(async () => {
      pending.resolve(profile('A', { pushEnabled: true }));
      await refreshing;
    });
    expect(session.preferences.pushEnabled).toBe(false);
    expect(session.preferencesError).toBeNull();
  });

  it.each(['success', 'failure'])('ignores an old account save %s after sign-out and switching accounts', async outcome => {
    await mount();
    const pending = deferred();
    mocks.tables.profiles = pending.promise;
    await act(async () => session.updatePreferences({ pushEnabled: false }));
    await act(async () => session.signOut());
    mocks.session = { user: { id: 'B' } };
    mocks.tables.profiles = profile('B', { pushEnabled: true });
    mocks.callFunction.mockResolvedValueOnce({ data: { ok: true } }).mockResolvedValueOnce({ data: { access_token: 'fake', refresh_token: 'fake' } });
    await act(async () => session.requestOtp('0700000001'));
    await act(async () => expect((await session.verify('000000')).ok).toBe(true));
    await act(async () => pending.resolve(outcome === 'success' ? profile('A') : { data: null, error: { message: 'offline' } }));
    expect(session.user.id).toBe('B');
    expect(session.preferences).toEqual({ pushEnabled: true });
    expect(session.preferencesError).toBeNull();
    expect(session.preferencesSaving).toBe(false);
    const writes = mocks.calls.filter(c => c.action === 'update').length;
    await act(async () => session.retryPreferences());
    expect(mocks.calls.filter(c => c.action === 'update')).toHaveLength(writes);
  });
});

describe('order history sync feedback', () => {
  it('shows loading, offline error without cache, and successful retry', async () => {
    const pending = deferred();
    mocks.tables.orders = pending.promise;
    await act(async () => { root = create(ordersTree('A')); });
    expect(orders.historyLoading).toBe(true);
    await act(async () => pending.resolve({ data: null, error: { message: 'offline' } }));
    expect(orders.historyLoading).toBe(false);
    expect(orders.historyError).toContain('Could not sync');
    expect(orders.orders).toEqual([]);
    mocks.tables.orders = { data: [savedOrder('recovered')], error: null };
    await act(async () => orders.retryHistory());
    expect(orders.historyError).toBeNull();
    expect(orders.orders.map(o => o.id)).toEqual(['recovered']);
    expect(mocks.calls.filter(c => c.table === 'orders').every(c => c.filters.some(([key, value]) => key === 'user_id' && value === 'A'))).toBe(true);
  });

  it('keeps matching cached history visible on a rejected offline request', async () => {
    mocks.snapshot.orders = JSON.stringify({ userId: 'A', orders: [order('cached')] });
    const pending = deferred();
    mocks.tables.orders = pending.promise;
    await act(async () => { root = create(ordersTree('A')); });
    await act(async () => pending.reject(new Error('network')));
    expect(orders.orders.map(o => o.id)).toEqual(['cached']);
    expect(orders.historyLoading).toBe(false);
    expect(orders.historyError).not.toBeNull();
  });

  it.each(['success', 'failure'])('ignores old history %s and clears error state when switching accounts', async outcome => {
    const pending = deferred();
    mocks.tables.orders = pending.promise;
    await act(async () => { root = create(ordersTree('A')); });
    mocks.tables.orders = { data: [savedOrder('B-order')], error: null };
    await act(async () => root.update(ordersTree('B')));
    await act(async () => pending.resolve(outcome === 'success' ? { data: [savedOrder('A-order')], error: null } : { data: null, error: { message: 'offline' } }));
    expect(orders.orders.map(o => o.id)).toEqual(['B-order']);
    expect(orders.historyError).toBeNull();
    expect(orders.historyLoading).toBe(false);
    expect(mocks.save.mock.calls.filter(([key]) => key === 'orders').at(-1)[1].userId).toBe('B');
  });

  it('ignores an older retry response when a newer retry succeeds', async () => {
    mocks.tables.orders = { data: null, error: { message: 'offline' } };
    await act(async () => { root = create(ordersTree('A')); });
    const pending = deferred();
    mocks.tables.orders = pending.promise;
    await act(async () => orders.retryHistory());
    mocks.tables.orders = { data: [], error: null };
    await act(async () => orders.retryHistory());
    await act(async () => pending.resolve({ data: null, error: { message: 'offline' } }));
    expect(orders.historyError).toBeNull();
    expect(orders.historyLoading).toBe(false);
  });
});
