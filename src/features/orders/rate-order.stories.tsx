import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { mockSupabase } from '../../../.storybook/mocks/supabase';

import { RateOrder } from './rate-order';

const meta = { title: 'Features/RateOrder', component: RateOrder, args: { orderNo: 'XN-2402', pickup: false } } satisfies Meta<typeof RateOrder>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Not rated yet: pick thumbs, add a note, send. The saved row is checked. */
export const RateAndSend: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const send = await canvas.findByText('Send rating');
    await userEvent.click(canvas.getAllByText('Good')[0]);
    await userEvent.click(canvas.getAllByText('Poor')[1]);
    await userEvent.type(canvas.getByLabelText('Comment about this order'), 'Bread was squashed');
    await userEvent.click(send);

    await expect(await canvas.findByText('Thanks for rating this order')).toBeVisible();
    await expect(canvas.getByText('Rider: good · Packing: poor')).toBeVisible();
    const insert = mockSupabase.calls.find(c => c.kind === 'insert' && c.target === 'order_ratings');
    await expect(insert?.payload).toEqual({ service: 'up', packing: 'down', missing_items: false, comment: 'Bread was squashed', order_no: 'XN-2402' });
  },
};

/** Nothing picked yet, so there is nothing to send. */
export const NothingChosen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText('Send rating'));
    await expect(mockSupabase.calls.some(c => c.kind === 'insert')).toBe(false);
  },
};

/** A pickup order asks about the counter, not a rider. */
export const Pickup: Story = {
  args: { pickup: true },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Counter service')).toBeVisible();
  },
};

/** Already rated on another visit: shows the thanks card straight away. */
export const AlreadyRated: Story = {
  beforeEach: () => {
    mockSupabase.table('order_ratings', {
      select: mockSupabase.ok([{ service: 'down', packing: 'up', missing_items: true, comment: null }]),
    });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Rider: poor · Packing: good · Something was missing')).toBeVisible();
    await expect(canvas.getByText(/will call you about the missing item/)).toBeVisible();
  },
};

/** The save fails: the form stays, with a message. */
export const SendFails: Story = {
  beforeEach: () => {
    mockSupabase.table('order_ratings', { insert: mockSupabase.fail('offline') });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText('Something was missing'));
    await userEvent.click(canvas.getByText('Send rating'));
    await expect(await canvas.findByText(/send. Check your connection/)).toBeVisible();
  },
};

/** Rated from another phone first (duplicate): treated as sent. */
export const AlreadySentElsewhere: Story = {
  beforeEach: () => {
    mockSupabase.table('order_ratings', { insert: mockSupabase.fail('duplicate', '23505') });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click((await canvas.findAllByText('Good'))[0]);
    await userEvent.click(canvas.getByText('Send rating'));
    await waitFor(() => expect(canvas.getByText('Thanks for rating this order')).toBeVisible());
  },
};

/** Signed out: the card does not show at all. */
export const SignedOut: Story = {
  parameters: { session: { user: null } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByText('How was your order?')).toBeNull();
  },
};
