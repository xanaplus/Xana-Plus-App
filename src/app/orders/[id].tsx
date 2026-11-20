import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import {
  Badge,
  BottomSheet,
  Button,
  Card,
  Divider,
  EmptyState,
  Icon,
  SectionHeader,
  SelectableOption,
  Screen,
  TopBar,
  Txt,
} from '@/components/ui';
import { productById, stores } from '@/data/catalog';
import { PHARMACY_CONTACTS } from '@/data/pharmacy-contacts';
import type { SubstitutionPreference } from '@/data/types';
import { RateOrder } from '@/features/orders/rate-order';
import { OrderPlaced } from '@/features/orders/order-placed';
import { formatKes, formatKesDecimal } from '@/lib/format';
import { unitPrice } from '@/store/cart';
import { cancelNote, isCompleted, isRxPending, ORDER_PAYMENT_LABEL, paymentNote, stagesFor } from '@/lib/order-status';
import { useOrders } from '@/store/orders';
import { radius, spacing } from '@/theme';
import { useThemeStyles } from '@/theme/provider';
import type { Palette } from '@/theme';
import { LAUNCH_SCOPE } from '@/lib/launch-scope';
import { checkPayment, payMessage, payOnline, sendMpesaPrompt } from '@/lib/dpo';
import { formatPhoneDisplay } from '@/features/auth/auth-sheet';
import { useFulfilment } from '@/store/fulfilment';

/** After DPO's page: ask every 5 s for 3 minutes, then every 20 s (as the website's order page). */
const FAST_CHECKS = 36;

/**
 * Screens 09a / 09b — Order Status, with the Substitution Resolution sheet
 * (09c–09e) attached. One screen covers every stage; the stepper and the sheet
 * both read from the live order record.
 */

const SUBSTITUTION_OPTIONS: { value: SubstitutionPreference; title: string; description: string }[] = [
  {
    value: 'similar',
    title: 'Replace with similar',
    description: 'Your shopper picks the closest brand or size of equal or greater value, at no extra cost.',
  },
  {
    value: 'refund',
    title: 'Refund this item',
    description: 'We remove the item and refund its value to your M-Pesa line through a credit note.',
  },
  {
    value: 'call',
    title: 'Call me first',
    description: 'Your shopper calls you before replacing or removing anything.',
  },
];

export default function OrderStatusScreen() {
  const styles = useThemeStyles(createStyles);
  const router = useRouter();
  const { id, placed, pay } = useLocalSearchParams<{ id: string; placed?: string; pay?: string }>();
  const { orderById, resolveSubstitution, advanceStatus, confirmApproved, applyPayment } = useOrders();
  const order = orderById(String(id));

  // Paying online (DPO): open the page, then ask the dpo function until the order is paid.
  const awaitingOnline = order?.paymentMethod === 'dpo' && order.status === 'awaiting-payment';
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [amountDue, setAmountDue] = useState<number | null>(null);
  const [checks, setChecks] = useState(0);
  const autoPaid = useRef(false);

  // M-Pesa straight to the phone (no DPO page). Card and Airtel still use DPO's page.
  const { mpesaNumber, store: chosenStore } = useFulfilment();
  const [helpOpen, setHelpOpen] = useState(false);
  const [prompting, setPrompting] = useState(false);
  const [promptSent, setPromptSent] = useState<{ instructions: string | null } | null>(null);
  // DPO allows one prompt every 30 seconds: count down before "Send again".
  const [resendIn, setResendIn] = useState(0);
  useEffect(() => {
    if (!resendIn) return;
    const tick = setTimeout(() => setResendIn(left => left - 1), 1000);
    return () => clearTimeout(tick);
  }, [resendIn]);

  const sendPrompt = async () => {
    if (!order) return;
    setPrompting(true);
    setPayError(null);
    const result = await sendMpesaPrompt(order.id, mpesaNumber);
    setPrompting(false);
    if (!result.ok) {
      setPayError(payMessage(result.error));
      return;
    }
    if (result.data.sent) {
      setPromptSent({ instructions: result.data.instructions ?? null });
      setResendIn(30);
    }
    setChecking(true);
    setChecks(0);
  };

  const startPayment = async () => {
    if (!order) return;
    setPaying(true);
    setPayError(null);
    const failed = await payOnline(order.id);
    setPaying(false);
    if (failed) setPayError(payMessage(failed));
    else {
      setChecking(true);
      setChecks(0);
    }
  };

  // Straight from checkout: open DPO's page once.
  useEffect(() => {
    if ((pay === '1' || pay === 'mpesa') && awaitingOnline && !autoPaid.current) {
      autoPaid.current = true;
      // From checkout with an M-Pesa number: send the prompt; otherwise open DPO's page.
      const viaPrompt = pay === 'mpesa' && !!mpesaNumber;
      void Promise.resolve().then(() => (viaPrompt ? sendPrompt() : startPayment()));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pay, awaitingOnline]);

  // While the order waits for an online payment, ask the dpo function (which asks DPO).
  useEffect(() => {
    const orderNo = order?.id;
    if (!awaitingOnline || paying || !orderNo) return;
    const timer = setTimeout(async () => {
      const result = await checkPayment(orderNo);
      if (result.ok) {
        setAmountDue(result.data.amountDue);
        applyPayment(orderNo, result.data);
        if (result.data.paymentStatus !== 'pending') setChecking(false);
      }
      setChecks(count => count + 1);
    }, checks === 0 ? 0 : checks < FAST_CHECKS ? 5_000 : 20_000);
    return () => clearTimeout(timer);
  }, [awaitingOnline, paying, checks, order?.id, applyPayment]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [choice, setChoice] = useState<SubstitutionPreference>('similar');
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/orders'));

  if (!order) {
    return (
      <Screen padded>
        <TopBar title="Order" onBack={goBack} />
        <EmptyState icon="delivery" title="Order not found">
          <Button label="Back to my orders" onPress={() => router.replace('/orders')} />
        </EmptyState>
      </Screen>
    );
  }

  const stages = stagesFor(order);
  const stage = stages.findIndex(s => s.status === order.status);
  const pickup = order.fulfilment === 'pickup';
  const completed = isCompleted(order.status);
  const moneyNote = awaitingOnline ? null : paymentNote(order);
  const payAmount = amountDue ?? order.summary.total;
  // The branch that has the order (saved as e.g. "RUIRU" or "Xana Plus Ruiru"); else the shopper's chosen store.
  const orderStore = stores.find(entry => order.storeName.toLowerCase().includes(entry.id)) ?? chosenStore;
  // Prescription orders go to that branch's pharmacy line, not the shop.
  const pharmacyLine = PHARMACY_CONTACTS.find(contact => contact.storeId === orderStore.id) ?? PHARMACY_CONTACTS[0];
  // Saved orders (app or website) carry isTest; only the demo's sample baskets don't.
  const sample = order.isTest === undefined;
  const blockedProduct = order.substitutionNeeded ? productById(order.substitutionNeeded.productId) : undefined;

  const rxPending = isRxPending(order.status);
  const whyCancelled = cancelNote(order);

  const confirmOrder = async () => {
    setConfirming(true);
    setConfirmError(await confirmApproved(order.id));
    setConfirming(false);
  };

  const confirmSubstitution = () => {
    resolveSubstitution(order.id, choice);
    setSheetOpen(false);
  };

  return (
    <Screen padded contentStyle={styles.content}>
      <TopBar title={`Order #${order.id}`} subtitle={`${order.placed} · ${order.storeName}`} onBack={goBack} />

      {/* Straight after M-Pesa checkout: the same "order placed" moment as the cash and card sheet. */}
      {placed === '1' ? (
        <Card variant="elevated" padding={spacing.lg} style={styles.card}>
          <OrderPlaced points={order.pointsEarned} />
          <Txt variant="headlineSm" align="center">
            Order placed
          </Txt>
        </Card>
      ) : null}

      {/* Fulfilment tracker */}
      <Card variant="elevated" padding={spacing.lg} style={styles.card}>
        <View style={styles.trackerHead}>
          <Txt variant="overline" color="onSurfaceVariant">
            LIVE FULFILMENT
          </Txt>
          <Badge
            label={
              completed ? 'Complete'
                : order.status === 'cancelled' ? 'Cancelled'
                  : order.status === 'awaiting-payment' ? 'Awaiting payment'
                    : order.status === 'awaiting-approval' ? 'With the pharmacist'
                      : order.status === 'approved' ? 'Please confirm'
                        : 'Active'
            }
            tone={completed ? 'fresh' : order.status === 'cancelled' ? 'neutral' : order.status === 'awaiting-payment' || rxPending ? 'warning' : 'info'}
          />
        </View>

        <View style={styles.stepper}>
          {stages.map((s, index) => {
            const done = index <= stage;
            const current = index === stage;
            return (
              <View key={s.status} style={styles.step}>
                <View style={styles.stepTop}>
                  {index > 0 ? <View style={[styles.connector, done ? styles.connectorDone : null]} /> : <View style={styles.connectorSpacer} />}
                  <View style={[styles.dot, done ? styles.dotDone : null, current ? styles.dotCurrent : null]}>
                    {done ? <Icon name="check" size={10} color="onPrimary" /> : null}
                  </View>
                  {index < stages.length - 1 ? (
                    <View style={[styles.connector, index < stage ? styles.connectorDone : null]} />
                  ) : (
                    <View style={styles.connectorSpacer} />
                  )}
                </View>
                <Txt variant="caption" align="center" color={current ? 'primaryAccent' : 'onSurfaceVariant'} numberOfLines={2}>
                  {s.label}
                </Txt>
              </View>
            );
          })}
        </View>

        <View style={styles.eta}>
          <Icon name={pickup ? 'store' : 'delivery'} size={16} color="primaryAccent" />
          <Txt variant="bodySm" style={styles.etaText}>
            {order.status === 'delivered'
              ? 'Delivered. Thank you for shopping with Xana Life.'
              : order.status === 'collected'
                ? 'Collected. Thank you for shopping with Xana Life.'
                : order.status === 'cancelled'
                  ? `${whyCancelled ? `${whyCancelled} ` : ''}This order was cancelled. Any Xana Club points you used have been returned.`
                  : order.status === 'awaiting-approval'
                    ? 'A pharmacist is checking your prescription and will set the quantities. We will text you when it is done.'
                  : order.status === 'approved'
                    ? `Approved by the pharmacist. Check the items and total below, then confirm${order.expiresAt ? ` by ${formatDeadline(order.expiresAt)}` : ' within 48 hours'}.`
                  : order.status === 'awaiting-payment'
                    ? 'Awaiting payment. We start on your order once it is paid.'
                    : order.status === 'ready'
                      ? `Ready to collect at ${order.storeName}.`
                      : `${stages[Math.max(0, stage)].label} · ${order.slotLabel}`}
          </Txt>
        </View>

        {order.status === 'ready' && order.collectionCode ? (
          <View style={styles.eta}>
            <Icon name="check" size={16} color="primaryAccent" />
            <Txt variant="bodySm" style={styles.etaText}>
              {`Collection code: ${order.collectionCode}. Show it at the counter.`}
            </Txt>
          </View>
        ) : null}

        {moneyNote ? (
          <Txt variant="caption" color="onSurfaceVariant">
            {moneyNote}
          </Txt>
        ) : null}

        {/* Saved orders are moved along by the branch in Staff tools; only the sample orders advance here. */}
        {sample && order.status !== 'delivered' ? (
          <Button label="Advance status (demo)" size="sm" variant="ghost" onPress={() => advanceStatus(order.id)} />
        ) : null}
      </Card>

      {/* Paying online: the website's words (assets/order-rules.js), with Pay now / Pay again. */}
      {awaitingOnline ? (
        <Card variant="elevated" padding={spacing.lg} style={styles.alertCard}>
          <View style={styles.alertHead}>
            <Icon name="lock" size={16} color="primaryAccent" />
            <Txt variant="label">{checking && order.paymentStatus === 'pending' ? 'Checking your payment with DPO…' : 'Waiting for payment'}</Txt>
          </View>
          <Txt variant="caption" color="onSurfaceVariant">
            {`${order.paymentStatus === 'failed' ? 'Your last payment did not go through. ' : ''}Pay ${formatKesDecimal(payAmount)} online${order.expiresAt ? ` by ${formatDeadline(order.expiresAt)}` : ''} to confirm your order. We hold the items until then.`}
          </Txt>
          {promptSent && order.paymentStatus === 'pending' ? (
            <View style={styles.promptBox}>
              <Txt variant="label">{`Check your phone: enter your M-Pesa PIN to pay ${formatKesDecimal(payAmount)}`}</Txt>
              <Txt variant="caption" color="onSurfaceVariant">
                {`Prompt sent to ${formatPhoneDisplay(mpesaNumber)}. This page updates by itself once you pay.`}
              </Txt>
              {promptSent.instructions ? (
                <Txt variant="caption" color="onSurfaceVariant">
                  {promptSent.instructions}
                </Txt>
              ) : null}
            </View>
          ) : null}
          {payError ? (
            <Txt variant="caption" color="error">
              {payError}
            </Txt>
          ) : null}
          {mpesaNumber ? (
            <Button
              label={
                promptSent
                  ? resendIn
                    ? `Send the M-Pesa prompt again (${resendIn}s)`
                    : 'Send the M-Pesa prompt again'
                  : `Pay ${formatKesDecimal(payAmount)} with M-Pesa`
              }
              icon="mpesa"
              iconPosition="leading"
              loading={prompting}
              disabled={paying || resendIn > 0}
              variant={promptSent ? 'secondary' : 'primary'}
              onPress={() => void sendPrompt()}
            />
          ) : null}
          <Button
            label={mpesaNumber ? 'Pay by card or Airtel Money' : order.paymentStatus === 'failed' ? 'Pay again' : `Pay ${formatKesDecimal(payAmount)} now`}
            icon="lock"
            iconPosition="leading"
            loading={paying}
            disabled={prompting}
            variant={mpesaNumber ? 'ghost' : 'primary'}
            onPress={() => void startPayment()}
          />
        </Card>
      ) : null}

      {/* The pharmacist approved: the customer accepts the quantities and total. */}
      {order.status === 'approved' ? (
        <Card variant="elevated" padding={spacing.lg} style={styles.alertCard}>
          <View style={styles.alertHead}>
            <Icon name="prescription" size={16} color="primaryAccent" />
            <Txt variant="label">{`Approved · ${formatKesDecimal(order.summary.total)}`}</Txt>
          </View>
          {order.pharmacistNote ? (
            <Txt variant="caption" color="onSurfaceVariant">
              {`Pharmacist's note: ${order.pharmacistNote}`}
            </Txt>
          ) : null}
          <Txt variant="caption" color="onSurfaceVariant">
            {order.fulfilment === 'pickup'
              ? `Confirm and the branch prepares your order. You pay at the counter at ${order.storeName}.`
              : 'Confirm and we start on your order.'}
          </Txt>
          {confirmError ? (
            <Txt variant="caption" color="error">
              {confirmError}
            </Txt>
          ) : null}
          <Button label="Confirm order" icon="check" iconPosition="leading" loading={confirming} onPress={() => void confirmOrder()} />
        </Card>
      ) : null}

      {/* Substitution request */}
      {order.substitutionNeeded ? (
        <Card variant="elevated" padding={spacing.lg} style={styles.alertCard}>
          <View style={styles.alertHead}>
          <Icon name="info" size={16} color="secondaryAccent" />
            <Txt variant="label">{order.substitutionNeeded.held ? 'Item on hold' : 'Substitution needed'}</Txt>
          </View>
          <Txt variant="caption" color="onSurfaceVariant">
            {blockedProduct ? `${blockedProduct.name}: ` : ''}
            {order.substitutionNeeded.shopperNote}
          </Txt>
          {order.substitutionNeeded.held ? (
            <Txt variant="caption" color="onSurfaceVariant">
              {"We couldn't reach you, so we're holding this item. Nothing is replaced or removed until you choose."}
            </Txt>
          ) : null}
          <Button label={order.substitutionNeeded.held ? 'Choose now' : 'Resolve'} size="sm" onPress={() => setSheetOpen(true)} />
        </Card>
      ) : null}

      {/* Delivery details */}
      <SectionHeader title={pickup ? 'Pickup' : 'Delivery'} style={styles.sectionHead} />
      <Card variant="elevated" padding={spacing.lg} style={styles.card}>
        <Row icon="store" label={pickup ? 'Branch' : 'Address'} value={order.addressLine} note={`${order.contact} · ${order.storeName}`} />
        <Divider />
        <Row icon="delivery" label="Slot" value={order.slotLabel} />
        <Divider />
        <Row
          icon="mpesa"
          label="Payment"
          value={order.paymentMethod === 'cod' && pickup ? ORDER_PAYMENT_LABEL.counter : ORDER_PAYMENT_LABEL[order.paymentMethod] ?? 'Card'}
          note={order.paymentReference ? `Ref: ${order.paymentReference}` : undefined}
        />
      </Card>

      {/* Items */}
      <SectionHeader title={`Items (${order.summary.itemCount})`} style={styles.sectionHead} />
      <Card variant="elevated" padding={spacing.lg} style={styles.card}>
        {order.lines.map((line, index) => {
          const product = productById(line.productId);
          if (!product) return null;
          const paid = unitPrice(product, line.quantity);
          const unavailable = order.substitutionNeeded?.productId === product.id;
          return (
            <View key={product.id}>
              {index === 0 ? null : <Divider />}
              <View style={styles.itemRow}>
                <View style={styles.itemText}>
                  <Txt variant="label" numberOfLines={1}>
                    {product.name}
                  </Txt>
                  <Txt variant="caption" color="onSurfaceVariant" numberOfLines={1}>
                    {product.pack} · Qty {line.quantity}
                  </Txt>
                  {unavailable ? <Badge label="Out of stock" tone="warning" /> : null}
                </View>
                {/* Saved lines keep what was charged (a pharmacist's approval re-prices them); samples work it out. */}
                <Txt variant="label">{formatKes(line.lineTotal ?? paid * line.quantity)}</Txt>
              </View>
            </View>
          );
        })}
      </Card>

      {/* Charges */}
      <SectionHeader title="Payment & charges" style={styles.sectionHead} />
      <Card variant="elevated" padding={spacing.lg} style={styles.card}>
        <Line label="Items subtotal" value={formatKesDecimal(order.summary.itemsSubtotal)} />
        <Line label={`${pickup ? 'Pickup' : 'Delivery'} (${order.storeName})`} value={order.summary.deliveryFee === 0 ? 'Free' : formatKesDecimal(order.summary.deliveryFee)} />
        {order.summary.promoDiscount ? (
          <Line label={`Promo code${order.summary.promoCode ? ` (${order.summary.promoCode})` : ''}`} value={`− ${formatKesDecimal(order.summary.promoDiscount)}`} tint />
        ) : null}
        {order.summary.wholesaleSavings > 0 ? (
          <Line label="Club member savings" value={`− ${formatKesDecimal(order.summary.wholesaleSavings)}`} tint />
        ) : null}
        <Divider />
        <Line label={order.paymentStatus === 'paid' ? 'Total paid' : 'Total'} value={formatKesDecimal(order.summary.total)} strong />
        {/* Points are added when the order is completed, not when it is placed. */}
        {order.pointsEarned > 0 ? (
          <View style={styles.points}>
            <Icon name="sparkle" size={14} color="primaryAccent" />
            <Txt variant="caption" color="onSurfaceVariant" style={styles.pointsText}>
              {completed
                ? `${order.pointsEarned} points earned with this order`
                : `You'll earn ${order.pointsEarned} points when this order is completed`}
            </Txt>
          </View>
        ) : null}
      </Card>

      {/* The KRA verification link, once the order is signed for real (the same link as the receipt QR). */}
      {order.kraReceiptUrl ? (
        <Button
          label="View KRA receipt"
          variant="outline"
          icon="receipt"
          iconPosition="leading"
          onPress={() => void Linking.openURL(order.kraReceiptUrl!)}
          style={styles.help}
        />
      ) : null}

      {/* Ratings reach no one until the admin app shows them (LAUNCH_SCOPE.orderFeedback). */}
      {completed && LAUNCH_SCOPE.orderFeedback ? <RateOrder orderNo={order.id} pickup={pickup || order.slotLabel.startsWith('Pickup')} /> : null}

      {/* Returns wait for the admin site's Returns screen; until then customers return at the counter. */}
      {completed && LAUNCH_SCOPE.returns ? (
        <Button
          label="Request a return"
          variant="outline"
          icon="refresh"
          iconPosition="leading"
          onPress={() => router.push({ pathname: '/orders/return', params: { id: order.id } })}
          style={styles.help}
        />
      ) : null}

      <Button
        label="Need help with this order?"
        variant="outline"
        onPress={() => setHelpOpen(true)}
        style={styles.help}
      />

      {/* Help goes to the branch that has the order (Amazon-style "Get help with order"), not the account page. */}
      <BottomSheet
        visible={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="Help with this order"
        description={`Have your order number ready: ${order.id}`}
      >
        <View style={styles.sheetBody}>
          <Button
            label={order.prescription ? `Call the ${pharmacyLine.name} pharmacy` : `Call ${orderStore.name}`}
            icon="phone"
            iconPosition="leading"
            fullWidth
            onPress={() => void Linking.openURL(`tel:${(order.prescription ? pharmacyLine.phone : orderStore.phone).replace(/\s+/g, '')}`)}
          />
          {order.prescription ? (
            <Button
              label="WhatsApp the pharmacist"
              icon="whatsapp"
              iconPosition="leading"
              variant="outline"
              fullWidth
              onPress={() => {
                const text = `Hello Xana Pharmacy, I need help with my order ${order.id}.`;
                void Linking.openURL(`https://wa.me/${pharmacyLine.wa}?text=${encodeURIComponent(text)}`);
              }}
            />
          ) : null}
          <Txt variant="caption" color="onSurfaceVariant">
            {order.prescription ? `Pharmacy: ${pharmacyLine.phone}` : `${orderStore.name} is open ${orderStore.hours}.`}
          </Txt>
        </View>
      </BottomSheet>

      <BottomSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Substitution Resolution"
        description={
          blockedProduct
            ? `${blockedProduct.name}: ${order.substitutionNeeded?.shopperNote ?? ''}`
            : order.substitutionNeeded?.shopperNote
        }
        footer={<Button label="Confirm choice" size="lg" fullWidth onPress={confirmSubstitution} />}
      >
        <View style={styles.sheetBody}>
          {SUBSTITUTION_OPTIONS.map(option => (
            <SelectableOption
              key={option.value}
              title={option.title}
              description={option.description}
              selected={choice === option.value}
              onPress={() => setChoice(option.value)}
              indicator="radio"
            />
          ))}
        </View>
      </BottomSheet>
    </Screen>
  );
}

/** `2026-10-31T11:05:00Z` → `Sat 31 Oct, 2:05 pm`, in the phone's own time zone. */
function formatDeadline(iso: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const time = date.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${day}, ${time}`;
}

function Row({ icon, label, value, note }: { icon: 'store' | 'delivery' | 'mpesa'; label: string; value: string; note?: string }) {
  const styles = useThemeStyles(createStyles);
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <Icon name={icon} size={16} color="primaryAccent" />
      </View>
      <View style={styles.detailText}>
        <Txt variant="caption" color="onSurfaceVariant">
          {label}
        </Txt>
        <Txt variant="bodySm" numberOfLines={2}>
          {value}
        </Txt>
        {note ? (
          <Txt variant="caption" color="onSurfaceVariant" numberOfLines={1}>
            {note}
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

function Line({ label, value, strong, tint }: { label: string; value: string; strong?: boolean; tint?: boolean }) {
  const styles = useThemeStyles(createStyles);
  return (
    <View style={styles.line}>
      <Txt variant={strong ? 'label' : 'bodySm'} color={strong ? 'onSurface' : 'onSurfaceVariant'} numberOfLines={1} style={styles.lineLabel}>
        {label}
      </Txt>
      <Txt variant="label" color={tint ? 'primaryAccent' : 'onSurface'}>
        {value}
      </Txt>
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.giant },
  card: { gap: spacing.md },
  sectionHead: { marginTop: spacing.sm },

  trackerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepper: { flexDirection: 'row', alignItems: 'flex-start' },
  step: { flex: 1, gap: spacing.sm },
  stepTop: { flexDirection: 'row', alignItems: 'center' },
  connector: { flex: 1, height: 2, backgroundColor: colors.surfaceContainerHigh },
  connectorDone: { backgroundColor: colors.primaryAccent },
  connectorSpacer: { flex: 1 },
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
  dotCurrent: { borderColor: colors.primaryAccent },

  eta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  etaText: { flex: 1 },

  alertCard: { gap: spacing.sm, borderWidth: 1, borderColor: colors.mintEdge },
  alertHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  promptBox: { gap: spacing.xs, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceContainerHigh },

  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.sm },
  detailIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailText: { flex: 1, gap: spacing.xxs },

  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  itemText: { flex: 1, gap: spacing.xxs, alignItems: 'flex-start' },

  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingVertical: spacing.xs },
  lineLabel: { flex: 1 },
  points: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  pointsText: { flex: 1 },

  help: { marginTop: spacing.sm },
  sheetBody: { gap: spacing.md },
});
