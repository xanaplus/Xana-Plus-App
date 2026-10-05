import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  Divider,
  EmptyState,
  Icon,
  ProgressBar,
  Screen,
  SectionHeader,
  Segmented,
  TopBar,
  Txt,
  type IconName,
  type SegmentedOption,
} from '@/components/ui';
import { productById, verticalForProduct } from '@/data/catalog';
import { ORDER_HISTORY, orderMonthLabel, parseOrderDate, type OrderRecord } from '@/data/orders';
import type { CategoryVertical } from '@/data/types';
import { formatKes } from '@/lib/format';
import { unitPrice, useCart } from '@/store/cart';
import { useOrders } from '@/store/orders';
import { useSession } from '@/store/session';
import { colors, gradients, radius, spacing } from '@/theme';

/**
 * Savings & Spending — a read-only view derived entirely from order history.
 *
 * Reached from the savings figure on Profile, so it leads with money saved and
 * treats spend as the detail that explains it. Nothing here is tracked
 * separately: every number is computed from ORDER_HISTORY and the catalogue.
 *
 * Charts are single-hue by design. The bars compare magnitudes of one measure
 * and carry their own text labels, so colour is not encoding identity and no
 * categorical palette is involved.
 */

type Period = '3m' | '6m' | 'all';

const PERIOD_OPTIONS: SegmentedOption<Period>[] = [
  { value: '3m', label: '3 months' },
  { value: '6m', label: '6 months' },
  { value: 'all', label: 'All time' },
];

const PERIOD_MONTHS: Record<Period, number | null> = { '3m': 3, '6m': 6, all: null };

/** D-5: 1 Xana Club point per KES 120 spent. */
const POINTS_PER_SHILLING = 1 / 120;

const CLUB_TIERS = [
  { tier: 'Bronze', from: 0 },
  { tier: 'Silver', from: 1_000 },
  { tier: 'Gold', from: 2_000 },
  { tier: 'Platinum', from: 5_000 },
] as const;

const VERTICAL_LABELS: Record<CategoryVertical, string> = {
  groceries: 'Groceries',
  pharmacy: 'Pharmacy',
  deli: 'Deli',
  retail: 'Retail',
  wholesale: 'Wholesale',
  liquor: 'Liquor',
  household: 'Household',
  beauty: 'Beauty & Personal Care',
};

const VERTICAL_ICONS: Record<CategoryVertical, IconName> = {
  groceries: 'cart',
  pharmacy: 'pill',
  deli: 'cart',
  retail: 'cart',
  wholesale: 'cart',
  liquor: 'cart',
  household: 'cart',
  beauty: 'cart',
};

type DepartmentTotal = { vertical: CategoryVertical; total: number; units: number };
type MonthTotal = { label: string; total: number };
type RegularItem = { productId: string; name: string; pack: string; units: number; spent: number };

type Totals = {
  orderCount: number;
  spent: number;
  wholesaleSavings: number;
  promoSavings: number;
  deliverySavings: number;
  totalSaved: number;
  pointsEarned: number;
  departments: DepartmentTotal[];
  months: MonthTotal[];
  regulars: RegularItem[];
  pharmacySpend: number;
};

/** Free delivery at Syokimau and Ruiru — the fee the order would otherwise carry. */
const DELIVERY_FEE_WAIVED = 150;

function computeTotals(orders: OrderRecord[]): Totals {
  let spent = 0;
  let wholesaleSavings = 0;
  let promoSavings = 0;
  const byVertical = new Map<CategoryVertical, DepartmentTotal>();
  const byMonth = new Map<string, number>();
  const byProduct = new Map<string, RegularItem>();

  for (const order of orders) {
    let orderTotal = 0;

    for (const line of order.lines) {
      const product = productById(line.productId);
      if (!product) continue;

      const paid = unitPrice(product, line.quantity);
      const lineTotal = paid * line.quantity;
      orderTotal += lineTotal;

      wholesaleSavings += (product.price - paid) * line.quantity;
      if (product.wasPrice) promoSavings += (product.wasPrice - product.price) * line.quantity;

      const vertical = verticalForProduct(product);
      const dept = byVertical.get(vertical) ?? { vertical, total: 0, units: 0 };
      dept.total += lineTotal;
      dept.units += line.quantity;
      byVertical.set(vertical, dept);

      // Pharmacy items are deliberately excluded from "Your regulars": listing a
      // medicine by name would undo the aggregation applied to pharmacy spend.
      // Refills live in My Prescriptions, which is behind the same posture.
      if (vertical !== 'pharmacy') {
        const regular = byProduct.get(product.id) ?? {
          productId: product.id,
          name: product.name,
          pack: product.pack,
          units: 0,
          spent: 0,
        };
        regular.units += line.quantity;
        regular.spent += lineTotal;
        byProduct.set(product.id, regular);
      }
    }

    spent += orderTotal;
    const month = orderMonthLabel(order.placed);
    byMonth.set(month, (byMonth.get(month) ?? 0) + orderTotal);
  }

  const deliverySavings = orders.length * DELIVERY_FEE_WAIVED;
  const departments = [...byVertical.values()].sort((a, b) => b.total - a.total);

  const months = [...byMonth.entries()]
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => {
      const aOrder = orders.find(o => orderMonthLabel(o.placed) === a.label);
      const bOrder = orders.find(o => orderMonthLabel(o.placed) === b.label);
      return parseOrderDate(aOrder?.placed ?? '').getTime() - parseOrderDate(bOrder?.placed ?? '').getTime();
    });

  const regulars = [...byProduct.values()].sort((a, b) => b.units - a.units).slice(0, 4);

  return {
    orderCount: orders.length,
    spent,
    wholesaleSavings,
    promoSavings,
    deliverySavings,
    totalSaved: wholesaleSavings + promoSavings + deliverySavings,
    pointsEarned: Math.floor(spent * POINTS_PER_SHILLING),
    departments,
    months,
    regulars,
    pharmacySpend: byVertical.get('pharmacy')?.total ?? 0,
  };
}

export default function SpendingScreen() {
  const router = useRouter();
  const cart = useCart();
  const { user, isDemo } = useSession();
  const { orders: placedOrders } = useOrders();
  const [period, setPeriod] = useState<Period>('3m');

  // The demo account keeps the sample history; everyone else sees their own non-cancelled orders.
  const history = useMemo<OrderRecord[]>(
    () =>
      isDemo
        ? ORDER_HISTORY
        : placedOrders
            .filter(o => o.status !== 'cancelled')
            .map(o => ({ id: o.id, placed: o.placed, status: o.status, tone: 'neutral', lines: o.lines })),
    [isDemo, placedOrders],
  );

  const orders = useMemo(() => {
    const months = PERIOD_MONTHS[period];
    if (months === null) return history;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    return history.filter(o => parseOrderDate(o.placed) >= cutoff);
  }, [period, history]);

  const t = useMemo(() => computeTotals(orders), [orders]);

  const tier = user ? [...CLUB_TIERS].reverse().find(c => user.clubPoints >= c.from) ?? CLUB_TIERS[0] : CLUB_TIERS[0];
  const nextTier = CLUB_TIERS[CLUB_TIERS.findIndex(c => c.tier === tier.tier) + 1];
  const clubProgress = user && nextTier ? Math.min(1, Math.max(0, (user.clubPoints - tier.from) / (nextTier.from - tier.from))) : 1;
  const pointsToNext = user && nextTier ? Math.max(0, nextTier.from - user.clubPoints) : 0;

  const deptMax = Math.max(...t.departments.map(d => d.total), 1);
  const monthMax = Math.max(...t.months.map(m => m.total), 1);
  const savedShare = t.spent > 0 ? t.totalSaved / (t.spent + t.totalSaved) : 0;

  return (
    <Screen
      padded
      backgroundColor={colors.background}
      contentStyle={styles.content}
    >
      <TopBar
        title="Savings & Spending"
        subtitle={user ? `${user.name} · ${tier.tier} member` : 'Your Xana activity'}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'))}
      />

      {t.orderCount === 0 ? (
        <EmptyState
          icon="tag"
          title="Nothing to show yet"
          description="Once you have placed an order, your savings and spending breakdown appears here."
        >
          <Button label="Start shopping" onPress={() => router.replace('/')} />
        </EmptyState>
      ) : (
        <>
          <Segmented options={PERIOD_OPTIONS} value={period} onChange={setPeriod} style={styles.period} />

          {/* Hero — savings first. This screen is reached from a savings card. */}
          <LinearGradient colors={gradients.club} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
            <Txt variant="caption" tint={colors.primaryFixed}>
              YOU SAVED
            </Txt>
            <Txt variant="display" tint={colors.onPrimary}>
              {formatKes(t.totalSaved)}
            </Txt>
            <Txt variant="body" tint={colors.primaryFixed} style={styles.heroNote}>
              across {t.orderCount} {t.orderCount === 1 ? 'order' : 'orders'} · {formatKes(t.spent)} spent
            </Txt>

            <View style={styles.heroMeter}>
              <ProgressBar
                value={savedShare}
                height={6}
                trackColor={colors.white70}
                fillColor={colors.primaryFixed}
              />
              <Txt variant="caption" tint={colors.primaryFixed} style={styles.heroMeterLabel}>
                {Math.round(savedShare * 100)}% of your basket value came back to you
              </Txt>
            </View>
          </LinearGradient>

          {/* How the saving happened */}
          <SectionHeader title="How you saved" style={styles.sectionHead} />
          <Card variant="elevated" padding={spacing.lg}>
            <SavingRow
              icon="cart"
              label="Wholesale & bulk pricing"
              note="Unit price drops at carton quantities"
              value={t.wholesaleSavings}
            />
            <Divider />
            <SavingRow
              icon="tag"
              label="Promotional pricing"
              note="Member and flash-drop prices"
              value={t.promoSavings}
            />
            <Divider />
            <SavingRow
              icon="delivery"
              label="Free delivery"
              note={`Waived on ${t.orderCount} ${t.orderCount === 1 ? 'order' : 'orders'} · Syokimau & Ruiru`}
              value={t.deliverySavings}
            />
          </Card>

          {/* Department split — single hue, labelled bars, tap through to the aisle */}
          <SectionHeader title="Where it went" style={styles.sectionHead} />
          <Card variant="elevated" padding={spacing.lg}>
            {t.departments.map((dept, index) => (
              <Pressable
                key={dept.vertical}
                accessibilityRole="button"
                accessibilityLabel={`${VERTICAL_LABELS[dept.vertical]}, ${formatKes(dept.total)}`}
                onPress={() => router.push('/(tabs)/categories')}
                style={[styles.deptRow, index === 0 ? null : styles.deptRowSpaced]}
              >
                <View style={styles.deptLabelRow}>
                  <View style={styles.deptLabel}>
                    <Icon name={VERTICAL_ICONS[dept.vertical]} size={14} color="onSurfaceVariant" />
                    <Txt variant="label" numberOfLines={1}>
                      {VERTICAL_LABELS[dept.vertical]}
                    </Txt>
                  </View>
                  <Txt variant="label">{formatKes(dept.total)}</Txt>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${Math.max(2, (dept.total / deptMax) * 100)}%` }]} />
                </View>
                <Txt variant="caption" color="onSurfaceVariant">
                  {dept.units} {dept.units === 1 ? 'unit' : 'units'} · {Math.round((dept.total / t.spent) * 100)}% of spend
                </Txt>
              </Pressable>
            ))}
          </Card>

          {/* Pharmacy is deliberately shown as one aggregate, never itemised. */}
          {t.pharmacySpend > 0 ? (
            <Card variant="tinted" padding={spacing.lg} style={styles.privacyCard}>
              <View style={styles.privacyHead}>
                <Icon name="pill" size={16} color="primaryContainer" />
                <Txt variant="label">Pharmacy shown as a total</Txt>
              </View>
              <Txt variant="caption" color="onSurfaceVariant">
                {formatKes(t.pharmacySpend)} of pharmacy spend is grouped rather than itemised, so medicines are
                not listed on a screen others may see, and are left out of Your regulars below. Individual items stay in My Prescriptions.
              </Txt>
            </Card>
          ) : null}

          {/* Trend */}
          <SectionHeader title="Month by month" style={styles.sectionHead} />
          <Card variant="elevated" padding={spacing.lg}>
            <View style={styles.monthChart}>
              {t.months.map(month => (
                <View key={month.label} style={styles.monthCol}>
                  <Txt variant="caption" color="onSurfaceVariant" numberOfLines={1}>
                    {formatKes(month.total)}
                  </Txt>
                  <View style={styles.monthBarWrap}>
                    <View style={[styles.monthBar, { height: `${Math.max(4, (month.total / monthMax) * 100)}%` }]} />
                  </View>
                  <Txt variant="caption" color="onSurfaceVariant" numberOfLines={1}>
                    {month.label.split(' ')[0]}
                  </Txt>
                </View>
              ))}
            </View>
            {t.months.length < 3 ? (
              <Txt variant="caption" color="onSurfaceVariant" align="center" style={styles.monthNote}>
                A longer trend appears as you place more orders.
              </Txt>
            ) : null}
          </Card>

          {/* Club progress */}
          {user ? (
            <>
              <SectionHeader title="Xana Club" style={styles.sectionHead} />
              <Card variant="elevated" padding={spacing.lg}>
                <View style={styles.clubRow}>
                  <View>
                    <Txt variant="headlineLg">{user.clubPoints.toLocaleString('en-KE')}</Txt>
                    <Txt variant="caption" color="onSurfaceVariant">
                      points · {tier.tier}
                    </Txt>
                  </View>
                  <View style={styles.clubEarned}>
                    <Txt variant="label" color="primaryContainer">
                      +{t.pointsEarned.toLocaleString('en-KE')} pts
                    </Txt>
                    <Txt variant="caption" color="onSurfaceVariant">
                      this period
                    </Txt>
                  </View>
                </View>
                <ProgressBar value={clubProgress} height={6} style={styles.clubBar} />
                <Txt variant="caption" color="onSurfaceVariant">
                  {nextTier
                    ? `${pointsToNext.toLocaleString('en-KE')} points to ${nextTier.tier}`
                    : 'Top tier reached'}
                </Txt>
              </Card>
            </>
          ) : null}

          {/* Regulars — the one section that does commercial work */}
          <SectionHeader title="Your regulars" style={styles.sectionHead} />
          <Card variant="elevated" padding={spacing.lg}>
            {t.regulars.map((item, index) => (
              <View key={item.productId}>
                {index === 0 ? null : <Divider />}
                <View style={styles.regularRow}>
                  <View style={styles.regularText}>
                    <Txt variant="label" numberOfLines={1}>
                      {item.name}
                    </Txt>
                    <Txt variant="caption" color="onSurfaceVariant" numberOfLines={1}>
                      {item.units} bought · {formatKes(item.spent)}
                    </Txt>
                  </View>
                  <Button
                    label="Reorder"
                    size="sm"
                    variant="outline"
                    onPress={() => {
                      cart.add(item.productId, 1);
                      router.push('/(tabs)/cart');
                    }}
                  />
                </View>
              </View>
            ))}
          </Card>

          <Txt variant="caption" color="onSurfaceVariant" align="center" style={styles.footnote}>
            Calculated from your order history. Delivery saving assumes the {formatKes(DELIVERY_FEE_WAIVED)} standard
            fee waived at Syokimau and Ruiru.
          </Txt>
        </>
      )}
    </Screen>
  );
}

function SavingRow({ icon, label, note, value }: { icon: IconName; label: string; note: string; value: number }) {
  return (
    <View style={styles.savingRow}>
      <View style={styles.savingIcon}>
        <Icon name={icon} size={16} color="primaryContainer" />
      </View>
      <View style={styles.savingText}>
        <Txt variant="label" numberOfLines={1}>
          {label}
        </Txt>
        <Txt variant="caption" color="onSurfaceVariant" numberOfLines={2}>
          {note}
        </Txt>
      </View>
      <Txt variant="label" color="primaryContainer">
        {value > 0 ? formatKes(value) : 'KES 0'}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.giant },
  period: { marginTop: spacing.sm },

  hero: { borderRadius: radius.card, padding: spacing.xl, gap: spacing.xxs },
  heroNote: { marginTop: spacing.xxs },
  heroMeter: { marginTop: spacing.lg, gap: spacing.sm },
  heroMeterLabel: { marginTop: spacing.xxs },

  sectionHead: { marginTop: spacing.sm },

  savingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  savingIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savingText: { flex: 1, gap: spacing.xxs },

  deptRow: { gap: spacing.sm },
  deptRowSpaced: { marginTop: spacing.lg },
  deptLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  deptLabel: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  barTrack: { height: 10, borderRadius: radius.xs, backgroundColor: colors.surfaceContainerHigh, overflow: 'hidden' },
  barFill: { height: 10, borderRadius: radius.xs, backgroundColor: colors.primaryContainer },

  privacyCard: { marginTop: spacing.md, gap: spacing.sm },
  privacyHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },

  monthChart: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md, height: 168 },
  monthCol: { flex: 1, alignItems: 'center', gap: spacing.sm, height: '100%', justifyContent: 'flex-end' },
  monthBarWrap: { flex: 1, width: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  monthBar: { width: '70%', borderRadius: radius.xs, backgroundColor: colors.primaryContainer },
  monthNote: { marginTop: spacing.md },

  clubRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  clubEarned: { alignItems: 'flex-end' },
  clubBar: { marginTop: spacing.lg, marginBottom: spacing.sm },

  regularRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  regularText: { flex: 1, gap: spacing.xxs },

  footnote: { marginTop: spacing.lg },
});
