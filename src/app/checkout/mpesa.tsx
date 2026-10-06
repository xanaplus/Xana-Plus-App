import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Icon, ProgressBar, Screen, TopBar, Txt } from '@/components/ui';
import { formatKesDecimal } from '@/lib/format';
import { placeOrderErrorMessage, useOrders } from '@/store/orders';
import { useCart } from '@/store/cart';
import { useFulfilment } from '@/store/fulfilment';
import { useSession } from '@/store/session';
import { colors, gradients, layout, radius, spacing } from '@/theme';

/** Seconds an M-Pesa STK prompt stays live before it has to be re-sent. */
const STK_WINDOW_SECONDS = 60;

/** Matches the redemption rate on the checkout points panel: 10 pts = KES 1. */
const POINTS_PER_KES = 10;

/** `+254 712 345 678` → `+254 712 ••• •78` — the masked line shown on Screen 6b. */
const maskPhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '').replace(/^254/, '').replace(/^0/, '');
  return `+254 ${digits.slice(0, 3)} ••• •${digits.slice(-2)}`;
};

/**
 * Screen 6b — Checkout (M-Pesa STK Push Pending). The prompt is live until the
 * shopper confirms, resends it or walks back to pick another payment method.
 */
export default function MpesaPendingRoute() {
  const router = useRouter();
  const cart = useCart();
  const fulfilment = useFulfilment();
  const session = useSession();
  const { mpesaNumber } = fulfilment;
  const { placeOrder } = useOrders();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(STK_WINDOW_SECONDS);
  const [attempt, setAttempt] = useState(1);

  const pointsUsed = Math.min(fulfilment.pointsRedeemed, session.user?.clubPoints ?? 0);
  const amountDue = Math.max(0, cart.summary.total - (fulfilment.promo?.discount ?? 0) - pointsUsed / POINTS_PER_KES);

  useEffect(() => {
    const timer = setInterval(() => setSecondsLeft(previous => (previous > 0 ? previous - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, []);

  const expired = secondsLeft === 0;
  const steps = [
    'Unlock your phone',
    'Enter your 4-digit M-Pesa PIN',
    `Press OK to complete ${formatKesDecimal(amountDue)} payment`,
  ];

  /** Back to checkout without touching the basket — the shopper can switch method. */
  const cancel = () => router.replace('/checkout');

  /** Hands off to the recovery screen when the prompt is not completed. */
  const reportFailure = (reason: 'timeout' | 'cancelled') =>
    router.replace({ pathname: '/checkout/failed', params: { reason, attempt: String(attempt) } });

  /** Saves the order, empties the basket and opens live tracking. */
  const confirm = async () => {
    if (cart.items.some(item => item.product.rxRequired)) {
      setSaveError('Prescription medicines must be ordered from the pharmacist’s quote in My prescriptions. No payment has been collected.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    const result = await placeOrder({
      lines: cart.items.map(i => ({ productId: i.product.id, quantity: i.quantity })),
      paymentMethod: 'mpesa',
      contact: fulfilment.address.contact,
      addressLine: fulfilment.address.line,
      slotLabel: fulfilment.slot.label,
      storeName: fulfilment.store.name,
      substitution: cart.substitution,
      pointsRedeemed: pointsUsed,
      ageConfirmed: fulfilment.ageConfirmed,
      rxSupplied: false,
      rxReference: fulfilment.rxReference || undefined,
      promoCode: fulfilment.promo?.code,
    });
    setSaving(false);
    if (!result.ok) {
      // A code that stopped working comes off, so the amount above is right on the next try.
      if (result.error.startsWith('promo_')) fulfilment.setPromo(null);
      setSaveError(placeOrderErrorMessage(result.error));
      return;
    }
    cart.clear();
    session.spendPoints(pointsUsed);
    fulfilment.setPointsRedeemed(0);
    fulfilment.setPromo(null);
    fulfilment.setAgeConfirmed(false);
    fulfilment.setRxReference('');
    router.replace(`/orders/${result.id}`);
  };

  return (
    <Screen
      padded={false}
      contentStyle={styles.content}
      footer={
        <View style={styles.footer}>
          <Button
            label={`I've paid · ${formatKesDecimal(amountDue)}`}
            icon="check-circle"
            iconPosition="leading"
            size="lg"
            loading={saving}
            disabled={saving}
            onPress={confirm}
          />
          {saveError ? (
            <Txt variant="caption" tint={colors.error} align="center">
              {saveError}
            </Txt>
          ) : null}
          <Button
            label={expired ? 'The prompt expired. Get help' : "Payment didn't go through"}
            variant="outline"
            onPress={() => reportFailure(expired ? 'timeout' : 'cancelled')}
          />
          <View style={styles.trust}>
            <Icon name="lock" size={12} color="outline" />
            <Txt variant="caption" color="onSurfaceVariant">
              256-bit Encrypted · Instant M-Pesa Prompt
            </Txt>
          </View>
        </View>
      }
    >
      <TopBar title="M-Pesa Payment" onBack={cancel} />

      <LinearGradient colors={gradients.mpesa} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.panel}>
        <View style={styles.brandPill}>
          <View style={styles.brandDot} />
          <Txt variant="labelSm" color="primary">
            Xana Pay via M-Pesa
          </Txt>
        </View>

        <View style={styles.glyph}>
          <Icon name="mpesa" size={34} color="primaryContainer" />
        </View>

        <View style={styles.heading}>
          <Txt variant="headlineLg" align="center">
            Check your phone
          </Txt>
          <Txt variant="bodySm" color="onSurfaceVariant" align="center">
            An STK push PIN prompt has been sent to:
          </Txt>
        </View>

        <View style={styles.phonePill}>
          <Icon name="phone" size={14} color="onSurfaceVariant" />
          <Txt variant="title" color="onSurfaceVariant">
            {maskPhone(mpesaNumber)}
          </Txt>
        </View>

        <View style={styles.statusCard}>
          <Icon name="clock" size={18} color="primaryContainer" />
          <View style={styles.flex}>
            <Txt variant="bodySm" color="onSurfaceVariant">
              {expired ? 'Prompt expired. Resend to try again.' : 'Waiting for confirmation...'}
            </Txt>
            <ProgressBar value={secondsLeft / STK_WINDOW_SECONDS} style={styles.progress} />
          </View>
          <View style={styles.statusRight}>
            <Txt variant="labelSm" color="primary" align="right">
              Xana Pay via M-Pesa
            </Txt>
            <Txt variant="caption" color="onSurfaceVariant" align="right">
              {`${secondsLeft}s`}
            </Txt>
          </View>
        </View>

        <View style={styles.instructions}>
          <Txt variant="overline" color="onSurfaceVariant">
            Instructions
          </Txt>
          <View style={styles.steps}>
            {steps.map((step, index) => (
              <View key={step} style={styles.step}>
                <View style={styles.stepIndex}>
                  <Txt variant="micro" color="primary">
                    {index + 1}
                  </Txt>
                </View>
                <Txt variant="bodySm" color="onSurfaceVariant" style={styles.flex}>
                  {step}
                </Txt>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.links}>
          <View style={styles.linkRow}>
            <Txt variant="bodySm" color="onSurfaceVariant">
              {"Didn't get the prompt?"}
            </Txt>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Resend M-Pesa prompt"
              hitSlop={8}
              onPress={() => {
                setAttempt(previous => previous + 1);
                setSecondsLeft(STK_WINDOW_SECONDS);
              }}
            >
              <Txt variant="label" color="primary">
                Resend
              </Txt>
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Change payment method" hitSlop={8} onPress={cancel}>
            <Txt variant="label" color="onSurfaceVariant">
              Change payment method
            </Txt>
          </Pressable>
        </View>
      </LinearGradient>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  flex: { flex: 1 },
  panel: {
    marginHorizontal: layout.screenMargin,
    padding: spacing.xl,
    borderRadius: radius.xxl,
    alignItems: 'center',
    gap: spacing.lg,
  },
  brandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.white95,
  },
  brandDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.primaryContainer },
  glyph: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.primaryContainer,
    backgroundColor: colors.white95,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: { gap: spacing.xs },
  phonePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.mintEdge,
    backgroundColor: colors.white95,
  },
  statusCard: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.mintEdge,
    backgroundColor: colors.white95,
  },
  progress: { marginTop: spacing.sm },
  statusRight: { alignItems: 'flex-end' },
  instructions: {
    alignSelf: 'stretch',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.mintEdge,
    backgroundColor: colors.white95,
  },
  steps: { gap: spacing.md },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  stepIndex: { width: 20, height: 20, borderRadius: radius.pill, backgroundColor: colors.mintSurface, alignItems: 'center', justifyContent: 'center' },
  links: { alignItems: 'center', gap: spacing.md },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  footer: { gap: spacing.sm },
  trust: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
});
