import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, Screen, TopBar } from '@/components/ui';
import { OTP_LENGTH, SignInCodeStep, SignInEntry, useSignInFlow } from '@/features/auth/auth-sheet';
import { layout, spacing } from '@/theme';

/**
 * Screen 11 — Login (OTP verification): the email-or-phone step from the
 * sign-in sheet followed by the designed six-cell verification step, as a
 * routed screen.
 */
export default function LoginRoute() {
  const router = useRouter();
  const flow = useSignInFlow(() => router.replace('/(tabs)'));
  const entering = flow.step === 'enter';

  const goBack = () => {
    if (!entering) {
      flow.backToEntry();
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  return (
    <Screen
      padded={false}
      contentStyle={styles.content}
      footer={
        entering ? (
          <Button label="Send code" size="lg" loading={flow.busy} onPress={flow.sendCode} />
        ) : (
          <View style={styles.footer}>
            <Button
              label="Verify & Continue"
              icon="shield"
              iconPosition="leading"
              size="lg"
              disabled={flow.code.length < OTP_LENGTH}
              loading={flow.busy}
              onPress={() => void flow.confirmCode()}
            />
          </View>
        )
      }
    >
      <TopBar
        title={entering ? 'Log in' : flow.method === 'email' ? 'Check your email' : 'Verify your number'}
        onBack={goBack}
      />

      <View style={[styles.inset, styles.section]}>
        {entering ? <SignInEntry flow={flow} /> : <SignInCodeStep flow={flow} />}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  inset: { marginHorizontal: layout.screenMargin },
  section: { gap: spacing.md },
  footer: { gap: spacing.lg },
});
