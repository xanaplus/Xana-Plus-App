import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Switch,
  TextInput,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';

import { Button, Card, Chip, Icon, Screen, TopBar, Txt } from '@/components/ui';
import type { Address } from '@/store/fulfilment';
import { useFulfilment } from '@/store/fulfilment';
import { colors, radius, spacing } from '@/theme';

const MAP_SIZE = 280;
const ZONE_RADIUS = 90;
const CENTER = MAP_SIZE / 2;

/** Clamp a drag to the map box so the pin stays inside the backdrop. */
const boundedOffset = (start: { x: number; y: number }, gesture: PanResponderGestureState) => {
  const bound = CENTER - 16;
  return {
    x: Math.max(-bound, Math.min(bound, start.x + gesture.dx)),
    y: Math.max(-bound, Math.min(bound, start.y + gesture.dy)),
  };
};

type AddressLabel = 'Home' | 'Work' | 'Other';

/** Screen: Address — Add (In Zone / Out of Zone), FR-E.7 / FR-E.8.
 *
 * No map library in the project yet, so the map is a lightweight stand-in:
 * road labels on a static backdrop, a pin the shopper drags with a real pan
 * gesture, and zone status derived from the pin's distance from the hub —
 * inside the dashed ring is Syokimau's delivery zone, outside it is not.
 */
export default function AddAddressRoute() {
  const router = useRouter();
  const { addAddress } = useFulfilment();

  const [pan] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));
  const [pinOffset, setPinOffset] = useState({ x: 0, y: 0 });

  const [estate, setEstate] = useState('');
  const [houseNumber, setHouseNumber] = useState('');
  const [landmark, setLandmark] = useState('');
  const [recipient, setRecipient] = useState('');
  const [phone, setPhone] = useState('');
  const [gateCode, setGateCode] = useState('');
  const [label, setLabel] = useState<AddressLabel>('Home');
  const [setDefault, setSetDefault] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'));

  const distanceFromHub = Math.sqrt(pinOffset.x ** 2 + pinOffset.y ** 2);
  const inZone = distanceFromHub <= ZONE_RADIUS;

  // Gesture-time bookkeeping only — never read during render.
  const dragStart = useRef({ x: 0, y: 0 });
  const settled = useRef({ x: 0, y: 0 });

  const [panHandlers, setPanHandlers] = useState({});
  useEffect(() => {
    const responder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragStart.current = { ...settled.current };
      },
      onPanResponderMove: (_evt: GestureResponderEvent, gesture: PanResponderGestureState) => {
        const next = boundedOffset(dragStart.current, gesture);
        pan.setValue(next);
        setPinOffset(next);
      },
      onPanResponderRelease: (_evt: GestureResponderEvent, gesture: PanResponderGestureState) => {
        settled.current = boundedOffset(dragStart.current, gesture);
      },
      onPanResponderTerminate: (_evt: GestureResponderEvent, gesture: PanResponderGestureState) => {
        settled.current = boundedOffset(dragStart.current, gesture);
      },
    });
    setPanHandlers(responder.panHandlers);
  }, [pan]);

  const useMyLocation = () => {
    settled.current = { x: 0, y: 0 };
    pan.setValue({ x: 0, y: 0 });
    setPinOffset({ x: 0, y: 0 });
  };

  const canSave = inZone && estate.trim().length > 0 && houseNumber.trim().length > 0 && recipient.trim().length > 0 && phone.trim().length >= 9;

  const save = async () => {
    if (!canSave || saving) return;
    const address: Address = {
      id: `addr_${Date.now()}`,
      label: label.toUpperCase(),
      contact: recipient.trim(),
      line: [estate.trim(), houseNumber.trim(), landmark.trim() ? `near ${landmark.trim()}` : null].filter(Boolean).join(', '),
      phone: phone.trim().startsWith('+254') ? phone.trim() : `+254 ${phone.trim()}`,
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
            <Icon name="check-circle" size={28} color="primaryContainer" />
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
        inZone ? (
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
        ) : (
          <View style={styles.footerColumn}>
            <Button label="Notify me when you deliver here" icon="bell" iconPosition="leading" size="lg" onPress={goBack} />
            <Button label="Choose a different location" variant="outline" onPress={useMyLocation} />
          </View>
        )
      }
    >
      <TopBar title="Add Address" onBack={goBack} />

      <View style={styles.inset}>
        <Txt variant="caption" color="onSurfaceVariant" align="center" style={styles.mapHint}>
          {inZone ? 'Drag the pin to place it at your gate' : 'Drag the pin to your exact gate'}
        </Txt>

        <View style={styles.mapBox}>
          <View style={styles.roadHorizontal} />
          <View style={styles.roadVertical} />
          <Txt variant="micro" color="onSurfaceVariant" style={[styles.roadLabel, styles.roadLabelH]}>MOMBASA RD (A104)</Txt>
          <Txt variant="micro" color="onSurfaceVariant" style={[styles.roadLabel, styles.roadLabelV]}>KATANI RD</Txt>

          <View style={[styles.zoneRing, { width: ZONE_RADIUS * 2, height: ZONE_RADIUS * 2, borderRadius: ZONE_RADIUS }]} />
          <View style={styles.hub}>
            <Txt variant="micro" tint={colors.onPrimary}>SYOKIMAU</Txt>
          </View>

          <Animated.View
            {...panHandlers}
            style={[styles.pin, { transform: [{ translateX: pan.x }, { translateY: pan.y }] }]}
          >
            <Icon name="map-pin" size={28} color={inZone ? 'primary' : 'error'} />
          </Animated.View>
        </View>

        <Pressable accessibilityRole="button" onPress={useMyLocation} style={styles.locationLink}>
          <Icon name="map-pin" size={14} color="primaryContainer" />
          <Txt variant="label" color="primaryContainer">Use my location</Txt>
        </Pressable>

        {inZone ? (
          <View style={styles.zoneBanner}>
            <Icon name="check-circle" size={14} color="primary" />
            <Txt variant="labelSm" color="primary">Inside Xana Plus Syokimau zone · Express slots available</Txt>
          </View>
        ) : (
          <View style={styles.zoneBannerWarn}>
            <Icon name="alert" size={14} color="error" />
            <View style={styles.flex}>
              <Txt variant="label" tint={colors.error}>Outside our delivery zone</Txt>
              <Txt variant="caption" color="onSurfaceVariant">Nearest active branch is Xana Plus Ruiru, 14 km away.</Txt>
            </View>
          </View>
        )}
      </View>

      {inZone ? (
        <View style={[styles.inset, styles.form]}>
          <Txt variant="overline" color="onSurfaceVariant">GATE & HOUSE DETAILS</Txt>
          <Txt variant="caption" color="onSurfaceVariant">Precise details ensure smooth doorstep handover.</Txt>

          <Field label="Estate / Apartment Name" value={estate} onChangeText={setEstate} placeholder="Green Park Estate" />
          <Field label="House / Unit / Door Number" value={houseNumber} onChangeText={setHouseNumber} placeholder="Block C, Door 14" />
          <Field label="Nearest Landmark" value={landmark} onChangeText={setLandmark} placeholder="Next to TotalEnergies Katani Rd" />

          <Txt variant="overline" color="onSurfaceVariant" style={styles.sectionGap}>CONTACT PERSON</Txt>
          <Field label="Recipient Name" value={recipient} onChangeText={setRecipient} placeholder="Amina Mohamed" />
          <Field label="M-Pesa Delivery Phone Number" value={phone} onChangeText={setPhone} placeholder="712 345 678" keyboardType="number-pad" />

          <Txt variant="overline" color="onSurfaceVariant" style={styles.sectionGap}>ACCESS INSTRUCTIONS</Txt>
          <Field label="Intercom / Gate Code" value={gateCode} onChangeText={setGateCode} placeholder="#4402" />

          <Txt variant="overline" color="onSurfaceVariant" style={styles.sectionGap}>SAVE ADDRESS AS</Txt>
          <View style={styles.chipRow}>
            {(['Home', 'Work', 'Other'] as AddressLabel[]).map(option => (
              <Chip key={option} label={option} selected={label === option} onPress={() => setLabel(option)} />
            ))}
          </View>

          <View style={styles.defaultRow}>
            <View style={styles.flex}>
              <Txt variant="label">Set as default delivery address</Txt>
              <Txt variant="caption" color="onSurfaceVariant">Preferred destination for one-tap orders</Txt>
            </View>
            <Switch value={setDefault} onValueChange={setSetDefault} />
          </View>
        </View>
      ) : (
        <View style={[styles.inset, styles.expandNote]}>
          <Txt variant="label">We&apos;re expanding rapidly across Nairobi!</Txt>
          <Txt variant="bodySm" color="onSurfaceVariant">
            Syokimau and Ruiru branches currently service within 10 km. We are onboarding new dispatch riders soon.
          </Txt>
        </View>
      )}
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

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingBottom: spacing.giant },
  inset: { marginHorizontal: spacing.lg },
  flex: { flex: 1 },

  mapHint: { marginBottom: spacing.sm },
  mapBox: {
    width: MAP_SIZE,
    height: MAP_SIZE,
    alignSelf: 'center',
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceContainerLow,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.surfaceContainerHigh,
  },
  roadHorizontal: { position: 'absolute', top: MAP_SIZE * 0.35, left: 0, right: 0, height: 10, backgroundColor: colors.surfaceContainerHighest },
  roadVertical: { position: 'absolute', left: MAP_SIZE * 0.65, top: 0, bottom: 0, width: 10, backgroundColor: colors.surfaceContainerHighest },
  roadLabel: { position: 'absolute' },
  roadLabelH: { top: MAP_SIZE * 0.35 - 14, left: 8 },
  roadLabelV: { top: 8, left: MAP_SIZE * 0.65 + 14 },
  zoneRing: {
    position: 'absolute',
    top: CENTER - ZONE_RADIUS,
    left: CENTER - ZONE_RADIUS,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.primaryContainer,
  },
  hub: {
    position: 'absolute',
    top: CENTER - 14,
    left: CENTER - 24,
    width: 48,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pin: { position: 'absolute', top: CENTER - 28, left: CENTER - 14 },

  locationLink: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },

  zoneBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.mintSubtle },
  zoneBannerWarn: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.errorContainer },

  form: { gap: spacing.md },
  sectionGap: { marginTop: spacing.md },
  field: { gap: spacing.xs },
  input: { height: 44, paddingHorizontal: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outlineSoft30, backgroundColor: colors.surface, color: colors.onSurface, fontSize: 14 },
  chipRow: { flexDirection: 'row', gap: spacing.sm },
  defaultRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },

  expandNote: { gap: spacing.xs, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.mintSurface },

  confirmCard: { gap: spacing.sm, alignItems: 'flex-start', borderWidth: 1, borderColor: colors.mintEdge },
  confirmIcon: { width: 48, height: 48, borderRadius: radius.pill, backgroundColor: colors.mintSurface, alignItems: 'center', justifyContent: 'center' },
  footerColumn: { gap: spacing.sm },
});
