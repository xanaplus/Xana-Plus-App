import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { Button } from './button';

const meta = {
  title: 'UI/Button',
  component: Button,
  args: { label: 'Place Order', onPress: fn() },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByText('Place Order'));
    await expect(args.onPress).toHaveBeenCalledOnce();
  },
};

export const Outline: Story = { args: { variant: 'outline', label: 'Request a return', icon: 'refresh', iconPosition: 'leading' } };
export const Ghost: Story = { args: { variant: 'ghost', label: 'Show finished', size: 'sm', fullWidth: false } };
export const Danger: Story = { args: { variant: 'danger', label: 'Tap again to cancel', size: 'sm' } };

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByText('Place Order'));
    await expect(args.onPress).not.toHaveBeenCalled();
  },
};

export const Loading: Story = { args: { loading: true } };
