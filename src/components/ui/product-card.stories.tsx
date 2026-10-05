import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { View } from 'react-native';
import { expect, fn, userEvent, within } from 'storybook/test';

import { productById } from '@/data/catalog';
import type { Product } from '@/data/types';

import { ProductCard, ProductRow } from './product-card';
import { Txt } from './text';

const avocado = productById('hass-avocados-3pc') as Product;
const milk = productById('brookside-milk-500ml') as Product;
const ibuprofen = productById('ibuprofen-400mg-30s') as Product;

const meta = {
  title: 'UI/ProductCard',
  component: ProductCard,
  args: { product: avocado, width: 170, onPress: fn(), onAdd: fn() },
} satisfies Meta<typeof ProductCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByLabelText(`Add ${avocado.name} to cart`));
    await expect(args.onAdd).toHaveBeenCalledOnce();
    await expect(args.onPress).not.toHaveBeenCalled();
  },
};

/** Already in the cart: the add button becomes the count. */
export const InCart: Story = { args: { quantity: 2 } };

export const OutOfStock: Story = {
  args: { product: { ...milk, inStock: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Out of stock')).toBeVisible();
    await expect(canvas.queryByLabelText(`Add ${milk.name} to cart`)).toBeNull();
  },
};

export const Prescription: Story = { args: { product: ibuprofen } };

export const Row: Story = {
  render: args => (
    <View style={{ gap: 12 }}>
      <ProductRow product={avocado} eyebrow="Fresh" onAdd={args.onAdd} onPress={args.onPress} />
      <ProductRow product={milk} description="500ml pouch" quantity={3} />
      <ProductRow product={ibuprofen} trailing={<Txt variant="label">Qty 1</Txt>} />
    </View>
  ),
};
