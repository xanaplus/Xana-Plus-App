import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { View } from 'react-native';
import { expect, fn, userEvent, within } from 'storybook/test';

import { Chip, type ChipTone } from './chip';

const TONES: ChipTone[] = ['neutral', 'brand', 'mint', 'amber', 'outline'];

const meta = { title: 'UI/Chip', component: Chip, args: { label: '1,000 pts (KES 100)', onPress: fn() } } satisfies Meta<typeof Chip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Tappable: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /1,000 pts/ }));
    await expect(args.onPress).toHaveBeenCalledOnce();
  },
};

export const Selected: Story = { args: { selected: true, icon: 'thumbs-up-filled', label: 'Good' } };

/** Without onPress it is a label, not a button. */
export const ReadOnly: Story = {
  args: { onPress: undefined, label: 'Express 30 min', icon: 'delivery', tone: 'mint' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('button')).toBeNull();
  },
};

export const AllTones: Story = {
  render: () => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {TONES.map(tone => (
        <Chip key={tone} label={tone} tone={tone} />
      ))}
    </View>
  ),
};
