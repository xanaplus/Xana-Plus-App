import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Chip, Divider, Icon, Screen, TopBar, Txt } from '@/components/ui';
import { formatKesDecimal } from '@/lib/format';
import { useCart } from '@/store/cart';
import { useFulfilment } from '@/store/fulfilment';
import { useSession } from '@/store/session';
import { colors, radius, spacing } from '@/theme';

/**
 * Checkout — M-Pesa payment could not be completed.
 *
 * Not in the Figma set. `06e` designs only the happy path, so a failed STK
 * push had no designed recovery — the highest-revenue gap in the flow.
 *
 * Deliberately AMBER, not red, and the first line states that nothing has been
 * charged: the most damaging outcome here is not the failed payment but a
 * customer who believes they have been double-charged.
 */

type Reason = 'timeout' | 'cancelled' | 'balance';

const REASONS: { id: Reason; label: string; helper: string }[] = [
  {
    id: 'timeout',
    label: 'Request timed out',
    helper: 'The STK push expired after 60 seconds. Resend it and approve the prompt as soon as it appears.',
  },
  {
    id: 'cancelled',
    label: 'Cancelled on phone',
    helper: 'The prompt was dismissed before the PIN was entered. Resending sends a fresh request to the same line.',
  },
  {
    id: 'balance',
    label: 'Insufficient balance',
    helper: 'Your M-Pesa balance is below the order total. Top up via your Safaricom line, or pay on delivery instead.',
  },
];

/** Minutes the delivery slot is held while the shopper retries. */
const SLOT_HOLD_SECONDS = 12 * 60;

export default function PaymentFailedScreen() {
  const router = useRouter();
  const cart = useCart();
  const { mpesaNumber, setPaymentMethod, promo, pointsRedeemed } = useFulfilment();
  const session = useSession();
  // Same sum as the M-Pesa screen: promo code and points (10 pts = KES 1) come off the total.
  const pointsUsed = Math.min(pointsRedeemed, session.user?.clubPoints ?? 0);
  const amountDue = Math.max(0, cart.summary.total - (promo?.discount ?? 0) - pointsUsed / 10);
  const params = useLocalSearchParams<{ reason?: string; attempt?: string }>();

  const initial = REASONS.find(r => r.id === params.reason)?.id ?? 'timeout';
  const [reason, setReason] = useState<Reason>(initial);
  const attempt = Math.min(3, Math.max(1, Number(params.attempt) || 1));
  const [holdLeft, setHoldLeft] = useState(SLOT_HOLD_SECONDS);

  useEffect(() => {
    const timer = setInterval(() => setHoldLeft(prev => (prev > 0 ? prev - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, []);

  const active = REASONS.find(r => r.id === reason) ?? REASONS[0];
  const holdMinutes = Math.ceil(holdLeft / 60);
  const masked = mpesaNumber.replace(/(\+254\s?\d{3})\s?\d{3}\s?(\d{2})/, '$1 ••• •$2');
  const exhausted = attempt >= 3;

  /** Fresh STK push on the same line — back to the pending screen. */
  const resend = () => router.replace('/checkout/mpesa');

  /** Switch to cash on delivery and return to checkout to confirm. */
  const payOnDelivery = () => {
    setPaymentMethod('cod');
    router.replace('/checkout');
  };

  return (
    <Screen
      padded
      contentStyle={styles.content}
      footer={
        <View style={styles.footer}>
          {!exhausted ? (
            <Button
              label={`Resend M-Pesa Request · ${formatKesDecimal(amountDue)}`}
              icon="refresh"
              iconPosition="leading"
              size="lg"
              fullWidth
              onPress={resend}
            />
          ) : null}
          <Button
            label="Pay on Delivery instead"
            variant="outline"
            size={exhausted ? 'lg' : 'md'}
            fullWidth
            onPress={payOnDelivery}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="Change payment method" onPress={() => router.replace('/checkout')}>
            <Txt variant="label" color="primaryContainer" align="center">
              Change payment method
            </Txt>
          </Pressable>
          <View style={styles.trust}>
            <Icon name="lock" size={12} color="outline" />
            <Txt variant="caption" color="onSurfaceVariant">
              256-bit Encrypted · Safaricom M-Pesa
            </Txt>
          </View>
        </View>
      }
    >
      <TopBar title="M-Pesa Payment" onBack={() => router.replace('/checkout')} />

      {/* Headline — amber, and the reassurance comes first */}
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Icon name="alert" size={26} color="secondaryContainer" />
        </View>
        <Txt variant="headlineLg" align="center">
          Payment not completed
        </Txt>
        <Txt variant="bodySm" color="onSurfaceVariant" align="center">
          We didn&apos;t receive confirmation from M-Pesa. Nothing has been charged and your order is still saved.
        </Txt>
      </View>

      {/* Reason */}
      <Txt variant="overline" color="onSurfaceVariant">
        WHAT HAPPENED
      </Txt>
      <View style={styles.reasonRow}>
        {REASONS.map(r => (
          <Chip key={r.id} label={r.label} selected={reason === r.id} onPress={() => setReason(r.id)} />
        ))}
      </View>
      <Card variant="flat" padding={spacing.lg} style={styles.helperCard}>
        <Icon name="info" size={16} color="secondaryContainer" />
        <Txt variant="caption" color="onSurfaceVariant" style={styles.helperText}>
          {active.helper}
        </Txt>
      </Card>

      {/* Amount */}
      <Card variant="elevated" padding={spacing.lg} style={styles.amountCard}>
        <View style={styles.amountHead}>
          <Txt variant="overline" color="onSurfaceVariant">
            ATTEMPTED PAYMENT
          </Txt>
          <Badge label={`Attempt ${attempt} of 3`} tone={exhausted ? 'warning' : 'neutral'} />
        </View>
        <Row label="Total to pay" value={formatKesDecimal(amountDue)} strong />
        <Divider />
        <Row label="M-Pesa number" value={masked} />
        <Row label="Items" value={`${cart.summary.itemCount} · ${cart.summary.unitCount} units`} />
      </Card>

      {/* Balance-specific escape hatch */}
      {reason === 'balance' ? (
        <Card variant="tinted" padding={spacing.lg} style={styles.splitCard}>
          <Txt variant="label">Short on balance?</Txt>
          <Txt variant="caption" color="onSurfaceVariant">
            Pay part now and the remainder to the rider on delivery. The pharmacist still releases Rx items only
            once the full amount clears.
          </Txt>
          <Button label="Pay on Delivery instead" size="sm" variant="outline" onPress={payOnDelivery} />
        </Card>
      ) : null}

      {exhausted ? (
        <Card variant="flat" padding={spacing.lg} style={styles.helperCard}>
          <Icon name="alert" size={16} color="warningDeep" />
          <Txt variant="caption" tint={colors.warningDeep} style={styles.helperText}>
            Three attempts have been made on this order. For your security, try another payment method or contact
            Xana Plus Syokimau Dispatch on +254 20 765 4321.
          </Txt>
        </Card>
      ) : null}

      {/* Instructions, so a retry succeeds */}
      <Txt variant="overline" color="onSurfaceVariant" style={styles.instructionsHead}>
        WHEN THE PROMPT ARRIVES
      </Txt>
      <Card variant="elevated" padding={spacing.lg} style={styles.instructions}>
        {['Unlock your phone', 'Enter your 4-digit M-Pesa PIN', `Press OK to complete ${formatKesDecimal(amountDue)} payment`].map(
          (step, index) => (
            <View key={step} style={styles.step}>
              <View style={styles.stepIndex}>
                <Txt variant="micro" color="primary">
                  {index + 1}
                </Txt>
              </View>
              <Txt variant="bodySm" color="onSurfaceVariant" style={styles.stepText}>
                {step}
              </Txt>
            </View>
          ),
        )}
      </Card>

      {/* Slot hold — urgency without threat */}
      <View style={styles.hold}>
        <Icon name="clock" size={14} color="primaryContainer" />
        <Txt variant="caption" color="onSurfaceVariant" style={styles.holdText}>
          {holdLeft > 0
            ? `Your 9:00 AM to 11:00 AM delivery slot is held for ${holdMinutes} more ${holdMinutes === 1 ? 'minute' : 'minutes'}.`
            : 'Your delivery slot has been released. You can pick a new one at checkout.'}
        </Txt>
      </View>
    </Screen>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Txt variant="bodySm" color="onSurfaceVariant" numberOfLines={1} style={styles.rowLabel}>
        {label}
      </Txt>
      <Txt variant={strong ? 'titleLg' : 'label'}>{value}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xxl },

  hero: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.sm },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.amberTint15,
    alignItems: 'center',
    justifyContent: 'center',
  },

  reasonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  helperCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  helperText: { flex: 1 },

  amountCard: { gap: spacing.sm, marginTop: spacing.sm },
  amountHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingVertical: spacing.xs },
  rowLabel: { flex: 1 },

  splitCard: { gap: spacing.sm, alignItems: 'flex-start' },

  instructionsHead: { marginTop: spacing.sm },
  instructions: { gap: spacing.md },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  stepIndex: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { flex: 1 },

  hold: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  holdText: { flex: 1 },

  footer: { gap: spacing.sm },
  trust: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
});
