import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { BottomSheet } from './bottom-sheet';
import { Button } from './button';
import { Txt } from './text';

const meta = {
  title: 'UI/BottomSheet',
  component: BottomSheet,
  args: {
    visible: true,
    onClose: fn(),
    title: 'M-Pesa number',
    description: 'The STK push prompt goes to this line.',
    children: <Txt>+254 712 345 678</Txt>,
  },
} satisfies Meta<typeof BottomSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {
  play: async ({ args }) => {
    // The sheet renders over the page, so look in the whole document.
    const page = within(document.body);
    await userEvent.click(await page.findByLabelText('Close'));
    await expect(args.onClose).toHaveBeenCalled();
  },
};

export const WithFooter: Story = { args: { footer: <Button label="Save number" /> } };

/** Opening and closing it the way a screen does. */
export const OpenAndClose: Story = {
  render: function Render(args) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button label="Change number" onPress={() => setOpen(true)} />
        <BottomSheet {...args} visible={open} onClose={() => setOpen(false)} />
      </>
    );
  },
  play: async ({ canvasElement }) => {
    const page = within(document.body);
    await userEvent.click(within(canvasElement).getByText('Change number'));
    await expect(await page.findByText('M-Pesa number')).toBeVisible();
    await userEvent.click(page.getByLabelText('Close'));
    await waitFor(() => expect(page.queryByText('M-Pesa number')).toBeNull());
  },
};
