import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { Button } from './button';
import { EmptyState, LoadState, ProgressBar } from './feedback';

const meta = {
  title: 'UI/Feedback',
  component: EmptyState,
  args: { icon: 'cart', title: 'Your cart is empty', description: 'Add groceries, pharmacy items or cartons to get started.' },
} satisfies Meta<typeof EmptyState>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const EmptyWithAction: Story = { args: { children: <Button label="Start shopping" fullWidth={false} /> } };

export const Loading: Story = { render: () => <LoadState status="loading" placeholder="list" /> };

const retry = fn();
export const LoadFailed: Story = {
  render: () => <LoadState status="error" noun="orders" onRetry={retry} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/load orders/)).toBeVisible();
    await userEvent.click(canvas.getByText('Try again'));
    await expect(retry).toHaveBeenCalledOnce();
  },
};

export const Progress: Story = { render: () => <ProgressBar value={0.6} height={8} /> };
