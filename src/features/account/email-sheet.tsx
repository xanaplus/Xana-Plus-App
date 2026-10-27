import { useSegments } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BottomSheet, Button } from '@/components/ui';
import { ChangeNumberLink, EmailSignInForm, OTP_LENGTH, OtpCodeField, signInErrorMessage } from '@/features/auth/auth-sheet';
import { useFulfilment } from '@/store/fulfilment';
import { useSession } from '@/store/session';
import { spacing } from '@/theme';
import { useThemeStyles } from '@/theme/provider';

/**
 * Links an email to the signed-in account: the address, then the code the
 * `email-code` function sends to it. Once confirmed, the customer can sign in
 * by email. Shown once after a phone sign-in (`EmailPrompt`) and from Profile.
 */
export function EmailSheet({
  visible,
  onClose,
  title,
  description,
  dismissLabel = 'Cancel',
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  description: string;
  dismissLabel?: string;
}) {
  if (!visible) return null;
  // Mounted per open so every visit starts on the address step.
  return <EmailForm onClose={onClose} title={title} description={description} dismissLabel={dismissLabel} />;
}

function EmailForm({ onClose, title, description, dismissLabel }: { onClose: () => void; title: string; description: string; dismissLabel: string }) {
  const styles = useThemeStyles(createStyles);
  const { email: current, requestEmailConfirm, confirmEmail } = useSession();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState(current ?? '');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const sendCode = async () => {
    if (busy) return;
    setBusy(true);
    const result = await requestEmailConfirm(email);
    setBusy(false);
    if (!result.ok) {
      setError(signInErrorMessage(result.error));
      return;
    }
    setSentTo(result.email);
    setCode('');
    setError('');
    setStep('code');
  };

  const resend = async () => {
    if (busy) return;
    setBusy(true);
    setCode('');
    const result = await requestEmailConfirm(sentTo);
    setBusy(false);
    setError(result.ok ? '' : signInErrorMessage(result.error));
  };

  const confirm = async (entered = code) => {
    if (busy || entered.length < OTP_LENGTH) return;
    setBusy(true);
    const result = await confirmEmail(sentTo, entered);
    setBusy(false);
    if (result.ok) {
      onClose();
      return;
    }
    setError(signInErrorMessage(result.error));
    setCode('');
  };

  const changeCode = (next: string) => {
    setCode(next);
    if (next.length === OTP_LENGTH) void confirm(next);
  };

  const enteringEmail = step === 'email';

  return (
    <BottomSheet
      visible
      onClose={onClose}
      title={enteringEmail ? title : 'Check your email'}
      description={enteringEmail ? description : `Enter the 6-digit code sent to ${sentTo}`}
      footer={
        <View style={styles.footer}>
          {enteringEmail ? (
            <Button label="Send code" loading={busy} disabled={email.length === 0} onPress={sendCode} />
          ) : (
            <Button label="Confirm email" icon="shield" iconPosition="leading" loading={busy} disabled={code.length < OTP_LENGTH} onPress={() => void confirm()} />
          )}
          <Button label={dismissLabel} variant="outline" onPress={onClose} />
        </View>
      }
    >
      {enteringEmail ? (
        <EmailSignInForm value={email} onChange={setEmail} onSubmit={() => void sendCode()} error={error} helper="We'll email you a 6-digit code to confirm it's yours." />
      ) : (
        <View style={styles.codeStep}>
          <ChangeNumberLink
            label="Change email"
            onPress={() => {
              setStep('email');
              setCode('');
              setError('');
            }}
          />
          <OtpCodeField code={code} onChangeCode={changeCode} onResend={resend} onSubmit={() => void confirm()} error={error} autoFocus busy={busy} />
        </View>
      )}
    </BottomSheet>
  );
}

/**
 * Right after a phone sign-in on an account with no email, offers once to add
 * one, so next time the customer can sign in by email. Waits for the tabs and a
 * chosen store, like the name prompt (which goes first).
 */
export function EmailPrompt() {
  const { offerEmail, dismissEmailOffer } = useSession();
  const { storeChosen } = useFulfilment();
  const onTabs = useSegments()[0] === '(tabs)';
  return (
    <EmailSheet
      visible={offerEmail && onTabs && storeChosen}
      onClose={dismissEmailOffer}
      title="Add your email"
      description="Next time, sign in with a code sent to your email."
      dismissLabel="Skip for now"
    />
  );
}

const createStyles = () => StyleSheet.create({
  footer: { gap: spacing.sm },
  codeStep: { gap: spacing.md },
});
