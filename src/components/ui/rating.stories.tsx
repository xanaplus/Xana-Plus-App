import type { Meta, StoryObj } from '@storybook/react-native-web-vite';

import { Rating } from './rating';

const meta = { title: 'UI/Rating', component: Rating, args: { value: 4.7, reviewLabel: '128 reviews' } } satisfies Meta<typeof Rating>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Low: Story = { args: { value: 2.3, reviewLabel: '4 reviews' } };
