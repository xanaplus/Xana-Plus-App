import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { BottomSheet, Button, Txt } from '@/components/ui';
import { useSession } from '@/store/session';
import { colors, radius, spacing } from '@/theme';

/**
 * Asks for the customer's name and saves it to their profile. Shown once after
 * a first sign-in (`NamePrompt`) and from the Profile identity card to edit it.
 */
export function NameSheet({
  visible,
  onClose,
  title,
  description,
  initialName = '',
  dismissLabel = 'Cancel',
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  description: string;
  initialName?: string;
  dismissLabel?: string;
}) {
  if (!visible) return null;
  // Mounted per open so the field starts from the current name each time.
  return <NameForm onClose={onClose} title={title} description={description} initialName={initialName} dismissLabel={dismissLabel} />;
}

function NameForm({
  onClose,
  title,
  description,
  initialName,
  dismissLabel,
}: {
  onClose: () => void;
  title: string;
  description: string;
  initialName: string;
  dismissLabel: string;
}) {
  const { updateName } = useSession();
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const canSave = name.trim().length > 0 && !busy;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setFailed(false);
    const ok = await updateName(name);
    setBusy(false);
    if (ok) onClose();
    else setFailed(true);
  };

  return (
    <BottomSheet
      visible
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <View style={styles.footer}>
          <Button label={busy ? 'Saving…' : 'Save name'} disabled={!canSave} onPress={save} />
          <Button label={dismissLabel} variant="outline" onPress={onClose} />
        </View>
      }
    >
      <View style={styles.field}>
        <Txt variant="label" color="onSurfaceVariant">
          Your name
        </Txt>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Amina Odhiambo"
          placeholderTextColor={colors.outline}
          autoFocus
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          maxLength={60}
          returnKeyType="done"
          onSubmitEditing={save}
          accessibilityLabel="Your name"
          style={styles.input}
        />
        {failed ? (
          <Txt variant="caption" color="error">
            Couldn&apos;t save your name. Check your connection and try again.
          </Txt>
        ) : null}
      </View>
    </BottomSheet>
  );
}

/** After a first sign-in, asks once per app visit for the name the profile doesn't have yet. */
export function NamePrompt() {
  const { needsName } = useSession();
  const [dismissed, setDismissed] = useState(false);
  return (
    <NameSheet
      visible={needsName && !dismissed}
      onClose={() => setDismissed(true)}
      title="What should we call you?"
      description="Your rider and pharmacist will see this name on your orders."
      dismissLabel="Skip for now"
    />
  );
}

const styles = StyleSheet.create({
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
