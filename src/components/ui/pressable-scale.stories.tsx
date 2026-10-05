import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { PressableScale } from './pressable-scale';
import { Txt } from './text';

const meta = {
  title: 'UI/PressableScale',
  component: PressableScale,
  args: { onPress: fn(), accessibilityRole: 'button', children: <Txt>Press me</Txt> },
} satisfies Meta<typeof PressableScale>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByText('Press me'));
    await expect(args.onPress).toHaveBeenCalledOnce();
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByText('Press me'));
    await expect(args.onPress).not.toHaveBeenCalled();
  },
};
