import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';

import { QuantityStepper } from './quantity-stepper';

const meta = {
  title: 'UI/QuantityStepper',
  component: QuantityStepper,
  args: { quantity: 2, onIncrement: fn(), onDecrement: fn() },
} satisfies Meta<typeof QuantityStepper>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Regular: Story = {};
export const CompactBrand: Story = { args: { size: 'compact', tone: 'brand' } };
export const WithSuffix: Story = { args: { quantity: 6, suffix: 'cartons' } };

/** Wired to state the way the cart uses it. */
export const Counting: Story = {
  render: function Render(args) {
    const [quantity, setQuantity] = useState(1);
    return (
      <QuantityStepper
        {...args}
        quantity={quantity}
        onIncrement={() => setQuantity(q => q + 1)}
        onDecrement={() => setQuantity(q => Math.max(1, q - 1))}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByLabelText('Increase quantity'));
    await userEvent.click(canvas.getByLabelText('Increase quantity'));
    await expect(canvas.getByText('3')).toBeVisible();
    await userEvent.click(canvas.getByLabelText('Decrease quantity'));
    await expect(canvas.getByText('2')).toBeVisible();
  },
};
