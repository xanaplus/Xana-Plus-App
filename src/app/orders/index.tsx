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
import { ORDER_STAGES, useOrders, type OrderStatus, type PlacedOrder } from '@/store/orders';
import { colors, radius, spacing } from '@/theme';

/** Screen 10 — Order History: active, delivered and cancelled orders. */

type Filter = 'all' | 'active' | 'delivered' | 'cancelled';

const ACTIVE_STATES: OrderStatus[] = ['received', 'shopping', 'out-for-delivery'];

const STATUS_META: Record<OrderStatus, { label: string; tone: BadgeTone }> = {
  received: { label: 'Received', tone: 'warning' },
  shopping: { label: 'Shopper picking', tone: 'warning' },
  'out-for-delivery': { label: 'Out for delivery', tone: 'info' },
  delivered: { label: 'Delivered', tone: 'fresh' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

export default function OrderHistoryScreen() {
  const router = useRouter();
  const cart = useCart();
  const { orders } = useOrders();
  const [filter, setFilter] = useState<Filter>('all');

  const counts = useMemo(
    () => ({
      all: orders.length,
      active: orders.filter(o => ACTIVE_STATES.includes(o.status)).length,
      delivered: orders.filter(o => o.status === 'delivered').length,
      cancelled: orders.filter(o => o.status === 'cancelled').length,
    }),
    [orders],
  );

  const options: SegmentedOption<Filter>[] = [
    { value: 'all', label: `All (${counts.all})` },
    { value: 'active', label: `Active (${counts.active})` },
    { value: 'delivered', label: `Delivered (${counts.delivered})` },
  ];

  const visible = useMemo(() => {
    if (filter === 'active') return orders.filter(o => ACTIVE_STATES.includes(o.status));
    if (filter === 'delivered') return orders.filter(o => o.status === 'delivered');
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

      {visible.length === 0 ? (
        <EmptyState icon="delivery" title="No orders here" description="Orders you place will appear in this list.">
          <Button label="Start shopping" onPress={() => router.replace('/(tabs)')} />
        </EmptyState>
      ) : (
        visible.map((order, index) => {
          const meta = STATUS_META[order.status];
          const isActive = ACTIVE_STATES.includes(order.status);
          const stage = ORDER_STAGES.findIndex(s => s.status === order.status);
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
                  <Icon name="info" size={14} color="secondaryContainer" />
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
                      style={[styles.progressFill, { width: `${((stage + 1) / ORDER_STAGES.length) * 100}%` }]}
                    />
                  </View>
                  <Txt variant="caption" color="onSurfaceVariant">
                    {ORDER_STAGES[Math.max(0, stage)].label} · {order.slotLabel}
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

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.giant },
  filter: { marginTop: spacing.sm },
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
  progressFill: { height: 6, borderRadius: radius.pill, backgroundColor: colors.primaryContainer },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
