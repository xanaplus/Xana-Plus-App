import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, userEvent, within } from 'storybook/test';

import { mockSupabase } from '../../../.storybook/mocks/supabase';

import { InsightsPanel } from './insights';

/** What staff_insights() returns for a busy week. */
const WEEK = {
  days: 7,
  funnel: [
    { step: 'app_open', devices: 420 },
    { step: 'product_view', devices: 310 },
    { step: 'add_to_cart', devices: 160 },
    { step: 'checkout_view', devices: 90 },
    { step: 'order_placed', devices: 38 },
  ],
  order_failures: { network: 7, unavailable: 3, rx_missing: 2 },
  errors: {
    count: 3,
    devices: 2,
    latest: [
      { created_at: '2026-09-26T08:12:00Z', message: "Cannot read properties of undefined (reading 'price')", screen: 'product/[id]', platform: 'android', fatal: true },
      { created_at: '2026-09-25T17:40:00Z', message: 'Network request failed', screen: 'checkout', platform: 'ios', fatal: false },
    ],
  },
  ratings: {
    count: 12,
    service_up: 9,
    service_down: 2,
    packing_up: 8,
    packing_down: 3,
    missing: 1,
    comments: [{ created_at: '2026-09-26T10:00:00Z', order_no: 'XN-7704', comment: 'Bread was squashed' }],
  },
  promos: [{ code: 'WELCOME10', uses: 14, discount: 2310 }],
};

const EMPTY = {
  days: 7,
  funnel: WEEK.funnel.map(s => ({ ...s, devices: 0 })),
  order_failures: {},
  errors: { count: 0, devices: 0, latest: [] },
  ratings: { count: 0, service_up: 0, service_down: 0, packing_up: 0, packing_down: 0, missing: 0, comments: [] },
  promos: [],
};

const meta = { title: 'Features/Staff Insights', component: InsightsPanel, parameters: { session: { isStaff: true } } } satisfies Meta<typeof InsightsPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const BusyWeek: Story = {
  beforeEach: () => {
    mockSupabase.rpc('staff_insights', args => mockSupabase.ok({ ...WEEK, days: Number(args.p_days) }));
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Placed an order')).toBeVisible();
    // 38 of 90 checkouts became orders.
    await expect(canvas.getByText('42%')).toBeVisible();
    await expect(canvas.getByText('No connection')).toBeVisible();
    await expect(canvas.getByText(/3 crashes on 2 phones/)).toBeVisible();
    await expect(canvas.getByText(/Bread was squashed/)).toBeVisible();
    await expect(canvas.getByText(/14 orders/)).toBeVisible();

    await userEvent.click(canvas.getByText('Last 30 days'));
    await expect(await canvas.findByText('Placed an order')).toBeVisible();
    const last = mockSupabase.calls.filter(c => c.target === 'staff_insights').at(-1);
    await expect(last?.payload).toEqual({ p_days: 30 });
  },
};

export const QuietWeek: Story = {
  beforeEach: () => {
    mockSupabase.rpc('staff_insights', mockSupabase.ok(EMPTY));
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('No crashes reported.')).toBeVisible();
    await expect(canvas.getByText('No ratings yet.')).toBeVisible();
    await expect(canvas.getByText('No codes used.')).toBeVisible();
  },
};

/** The database can't be reached: offer a retry, which loads it. */
export const LoadFails: Story = {
  beforeEach: () => {
    let attempts = 0;
    mockSupabase.rpc('staff_insights', () => (++attempts === 1 ? mockSupabase.fail('offline') : mockSupabase.ok(WEEK)));
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText('Try again'));
    await expect(await canvas.findByText('Placed an order')).toBeVisible();
  },
};
