import type { Meta, StoryObj } from '@storybook/react-native-web-vite';

import { Skeleton } from './skeleton';

const meta = { title: 'UI/Skeleton', component: Skeleton, args: { shape: 'grid' } } satisfies Meta<typeof Skeleton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Grid: Story = {};
export const Rail: Story = { args: { shape: 'rail' } };
export const List: Story = { args: { shape: 'list' } };
export const Detail: Story = { args: { shape: 'detail' } };
