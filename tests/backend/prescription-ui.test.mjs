// Offline interaction tests: actual screens, mocked authentication/API/native UI.
// These do not establish live auth, real storage privacy, or native camera behavior.
import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  session: {}, fulfilment: {}, list: {}, record: {}, router: {}, api: {},
}));
vi.mock('react-native', () => ({
  View: 'View', Pressable: 'Pressable', TextInput: 'TextInput', ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: value => value, hairlineWidth: 1 }, Alert: { alert: vi.fn() },
}));
vi.mock('expo-image', () => ({ Image: 'Image' }));
vi.mock('expo-router', () => ({
  useRouter: () => m.router, useLocalSearchParams: () => ({ id: m.record.id }),
  useFocusEffect: () => {},
}));
vi.mock('@/components/ui', () => {
  const component = name => props => React.createElement(name, props, props.children);
  return {
    ...Object.fromEntries(['Badge', 'Button', 'Card', 'Chip', 'Icon', 'Screen', 'SelectableOption', 'TopBar', 'Txt']
      .map(name => [name, component(name)])),
    BottomSheet: props => props.visible ? React.createElement('BottomSheet', props, props.children, props.footer) : null,
  };
});
vi.mock('@/store/session', () => ({ useSession: () => m.session }));
vi.mock('@/store/fulfilment', () => ({ useFulfilment: () => m.fulfilment }));
vi.mock('@/data/catalog', () => ({
  stores: [{ id: 'test', name: 'Test store' }],
  deliverySlots: [{ id: 'delivery', mode: 'delivery', label: 'Today', window: 'Test window' },
    { id: 'pickup', mode: 'pickup', label: 'Pickup', window: 'Test window' }],
}));
vi.mock('@/data/live-catalogue', () => ({
  LIVE_PHARMACY_CATEGORIES: ['general-medicines'], searchCatalogue: (...args) => m.api.searchCatalogue(...args),
}));
vi.mock('@/features/prescriptions/api', () => {
  // Keep the production error messages/status labels without importing the live client.
  return {
    STATUS_LABELS: { draft: 'Draft', submitted: 'Awaiting pharmacist', clarification: 'Your response needed',
      held: 'On hold with pharmacist', rejected: 'Needs a new prescription', quoted: 'Ready to confirm',
      ordered: 'Ordered', cancelled: 'Cancelled' },
    prescriptionError: e => e?.message === 'quote_changed'
      ? 'Price or availability has changed. Ask the pharmacist to refresh this quote.'
      : e?.message === 'quote_updated' ? 'The pharmacist updated this quote. Refresh and review the new medicine list before confirming.'
        : 'We could not load or save this request. Please retry. No successful change has been confirmed.',
    usePrescriptionList: () => m.list,
    ...Object.fromEntries(['createPrescription', 'pickPrescriptionPhotos', 'submitPrescription', 'uploadPrescriptionPhoto',
      'getPrescription', 'getPrescriptionEvents', 'orderPrescription', 'cancelPrescription',
      'respondToPrescription', 'removePrescriptionPhoto', 'prescriptionPhotoUrl', 'isPharmacyReviewer',
      'reviewPrescription', 'setPrescriptionReviewStatus'].map(name => [name, (...args) => m.api[name](...args)])),
  };
});
import Upload from '@/app/pharmacy/upload';
import Details from '@/app/pharmacy/prescription/[id]';
import Review from '@/app/pharmacy/review';
import List from '@/app/pharmacy/prescriptions';

let root;
const flush = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(1); }); };
const render = async Screen => {
  await act(async () => { root = create(React.createElement(Screen)); });
  await flush();
  await flush();
};
const nodes = type => root.root.findAllByType(type);
const button = label => nodes('Button').find(n => n.props.label === label);
const press = async node => {
  expect(node).toBeDefined();
  expect(node.props.disabled).not.toBe(true);
  await act(async () => { await node.props.onPress(); });
  await flush();
};
const input = async (label, value) => {
  const node = nodes('TextInput').find(n => n.props.accessibilityLabel === label);
  expect(node).toBeDefined();
  await act(async () => node.props.onChangeText(value));
};
const visibleText = () => {
  const read = n => n == null ? '' : typeof n !== 'object' ? String(n)
    : Array.isArray(n) ? n.map(read).join(' ')
      : [n.props?.title, n.props?.label, read(n.children)].filter(Boolean).join(' ');
  return read(root.toJSON()).replace(/\s+/g, ' ');
};
const photo = n => ({ uri: `file://synthetic-${n}.png`, mimeType: 'image/png', fileSize: 32, fileName: `Test ${n}` });
beforeEach(() => {
  vi.useFakeTimers();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  m.router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), canGoBack: () => false };
  m.session = { isAuthenticated: true };
  m.fulfilment = {
    address: { phone: 'Synthetic test contact', line: 'DO NOT FULFIL' }, mode: 'delivery', paymentMethod: 'cod',
    hasAddress: true, store: { name: 'Test store', address: 'Test address' }, storeId: 'test', slotId: 'delivery',
    slot: { mode: 'delivery', label: 'Test only' }, setMode: vi.fn(), setSlotId: vi.fn(),
    setStoreId: vi.fn(), setPaymentMethod: vi.fn(),
  };
  m.record = {
    id: '10000000-0000-4000-8000-000000000001', patient_name: 'Synthetic patient', status: 'quoted',
    files: [], quote_lines: [{ item_no: 'TEST-RX', name: 'Synthetic medicine', unit_price: 123.45, quantity: 2, instructions: 'Test only' }],
    review_note: 'Synthetic review', quoted_at: new Date().toISOString(),
    valid_until: new Date(Date.now() + 86400000).toISOString(), created_at: new Date().toISOString(),
  };
  m.list = { records: [m.record], loading: false, error: '', refresh: vi.fn() };
  m.api = Object.fromEntries(['createPrescription', 'pickPrescriptionPhotos', 'submitPrescription', 'uploadPrescriptionPhoto',
    'getPrescription', 'getPrescriptionEvents', 'orderPrescription', 'cancelPrescription', 'respondToPrescription',
    'removePrescriptionPhoto', 'prescriptionPhotoUrl', 'isPharmacyReviewer', 'reviewPrescription',
    'setPrescriptionReviewStatus', 'searchCatalogue'].map(name => [name, vi.fn().mockResolvedValue(undefined)]));
  m.api.createPrescription.mockResolvedValue(m.record.id);
  m.api.pickPrescriptionPhotos.mockResolvedValue([photo(1)]);
  m.api.getPrescription.mockImplementation(async () => ({ ...m.record }));
  m.api.getPrescriptionEvents.mockResolvedValue([]);
  m.api.prescriptionPhotoUrl.mockResolvedValue('https://example.invalid/private-test-only');
  m.api.isPharmacyReviewer.mockResolvedValue(true);
  m.api.searchCatalogue.mockResolvedValue([]);
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  vi.useRealTimers();
});

describe('upload interactions (offline mocks)', () => {
  it('selects camera/gallery, removes photos and filters unsupported/oversized images', async () => {
    await render(Upload);
    await press(button('Take photo'));
    expect(m.api.pickPrescriptionPhotos).toHaveBeenLastCalledWith(true);
    m.api.pickPrescriptionPhotos.mockResolvedValue([photo(2), { ...photo(3), mimeType: 'application/pdf' },
      { ...photo(4), fileSize: 11 * 1024 * 1024 }]);
    await press(button('Choose photos'));
    expect(m.api.pickPrescriptionPhotos).toHaveBeenLastCalledWith(false);
    expect(nodes('Image')).toHaveLength(2);
    expect(visibleText()).toContain('no larger than 10 MB');
    await press(nodes('Pressable').find(n => n.props.accessibilityLabel === 'Remove photo'));
    expect(nodes('Image')).toHaveLength(1);
  });
  it('keeps a partial draft and retries only the unsuccessful uploads', async () => {
    m.api.pickPrescriptionPhotos.mockResolvedValue([photo(1), photo(2)]);
    m.api.uploadPrescriptionPhoto.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('offline'));
    await render(Upload);
    await press(button('Choose photos'));
    await input('Your full name', 'Synthetic patient');
    await press(nodes('Pressable').find(n => n.props.accessibilityRole === 'checkbox'));
    await press(button('Submit for pharmacist review'));
    expect(m.api.submitPrescription).not.toHaveBeenCalled();
    expect(visibleText()).toContain('Draft saved for retry');
    expect(nodes('Image')).toHaveLength(1);
    await press(button('Retry submission'));
    expect(m.api.createPrescription).toHaveBeenCalledOnce();
    expect(m.api.uploadPrescriptionPhoto.mock.calls.map(c => c[1].uri))
      .toEqual([photo(1).uri, photo(2).uri, photo(2).uri]);
    expect(m.api.submitPrescription).toHaveBeenCalledWith(m.record.id);
    expect(m.router.replace).toHaveBeenCalledWith(`/pharmacy/prescription/${m.record.id}`);
  });
  it('requires sign-in and preserves queued details without creating a draft', async () => {
    m.session.isAuthenticated = false;
    await render(Upload);
    await press(button('Choose photos'));
    await input('Your full name', 'Synthetic patient');
    await press(nodes('Pressable').find(n => n.props.accessibilityRole === 'checkbox'));
    await press(button('Submit for pharmacist review'));
    expect(m.api.createPrescription).not.toHaveBeenCalled();
    expect(nodes('Image')).toHaveLength(1);
    expect(visibleText()).toContain('Sign in to securely submit');
  });
});

describe('customer detail interactions (offline mocks)', () => {
  it('displays the exact quote and guards against two immediate confirmation clicks', async () => {
    await render(Details);
    expect(visibleText()).toContain('123.45 each');
    expect(visibleText()).toContain('246.90');
    expect(visibleText()).toContain('test/simulated');
    await press(button('Confirm quoted order'));
    let resolve;
    m.api.orderPrescription.mockImplementation(() => new Promise(r => { resolve = r; }));
    const confirm = button('Confirm order').props.onPress;
    await act(async () => { confirm(); confirm(); });
    expect(m.api.orderPrescription).toHaveBeenCalledOnce();
    expect(m.api.orderPrescription).toHaveBeenCalledWith(m.record.id, {
      paymentMethod: 'cod', contact: 'Synthetic test contact', addressLine: 'DO NOT FULFIL',
      slotLabel: 'Test only', storeName: 'Test store', quoteVersion: m.record.quoted_at,
    });
    m.record.status = 'ordered'; m.record.order_no = 'XN-SYNTHETIC';
    await act(async () => resolve({ orderNo: m.record.order_no }));
    await flush();
    expect(button('Confirm quoted order')).toBeUndefined();
    await press(nodes('Pressable').find(n => n.props.accessibilityLabel === 'Open order XN-SYNTHETIC'));
    expect(m.router.push).toHaveBeenCalledWith('/orders/XN-SYNTHETIC');
  });
  it.each(['quote_changed', 'quote_updated'])('reports %s and does not claim a successful order', async code => {
    m.api.orderPrescription.mockRejectedValue(new Error(code));
    await render(Details);
    await press(button('Confirm quoted order'));
    await press(button('Confirm order'));
    expect(visibleText()).toContain(code === 'quote_changed' ? 'Price or availability has changed' : 'The pharmacist updated this quote');
    expect(visibleText()).not.toContain('View order');
  });
  it('disables expired quotes', async () => {
    m.record.valid_until = new Date(Date.now() - 1000).toISOString();
    await render(Details);
    expect(button('Confirm quoted order').props.disabled).toBe(true);
    expect(visibleText()).toContain('expired or missing its review timestamp');
  });
  it('sends clarification replies and returns to pharmacist review', async () => {
    m.record.status = 'clarification'; m.record.quote_lines = [];
    m.api.respondToPrescription.mockImplementation(async () => { m.record.status = 'submitted'; });
    await render(Details);
    expect(button('Send response').props.disabled).toBe(true);
    await input('Message for pharmacist', '  Synthetic clarification  ');
    await press(button('Send response'));
    expect(m.api.respondToPrescription).toHaveBeenCalledWith(m.record.id, 'Synthetic clarification');
    expect(visibleText()).toContain('Awaiting pharmacist');
    expect(button('Send response')).toBeUndefined();
  });
  it('does not cancel until confirmed and removes ordering after cancellation', async () => {
    m.api.cancelPrescription.mockImplementation(async () => { m.record.status = 'cancelled'; });
    await render(Details);
    await press(button('Cancel prescription'));
    expect(m.api.cancelPrescription).not.toHaveBeenCalled();
    await press(button('Keep request'));
    expect(m.api.cancelPrescription).not.toHaveBeenCalled();
    await press(button('Cancel prescription'));
    await press(nodes('BottomSheet')[0].findAllByType('Button').find(n => n.props.label === 'Cancel prescription'));
    expect(m.api.cancelPrescription).toHaveBeenCalledOnce();
    expect(button('Confirm quoted order')).toBeUndefined();
    expect(visibleText()).toContain('Cancelled');
  });
});

describe('authorised review and list interactions (offline mocks)', () => {
  it('denies ordinary customers without exposing the review editor', async () => {
    m.api.isPharmacyReviewer.mockResolvedValue(false);
    await render(Review);
    expect(visibleText()).toContain('Reviewer access required');
    expect(button('Send priced quote')).toBeUndefined();
    expect(visibleText()).not.toContain('Synthetic patient');
  });
  const choose = async () => press(nodes('Pressable').find(n => n.props.accessibilityLabel?.startsWith('Review request')));
  it.each([['Request clarification', 'clarification'], ['Place on hold', 'held']])('sends %s with a mandatory note', async (label, status) => {
    m.record.review_note = '';
    await render(Review); await choose();
    await press(button(label));
    expect(m.api.setPrescriptionReviewStatus).not.toHaveBeenCalled();
    await input('Reviewer note', '  Synthetic reason  ');
    await press(button(label));
    expect(m.api.setPrescriptionReviewStatus).toHaveBeenCalledWith(m.record.id, status, 'Synthetic reason');
    expect(m.list.refresh).toHaveBeenCalled();
  });
  it('requires a decline reason and submits it without placing an order', async () => {
    m.record.review_note = '';
    await render(Review); await choose();
    await press(button('Decline request'));
    expect(m.api.reviewPrescription).not.toHaveBeenCalled();
    await input('Reviewer note', 'Synthetic decline reason');
    await press(button('Decline request'));
    expect(m.api.reviewPrescription.mock.calls[0][4]).toBe(true);
    expect(m.api.orderPrescription).not.toHaveBeenCalled();
  });
  it('sends quantities/instructions, not client-supplied prices, for backend repricing', async () => {
    await render(Review); await choose();
    await input('Quote expiry date', new Date(Date.now() + 86400000).toISOString().slice(0, 10));
    await press(button('Send priced quote'));
    expect(m.api.reviewPrescription).toHaveBeenCalledWith(m.record.id,
      [{ itemNo: 'TEST-RX', quantity: 2, instructions: 'Test only' }], 'Synthetic review', expect.any(String), false);
    expect(m.api.orderPrescription).not.toHaveBeenCalled();
  });
  it('opens an existing prescription from the customer list', async () => {
    await render(List);
    const row = nodes('Pressable').find(n => n.findAllByType('Badge').length);
    await press(row);
    expect(m.router.push).toHaveBeenCalledWith(`/pharmacy/prescription/${m.record.id}`);
  });
});
