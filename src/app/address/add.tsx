import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, TextInput, View } from 'react-native';

import { Button, Card, Chip, Icon, Screen, TopBar, Txt } from '@/components/ui';
import type { Address } from '@/store/fulfilment';
import { useFulfilment } from '@/store/fulfilment';
import { radius, spacing } from '@/theme';
import { useTheme, useThemeStyles } from '@/theme/provider';
import type { Palette } from '@/theme';

type AddressLabel = 'Home' | 'Work' | 'Other';

const withCountryCode = (number: string) => (number.trim().startsWith('+254') ? number.trim() : `+254 ${number.trim()}`);

/** Screen: Address — Add, FR-E.7.
 *
 * A form, not a map (22 Oct 2026): the old drag-a-pin stand-in judged the
 * delivery zone from a drawing. Riders get the area, building, door and a
 * landmark in words; staff confirm the area when the order comes in. A real
 * map waits for a Google Maps key and the stores' delivery areas.
 */
export default function AddAddressRoute() {
  const styles = useThemeStyles(createStyles);
  const router = useRouter();
  const { addAddress, store } = useFulfilment();

  const [area, setArea] = useState('');
  const [estate, setEstate] = useState('');
  const [houseNumber, setHouseNumber] = useState('');
  const [landmark, setLandmark] = useState('');
  const [recipient, setRecipient] = useState('');
  const [phone, setPhone] = useState('');
  const [secondPhone, setSecondPhone] = useState('');
  const [label, setLabel] = useState<AddressLabel>('Home');
  const [setDefault, setSetDefault] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'));

  const canSave =
    area.trim().length > 0 &&
    estate.trim().length > 0 &&
    houseNumber.trim().length > 0 &&
    recipient.trim().length > 0 &&
    phone.trim().length >= 9 &&
    (secondPhone.trim().length === 0 || secondPhone.trim().length >= 9);

  const save = async () => {
    if (!canSave || saving) return;
    const address: Address = {
      id: `addr_${Date.now()}`,
      label: label.toUpperCase(),
      contact: recipient.trim(),
      line: [
        houseNumber.trim(),
        estate.trim(),
        area.trim(),
        landmark.trim() ? `near ${landmark.trim()}` : null,
        // No column for it: the second number travels in the address line to the order and the rider.
        secondPhone.trim() ? `alt phone ${withCountryCode(secondPhone)}` : null,
      ]
        .filter(Boolean)
        .join(', '),
      phone: withCountryCode(phone),
      isDefault: setDefault,
    };
    setSaving(true);
    setSaveFailed(false);
    const ok = await addAddress(address);
    setSaving(false);
    if (ok) setSaved(true);
    else setSaveFailed(true);
  };

  if (saved) {
    return (
      <Screen padded contentStyle={styles.content}>
        <TopBar title="Address saved" onBack={goBack} />
        <Card variant="elevated" padding={spacing.lg} style={styles.confirmCard}>
          <View style={styles.confirmIcon}>
            <Icon name="check-circle" size={28} color="primaryAccent" />
          </View>
          <Txt variant="titleLg">Saved to your addresses</Txt>
          <Txt variant="bodySm" color="onSurfaceVariant">
            {`${label} · ${recipient}, ${phone.startsWith('+254') ? phone : `+254 ${phone}`}`}
          </Txt>
        </Card>
        <Button label="Done" onPress={goBack} />
      </Screen>
    );
  }

  return (
    <Screen
      padded={false}
      contentStyle={styles.content}
      footer={
        <View style={styles.footerColumn}>
          {saveFailed ? (
            <Txt variant="caption" color="error" align="center">
              Couldn&apos;t save the address. Check your connection and try again.
            </Txt>
          ) : null}
          <Button
            label={saving ? 'Saving…' : 'Save Delivery Address'}
            icon="check-circle"
            iconPosition="leading"
            size="lg"
            disabled={!canSave || saving}
            onPress={save}
          />
        </View>
      }
    >
      <TopBar title="Add Address" onBack={goBack} />

      <View style={[styles.inset, styles.storeNote]}>
        <Icon name="store" size={16} color="primaryAccent" />
        <View style={styles.flex}>
          <Txt variant="label">{`Delivering from ${store.name}`}</Txt>
          <Txt variant="caption" color="onSurfaceVariant">
            We&apos;ll confirm we can reach your area when your order comes in.
          </Txt>
        </View>
      </View>

      <View style={[styles.inset, styles.form]}>
        {/* Contact first, then the address, as on Jumia (23 Oct). */}
        <Txt variant="overline" color="onSurfaceVariant">CONTACT PERSON</Txt>
        <Field label="Recipient Name" value={recipient} onChangeText={setRecipient} placeholder="Amina Mohamed" />
        <Field label="M-Pesa Delivery Phone Number" value={phone} onChangeText={setPhone} placeholder="712 345 678" keyboardType="number-pad" />
        <Field label="Second Phone Number (optional)" value={secondPhone} onChangeText={setSecondPhone} placeholder="733 456 789" keyboardType="number-pad" />

        <Txt variant="overline" color="onSurfaceVariant" style={styles.sectionGap}>WHERE TO DELIVER</Txt>

        <Field label="Area / Street" value={area} onChangeText={setArea} placeholder="Syokimau, Katani Road" />
        <Field label="Estate / Apartment Name" value={estate} onChangeText={setEstate} placeholder="Green Park Estate" />
        <Field label="House / Unit / Door Number" value={houseNumber} onChangeText={setHouseNumber} placeholder="Block C, Door 14" />
        <Field label="Nearest Landmark" value={landmark} onChangeText={setLandmark} placeholder="Next to TotalEnergies Katani Rd" />


        <Txt variant="overline" color="onSurfaceVariant" style={styles.sectionGap}>SAVE ADDRESS AS</Txt>
        <View style={styles.chipRow}>
          {(['Home', 'Work', 'Other'] as AddressLabel[]).map(option => (
            <Chip key={option} label={option} selected={label === option} onPress={() => setLabel(option)} />
          ))}
        </View>

        <View style={styles.defaultRow}>
          <Txt variant="label" style={styles.flex}>Set as default delivery address</Txt>
          <Switch value={setDefault} onValueChange={setSetDefault} />
        </View>
      </View>
    </Screen>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'number-pad';
}) {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  return (
    <View style={styles.field}>
      <Txt variant="labelSm" color="onSurfaceVariant">{label.toUpperCase()}</Txt>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.outline}
        keyboardType={keyboardType}
        style={styles.input}
      />
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  content: { gap: spacing.lg, paddingBottom: spacing.giant },
  inset: { marginHorizontal: spacing.lg },
  flex: { flex: 1 },

  storeNote: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.mintSubtle },

  form: { gap: spacing.md },
  sectionGap: { marginTop: spacing.md },
  field: { gap: spacing.xs },
  input: { height: 44, paddingHorizontal: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outlineSoft30, backgroundColor: colors.surface, color: colors.onSurface, fontSize: 14 },
  chipRow: { flexDirection: 'row', gap: spacing.sm },
  defaultRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },


  confirmCard: { gap: spacing.sm, alignItems: 'flex-start', borderWidth: 1, borderColor: colors.mintEdge },
  confirmIcon: { width: 48, height: 48, borderRadius: radius.pill, backgroundColor: colors.mintSurface, alignItems: 'center', justifyContent: 'center' },
  footerColumn: { gap: spacing.sm },
});
