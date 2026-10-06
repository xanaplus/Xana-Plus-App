import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: {}, orders: {}, fulfilment: {} }));
vi.mock('react-native', () => ({
  View: 'View', Pressable: 'Pressable', Switch: 'Switch',
  StyleSheet: { create: value => value },
  Linking: { openURL: vi.fn() },
}));
vi.mock('react-native-reanimated', () => ({
  default: { View: 'AnimatedView' },
  FadeInDown: { duration: () => ({ delay: () => ({}) }) },
}));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), canGoBack: () => false }) }));
vi.mock('@/components/ui', () => {
  const component = name => props => React.createElement(name, props, props.children);
  return {
    ...Object.fromEntries(['Badge', 'Button', 'Card', 'Chip', 'Divider', 'EmptyState', 'Icon',
      'ProgressBar', 'Screen', 'SectionHeader', 'Segmented', 'SelectableOption', 'TopBar', 'TopBarAction', 'Txt']
      .map(name => [name, component(name)])),
    BottomSheet: props => props.visible ? React.createElement('BottomSheet', props, props.children, props.footer) : null,
  };
});
vi.mock('@/features/account/name-sheet', () => ({ NameSheet: () => null }));
vi.mock('@/data/live-catalogue', () => ({
  groupsForCategory: () => [], liveProductById: () => undefined, liveProductsByCategory: () => [],
}));
vi.mock('@/store/session', () => ({ useSession: () => mocks.session }));
vi.mock('@/store/orders', () => ({
  useOrders: () => mocks.orders,
  ORDER_STAGES: [{ status: 'received', label: 'Received' }],
}));
vi.mock('@/store/cart', () => ({
  useCart: () => ({ add: vi.fn(), summary: { wholesaleSavings: 0 } }), unitPrice: product => product.price,
}));
vi.mock('@/store/fulfilment', () => ({ useFulfilment: () => mocks.fulfilment }));

import ProfileRoute from '@/app/(tabs)/profile';
import OrderHistoryScreen from '@/app/orders/index';

let root;
const render = async Screen => { await act(async () => { root = create(React.createElement(Screen)); }); };
const update = async Screen => { await act(async () => root.update(React.createElement(Screen))); };
const text = () => {
  const read = node => {
    if (node == null) return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(read).join(' ');
    return [node.props?.title, node.props?.label, read(node.children)].filter(Boolean).join(' ');
  };
  return read(root.toJSON());
};
const button = label => root.root.findAllByType('Button').find(node => node.props.label === label);
const openSheet = async label => {
  const row = root.root.findAllByType('Pressable').find(node => node.props.accessibilityLabel === label);
  await act(async () => row.props.onPress());
};
const failedSettings = 'Your settings have not been saved. Check your connection and retry.';
const failedHistory = 'Could not sync your order history. Check your connection and retry.';

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  mocks.session = {
    user: { id: 'A', name: 'Test', phone: '+254700000001', clubTier: 'Bronze', clubPoints: 0 },
    isAuthenticated: true, preferences: {}, preferencesSaving: false, preferencesError: null,
    updatePreferences: vi.fn(), retryPreferences: vi.fn(), signOut: vi.fn(), deleteAccount: vi.fn(),
    isDemo: false, isStaff: false,
  };
  mocks.orders = { orders: [], historyLoading: false, historyError: null, retryHistory: vi.fn() };
  mocks.fulfilment = {
    address: { line: 'Test address' }, addresses: [], hasAddress: false, mode: 'delivery',
    slot: { mode: 'delivery', label: 'Today', window: 'Test slot' },
    store: { id: 'test', name: 'Test store', address: 'Test street', phone: '0700000001' },
    storeId: 'test', paymentMethod: 'cod', mpesaNumber: '0700000001',
  };
});
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

describe('settings screen sync feedback', () => {
  it.each(['Notifications', 'Terms & Privacy'])('keeps failed settings visible in %s and after closing the sheet, with working retry and recovery', async sheet => {
    await render(ProfileRoute);
    await openSheet(sheet);
    const toggle = root.root.findAllByType('Switch')[0];
    await act(async () => toggle.props.onValueChange(false));
    expect(mocks.session.updatePreferences).toHaveBeenCalled();
    mocks.session = { ...mocks.session, preferencesSaving: true };
    await update(ProfileRoute);
    expect(text()).toContain('Saving your settings…');
    mocks.session = { ...mocks.session, preferencesSaving: false, preferencesError: failedSettings };
    await update(ProfileRoute);
    expect(text()).toContain(failedSettings);
    const visibleSheet = root.root.findByType('BottomSheet');
    expect(visibleSheet.findAllByType('Txt').some(node => node.props.children === failedSettings)).toBe(true);
    expect(visibleSheet.findAllByType('Button').some(node => node.props.label === 'Retry')).toBe(true);
    await act(async () => visibleSheet.props.onClose());
    expect(root.root.findAllByType('BottomSheet')).toHaveLength(0);
    expect(text()).toContain(failedSettings);
    await act(async () => button('Retry').props.onPress());
    expect(mocks.session.retryPreferences).toHaveBeenCalledOnce();
    mocks.session = { ...mocks.session, preferencesError: null, preferencesSaving: true };
    await update(ProfileRoute);
    expect(text()).not.toContain(failedSettings);
    expect(text()).toContain('Saving your settings…');
    mocks.session = { ...mocks.session, preferencesSaving: false };
    await update(ProfileRoute);
    expect(button('Retry')).toBeUndefined();
    expect(text()).not.toContain('Saving your settings…');
  });

  it('removes the previous account warning when the session switches', async () => {
    mocks.session.preferencesError = failedSettings;
    await render(ProfileRoute);
    mocks.session = { ...mocks.session, user: { ...mocks.session.user, id: 'B' }, preferencesError: null };
    await update(ProfileRoute);
    expect(text()).not.toContain(failedSettings);
  });
});

describe('order history screen sync feedback', () => {
  it('does not mistake loading or offline history for an empty history and recovers through Retry', async () => {
    mocks.orders.historyLoading = true;
    await render(OrderHistoryScreen);
    expect(text()).toContain('Loading your order history…');
    expect(text()).not.toContain('No orders here');
    mocks.orders = { ...mocks.orders, historyLoading: false, historyError: failedHistory };
    await update(OrderHistoryScreen);
    expect(text()).toContain(failedHistory);
    expect(text()).not.toContain('No orders here');
    await act(async () => button('Retry').props.onPress());
    expect(mocks.orders.retryHistory).toHaveBeenCalledOnce();
    mocks.orders = { ...mocks.orders, historyError: null, historyLoading: true };
    await update(OrderHistoryScreen);
    expect(button('Retry')).toBeUndefined();
    mocks.orders = { ...mocks.orders, historyLoading: false };
    await update(OrderHistoryScreen);
    expect(text()).toContain('No orders here');
    expect(text()).not.toContain(failedHistory);
  });

  it('keeps cached orders visible with an outdated-data warning on failure and during recovery', async () => {
    mocks.orders.orders = [{
      id: 'cached', placed: '06 Oct 2026', status: 'received', lines: [],
      summary: { total: 120, unitCount: 0 }, storeName: 'Test', slotLabel: 'Today',
    }];
    mocks.orders.historyError = failedHistory;
    await render(OrderHistoryScreen);
    expect(text()).toContain('cached');
    expect(text()).toContain('Saved orders are shown and may be out of date.');
    mocks.orders = { ...mocks.orders, historyError: null, historyLoading: true };
    await update(OrderHistoryScreen);
    expect(text()).toContain('cached');
    expect(text()).toContain('Updating your order history.');
  });

  it('does not keep the previous account error after switching to recovered history', async () => {
    mocks.orders.historyError = failedHistory;
    await render(OrderHistoryScreen);
    mocks.orders = { ...mocks.orders, historyError: null, orders: [] };
    await update(OrderHistoryScreen);
    expect(text()).not.toContain(failedHistory);
    expect(button('Retry')).toBeUndefined();
  });
});
