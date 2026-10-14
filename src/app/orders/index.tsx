import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  Icon,
  Screen,
  Segmented,
  TopBar,
  Txt,
  type BadgeTone,
  type SegmentedOption,
} from '@/components/ui';
import { productById } from '@/data/catalog';
import { formatKes } from '@/lib/format';
import { useCart } from '@/store/cart';
import { isActiveOrder, isCompleted, stagesFor, type OrderStatus } from '@/lib/order-status';
import { useOrders, type PlacedOrder } from '@/store/orders';
import { radius, spacing } from '@/theme';
import { useThemeStyles } from '@/theme/provider';
import type { Palette } from '@/theme';

/** Screen 10 — Order History: active, completed and cancelled orders, from the app and the website. */

type Filter = 'all' | 'active' | 'delivered' | 'cancelled';

const STATUS_META: Record<OrderStatus, { label: string; tone: BadgeTone }> = {
  'awaiting-payment': { label: 'Awaiting payment', tone: 'warning' },
  received: { label: 'Received', tone: 'warning' },
  shopping: { label: 'Shopper picking', tone: 'warning' },
  ready: { label: 'Ready to collect', tone: 'info' },
  collected: { label: 'Collected', tone: 'fresh' },
  'out-for-delivery': { label: 'Out for delivery', tone: 'info' },
  delivered: { label: 'Delivered', tone: 'fresh' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

export default function OrderHistoryScreen() {
  const styles = useThemeStyles(createStyles);
  const router = useRouter();
  const cart = useCart();
  const { orders, historyLoading, historyError, retryHistory } = useOrders();
  const [filter, setFilter] = useState<Filter>('all');

  const counts = useMemo(
    () => ({
      all: orders.length,
      active: orders.filter(o => isActiveOrder(o.status)).length,
      delivered: orders.filter(o => isCompleted(o.status)).length,
      cancelled: orders.filter(o => o.status === 'cancelled').length,
    }),
    [orders],
  );

  const options: SegmentedOption<Filter>[] = [
    { value: 'all', label: `All (${counts.all})` },
    { value: 'active', label: `Active (${counts.active})` },
    { value: 'delivered', label: `Completed (${counts.delivered})` },
  ];

  const visible = useMemo(() => {
    if (filter === 'active') return orders.filter(o => isActiveOrder(o.status));
    if (filter === 'delivered') return orders.filter(o => isCompleted(o.status));
    if (filter === 'cancelled') return orders.filter(o => o.status === 'cancelled');
    return orders;
  }, [orders, filter]);

  const reorder = (order: PlacedOrder) => {
    order.lines.forEach(line => cart.add(line.productId, line.quantity));
    router.push('/(tabs)/cart');
  };

  return (
    <Screen padded contentStyle={styles.content}>
      <TopBar
        title="My Orders"
        subtitle={`${orders.length} ${orders.length === 1 ? 'order' : 'orders'} · Xana Life`}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'))}
      />

      <Segmented options={options} value={filter} onChange={setFilter} style={styles.filter} />

      {historyLoading || historyError ? (
        <View
          accessibilityRole="summary"
          style={[styles.syncNotice, historyError ? styles.syncNoticeError : styles.syncNoticePending]}
        >
          <Icon name="info" size={18} color={historyError ? 'error' : 'primaryAccent'} />
          <View style={styles.syncNoticeBody}>
            <Txt variant="caption" color={historyError ? 'error' : 'onSurfaceVariant'}>
              {historyError
                ? `${historyError}${orders.length > 0 ? ' Saved orders are shown and may be out of date.' : ''}`
                : orders.length > 0
                  ? 'Updating your order history. Saved orders are shown and may be out of date.'
                  : 'Loading your order history…'}
            </Txt>
            {historyError ? (
              <Button label="Retry" size="sm" variant="outline" fullWidth={false} onPress={retryHistory} />
            ) : null}
          </View>
        </View>
      ) : null}

      {visible.length === 0 ? (
        orders.length === 0 && (historyLoading || historyError) ? null : (
          <EmptyState icon="delivery" title="No orders here" description="Orders you place will appear in this list.">
            <Button label="Start shopping" onPress={() => router.replace('/(tabs)')} />
          </EmptyState>
        )
      ) : (
        visible.map((order, index) => {
          // An unknown status from a newer server still shows, rather than breaking the list.
          const meta = STATUS_META[order.status] ?? { label: String(order.status), tone: 'neutral' as BadgeTone };
          const isActive = isActiveOrder(order.status);
          const stages = stagesFor(order);
          const stage = stages.findIndex(s => s.status === order.status);
          const names = order.lines
            .map(l => productById(l.productId)?.name)
            .filter(Boolean)
            .slice(0, 2)
            .join(', ');

          return (
            <Animated.View key={order.id} entering={FadeInDown.duration(260).delay(Math.min(index, 6) * 50)}>
            <Card variant="elevated" padding={spacing.lg} style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.cardHeadText}>
                  <Txt variant="label">#{order.id}</Txt>
                  <Txt variant="caption" color="onSurfaceVariant">
                    {order.placed} · {order.storeName}
                  </Txt>
                </View>
                <Badge label={meta.label} tone={meta.tone} />
              </View>

              {order.substitutionNeeded ? (
                <View style={styles.alert}>
                  <Icon name="info" size={14} color="secondaryAccent" />
                  <Txt variant="caption" color="onSurfaceVariant" style={styles.alertText}>
                    An item is out of stock and needs your decision.
                  </Txt>
                </View>
              ) : null}

              <View style={styles.itemsRow}>
                <Txt variant="caption" color="onSurfaceVariant" numberOfLines={1} style={styles.itemsText}>
                  {order.summary.unitCount} {order.summary.unitCount === 1 ? 'unit' : 'units'} · {names}
                  {order.lines.length > 2 ? ` +${order.lines.length - 2} more` : ''}
                </Txt>
                <Txt variant="label">{formatKes(order.summary.total)}</Txt>
              </View>

              {isActive ? (
                <View style={styles.progress}>
                  <View style={styles.progressTrack}>
                    <View
                      style={[styles.progressFill, { width: `${((stage + 1) / stages.length) * 100}%` }]}
                    />
                  </View>
                  <Txt variant="caption" color="onSurfaceVariant">
                    {stage < 0 ? meta.label : stages[stage].label} · {order.slotLabel}
                  </Txt>
                </View>
              ) : null}

              <View style={styles.actions}>
                {isActive ? (
                  <Button label="Track order" size="sm" onPress={() => router.push(`/orders/${order.id}`)} />
                ) : (
                  <Button label="Reorder" size="sm" variant="outline" onPress={() => reorder(order)} />
                )}
                <Chip label="View details" onPress={() => router.push(`/orders/${order.id}`)} />
              </View>
            </Card>
            </Animated.View>
          );
        })
      )}
    </Screen>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.giant },
  filter: { marginTop: spacing.sm },
  syncNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md },
  syncNoticeError: { backgroundColor: colors.amberTint15 },
  syncNoticePending: { backgroundColor: colors.surfaceContainerLow },
  syncNoticeBody: { flex: 1, gap: spacing.xs, alignItems: 'flex-start' },
  card: { gap: spacing.md },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  cardHeadText: { flex: 1, gap: spacing.xxs },
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.amberTint15,
  },
  alertText: { flex: 1 },
  itemsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  itemsText: { flex: 1 },
  progress: { gap: spacing.sm },
  progressTrack: { height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceContainerHigh, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: radius.pill, backgroundColor: colors.primaryAccent },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
