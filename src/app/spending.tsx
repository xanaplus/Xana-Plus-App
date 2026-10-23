import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

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
import DepartmentDonut from '@/components/spending/department-donut';
import { useRevealProgress } from '@/components/spending/use-reveal';
import { ORDER_HISTORY, orderMonthLabel, parseOrderDate } from '@/data/orders';
import type { CategoryVertical } from '@/data/types';
import { formatKes } from '@/lib/format';
import { recordedSavings } from '@/lib/order-savings';
import { spendingBreakdown } from '@/lib/spending-breakdown';
import { unitPrice, useCart } from '@/store/cart';
import { useOrders, type PlacedOrder } from '@/store/orders';
import { useSession } from '@/store/session';
import { radius, spacing } from '@/theme';
import { useTheme, useThemeStyles } from '@/theme/provider';
import type { Palette } from '@/theme';

/**
 * Savings & Spending — a read-only view derived entirely from order history.
 *
 * Reached from the savings figure on Profile, so it leads with money saved and
 * treats spend as the detail that explains it. Nothing here is tracked
 * separately: totals and discounts come from order snapshots; catalogue data
 * is used only to describe recognised line items.
 *
 * Monthly bars compare paid order totals. The department donut compares recorded
 * item amounts, separately from order-level fees and discounts.
 */

type Period = '3m' | '6m' | 'all';

const PERIOD_OPTIONS: SegmentedOption<Period>[] = [
  { value: '3m', label: '3 months' },
  { value: '6m', label: '6 months' },
  { value: 'all', label: 'All time' },
];

const PERIOD_MONTHS: Record<Period, number | null> = { '3m': 3, '6m': 6, all: null };
const SAMPLE_ORDER_IDS = new Set(ORDER_HISTORY.map(order => order.id));

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

type DepartmentTotal = { vertical: CategoryVertical; total: number; units: number };
type MonthTotal = { label: string; total: number };
type RegularItem = { productId: string; name: string; pack: string; units: number; spent: number };

type Totals = {
  orderCount: number;
  spent: number;
  wholesaleSavings: number;
  promoSavings: number;
  totalSaved: number;
  pointsEarned: number;
  departments: DepartmentTotal[];
  unclassifiedSpend: number;
  unpricedItems: number;
  months: MonthTotal[];
  regulars: RegularItem[];
  pharmacySpend: number;
};

function computeTotals(orders: PlacedOrder[]): Totals {
  let spent = 0;
  let unclassifiedSpend = 0;
  let unpricedItems = 0;
  const byVertical = new Map<CategoryVertical, DepartmentTotal>();
  const byMonth = new Map<string, number>();
  const byProduct = new Map<string, RegularItem>();

  for (const order of orders) {
    const isSampleOrder = SAMPLE_ORDER_IDS.has(order.id);
    for (const line of order.lines) {
      const product = productById(line.productId);

      const lineTotal =
        line.lineTotal ??
        (line.unitPrice !== undefined
          ? line.unitPrice * line.quantity
          : isSampleOrder && product
            ? unitPrice(product, line.quantity) * line.quantity
            : null);
      // Older saved orders may not have line-price snapshots. Keep them in the
      // recorded order total, but don't re-price them from today's catalogue.
      if (lineTotal === null) {
        unpricedItems++;
        continue;
      }
      if (!product) {
        unclassifiedSpend += lineTotal;
        continue;
      }

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

    // Summary totals include unavailable/hidden lines and order-level fees.
    spent += order.summary.total;
    const month = orderMonthLabel(order.placed);
    byMonth.set(month, (byMonth.get(month) ?? 0) + order.summary.total);
  }

  const savings = recordedSavings(orders);
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
    wholesaleSavings: savings.wholesaleSavings,
    promoSavings: savings.promoSavings,
    totalSaved: savings.totalSaved,
    pointsEarned: orders.reduce((sum, order) => sum + order.pointsEarned, 0),
    departments,
    unclassifiedSpend,
    unpricedItems,
    months,
    regulars,
    pharmacySpend: byVertical.get('pharmacy')?.total ?? 0,
  };
}

type RevealedChart = 'donut' | 'months';

/** A chart plays once its top passes this far down the visible area. */
const REVEAL_LINE = 0.85;

/** Bars rise left to right, slightly staggered, all finishing with the reveal. */
const barRise = (progress: number, index: number, count: number) => {
  const step = count > 1 ? Math.min(0.08, 0.4 / (count - 1)) : 0;
  const start = index * step;
  return Math.min(1, Math.max(0, (progress - start) / (1 - step * (count - 1))));
};

export default function SpendingScreen() {
  const { colors, gradients } = useTheme();
  const styles = useThemeStyles(createStyles);
  const router = useRouter();
  const cart = useCart();
  const { user } = useSession();
  const { orders: placedOrders } = useOrders();
  const [period, setPeriod] = useState<Period>('all');

  // Each chart draws in once, when most of the way up the screen (as on Revolut and Apple Fitness).
  const { height: windowHeight } = useWindowDimensions();
  const chartTops = useRef<Partial<Record<RevealedChart, number>>>({});
  const view = useRef({ offset: 0, height: windowHeight });
  const [revealed, setRevealed] = useState<Record<RevealedChart, boolean>>({ donut: false, months: false });
  const checkReveal = () => {
    const line = view.current.offset + view.current.height * REVEAL_LINE;
    const due = (Object.keys(chartTops.current) as RevealedChart[]).filter(
      chart => !revealed[chart] && (chartTops.current[chart] ?? Infinity) < line,
    );
    if (due.length > 0) setRevealed(current => ({ ...current, ...Object.fromEntries(due.map(chart => [chart, true])) }));
  };
  const placeChart = (chart: RevealedChart) => (y: number) => {
    chartTops.current[chart] = y;
    checkReveal();
  };
  const monthsProgress = useRevealProgress(revealed.months);

  // Provider includes demo seed orders and saved orders with checkout snapshots.
  const history = useMemo(() => placedOrders.filter(order => order.status !== 'cancelled' && order.status !== 'awaiting-payment'), [placedOrders]);

  const orders = useMemo(() => {
    const months = PERIOD_MONTHS[period];
    if (months === null) return history;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    return history.filter(o => parseOrderDate(o.placed) >= cutoff);
  }, [period, history]);

  const t = useMemo(() => computeTotals(orders), [orders]);
  const breakdown = useMemo(() => spendingBreakdown([
    ...t.departments.map(dept => ({ id: dept.vertical, label: VERTICAL_LABELS[dept.vertical], total: dept.total })),
    ...(t.unclassifiedSpend > 0
      ? [{ id: 'unclassified', label: 'Unclassified items', total: t.unclassifiedSpend }]
      : []),
  ]), [t]);

  const tier = user ? [...CLUB_TIERS].reverse().find(c => user.clubPoints >= c.from) ?? CLUB_TIERS[0] : CLUB_TIERS[0];
  const nextTier = CLUB_TIERS[CLUB_TIERS.findIndex(c => c.tier === tier.tier) + 1];
  const clubProgress = user && nextTier ? Math.min(1, Math.max(0, (user.clubPoints - tier.from) / (nextTier.from - tier.from))) : 1;
  const pointsToNext = user && nextTier ? Math.max(0, nextTier.from - user.clubPoints) : 0;

  const monthMax = Math.max(...t.months.map(m => m.total), 1);
  const savedShare = t.spent > 0 ? t.totalSaved / (t.spent + t.totalSaved) : 0;

  return (
    <Screen
      padded
      contentStyle={styles.content}
      onScroll={(offset, height) => {
        view.current = { offset, height };
        checkReveal();
      }}
    >
      <TopBar
        title="Savings & Spending"
        subtitle={user ? `${user.name} · ${tier.tier} member` : undefined}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'))}
      />

      {t.orderCount === 0 ? (
        <EmptyState
          icon="tag"
          title="Nothing to show yet"
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
          </Card>

          {/* Composition is based on recorded item amounts, not guessed discount allocation. */}
          <SectionHeader title="Spending by department" style={styles.sectionHead} />
          <Card variant="elevated" padding={spacing.lg} onLayout={event => placeChart('donut')(event.nativeEvent.layout.y)}>
            <DepartmentDonut breakdown={breakdown} revealed={revealed.donut} onDepartmentPress={id => {
              if (id in VERTICAL_LABELS) router.push({
                pathname: '/(tabs)/categories', params: { vertical: id, t: String(Date.now()) },
              });
            }} />
            <Txt variant="caption" color="onSurfaceVariant" style={styles.breakdownNote}>
              Recorded item totals before order-level fees and discounts.
              {t.unclassifiedSpend > 0 ? ' Items without department details are grouped as unclassified.' : ''}
              {t.unpricedItems > 0 ? ' Older items without saved prices are excluded; the monthly bars still include their order totals.' : ''}
            </Txt>
          </Card>

          {/* Pharmacy is deliberately shown as one aggregate, never itemised. */}
          {t.pharmacySpend > 0 ? (
            <Card variant="tinted" padding={spacing.lg} style={styles.privacyCard}>
              <View style={styles.privacyHead}>
                <Icon name="pill" size={16} color="primaryAccent" />
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
          <Card variant="elevated" padding={spacing.lg} onLayout={event => placeChart('months')(event.nativeEvent.layout.y)}>
            <View style={styles.monthChart}>
              {t.months.map((month, index) => (
                <View key={month.label} style={styles.monthCol}>
                  <Txt variant="caption" color="onSurfaceVariant" numberOfLines={1}>
                    {formatKes(month.total)}
                  </Txt>
                  <View style={styles.monthBarWrap}>
                    <View
                      style={[
                        styles.monthBar,
                        { height: `${Math.max(4, (month.total / monthMax) * 100) * barRise(monthsProgress, index, t.months.length)}%` },
                      ]}
                    />
                  </View>
                  <Txt variant="caption" color="onSurfaceVariant" numberOfLines={1}>
                    {month.label.split(' ')[0]}
                  </Txt>
                </View>
              ))}
            </View>
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
                    <Txt variant="label" color="primaryAccent">
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
            Savings reflect discounts recorded on your orders.
          </Txt>
        </>
      )}
    </Screen>
  );
}

function SavingRow({ icon, label, note, value }: { icon: IconName; label: string; note: string; value: number }) {
  const styles = useThemeStyles(createStyles);
  return (
    <View style={styles.savingRow}>
      <View style={styles.savingIcon}>
        <Icon name={icon} size={16} color="primaryAccent" />
      </View>
      <View style={styles.savingText}>
        <Txt variant="label" numberOfLines={1}>
          {label}
        </Txt>
        <Txt variant="caption" color="onSurfaceVariant" numberOfLines={2}>
          {note}
        </Txt>
      </View>
      <Txt variant="label" color="primaryAccent">
        {value > 0 ? formatKes(value) : 'KES 0'}
      </Txt>
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
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

  breakdownNote: { marginTop: spacing.md },

  privacyCard: { marginTop: spacing.md, gap: spacing.sm },
  privacyHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },

  monthChart: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md, height: 168 },
  monthCol: { flex: 1, alignItems: 'center', gap: spacing.sm, height: '100%', justifyContent: 'flex-end' },
  monthBarWrap: { flex: 1, width: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  monthBar: { width: '70%', borderRadius: radius.xs, backgroundColor: colors.primaryAccent },

  clubRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  clubEarned: { alignItems: 'flex-end' },
  clubBar: { marginTop: spacing.lg, marginBottom: spacing.sm },

  regularRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  regularText: { flex: 1, gap: spacing.xxs },

  footnote: { marginTop: spacing.lg },
});
