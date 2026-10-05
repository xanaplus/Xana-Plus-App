import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge, Button, Card, EmptyState, LoadState, Screen, SectionHeader, TopBar, Txt, type BadgeTone } from '@/components/ui';
import { formatKes } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/store/session';
import { spacing } from '@/theme';

/**
 * Returns & bookings: what the customer has sent and where each one is up to,
 * as the branch moves it along in Staff tools.
 */

type ReturnRow = {
  ref: string;
  order_no: string;
  items: { name: string; quantity: number }[];
  refund_to: 'mpesa' | 'club-credit';
  refund_estimate: number | string;
  status: 'requested' | 'approved' | 'rejected' | 'refunded';
  created_at: string;
};

type BookingRow = {
  ref: string;
  service_name: string;
  store_name: string;
  slot_label: string;
  price: number | string;
  status: 'requested' | 'confirmed' | 'completed' | 'cancelled';
  created_at: string;
};

const RETURN_STATUS: Record<ReturnRow['status'], { label: string; tone: BadgeTone; note: string }> = {
  requested: { label: 'SENT', tone: 'warning', note: 'The branch is reviewing your request.' },
  approved: { label: 'APPROVED', tone: 'info', note: 'Approved. Your refund is on its way.' },
  rejected: { label: 'NOT APPROVED', tone: 'neutral', note: 'The branch could not accept this return. Call them for details.' },
  refunded: { label: 'REFUNDED', tone: 'fresh', note: 'Refund done.' },
};

const BOOKING_STATUS: Record<BookingRow['status'], { label: string; tone: BadgeTone; note: string }> = {
  requested: { label: 'REQUESTED', tone: 'warning', note: 'The branch will call to confirm your slot.' },
  confirmed: { label: 'CONFIRMED', tone: 'info', note: 'Your slot is confirmed. See you then.' },
  completed: { label: 'DONE', tone: 'fresh', note: 'Completed. Thank you for visiting.' },
  cancelled: { label: 'CANCELLED', tone: 'neutral', note: 'This booking was cancelled.' },
};

const sentOn = (iso: string) => new Date(iso).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });

type Loaded = { returns: ReturnRow[]; bookings: BookingRow[] } | null;

/** The customer's own returns and bookings, newest first. */
async function fetchRequests(userId: string): Promise<Loaded> {
  // Staff accounts can read everyone's, so ask for this customer's explicitly.
  const [r, b] = await Promise.all([
    supabase
      .from('return_requests')
      .select('ref, order_no, items, refund_to, refund_estimate, status, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('clinic_bookings')
      .select('ref, service_name, store_name, slot_label, price, status, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
  ]);
  if (r.error || b.error) return null;
  return { returns: r.data as ReturnRow[], bookings: b.data as BookingRow[] };
}

export default function RequestsRoute() {
  const router = useRouter();
  const { user } = useSession();
  const userId = user?.id ?? null;
  const [data, setData] = useState<Loaded | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    fetchRequests(userId).then(result => {
      if (live) setData(result);
    });
    return () => {
      live = false;
    };
  }, [userId, attempt]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'));

  if (!userId) {
    return (
      <Screen padded>
        <TopBar title="Returns & bookings" onBack={goBack} />
        <EmptyState icon="receipt" title="Log in to see your requests" description="Returns and clinic bookings you send appear here.">
          <Button label="Log in" onPress={() => router.push('/login')} />
        </EmptyState>
      </Screen>
    );
  }

  return (
    <Screen padded contentStyle={styles.content}>
      <TopBar title="Returns & bookings" onBack={goBack} />

      {data === undefined ? <LoadState status="loading" placeholder="list" /> : null}
      {data === null ? (
        <LoadState
          status="error"
          noun="your requests"
          onRetry={() => {
            setData(undefined);
            setAttempt(n => n + 1);
          }}
        />
      ) : null}

      {data && data.returns.length === 0 && data.bookings.length === 0 ? (
        <EmptyState
          icon="receipt"
          title="Nothing sent yet"
          description="Return requests from a delivered order, and clinic bookings, show up here."
        />
      ) : null}

      {data && data.returns.length > 0 ? (
        <View style={styles.group}>
          <SectionHeader title="Returns" />
          {data.returns.map(row => {
            const status = RETURN_STATUS[row.status];
            return (
              <Card key={row.ref} variant="elevated" padding={spacing.lg} style={styles.card}>
                <View style={styles.head}>
                  <Txt variant="titleLg" style={styles.flex}>
                    {row.ref}
                  </Txt>
                  <Badge label={status.label} tone={status.tone} />
                </View>
                <Txt variant="caption" color="onSurfaceVariant">
                  {`Order ${row.order_no} · sent ${sentOn(row.created_at)}`}
                </Txt>
                {row.items.map((item, index) => (
                  <Txt key={`${item.name}-${index}`} variant="bodySm">
                    {`${item.quantity} × ${item.name}`}
                  </Txt>
                ))}
                <Txt variant="bodySm" color="onSurfaceVariant">
                  {`${row.refund_to === 'mpesa' ? 'M-Pesa refund' : 'Xana Club credit'} · ${formatKes(Number(row.refund_estimate))}`}
                </Txt>
                <Txt variant="caption" color="onSurfaceVariant">
                  {status.note}
                </Txt>
              </Card>
            );
          })}
        </View>
      ) : null}

      {data && data.bookings.length > 0 ? (
        <View style={styles.group}>
          <SectionHeader title="Clinic bookings" />
          {data.bookings.map(row => {
            const status = BOOKING_STATUS[row.status];
            return (
              <Card key={row.ref} variant="elevated" padding={spacing.lg} style={styles.card}>
                <View style={styles.head}>
                  <Txt variant="titleLg" style={styles.flex}>
                    {row.service_name}
                  </Txt>
                  <Badge label={status.label} tone={status.tone} />
                </View>
                <Txt variant="caption" color="onSurfaceVariant">
                  {`${row.ref} · booked ${sentOn(row.created_at)}`}
                </Txt>
                <Txt variant="bodySm">{`${row.slot_label} · ${row.store_name}`}</Txt>
                <Txt variant="bodySm" color="onSurfaceVariant">
                  {formatKes(Number(row.price))}
                </Txt>
                <Txt variant="caption" color="onSurfaceVariant">
                  {status.note}
                </Txt>
              </Card>
            );
          })}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  group: { gap: spacing.md },
  card: { gap: spacing.xs },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
