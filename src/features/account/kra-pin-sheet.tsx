import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { BottomSheet, Button, Txt } from '@/components/ui';
import { KRA_PIN_ERROR, kraPinMalformed } from '@/lib/kra-pin';
import { useSession } from '@/store/session';
import { radius, spacing } from '@/theme';
import { useTheme, useThemeStyles } from '@/theme/provider';
import type { Palette } from '@/theme';

/**
 * The buyer's KRA PIN on the account, as on the website's account page. It goes
 * on the KRA receipt of the customer's orders and fills in at checkout.
 */
export function KraPinSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  if (!visible) return null;
  // Mounted per open so the field starts from the saved PIN each time.
  return <KraPinForm onClose={onClose} />;
}

function KraPinForm({ onClose }: { onClose: () => void }) {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const { kraPin, saveKraPin } = useSession();
  const [pin, setPin] = useState(kraPin ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const malformed = kraPinMalformed(pin);
  // Hold the format message until a whole PIN's worth is typed.
  const showFormat = malformed && pin.trim().length >= 11;

  const save = async () => {
    if (busy || malformed) return;
    setBusy(true);
    setError(null);
    const result = await saveKraPin(pin);
    setBusy(false);
    if (result === 'saved') onClose();
    else setError(result === 'invalid' ? KRA_PIN_ERROR : 'Couldn’t save your KRA PIN. Check your connection and try again.');
  };

  return (
    <BottomSheet
      visible
      onClose={onClose}
      title="KRA PIN"
      description="Optional. It goes on the KRA receipt of your orders, and fills in at checkout."
      footer={
        <View style={styles.footer}>
          <Button label={busy ? 'Saving…' : 'Save KRA PIN'} disabled={busy || malformed} onPress={save} />
          <Button label="Cancel" variant="outline" onPress={onClose} />
        </View>
      }
    >
      <View style={styles.field}>
        <Txt variant="label" color="onSurfaceVariant">
          KRA PIN
        </Txt>
        <TextInput
          value={pin}
          onChangeText={setPin}
          placeholder="e.g. P051234567X"
          placeholderTextColor={colors.outline}
          autoFocus
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={14}
          returnKeyType="done"
          onSubmitEditing={save}
          accessibilityLabel="KRA PIN"
          style={styles.input}
        />
        <Txt variant="caption" color={showFormat || error ? 'error' : 'onSurfaceVariant'}>
          {showFormat ? KRA_PIN_ERROR : error ?? 'For example P051234567X. Leave it empty to remove it.'}
        </Txt>
      </View>
    </BottomSheet>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  footer: { gap: spacing.sm },
  field: { gap: spacing.xs },
  input: {
    height: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineSoft30,
    backgroundColor: colors.surface,
    color: colors.onSurface,
    fontSize: 16,
  },
});
