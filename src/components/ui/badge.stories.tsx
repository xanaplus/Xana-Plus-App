import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { View } from 'react-native';

import { Badge, NoticePill, type BadgeTone } from './badge';

const TONES: BadgeTone[] = ['discount', 'fresh', 'new', 'info', 'warning', 'danger', 'neutral', 'brand'];

const meta = { title: 'UI/Badge', component: Badge, args: { label: 'OUT FOR DELIVERY', tone: 'info' } } satisfies Meta<typeof Badge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllTones: Story = {
  render: () => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {TONES.map(tone => (
        <Badge key={tone} label={tone.toUpperCase()} tone={tone} />
      ))}
    </View>
  ),
};

export const Notice: Story = {
  render: () => (
    <View style={{ gap: 8, alignItems: 'flex-start' }}>
      <NoticePill label="Rx Required · Not Uploaded" tone="warning" />
      <NoticePill label="Free delivery over KES 2,000" tone="info" />
    </View>
  ),
};
