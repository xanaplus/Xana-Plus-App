import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { homeCategoryTiles } from '@/data/catalog';

import { CategoryTile } from './category-tile';

const tile = homeCategoryTiles[0];

const meta = {
  title: 'UI/CategoryTile',
  component: CategoryTile,
  args: { name: tile.name, image: tile.image, onPress: fn() },
} satisfies Meta<typeof CategoryTile>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByText(tile.name));
    await expect(args.onPress).toHaveBeenCalledOnce();
  },
};

export const Selected: Story = { args: { selected: true } };
