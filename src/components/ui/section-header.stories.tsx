import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { SectionHeader } from './section-header';

const meta = { title: 'UI/SectionHeader', component: SectionHeader, args: { title: 'Top Categories' } } satisfies Meta<typeof SectionHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

export const TitleOnly: Story = {};

export const WithAction: Story = {
  args: { actionLabel: 'See All', onAction: fn(), icon: 'flame' },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByText('See All'));
    await expect(args.onAction).toHaveBeenCalledOnce();
  },
};
