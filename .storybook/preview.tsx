import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import * as Font from 'expo-font';
import type { Decorator, Preview } from '@storybook/react-native-web-vite';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CartProvider } from '@/store/cart';
import { FulfilmentProvider } from '@/store/fulfilment';
import { colors, spacing } from '@/theme';

import { FakeSession, type FakeSessionOptions } from './fake-session';
import { mockSupabase } from './mocks/supabase';

/**
 * Every story runs inside the app's own providers with a fake signed-in
 * customer (override with `parameters.session`) and a fake database.
 */
const withApp: Decorator = (Story, context) => {
  const session = (context.parameters.session ?? {}) as FakeSessionOptions;
  return (
    <SafeAreaProvider>
      <FakeSession {...session}>
        <FulfilmentProvider>
          <CartProvider>
            <View style={{ padding: context.parameters.layout === 'fullscreen' ? 0 : spacing.lg, backgroundColor: colors.background, minHeight: '100%' }}>
              <Story />
            </View>
          </CartProvider>
        </FulfilmentProvider>
      </FakeSession>
    </SafeAreaProvider>
  );
};

const preview: Preview = {
  decorators: [withApp],
  // The app's Inter font, loaded before any story draws so tests see final text.
  loaders: [
    async () => {
      await Font.loadAsync({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold }).catch(() => {});
      return {};
    },
  ],
  // Each story starts from an empty fake database; stories add the answers they need.
  beforeEach: () => {
    mockSupabase.reset();
  },
  parameters: {
    layout: 'fullscreen',
    controls: { expanded: true },
  },
};

export default preview;
