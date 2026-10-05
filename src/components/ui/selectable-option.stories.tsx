import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { SelectableOption } from './selectable-option';

const meta = {
  title: 'UI/SelectableOption',
  component: SelectableOption,
  args: {
    title: 'Replace with similar',
    description: 'Your shopper picks the closest brand or size of equal or greater value.',
    selected: false,
    onPress: fn(),
    indicator: 'radio',
  },
} satisfies Meta<typeof SelectableOption>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Unselected: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('radio'));
    await expect(args.onPress).toHaveBeenCalledOnce();
  },
};

export const Selected: Story = { args: { selected: true } };

export const CheckWithIcon: Story = {
  args: { indicator: 'check', icon: 'mpesa', title: 'M-Pesa', description: 'Instant M-Pesa Prompt', selected: true },
};

export const WithWarningNote: Story = { args: { note: 'Not available for pickup', noteTone: 'warning' } };

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ args, canvasElement }) => {
    const radio = within(canvasElement).getByRole('radio');
    await expect(radio).toHaveAttribute('aria-disabled', 'true');
    // The page blocks taps on it; force one anyway and check nothing happens.
    await userEvent.click(radio, { pointerEventsCheck: 0 });
    await expect(args.onPress).not.toHaveBeenCalled();
  },
};
