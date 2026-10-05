import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  Divider,
  Icon,
  Screen,
  SectionHeader,
  TopBar,
  Txt,
} from '@/components/ui';
import { productById } from '@/data/catalog';
import {
  ACTIVE_RX_ORDER,
  CLINICAL_SERVICES,
  PPB_FOOTER,
  RX_STAGES,
} from '@/data/prescriptions';
import { useRepeatScripts } from '@/features/account/sample-data';
import { colors, radius, spacing } from '@/theme';

/** Screen 08b — Pharmacy: My Prescriptions (the care portal). */
export default function PrescriptionsScreen() {
  const scripts = useRepeatScripts();
  const router = useRouter();
  const stageIndex = RX_STAGES.indexOf(ACTIVE_RX_ORDER.stage);
  const activeProduct = productById(ACTIVE_RX_ORDER.productIds[0]);

  return (
    <Screen padded contentStyle={styles.content}>
      <TopBar
        title="My Prescriptions"
        subtitle="Pharmacy & Care Portal"
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'))}
        actions={
          <View style={styles.verified}>
            <Icon name="shield" size={12} color="primaryContainer" />
            <Txt variant="labelSm" color="primaryContainer">
              Verified Rx
            </Txt>
          </View>
        }
      />

      {/* Primary actions */}
      <View style={styles.actions}>
        <Button
          label="Upload a Prescription"
          icon="prescription"
          iconPosition="leading"
          fullWidth
          onPress={() => router.push('/pharmacy/upload')}
        />
        <Button
          label="Order a Repeat"
          icon="refresh"
          iconPosition="leading"
          variant="outline"
          fullWidth
          onPress={() => router.push('/pharmacy/repeat')}
        />
      </View>

      {/* Active dispensing order */}
      <Card variant="elevated" padding={spacing.lg} style={styles.card}>
        <View style={styles.activeHead}>
          <Txt variant="overline" color="onSurfaceVariant">
            ACTIVE ORDER #{ACTIVE_RX_ORDER.reference}
          </Txt>
          <Badge label="Dispensing" tone="info" />
        </View>

        <View style={styles.stepper}>
          {RX_STAGES.map((stage, index) => {
            const done = index <= stageIndex;
            const current = index === stageIndex;
            return (
              <View key={stage} style={styles.step}>
                <View style={styles.stepTop}>
                  {index > 0 ? <View style={[styles.connector, done ? styles.connectorDone : null]} /> : <View style={styles.spacer} />}
                  <View style={[styles.dot, done ? styles.dotDone : null, current ? styles.dotCurrent : null]}>
                    {done ? <Icon name="check" size={10} color="onPrimary" /> : null}
                  </View>
                  {index < RX_STAGES.length - 1 ? (
                    <View style={[styles.connector, index < stageIndex ? styles.connectorDone : null]} />
                  ) : (
                    <View style={styles.spacer} />
                  )}
                </View>
                <Txt variant="caption" align="center" color={current ? 'primaryContainer' : 'onSurfaceVariant'} numberOfLines={2}>
                  {stage}
                </Txt>
              </View>
            );
          })}
        </View>

        <View style={styles.readyBanner}>
          <Icon name="clock" size={16} color="primaryContainer" />
          <View style={styles.readyText}>
            <Txt variant="label">Ready by {ACTIVE_RX_ORDER.readyBy}</Txt>
            <Txt variant="caption" color="onSurfaceVariant">
              {ACTIVE_RX_ORDER.collectionPoint}
            </Txt>
          </View>
        </View>

        {activeProduct ? (
          <Txt variant="caption" color="onSurfaceVariant">
            {activeProduct.name} · {activeProduct.pack}
          </Txt>
        ) : null}
      </Card>

      {/* Repeats on file */}
      <SectionHeader title="Repeat & regular medications" style={styles.sectionHead} />
      <Card variant="elevated" padding={spacing.lg} style={styles.card}>
        <View style={styles.onFile}>
          <Txt variant="overline" color="onSurfaceVariant">
            ON FILE
          </Txt>
          <Badge label={`${scripts.length} scripts`} tone="neutral" />
        </View>

        {scripts.length === 0 ? (
          <Txt variant="bodySm" color="onSurfaceVariant">
            No repeat prescriptions on file yet. Upload a prescription and a pharmacist adds it here once verified.
          </Txt>
        ) : null}
        {scripts.map((script, index) => {
          const product = productById(script.productId);
          if (!product) return null;
          return (
            <View key={script.productId}>
              {index === 0 ? null : <Divider />}
              <View style={styles.scriptRow}>
                <View style={styles.scriptText}>
                  <Txt variant="label" numberOfLines={1}>
                    {product.name}
                  </Txt>
                  <Txt variant="caption" color="onSurfaceVariant" numberOfLines={1}>
                    {product.pack} · {script.prescriber}
                  </Txt>
                  <Txt variant="caption" color="onSurfaceVariant">
                    Next refill {script.nextRefill} · {script.refillsLeft} left
                  </Txt>
                  {script.expired ? (
                    <Badge label="Prescription expired" tone="warning" />
                  ) : script.dueInDays ? (
                    <Badge label={`Refill due in ${script.dueInDays} days`} tone="fresh" />
                  ) : null}
                </View>
                <Button
                  label={script.expired ? 'Renew' : 'Reorder'}
                  size="sm"
                  variant="outline"
                  onPress={() => router.push(script.expired ? '/pharmacy/upload' : '/pharmacy/repeat')}
                />
              </View>
            </View>
          );
        })}
      </Card>

      {/* Clinical services */}
      <SectionHeader title="Clinical services" style={styles.sectionHead} />
      <Card variant="elevated" padding={spacing.lg} style={styles.card}>
        {CLINICAL_SERVICES.map((service, index) => (
          <View key={service.id}>
            {index === 0 ? null : <Divider />}
            <View style={styles.serviceRow}>
              <View style={styles.serviceIcon}>
                <Icon name="stethoscope" size={16} color="primaryContainer" />
              </View>
              <View style={styles.serviceText}>
                <Txt variant="label">{service.title}</Txt>
                <Txt variant="caption" color="onSurfaceVariant" numberOfLines={2}>
                  {service.description}
                </Txt>
              </View>
            </View>
          </View>
        ))}
        <Button
          label="Ask a Pharmacist"
          icon="message"
          iconPosition="leading"
          variant="outline"
          fullWidth
          onPress={() => router.push('/pharmacy/consult')}
          style={styles.consultButton}
        />
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
  verified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.mintSurface,
  },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
  card: { gap: spacing.md },
  sectionHead: { marginTop: spacing.sm },

  activeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  stepper: { flexDirection: 'row', alignItems: 'flex-start' },
  step: { flex: 1, gap: spacing.sm },
  stepTop: { flexDirection: 'row', alignItems: 'center' },
  connector: { flex: 1, height: 2, backgroundColor: colors.surfaceContainerHigh },
  connectorDone: { backgroundColor: colors.primaryContainer },
  spacer: { flex: 1 },
  dot: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.surfaceContainerHigh,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: colors.primaryContainer, borderColor: colors.primaryContainer },
  dotCurrent: { borderColor: colors.primary },

  readyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.mintSurface,
  },
  readyText: { flex: 1, gap: spacing.xxs },

  onFile: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scriptRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  scriptText: { flex: 1, gap: spacing.xxs, alignItems: 'flex-start' },

  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  serviceIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceText: { flex: 1, gap: spacing.xxs },
  consultButton: { marginTop: spacing.sm },

  footer: { gap: spacing.xxs, marginTop: spacing.lg },
});
