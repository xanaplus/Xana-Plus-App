import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { View } from 'react-native';
import { expect, fn, userEvent, within } from 'storybook/test';

import { Card, Divider } from './card';
import { Txt } from './text';

const meta = {
  title: 'UI/Card',
  component: Card,
  args: { children: <Txt>Order XN-2481 · 3 items · KES 1,480</Txt> },
} satisfies Meta<typeof Card>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Elevated: Story = {};
export const Outline: Story = { args: { variant: 'outline' } };
export const Flat: Story = { args: { variant: 'flat' } };
export const Tinted: Story = { args: { variant: 'tinted' } };

export const Pressable: Story = {
  args: { onPress: fn() },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByText(/XN-2481/));
    await expect(args.onPress).toHaveBeenCalledOnce();
  },
};

export const WithDivider: Story = {
  args: {
    children: (
      <View style={{ gap: 12 }}>
        <Txt>Items subtotal</Txt>
        <Divider />
        <Txt variant="label">Total KES 1,500</Txt>
      </View>
    ),
  },
};
