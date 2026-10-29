import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Screen, TopBar } from '@/components/ui';
import { SignInActions, SignInBody, useSignInFlow } from '@/features/auth/auth-sheet';
import { layout, spacing } from '@/theme';

/**
 * Screen 11 — Login: phone number first, then its code or the sign-up form
 * (Carrefour's "Log in or sign up"), as a routed screen.
 */
export default function LoginRoute() {
  const router = useRouter();
  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };
  const flow = useSignInFlow(() => router.replace('/(tabs)'));

  return (
    <Screen
      padded={false}
      contentStyle={styles.content}
      // The phone and email screens carry their buttons under the field, so nothing is pinned below.
      footer={flow.view === 'phone' || flow.view === 'email' ? undefined : <SignInActions flow={flow} />}
    >
      <TopBar title={flow.title ?? 'Log in or sign up'} onBack={() => flow.back() || leave()} />

      <View style={[styles.inset, styles.section]}>
        <SignInBody flow={flow} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  inset: { marginHorizontal: layout.screenMargin },
  section: { gap: spacing.md },
});
