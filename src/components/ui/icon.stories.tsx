import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { View } from 'react-native';

import { Icon, iconNames } from './icon';
import { Txt } from './text';

const meta = { title: 'UI/Icon', component: Icon, args: { name: 'cart', size: 24 } } satisfies Meta<typeof Icon>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Single: Story = {};

/** Every icon name the screens can use. */
export const Gallery: Story = {
  render: () => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {iconNames.map(name => (
        <View key={name} style={{ width: 96, alignItems: 'center', gap: 4 }}>
          <Icon name={name} size={22} />
          <Txt variant="caption" align="center">{name}</Txt>
        </View>
      ))}
    </View>
  ),
};
