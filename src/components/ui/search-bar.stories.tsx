import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';

import { SearchBar } from './search-bar';

const meta = { title: 'UI/SearchBar', component: SearchBar } satisfies Meta<typeof SearchBar>;
export default meta;
type Story = StoryObj<typeof meta>;

/** On Home the bar is a button that opens the search screen. */
export const AsButton: Story = {
  args: { onPress: fn(), trailingIcon: 'scan', onTrailingPress: fn() },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByLabelText('Search groceries, meds & more'));
    await expect(args.onPress).toHaveBeenCalledOnce();
  },
};

/** On the search screen it takes typing and submits on Enter. */
export const Typing: Story = {
  args: { onSubmit: fn() },
  render: function Render(args) {
    const [value, setValue] = useState('');
    return <SearchBar {...args} value={value} onChangeText={setValue} />;
  },
  play: async ({ args, canvasElement }) => {
    const input = within(canvasElement).getByLabelText('Search groceries, meds & more');
    await userEvent.type(input, 'cooking oil{enter}');
    await expect(input).toHaveValue('cooking oil');
    await expect(args.onSubmit).toHaveBeenCalled();
  },
};
