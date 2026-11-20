import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: {}, orders: [], wellness: {}, saved: null }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(async () => mocks.saved), setItem: vi.fn(async () => undefined) },
}));
vi.mock('expo-router', () => ({ useFocusEffect: () => undefined }));
vi.mock('@/store/session', () => ({ useSession: () => mocks.session }));
vi.mock('@/store/orders', () => ({ useOrders: () => ({ orders: mocks.orders }) }));
vi.mock('@/features/wellness/store', () => ({ useWellness: () => mocks.wellness, todayKey: () => '2026-11-20' }));

import { useHomeGreeting } from '@/features/home/use-home-greeting';

let result;
function Probe() {
  result = useHomeGreeting({ offerCount: 12, shopName: 'Syokimau' });
  return null;
}
const render = async () => {
  await act(async () => { create(React.createElement(Probe)); });
  await act(async () => { await Promise.resolve(); });
};

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  mocks.session = { user: null, needsName: false };
  mocks.orders = [];
  mocks.wellness = { today: { water: 0 }, goal: 8, daysLogged: 0 };
  mocks.saved = null; // no first-day record yet, as on every phone on 20 Nov 2026
});

describe('Home greeting: who sees the brand line', () => {
  it('a brand-new, signed-out visitor sees the brand line on their first day', async () => {
    await render();
    expect(result.title).toBe('Good for you,\ngood for home.');
  });
  it('a signed-in customer gets the greeting even with no first-day record', async () => {
    mocks.session = { user: { name: 'Amina Odhiambo' }, needsName: false };
    await render();
    expect(result.title).toMatch(/^Habari ya \w+,\nAmina\.$|^Heri ya .+,\nAmina\.$/);
    expect(result.subtitle).toBe('12 offers at Syokimau today');
  });
  it('a signed-out visitor with check-ins on the phone gets the greeting', async () => {
    mocks.wellness = { today: { water: 2 }, goal: 8, daysLogged: 3 };
    await render();
    expect(result.title).not.toContain('Good for you');
  });
  it('a returning visitor (first day was earlier) gets the greeting', async () => {
    mocks.saved = '2026-11-01';
    await render();
    expect(result.title).not.toContain('Good for you');
  });
});
