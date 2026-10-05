import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  Chip,
  Divider,
  Icon,
  Screen,
  SectionHeader,
  TopBar,
  Txt,
} from '@/components/ui';
import { PHARMACIST, PPB_FOOTER } from '@/data/prescriptions';
import { formatKes } from '@/lib/format';
import { useCart } from '@/store/cart';
import { colors, radius, spacing } from '@/theme';

/**
 * Pharmacy — Upload a Prescription.
 *
 * Not in the Figma set: this screen was identified as the highest-impact gap,
 * because `06f Checkout — Rx Blocked` blocks an order with no way to unblock
 * it, and both the care portal and the storefront link here.
 *
 * Capture is simulated — the prototype has no camera — but the review states,
 * the patient fields and the PPB compliance gate are real.
 */

type Capture = { id: string; label: string; quality: 'ok' | 'glare' };

const PATIENT_OPTIONS = ['Myself', 'A dependant'];

export default function UploadPrescriptionScreen() {
  const router = useRouter();
  const cart = useCart();

  const [captures, setCaptures] = useState<Capture[]>([]);
  const [patient, setPatient] = useState(PATIENT_OPTIONS[0]);
  const [dependantName, setDependantName] = useState('');
  const [doctor, setDoctor] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  /** Rx items sitting in the basket — what this upload unblocks. */
  const blocked = cart.items.filter(i => i.product.rxRequired);
  const canSubmit = captures.length > 0 && confirmed;

  const addCapture = (source: 'camera' | 'gallery') => {
    setCaptures(prev => [
      ...prev,
      {
        id: `c${prev.length + 1}`,
        label: source === 'camera' ? `Photo ${prev.length + 1}` : `Upload ${prev.length + 1}`,
        // the second capture demonstrates the quality-feedback state
        quality: prev.length === 1 ? 'glare' : 'ok',
      },
    ]);
  };

  if (submitted) {
    return (
      <Screen padded contentStyle={styles.content}>
        <TopBar title="Prescription Status" onBack={() => router.replace('/pharmacy/prescriptions')} />

        <Card variant="elevated" padding={spacing.xl} style={styles.doneCard}>
          <View style={styles.pendingIcon}>
            <Icon name="clock" size={26} color="secondaryContainer" />
          </View>
          <Txt variant="headlineLg" align="center">
            Under pharmacist review
          </Txt>
          <Txt variant="bodySm" color="onSurfaceVariant" align="center">
            Submitted just now · Reference #RX-8842
          </Txt>
          <Txt variant="caption" color="onSurfaceVariant" align="center">
            {PHARMACIST.name} will verify your prescription, usually within 30 minutes. We&apos;ll SMS you as soon
            as it is approved.
          </Txt>
        </Card>

        {blocked.length > 0 ? (
          <>
            <SectionHeader title="Items this unblocks" style={styles.sectionHead} />
            <Card variant="elevated" padding={spacing.lg} style={styles.card}>
              {blocked.map((item, index) => (
                <View key={item.product.id}>
                  {index === 0 ? null : <Divider />}
                  <View style={styles.blockedRow}>
                    <View style={styles.blockedText}>
                      <Txt variant="label" numberOfLines={1}>
                        {item.product.name}
                      </Txt>
                      <Txt variant="caption" color="onSurfaceVariant">
                        {item.product.pack} · Qty {item.quantity}
                      </Txt>
                    </View>
                    <Badge label="Awaiting approval" tone="warning" />
                  </View>
                </View>
              ))}
            </Card>
          </>
        ) : null}

        <Button label="Back to My Prescriptions" fullWidth onPress={() => router.replace('/pharmacy/prescriptions')} />
        <Button
          label="Deliver my other items now"
          variant="outline"
          fullWidth
          onPress={() => router.replace('/(tabs)/cart')}
        />

        <View style={styles.footer}>
          {PPB_FOOTER.map(line => (
            <Txt key={line} variant="caption" color="onSurfaceVariant" align="center">
              {line}
            </Txt>
          ))}
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      padded
      contentStyle={styles.content}
      footer={
        <View style={styles.footerBar}>
          <Button label="Submit for Review" size="lg" fullWidth disabled={!canSubmit} onPress={() => setSubmitted(true)} />
          {blocked.length > 0 ? (
            <Pressable accessibilityRole="button" onPress={() => router.replace('/(tabs)/cart')}>
              <Txt variant="label" color="primaryContainer" align="center">
                Deliver my other items now and hold this one
              </Txt>
            </Pressable>
          ) : null}
        </View>
      }
    >
      <TopBar
        title="Upload Prescription"
        subtitle="Verified by a PPB-licensed pharmacist"
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/pharmacy/prescriptions'))}
      />

      <Card variant="tinted" padding={spacing.lg} style={styles.notice}>
        <Icon name="shield" size={16} color="primaryContainer" />
        <Txt variant="caption" color="onSurfaceVariant" style={styles.noticeText}>
          A PPB-licensed pharmacist reviews every prescription before dispensing. Typical response under 30
          minutes, daily 7:00 AM to 10:00 PM.
        </Txt>
      </Card>

      {/* Capture */}
      <SectionHeader title="Prescription images" style={styles.sectionHead} />
      <Card variant="elevated" padding={spacing.lg} style={styles.card}>
        <View style={styles.dropzone}>
          <Icon name="prescription" size={28} color="primaryContainer" />
          <Txt variant="label" align="center">
            Add a photo of your prescription
          </Txt>
          <Txt variant="caption" color="onSurfaceVariant" align="center">
            Capture the whole sheet including the doctor&apos;s stamp, signature and date.
          </Txt>
        </View>

        <View style={styles.captureButtons}>
          <Button label="Take Photo" size="sm" icon="scan" iconPosition="leading" onPress={() => addCapture('camera')} style={styles.captureBtn} />
          <Button
            label="Choose from Gallery"
            size="sm"
            variant="outline"
            onPress={() => addCapture('gallery')}
            style={styles.captureBtn}
          />
        </View>

        {captures.length > 0 ? (
          <View style={styles.thumbs}>
            {captures.map(capture => (
              <View key={capture.id} style={styles.thumb}>
                <View style={styles.thumbPreview}>
                  <Icon name="receipt" size={20} color="onSurfaceVariant" />
                </View>
                <Txt variant="caption" numberOfLines={1}>
                  {capture.label}
                </Txt>
                {capture.quality === 'glare' ? (
                  <Badge label="Glare, retake?" tone="warning" />
                ) : (
                  <Badge label="Clear" tone="fresh" />
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${capture.label}`}
                  onPress={() => setCaptures(prev => prev.filter(c => c.id !== capture.id))}
                  style={styles.thumbRemove}
                >
                  <Icon name="close" size={12} color="onSurfaceVariant" />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
      </Card>

      {/* Patient */}
      <SectionHeader title="Patient details" style={styles.sectionHead} />
      <Card variant="elevated" padding={spacing.lg} style={styles.card}>
        <Txt variant="caption" color="onSurfaceVariant">
          Who is this prescription for?
        </Txt>
        <View style={styles.patientRow}>
          {PATIENT_OPTIONS.map(option => (
            <Chip key={option} label={option} selected={patient === option} onPress={() => setPatient(option)} />
          ))}
        </View>

        {patient === 'A dependant' ? (
          <TextInput
            value={dependantName}
            onChangeText={setDependantName}
            placeholder="Dependant's name and age"
            placeholderTextColor={colors.outline}
            accessibilityLabel="Dependant name and age"
            style={styles.input}
          />
        ) : null}

        <TextInput
          value={doctor}
          onChangeText={setDoctor}
          placeholder="Prescribing doctor or facility (optional)"
          placeholderTextColor={colors.outline}
          accessibilityLabel="Prescribing doctor or facility"
          style={styles.input}
        />
      </Card>

      {/* Items awaiting */}
      {blocked.length > 0 ? (
        <>
          <SectionHeader title="Items awaiting prescription" style={styles.sectionHead} />
          <Card variant="elevated" padding={spacing.lg} style={styles.card}>
            {blocked.map((item, index) => (
              <View key={item.product.id}>
                {index === 0 ? null : <Divider />}
                <View style={styles.blockedRow}>
                  <View style={styles.blockedText}>
                    <Txt variant="label" numberOfLines={1}>
                      {item.product.name}
                    </Txt>
                    <Txt variant="caption" color="onSurfaceVariant">
                      {item.product.pack} · Qty {item.quantity}
                    </Txt>
                    <Badge label="Rx Required · Not Uploaded" tone="warning" />
                  </View>
                  <Txt variant="label">{formatKes(item.lineTotal)}</Txt>
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {/* Compliance gate */}
      <Card variant="elevated" padding={spacing.lg} style={styles.card}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: confirmed }}
          accessibilityLabel="Confirm the prescription is valid"
          onPress={() => setConfirmed(v => !v)}
          style={styles.confirmRow}
        >
          <View style={[styles.checkbox, confirmed ? styles.checkboxOn : null]}>
            {confirmed ? <Icon name="check" size={12} color="onPrimary" /> : null}
          </View>
          <Txt variant="bodySm" style={styles.confirmText}>
            I confirm this prescription is valid, unexpired and issued to the named patient.
          </Txt>
        </Pressable>
        <Txt variant="caption" color="onSurfaceVariant">
          Kenya Pharmacy &amp; Poisons Board regulations require a verified doctor&apos;s prescription for these
          medicines.
        </Txt>
      </Card>

      <View style={styles.footer}>
        {PPB_FOOTER.map(line => (
          <Txt key={line} variant="caption" color="onSurfaceVariant" align="center">
            {line}
          </Txt>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.giant },
  sectionHead: { marginTop: spacing.sm },
  card: { gap: spacing.md },

  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginTop: spacing.sm },
  noticeText: { flex: 1 },

  dropzone: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
  },
  captureButtons: { flexDirection: 'row', gap: spacing.sm },
  captureBtn: { flex: 1 },

  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  thumb: { width: 96, gap: spacing.xs, alignItems: 'flex-start' },
  thumbPreview: {
    width: 96,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbRemove: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.white95,
    alignItems: 'center',
    justifyContent: 'center',
  },

  patientRow: { flexDirection: 'row', gap: spacing.sm },
  input: {
    height: 46,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
    paddingHorizontal: spacing.md,
    color: colors.onSurface,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
  },

  blockedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  blockedText: { flex: 1, gap: spacing.xxs, alignItems: 'flex-start' },

  confirmRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.xs,
    borderWidth: 2,
    borderColor: colors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.primaryContainer, borderColor: colors.primaryContainer },
  confirmText: { flex: 1 },

  doneCard: { gap: spacing.md, alignItems: 'center', marginTop: spacing.lg },
  pendingIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.amberTint15,
    alignItems: 'center',
    justifyContent: 'center',
  },

  footerBar: { gap: spacing.sm },
  footer: { gap: spacing.xxs, marginTop: spacing.lg },
});
