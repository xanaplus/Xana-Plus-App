import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { Stack, useSegments, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CartToast } from '@/components/nav/cart-toast';
import { Button, Txt } from '@/components/ui';
import { EmailPrompt } from '@/features/account/email-sheet';
import { NamePrompt } from '@/features/account/name-sheet';
import { CartProvider } from '@/store/cart';
import { FulfilmentProvider } from '@/store/fulfilment';
import { OrdersProvider } from '@/store/orders';
import { SessionProvider, useSession } from '@/store/session';
import { reportError, setScreen, setTrackingEnabled, startTracking, track } from '@/lib/analytics';
import { usePushNotifications } from '@/lib/notifications';
import { loadSnapshot } from '@/lib/storage';
import { spacing } from '@/theme';
import { ThemeProvider, useTheme } from '@/theme/provider';

SplashScreen.preventAutoHideAsync();
startTracking();

/** Screen views and the funnel steps that are whole screens, for Staff tools → Insights. */
function TrackingBridge() {
  const { preferences } = useSession();
  const segments = useSegments();
  const route = segments.join('/').replace(/\/index$/, '') || 'index';

  useEffect(() => {
    setTrackingEnabled(preferences.privacy?.usageAnalytics !== false);
  }, [preferences.privacy?.usageAnalytics]);

  useEffect(() => {
    track('app_open');
  }, []);

  useEffect(() => {
    setScreen(route);
    track('screen', { route });
    if (route.startsWith('product/')) track('product_view');
    if (route === 'checkout') track('checkout_view');
  }, [route]);

  return null;
}

/** Registers this device for push notifications once a customer is signed in. */
function PushBridge() {
  const { user } = useSession();
  usePushNotifications(user?.id ?? null);
  return null;
}

/** A screen crashed: report it and offer a way back instead of a blank page. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { colors: palette } = useTheme();
  useEffect(() => {
    reportError(error, true);
  }, [error]);

  return (
    <View style={[styles.crash, { backgroundColor: palette.background }]}>
      <Txt variant="headlineLg" align="center">
        Something went wrong
      </Txt>
      <Txt variant="bodySm" color="onSurfaceVariant" align="center">
        {"We've been told about it. Your cart and orders are safe."}
      </Txt>
      <Button label="Try again" onPress={() => void retry()} />
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    let live = true;
    loadSnapshot().then(() => {
      if (live) setStorageReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if ((fontsLoaded || fontError) && storageReady) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError, storageReady]);

  if (!storageReady || (!fontsLoaded && !fontError)) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <SessionProvider>
          <FulfilmentProvider>
            <CartProvider>
              <OrdersProvider>
                <AppFrame />
              </OrdersProvider>
            </CartProvider>
          </FulfilmentProvider>
        </SessionProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function AppFrame() {
  const { resolved, colors: palette } = useTheme();
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.style.colorScheme = resolved;
      document.documentElement.style.backgroundColor = palette.background;
      document.body.style.backgroundColor = palette.background;
    }
  }, [resolved, palette.background]);
  return (
    <>
      <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.background },
          animation: 'ios_from_right',
        }}
      >
        <Stack.Screen name="index" options={{ animation: 'fade' }} />
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="login" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="checkout/mpesa" options={{ gestureEnabled: false }} />
      </Stack>
      <CartToast />
      <NamePrompt />
      <EmailPrompt />
      <TrackingBridge />
      <PushBridge />
    </>
  );
}

const styles = StyleSheet.create({
  crash: { flex: 1, justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
});
