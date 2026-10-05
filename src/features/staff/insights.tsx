import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, Divider, LoadState, Segmented, Txt, type SegmentedOption } from '@/components/ui';
import { formatKes } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { colors, radius, spacing } from '@/theme';

/**
 * Staff tools → Insights: where shoppers drop off, crashes, order ratings and
 * promo code use, from `staff_insights()`. Counts are phones (installs), not
 * people: one person on two phones counts twice.
 */

type Insights = {
  days: number;
  funnel: { step: string; devices: number }[];
  order_failures: Record<string, number>;
  errors: { count: number; devices: number; latest: { created_at: string; message: string; screen: string | null; platform: string | null; fatal: boolean }[] };
  ratings: {
    count: number;
    service_up: number;
    service_down: number;
    packing_up: number;
    packing_down: number;
    missing: number;
    comments: { created_at: string; order_no: string; comment: string }[];
  };
  promos: { code: string; uses: number; discount: number | string }[];
};

const STEP_LABEL: Record<string, string> = {
  app_open: 'Opened the app',
  product_view: 'Looked at a product',
  add_to_cart: 'Added to cart',
  checkout_view: 'Reached checkout',
  order_placed: 'Placed an order',
};

const FAILURE_LABEL: Record<string, string> = {
  network: 'No connection',
  unavailable: 'Item sold out',
  rx_missing: 'No prescription',
  age_unconfirmed: '18+ not confirmed',
  points_unavailable: 'Points problem',
  signed_out: 'Signed out',
  server_error: 'Server error',
};

const RANGES: SegmentedOption<'7' | '30'>[] = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
];

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-KE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '');

async function fetchInsights(days: string): Promise<Insights | null> {
  const { data, error } = await supabase.rpc('staff_insights', { p_days: Number(days) });
  return error || !data ? null : (data as Insights);
}

export function InsightsPanel() {
  const [range, setRange] = useState<'7' | '30'>('7');
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [data, setData] = useState<Insights | null>(null);

  /** Bumped by Retry, so the same range loads again. */
  const [attempt, setAttempt] = useState(0);

  // Starts in 'loading'; changing the range or retrying sets it again before this runs.
  useEffect(() => {
    let live = true;
    fetchInsights(range).then(result => {
      if (!live) return;
      setData(result);
      setStatus(result ? 'ready' : 'error');
    });
    return () => {
      live = false;
    };
  }, [range, attempt]);

  const changeRange = (days: '7' | '30') => {
    setStatus('loading');
    setRange(days);
  };

  const header = <Segmented options={RANGES} value={range} onChange={changeRange} />;

  if (status !== 'ready' || !data) {
    return (
      <View style={styles.stack}>
        {header}
        <LoadState
          status={status === 'ready' ? 'loading' : status}
          noun="insights"
          placeholder="list"
          onRetry={() => {
            setStatus('loading');
            setAttempt(n => n + 1);
          }}
        />
      </View>
    );
  }

  const top = data.funnel[0]?.devices ?? 0;
  const failures = Object.entries(data.order_failures).sort((a, b) => b[1] - a[1]);
  const r = data.ratings;

  return (
    <View style={styles.stack}>
      {header}

      <Card variant="elevated" padding={spacing.lg} style={styles.card}>
        <Txt variant="titleLg">Shopping funnel</Txt>
        <Txt variant="caption" color="onSurfaceVariant">
          Phones that reached each step. The biggest drop is where shoppers get stuck.
        </Txt>
        {data.funnel.map((step, index) => {
          const previous = index > 0 ? data.funnel[index - 1].devices : step.devices;
          return (
            <View key={step.step} style={styles.funnelRow}>
              <View style={styles.rowHead}>
                <Txt variant="bodySm" style={styles.flex}>
                  {STEP_LABEL[step.step] ?? step.step}
                </Txt>
                <Txt variant="label">{step.devices.toLocaleString('en-KE')}</Txt>
                {index > 0 ? (
                  <Txt variant="caption" color="onSurfaceVariant" style={styles.pct}>
                    {pct(step.devices, previous)}
                  </Txt>
                ) : (
                  <View style={styles.pct} />
                )}
              </View>
              <View style={styles.barTrack}>
                <View style={[styles.bar, { width: `${top > 0 ? Math.max(2, (step.devices / top) * 100) : 0}%` }]} />
              </View>
            </View>
          );
        })}
        {failures.length > 0 ? (
          <>
            <Divider />
            <Txt variant="label">Orders that failed</Txt>
            {failures.map(([reason, count]) => (
              <View key={reason} style={styles.rowHead}>
                <Txt variant="bodySm" color="onSurfaceVariant" style={styles.flex}>
                  {FAILURE_LABEL[reason] ?? reason.replace(/_/g, ' ')}
                </Txt>
                <Txt variant="label">{count}</Txt>
              </View>
            ))}
          </>
        ) : null}
      </Card>

      <Card variant="elevated" padding={spacing.lg} style={styles.card}>
        <Txt variant="titleLg">Crashes</Txt>
        <Txt variant="bodySm" color="onSurfaceVariant">
          {data.errors.count === 0
            ? 'No crashes reported.'
            : `${data.errors.count} ${data.errors.count === 1 ? 'crash' : 'crashes'} on ${data.errors.devices} ${data.errors.devices === 1 ? 'phone' : 'phones'}.`}
        </Txt>
        {data.errors.latest.map((e, index) => (
          <View key={`${e.created_at}-${index}`} style={styles.item}>
            <Txt variant="bodySm" numberOfLines={2}>
              {e.message}
            </Txt>
            <Txt variant="caption" color="onSurfaceVariant">
              {[when(e.created_at), e.screen, e.platform, e.fatal ? 'app closed' : null].filter(Boolean).join(' · ')}
            </Txt>
          </View>
        ))}
      </Card>

      <Card variant="elevated" padding={spacing.lg} style={styles.card}>
        <Txt variant="titleLg">Order ratings</Txt>
        {r.count === 0 ? (
          <Txt variant="bodySm" color="onSurfaceVariant">
            No ratings yet.
          </Txt>
        ) : (
          <>
            <Score label="Rider / counter" good={r.service_up} poor={r.service_down} />
            <Score label="Packing" good={r.packing_up} poor={r.packing_down} />
            <View style={styles.rowHead}>
              <Txt variant="bodySm" style={styles.flex}>
                Something was missing
              </Txt>
              <Txt variant="label" color={r.missing > 0 ? 'error' : 'onSurface'}>
                {r.missing}
              </Txt>
            </View>
            {r.comments.map((c, index) => (
              <View key={`${c.order_no}-${index}`} style={styles.item}>
                <Txt variant="bodySm">{`“${c.comment}”`}</Txt>
                <Txt variant="caption" color="onSurfaceVariant">
                  {`${c.order_no} · ${when(c.created_at)}`}
                </Txt>
              </View>
            ))}
          </>
        )}
      </Card>

      <Card variant="elevated" padding={spacing.lg} style={styles.card}>
        <Txt variant="titleLg">Promo codes</Txt>
        {data.promos.length === 0 ? (
          <Txt variant="bodySm" color="onSurfaceVariant">
            No codes used.
          </Txt>
        ) : (
          data.promos.map(p => (
            <View key={p.code} style={styles.rowHead}>
              <Txt variant="label" style={styles.flex}>
                {p.code}
              </Txt>
              <Txt variant="bodySm" color="onSurfaceVariant">
                {`${p.uses} ${p.uses === 1 ? 'order' : 'orders'} · ${formatKes(Number(p.discount))} off`}
              </Txt>
            </View>
          ))
        )}
      </Card>
    </View>
  );
}

function Score({ label, good, poor }: { label: string; good: number; poor: number }) {
  return (
    <View style={styles.rowHead}>
      <Txt variant="bodySm" style={styles.flex}>
        {label}
      </Txt>
      <Txt variant="label" color="primary">{`${good} good`}</Txt>
      <Txt variant="label" color={poor > 0 ? 'error' : 'onSurfaceVariant'}>{`${poor} poor`}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  card: { gap: spacing.sm },
  flex: { flex: 1 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pct: { width: 40, textAlign: 'right' },
  funnelRow: { gap: spacing.xs },
  barTrack: { height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceContainerHigh, overflow: 'hidden' },
  bar: { height: 8, borderRadius: radius.pill, backgroundColor: colors.primaryContainer },
  item: { gap: spacing.xxs, paddingTop: spacing.xs },
});
