import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  Chip,
  Divider,
  Icon,
  QuantityStepper,
  Screen,
  SectionHeader,
  SelectableOption,
  TopBar,
  Txt,
} from '@/components/ui';
import { productById } from '@/data/catalog';
import { PPB_FOOTER } from '@/data/prescriptions';
import { useRepeatScripts } from '@/features/account/sample-data';
import { formatKes } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

/** Screen 08c — Pharmacy: Order a Repeat. */

const FREQUENCIES = ['Every 30 days', 'Every 60 days', 'Every 90 days'];

type Fulfilment = 'deliver' | 'collect';

export default function RepeatOrderScreen() {
  const router = useRouter();

  const scripts = useRepeatScripts();
  const available = scripts.filter(s => productById(s.productId));
  const [selected, setSelected] = useState<Record<string, number>>(() =>
    Object.fromEntries(available.filter(s => !s.expired).map(s => [s.productId, 1])),
  );
  const [recurring, setRecurring] = useState(false);
  const [frequency, setFrequency] = useState(FREQUENCIES[0]);
  const [fulfilment, setFulfilment] = useState<Fulfilment>('deliver');
  const [submitted, setSubmitted] = useState(false);

  const total = useMemo(
    () =>
      Object.entries(selected).reduce((sum, [productId, qty]) => {
        const product = productById(productId);
        return product ? sum + product.price * qty : sum;
      }, 0),
    [selected],
  );

  const count = Object.keys(selected).length;

  const toggle = (productId: string) =>
    setSelected(prev => {
      const next = { ...prev };
      if (next[productId]) delete next[productId];
      else next[productId] = 1;
      return next;
    });

  const setQty = (productId: string, qty: number) =>
    setSelected(prev => ({ ...prev, [productId]: Math.max(1, qty) }));

  if (submitted) {
    return (
      <Screen padded contentStyle={styles.content}>
        <TopBar title="Order a Repeat" onBack={() => router.replace('/pharmacy/prescriptions')} />
        <Card variant="elevated" padding={spacing.xl} style={styles.doneCard}>
          <View style={styles.doneIcon}>
            <Icon name="check" size={28} color="onPrimary" />
          </View>
          <Txt variant="headlineLg" align="center">
            Sent to the pharmacist
          </Txt>
          <Txt variant="bodySm" color="onSurfaceVariant" align="center">
            {count} {count === 1 ? 'medication' : 'medications'} submitted for review. We&apos;ll SMS you when it&apos;s
            approved, usually within 30 minutes.
          </Txt>
          <Txt variant="caption" color="onSurfaceVariant" align="center">
            You won&apos;t be charged until the pharmacist approves your repeat.
          </Txt>
          <Button label="Back to My Prescriptions" fullWidth onPress={() => router.replace('/pharmacy/prescriptions')} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      padded
      contentStyle={styles.content}
      footer={
        <View style={styles.footerBar}>
          <View style={styles.footerTotals}>
            <Txt variant="titleLg">{formatKes(total)}</Txt>
            <Txt variant="caption" color="onSurfaceVariant">
              {count} {count === 1 ? 'item' : 'items'}
            </Txt>
          </View>
          <Button
            label="Send to Pharmacist"
            size="lg"
            disabled={count === 0}
            onPress={() => setSubmitted(true)}
            style={styles.footerCta}
          />
        </View>
      }
    >
      <TopBar
        title="Order a Repeat"
        subtitle="Pharmacist reviews every repeat"
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/pharmacy/prescriptions'))}
      />

      <Card variant="tinted" padding={spacing.lg} style={styles.notice}>
        <Icon name="shield" size={16} color="primaryContainer" />
        <Txt variant="caption" color="onSurfaceVariant" style={styles.noticeText}>
          A PPB-licensed pharmacist checks every repeat before dispensing. Typical response under 30 minutes,
          daily 7:00 AM to 10:00 PM.
        </Txt>
      </Card>

      <SectionHeader title="Select medications" style={styles.sectionHead} />
      {available.length === 0 ? (
        <Txt variant="bodySm" color="onSurfaceVariant" style={styles.sectionHead}>
          You have no repeat prescriptions on file yet. Upload a prescription first.
        </Txt>
      ) : null}
      {available.map(script => {
        const product = productById(script.productId);
        if (!product) return null;
        const isSelected = Boolean(selected[script.productId]);

        return (
          <Card key={script.productId} variant="elevated" padding={spacing.lg} style={styles.medCard}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected, disabled: script.expired }}
              accessibilityLabel={product.name}
              disabled={script.expired}
              onPress={() => toggle(script.productId)}
              style={styles.medHead}
            >
              <View style={[styles.checkbox, isSelected ? styles.checkboxOn : null, script.expired ? styles.checkboxOff : null]}>
                {isSelected ? <Icon name="check" size={12} color="onPrimary" /> : null}
              </View>
              <View style={styles.medText}>
                <Txt variant="label" numberOfLines={2}>
                  {product.name}
                </Txt>
                <Txt variant="caption" color="onSurfaceVariant" numberOfLines={1}>
                  {product.pack} · {script.prescriber}
                </Txt>
                <Txt variant="caption" color="onSurfaceVariant">
                  Next refill {script.nextRefill}
                </Txt>
              </View>
              <Txt variant="label">{formatKes(product.price)}</Txt>
            </Pressable>

            {script.expired ? (
              <View style={styles.expired}>
                <Badge label="Prescription expired" tone="warning" />
                <Button label="Upload a new prescription" size="sm" variant="outline" onPress={() => router.push('/pharmacy/upload')} />
              </View>
            ) : isSelected ? (
              <View style={styles.qtyRow}>
                <Txt variant="caption" color="onSurfaceVariant">
                  Packs
                </Txt>
                <QuantityStepper
                  quantity={selected[script.productId]}
                  onIncrement={() => setQty(script.productId, selected[script.productId] + 1)}
                  onDecrement={() => setQty(script.productId, selected[script.productId] - 1)}
                  size="compact"
                />
              </View>
            ) : null}
          </Card>
        );
      })}

      <SectionHeader title="Make this regular" style={styles.sectionHead} />
      <Card variant="elevated" padding={spacing.lg} style={styles.card}>
        <View style={styles.recurringRow}>
          <View style={styles.recurringText}>
            <Txt variant="label">Schedule recurring refills</Txt>
            <Txt variant="caption" color="onSurfaceVariant">
              We remind you 5 days before each refill. Cancel anytime.
            </Txt>
          </View>
          <Switch
            value={recurring}
            onValueChange={setRecurring}
            trackColor={{ true: colors.primaryContainer, false: colors.surfaceContainerHigh }}
            thumbColor={colors.surface}
          />
        </View>
        {recurring ? (
          <>
            <Divider />
            <View style={styles.freqRow}>
              {FREQUENCIES.map(f => (
                <Chip key={f} label={f} selected={frequency === f} onPress={() => setFrequency(f)} />
              ))}
            </View>
          </>
        ) : null}
      </Card>

      <SectionHeader title="Collection or delivery" style={styles.sectionHead} />
      <View style={styles.fulfilment}>
        <SelectableOption
          title="Deliver to me"
          description="Apt 4B, Karura Springs · Tomorrow, 9:00 AM to 11:00 AM"
          icon="delivery"
          selected={fulfilment === 'deliver'}
          onPress={() => setFulfilment('deliver')}
        />
        <SelectableOption
          title="Collect in branch"
          description="Xana Life Pharmacy Desk · Syokimau · Ready by 4:30 PM today"
          icon="pickup"
          selected={fulfilment === 'collect'}
          onPress={() => setFulfilment('collect')}
        />
      </View>

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

  medCard: { gap: spacing.md },
  medHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.xs,
    borderWidth: 2,
    borderColor: colors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxOn: { backgroundColor: colors.primaryContainer, borderColor: colors.primaryContainer },
  checkboxOff: { opacity: 0.4 },
  medText: { flex: 1, gap: spacing.xxs },
  expired: { gap: spacing.sm, alignItems: 'flex-start' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  recurringRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  recurringText: { flex: 1, gap: spacing.xxs },
  freqRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

  fulfilment: { gap: spacing.sm },

  footerBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  footerTotals: { gap: spacing.xxs },
  footerCta: { flex: 1 },

  doneCard: { gap: spacing.md, alignItems: 'center', marginTop: spacing.xxl },
  doneIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },

  footer: { gap: spacing.xxs, marginTop: spacing.lg },
});
