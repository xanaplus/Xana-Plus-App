import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BottomSheet, Button, Txt } from '@/components/ui';
import { PASSWORD_MAX, PASSWORD_MIN, passwordProblem, signInErrorMessage, TextField } from '@/features/auth/auth-sheet';
import { useSession } from '@/store/session';
import { spacing } from '@/theme';
import { useThemeStyles } from '@/theme/provider';

/**
 * Sets the account's first password, or changes it after checking the current
 * one, as on the website's account page. With it the customer signs in with
 * their email or phone number and no code.
 */
export function PasswordSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  if (!visible) return null;
  // Mounted per open so the fields start empty.
  return <PasswordForm onClose={onClose} />;
}

function PasswordForm({ onClose }: { onClose: () => void }) {
  const styles = useThemeStyles(createStyles);
  const { hasPassword, savePassword } = useSession();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (busy) return;
    if (hasPassword && !current) return setError('Enter your current password.');
    const problem = passwordProblem(next);
    if (problem) return setError(problem);
    setBusy(true);
    const result = await savePassword(next, hasPassword ? current : undefined);
    setBusy(false);
    if (!result.ok) return setError(signInErrorMessage(result.error));
    onClose();
  };

  return (
    <BottomSheet
      visible
      onClose={onClose}
      title={hasPassword ? 'Change your password' : 'Set a password'}
      description={hasPassword ? 'Change the password you sign in with.' : 'Sign in with your email or phone number and this password, without waiting for a code.'}
      footer={
        <View style={styles.footer}>
          <Button label={hasPassword ? 'Change password' : 'Set password'} icon="lock" iconPosition="leading" loading={busy} onPress={save} />
          <Button label="Cancel" variant="outline" onPress={onClose} />
        </View>
      }
    >
      <View style={styles.form}>
        {hasPassword ? (
          <TextField
            label="Current password"
            icon="lock"
            secure
            value={current}
            onChangeText={setCurrent}
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            maxLength={PASSWORD_MAX}
          />
        ) : null}
        <TextField
          label={hasPassword ? 'New password' : 'Password'}
          icon="lock"
          secure
          hint={`At least ${PASSWORD_MIN} characters.`}
          value={next}
          onChangeText={setNext}
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="done"
          onSubmitEditing={() => void save()}
          maxLength={PASSWORD_MAX}
        />
        {error ? (
          <Txt variant="bodySm" color="error" accessibilityLiveRegion="polite">
            {error}
          </Txt>
        ) : null}
        {hasPassword ? (
          <Txt variant="caption" color="onSurfaceVariant">
            Forgot it? Sign out, then get a code by SMS or email to sign in, and set a new one here.
          </Txt>
        ) : null}
      </View>
    </BottomSheet>
  );
}

const createStyles = () => StyleSheet.create({
  form: { gap: spacing.lg },
  footer: { gap: spacing.sm },
});
