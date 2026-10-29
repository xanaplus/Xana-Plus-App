import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, Screen, TopBar } from '@/components/ui';
import { SignInBody, useSignInFlow } from '@/features/auth/auth-sheet';
import { layout, spacing } from '@/theme';

/**
 * Screen 11 — Login: the same screens as the website's account page (sign in
 * with a password, create an account, get a code), as a routed screen.
 */
export default function LoginRoute() {
  const router = useRouter();
  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };
  const flow = useSignInFlow(() => router.replace('/(tabs)'));
  const codeStep = flow.view === 'verify' || flow.view === 'confirmEmail';

  return (
    <Screen
      padded={false}
      contentStyle={styles.content}
      footer={
        <Button
          label={flow.primary.label}
          icon={codeStep ? 'shield' : undefined}
          iconPosition="leading"
          size="lg"
          disabled={flow.primary.disabled}
          loading={flow.busy}
          onPress={() => void flow.primary.onPress()}
        />
      }
    >
      <TopBar title={flow.title ?? 'Log in'} onBack={() => flow.back() || leave()} />

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
