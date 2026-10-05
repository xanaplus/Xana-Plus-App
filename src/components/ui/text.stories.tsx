import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { View } from 'react-native';

import { type as typography } from '@/theme/typography';

import { Txt } from './text';

const meta = { title: 'UI/Text', component: Txt, args: { children: 'Fresh Hass avocados, 3 pieces' } } satisfies Meta<typeof Txt>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Body: Story = {};

/** Every type style in the app, top to bottom. */
export const AllVariants: Story = {
  render: () => (
    <View style={{ gap: 8 }}>
      {(Object.keys(typography) as (keyof typeof typography)[]).map(variant => (
        <Txt key={variant} variant={variant}>{`${variant}: KES 1,250 · Xana Plus Syokimau`}</Txt>
      ))}
    </View>
  ),
};

export const Colours: Story = {
  render: () => (
    <View style={{ gap: 8 }}>
      <Txt color="primary">primary</Txt>
      <Txt color="onSurfaceVariant">onSurfaceVariant</Txt>
      <Txt color="error">error</Txt>
      <Txt color="secondary">secondary</Txt>
    </View>
  ),
};
