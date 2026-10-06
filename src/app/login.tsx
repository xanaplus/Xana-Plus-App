import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Screen, TopBar, Txt } from '@/components/ui';
import {
  ChangeNumberLink,
  EMPTY_PHONE_INPUT,
  OTP_LENGTH,
  OtpCodeField,
  OtpSecurityNote,
  PHONE_INVALID_MESSAGE,
  PhoneSignInForm,
  formatPhoneDisplay,
  isValidPhone,
  phoneFromInput,
  signInErrorMessage,
  type PhoneInput,
} from '@/features/auth/auth-sheet';
import { useSession } from '@/store/session';
import { layout, spacing } from '@/theme';

/**
 * Screen 11 — Login (OTP verification): the phone step from the sign-in sheet
 * followed by the designed six-cell verification step, as a routed screen.
 */
export default function LoginRoute() {
  const router = useRouter();
  const { requestOtp, verify } = useSession();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState<PhoneInput>(EMPTY_PHONE_INPUT);
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const enteringPhone = step === 'phone';

  const leaveVerification = () => {
    setStep('phone');
    setCode('');
    setError('');
  };

  const goBack = () => {
    if (!enteringPhone) {
      leaveVerification();
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const sendCode = async () => {
    if (busy) return;
    if (!isValidPhone(phone)) {
      setError(PHONE_INVALID_MESSAGE);
      return;
    }
    setBusy(true);
    const result = await requestOtp(phoneFromInput(phone));
    setBusy(false);
    if (!result.ok) {
      setError(signInErrorMessage(result.error));
      return;
    }
    setSentTo(formatPhoneDisplay(result.phone));
    setCode('');
    setError('');
    setStep('otp');
  };

  // The iPhone number pad has no Enter key, so a complete code verifies by itself.
  const changeCode = (next: string) => {
    setCode(next);
    if (next.length === OTP_LENGTH) void confirmCode(next);
  };

  const resendCode = async () => {
    if (busy) return;
    setBusy(true);
    setCode('');
    const result = await requestOtp(phoneFromInput(phone));
    setBusy(false);
    setError(result.ok ? '' : signInErrorMessage(result.error));
  };

  const confirmCode = async (entered = code) => {
    if (busy || entered.length < OTP_LENGTH) return;
    setBusy(true);
    const result = await verify(entered);
    setBusy(false);
    if (result.ok) {
      router.replace('/(tabs)');
      return;
    }
    setError(signInErrorMessage(result.error));
    setCode('');
  };

  return (
    <Screen
      padded={false}
      contentStyle={styles.content}
      footer={
        enteringPhone ? (
          <Button label="Send code" size="lg" loading={busy} onPress={sendCode} />
        ) : (
          <View style={styles.footer}>
            <Button
              label="Verify & Continue"
              icon="shield"
              iconPosition="leading"
              size="lg"
              disabled={code.length < OTP_LENGTH}
              loading={busy}
              onPress={() => void confirmCode()}
            />
            <OtpSecurityNote />
          </View>
        )
      }
    >
      <TopBar title={enteringPhone ? 'Log in' : 'Verify your number'} onBack={goBack} />

      {enteringPhone ? (
        <View style={[styles.inset, styles.section]}>
          <Txt variant="bodySm" color="onSurfaceVariant">
            Enter your phone number to receive a one-time verification code. No password needed.
          </Txt>
          <PhoneSignInForm value={phone} onChange={setPhone} onSubmit={() => void sendCode()} error={error} />
        </View>
      ) : (
        <View style={[styles.inset, styles.section]}>
          <Txt variant="bodySm" color="onSurfaceVariant">
            {`Enter the 6-digit code sent to ${sentTo}`}
          </Txt>
          <ChangeNumberLink onPress={leaveVerification} />
          <OtpCodeField
            code={code}
            onChangeCode={changeCode}
            onResend={resendCode}
            onSubmit={() => void confirmCode()}
            error={error}
            autoFocus
            busy={busy}
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  inset: { marginHorizontal: layout.screenMargin },
  section: { gap: spacing.md },
  footer: { gap: spacing.lg },
});
