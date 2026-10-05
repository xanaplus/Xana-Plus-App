import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { Segmented, type SegmentedOption } from './segmented';
import { Txt } from './text';

type Mode = 'delivery' | 'pickup';
const OPTIONS: SegmentedOption<Mode>[] = [
  { value: 'delivery', label: 'Delivery', icon: 'delivery' },
  { value: 'pickup', label: 'Pickup', icon: 'pickup' },
];

function Demo({ scrollable }: { scrollable?: boolean }) {
  const [value, setValue] = useState<Mode>('delivery');
  return (
    <>
      <Segmented options={OPTIONS} value={value} onChange={setValue} scrollable={scrollable} />
      <Txt style={{ marginTop: 12 }}>{`Chosen: ${value}`}</Txt>
    </>
  );
}

const meta = { title: 'UI/Segmented', component: Demo } satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Switching: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('Pickup'));
    await expect(canvas.getByText('Chosen: pickup')).toBeVisible();
  },
};

export const Scrollable: Story = { args: { scrollable: true } };
