import type { Meta, StoryObj } from '@storybook/react-native-web-vite';

import { Button } from './button';
import { Screen } from './screen';
import { Txt } from './text';
import { TopBar } from './top-bar';

const meta = {
  title: 'UI/Screen',
  component: Screen,
  args: {
    padded: true,
    children: (
      <>
        <TopBar title="My Orders" />
        {Array.from({ length: 12 }, (_, i) => (
          <Txt key={i}>{`Order XN-${2400 + i}`}</Txt>
        ))}
      </>
    ),
  },
} satisfies Meta<typeof Screen>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Scrolling: Story = {};
export const WithFooter: Story = { args: { footer: <Button label="Place Order · KES 1,480" size="lg" /> } };
