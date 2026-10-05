import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { TopBar, TopBarAction } from './top-bar';

const meta = {
  title: 'UI/TopBar',
  component: TopBar,
  args: { title: 'Order #XN-2481', subtitle: '20 Sep 2026 · Xana Plus Syokimau' },
} satisfies Meta<typeof TopBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const TitleOnly: Story = {};

export const WithBack: Story = {
  args: { onBack: fn() },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByLabelText('Go back'));
    await expect(args.onBack).toHaveBeenCalledOnce();
  },
};

const refresh = fn();
export const WithAction: Story = {
  args: { onBack: fn(), actions: <TopBarAction name="refresh" accessibilityLabel="Refresh" onPress={refresh} /> },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByLabelText('Refresh'));
    await expect(refresh).toHaveBeenCalled();
  },
};

export const Centered: Story = { args: { centered: true, subtitle: undefined, title: 'Checkout' } };
