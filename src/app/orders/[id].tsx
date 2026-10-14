import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

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
import { productById } from '@/data/catalog';
import type { SubstitutionPreference } from '@/data/types';
import { RateOrder } from '@/features/orders/rate-order';
import { formatKes, formatKesDecimal } from '@/lib/format';
import { unitPrice } from '@/store/cart';
import { isActiveOrder, isCompleted, ORDER_PAYMENT_LABEL, paymentNote, stagesFor } from '@/lib/order-status';
import { useOrders } from '@/store/orders';
import { radius, spacing } from '@/theme';
import { useThemeStyles } from '@/theme/provider';
import type { Palette } from '@/theme';

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
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orderById, resolveSubstitution, advanceStatus } = useOrders();
  const order = orderById(String(id));

  const [sheetOpen, setSheetOpen] = useState(false);
  const [choice, setChoice] = useState<SubstitutionPreference>('similar');

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/orders'));

  if (!order) {
    return (
      <Screen padded>
        <TopBar title="Order" onBack={goBack} />
        <EmptyState icon="delivery" title="Order not found" description="This order is no longer available.">
          <Button label="Back to my orders" onPress={() => router.replace('/orders')} />
        </EmptyState>
      </Screen>
    );
  }

  const stages = stagesFor(order);
  const stage = stages.findIndex(s => s.status === order.status);
  const pickup = order.fulfilment === 'pickup';
  const completed = isCompleted(order.status);
  const moneyNote = paymentNote(order);
  // Saved orders (app or website) carry isTest; only the demo's sample baskets don't.
  const sample = order.isTest === undefined;
  const blockedProduct = order.substitutionNeeded ? productById(order.substitutionNeeded.productId) : undefined;

  const confirmSubstitution = () => {
    resolveSubstitution(order.id, choice);
    setSheetOpen(false);
  };

  return (
    <Screen padded contentStyle={styles.content}>
      <TopBar title={`Order #${order.id}`} subtitle={`${order.placed} · ${order.storeName}`} onBack={goBack} />

      {/* Fulfilment tracker */}
      <Card variant="elevated" padding={spacing.lg} style={styles.card}>
        <View style={styles.trackerHead}>
          <Txt variant="overline" color="onSurfaceVariant">
            LIVE FULFILMENT
          </Txt>
          <Badge
            label={completed ? 'Complete' : order.status === 'cancelled' ? 'Cancelled' : order.status === 'awaiting-payment' ? 'Awaiting payment' : 'Active'}
            tone={completed ? 'fresh' : order.status === 'cancelled' ? 'neutral' : order.status === 'awaiting-payment' ? 'warning' : 'info'}
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
                  ? 'This order was cancelled. Any Xana Club points you used have been returned.'
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
        {!sample ? (
          isActiveOrder(order.status) ? (
            <Txt variant="caption" color="onSurfaceVariant">
              {pickup ? 'This updates by itself as the branch gets your order ready.' : 'This updates by itself as the branch packs and sends your order.'}
            </Txt>
          ) : null
        ) : order.status !== 'delivered' ? (
          <Button label="Advance status (demo)" size="sm" variant="ghost" onPress={() => advanceStatus(order.id)} />
        ) : null}
      </Card>

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
          value={ORDER_PAYMENT_LABEL[order.paymentMethod] ?? 'Card'}
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
                <Txt variant="label">{formatKes(paid * line.quantity)}</Txt>
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
        <Line label="Total paid" value={formatKesDecimal(order.summary.total)} strong />
        <View style={styles.points}>
          <Icon name="sparkle" size={14} color="primaryAccent" />
          <Txt variant="caption" color="onSurfaceVariant" style={styles.pointsText}>
            {order.pointsEarned} points credited to your Xana Club balance
          </Txt>
        </View>
      </Card>

      {completed ? <RateOrder orderNo={order.id} pickup={pickup || order.slotLabel.startsWith('Pickup')} /> : null}

      {completed ? (
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
        onPress={() => router.push('/(tabs)/profile')}
        style={styles.help}
      />

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
