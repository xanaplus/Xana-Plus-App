import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  LoadState,
  Screen,
  Segmented,
  TopBar,
  TopBarAction,
  Txt,
  type BadgeTone,
  type SegmentedOption,
} from '@/components/ui';
import { InsightsPanel } from '@/features/staff/insights';
import { formatKes } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/store/session';
import { spacing } from '@/theme';

/**
 * Staff tools: branch staff see every order, return request and clinic
 * booking, and move each one along. Only accounts on the `staff` list can open
 * it; the database enforces the same rule, so hiding the entry is not the lock.
 * Insights shows the shopping funnel, crashes, ratings and promo code use.
 */

type Tab = 'orders' | 'returns' | 'bookings' | 'insights';

type OrderRow = {
  order_no: string;
  user_id: string | null;
  created_at: string;
  status: 'received' | 'shopping' | 'out-for-delivery' | 'delivered' | 'cancelled';
  is_test: boolean;
  payment_method: string;
  contact: string;
  address_line: string;
  slot_label: string;
  store_name: string;
  substitution: string;
  total: number | string;
  amount_due: number | string;
  points_redeemed: number;
  points_earned: number;
  rx_reference: string | null;
  order_items: { name: string; quantity: number }[];
};

type ReturnRow = {
  id: string;
  ref: string;
  user_id: string | null;
  order_no: string;
  items: { name: string; quantity: number }[];
  reason: string;
  notes: string | null;
  refund_to: 'mpesa' | 'club-credit';
  refund_estimate: number | string;
  status: 'requested' | 'approved' | 'rejected' | 'refunded';
  created_at: string;
};

type BookingRow = {
  id: string;
  ref: string;
  user_id: string | null;
  service_name: string;
  price: number | string;
  store_name: string;
  slot_label: string;
  notes: string | null;
  status: 'requested' | 'confirmed' | 'completed' | 'cancelled';
  created_at: string;
};

type Customer = { name: string | null; phone: string };

type RatingRow = { order_no: string; service: 'up' | 'down' | null; packing: 'up' | 'down' | null; missing_items: boolean; comment: string | null };

/** The next step for an order and the button that takes it there. */
const NEXT_ORDER_STEP: Partial<Record<OrderRow['status'], { status: OrderRow['status']; label: string }>> = {
  received: { status: 'shopping', label: 'Start shopping' },
  shopping: { status: 'out-for-delivery', label: 'Out for delivery' },
  'out-for-delivery': { status: 'delivered', label: 'Mark delivered' },
};

const ORDER_STATUS: Record<OrderRow['status'], { label: string; tone: BadgeTone }> = {
  received: { label: 'NEW', tone: 'warning' },
  shopping: { label: 'SHOPPING', tone: 'info' },
  'out-for-delivery': { label: 'OUT FOR DELIVERY', tone: 'info' },
  delivered: { label: 'DELIVERED', tone: 'fresh' },
  cancelled: { label: 'CANCELLED', tone: 'neutral' },
};

const RETURN_STATUS: Record<ReturnRow['status'], { label: string; tone: BadgeTone }> = {
  requested: { label: 'NEW', tone: 'warning' },
  approved: { label: 'APPROVED', tone: 'info' },
  rejected: { label: 'REJECTED', tone: 'neutral' },
  refunded: { label: 'REFUNDED', tone: 'fresh' },
};

const BOOKING_STATUS: Record<BookingRow['status'], { label: string; tone: BadgeTone }> = {
  requested: { label: 'NEW', tone: 'warning' },
  confirmed: { label: 'CONFIRMED', tone: 'info' },
  completed: { label: 'DONE', tone: 'fresh' },
  cancelled: { label: 'CANCELLED', tone: 'neutral' },
};

const REASON_LABEL: Record<string, string> = {
  'wrong-item': 'Wrong item',
  damaged: 'Damaged',
  expired: 'Expired',
  'no-longer-needed': 'No longer needed',
  other: 'Other',
};

const PAYMENT_LABEL: Record<string, string> = { mpesa: 'M-Pesa', cod: 'Cash on delivery', card: 'Card' };

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-KE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

const OPEN_ORDER = (o: OrderRow) => o.status !== 'delivered' && o.status !== 'cancelled';
const OPEN_RETURN = (r: ReturnRow) => r.status === 'requested' || r.status === 'approved';
const OPEN_BOOKING = (b: BookingRow) => b.status === 'requested' || b.status === 'confirmed';

type StaffData = {
  orders: OrderRow[];
  returns: ReturnRow[];
  bookings: BookingRow[];
  customers: Record<string, Customer>;
  ratings: Record<string, RatingRow>;
};

/** "Rider: poor · Packing: good · missing an item · “note”" for an order card. */
const ratingLine = (r: RatingRow) =>
  [
    r.service ? `Rider: ${r.service === 'up' ? 'good' : 'poor'}` : null,
    r.packing ? `Packing: ${r.packing === 'up' ? 'good' : 'poor'}` : null,
    r.missing_items ? 'something was missing' : null,
    r.comment ? `“${r.comment}”` : null,
  ]
    .filter(Boolean)
    .join(' · ');

/** Everything the staff lists show, newest first. */
async function fetchStaffData(): Promise<StaffData | null> {
  const [o, r, b] = await Promise.all([
    supabase
      .from('orders')
      .select(
        'order_no, user_id, created_at, status, is_test, payment_method, contact, address_line, slot_label, store_name, substitution, total, amount_due, points_redeemed, points_earned, rx_reference, order_items(name, quantity)',
      )
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('return_requests')
      .select('id, ref, user_id, order_no, items, reason, notes, refund_to, refund_estimate, status, created_at')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('clinic_bookings')
      .select('id, ref, user_id, service_name, price, store_name, slot_label, notes, status, created_at')
      .order('created_at', { ascending: false })
      .limit(100),
  ]);
  if (o.error || r.error || b.error) return null;
  const orderRows = o.data as OrderRow[];
  const returnRows = r.data as ReturnRow[];
  const bookingRows = b.data as BookingRow[];

  // Phone numbers come from the customers' profiles (staff may read them).
  const ids = [...new Set([...orderRows, ...returnRows, ...bookingRows].map(row => row.user_id).filter((id): id is string => !!id))];
  const people: Record<string, Customer> = {};
  if (ids.length > 0) {
    const { data } = await supabase.from('profiles').select('id, name, phone').in('id', ids);
    for (const row of data ?? []) people[row.id as string] = { name: row.name as string | null, phone: row.phone as string };
  }

  // Ratings for the orders on screen.
  const ratings: Record<string, RatingRow> = {};
  const orderNos = orderRows.map(row => row.order_no);
  if (orderNos.length > 0) {
    const { data } = await supabase.from('order_ratings').select('order_no, service, packing, missing_items, comment').in('order_no', orderNos);
    for (const row of (data ?? []) as RatingRow[]) ratings[row.order_no] = row;
  }

  return { orders: orderRows, returns: returnRows, bookings: bookingRows, customers: people, ratings };
}


export default function StaffRoute() {
  const router = useRouter();
  const { isStaff } = useSession();
  const [tab, setTab] = useState<Tab>('orders');
  const [showClosed, setShowClosed] = useState(false);
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [customers, setCustomers] = useState<Record<string, Customer>>({});
  const [ratings, setRatings] = useState<Record<string, RatingRow>>({});
  /** Key of the card whose action is saving, or waiting for a second tap to cancel. */
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'));

  // Starts in 'loading'; a refresh keeps the current lists on screen until the new ones arrive.
  const apply = useCallback((result: StaffData | null) => {
    if (!result) {
      setStatus('error');
      return;
    }
    setOrders(result.orders);
    setReturns(result.returns);
    setBookings(result.bookings);
    setCustomers(result.customers);
    setRatings(result.ratings);
    setStatus('ready');
  }, []);

  const load = useCallback(() => fetchStaffData().then(apply), [apply]);

  useEffect(() => {
    if (!isStaff) return;
    let live = true;
    fetchStaffData().then(result => {
      if (live) apply(result);
    });
    // New and changed orders appear without a refresh.
    const channel = supabase
      .channel('staff:orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchStaffData().then(result => {
          if (live) apply(result);
        });
      })
      .subscribe();
    return () => {
      live = false;
      void supabase.removeChannel(channel);
    };
  }, [isStaff, apply]);

  const run = async (key: string, action: () => PromiseLike<{ error: unknown }>) => {
    setBusyKey(key);
    setConfirmKey(null);
    setActionError('');
    const { error } = await action();
    setBusyKey(null);
    if (error) setActionError("That change didn't save. Refresh and try again.");
    await load();
  };

  const setOrderStatus = (order: OrderRow, next: OrderRow['status']) =>
    run(`order:${order.order_no}`, () => supabase.rpc('staff_set_order_status', { p_order_no: order.order_no, p_status: next }));

  const setReturnStatus = (row: ReturnRow, next: ReturnRow['status']) =>
    run(`return:${row.id}`, () =>
      supabase.from('return_requests').update({ status: next, updated_at: new Date().toISOString() }).eq('id', row.id),
    );

  const setBookingStatus = (row: BookingRow, next: BookingRow['status']) =>
    run(`booking:${row.id}`, () =>
      supabase.from('clinic_bookings').update({ status: next, updated_at: new Date().toISOString() }).eq('id', row.id),
    );

  const openCounts = useMemo(
    () => ({
      orders: orders.filter(OPEN_ORDER).length,
      returns: returns.filter(OPEN_RETURN).length,
      bookings: bookings.filter(OPEN_BOOKING).length,
    }),
    [orders, returns, bookings],
  );

  const tabs: SegmentedOption<Tab>[] = [
    { value: 'orders', label: `Orders (${openCounts.orders})` },
    { value: 'returns', label: `Returns (${openCounts.returns})` },
    { value: 'bookings', label: `Bookings (${openCounts.bookings})` },
    { value: 'insights', label: 'Insights' },
  ];

  const customerLine = (userId: string | null, fallback?: string) => {
    const person = userId ? customers[userId] : undefined;
    const name = person?.name || fallback || 'Customer';
    return person ? `${name} · ${person.phone}` : name;
  };

  if (!isStaff) {
    return (
      <Screen padded>
        <TopBar title="Staff tools" onBack={goBack} />
        <EmptyState icon="lock" title="Staff only" description="This account isn't on the staff list. Ask the office to add you." />
      </Screen>
    );
  }

  const visibleOrders = showClosed ? orders : orders.filter(OPEN_ORDER);
  const visibleReturns = showClosed ? returns : returns.filter(OPEN_RETURN);
  const visibleBookings = showClosed ? bookings : bookings.filter(OPEN_BOOKING);
  const visibleCount = tab === 'orders' ? visibleOrders.length : tab === 'returns' ? visibleReturns.length : visibleBookings.length;

  return (
    <Screen padded contentStyle={styles.content}>
      <TopBar
        title="Staff tools"
        subtitle="Orders, returns and clinic bookings"
        onBack={goBack}
        actions={<TopBarAction name="refresh" accessibilityLabel="Refresh" onPress={() => void load()} />}
      />

      <Segmented options={tabs} value={tab} onChange={setTab} scrollable />

      {tab === 'insights' ? <InsightsPanel /> : null}

      {tab !== 'insights' ? (
      <View style={styles.filterRow}>
        <Txt variant="caption" color="onSurfaceVariant" style={styles.flex}>
          {showClosed ? 'Showing everything, newest first' : 'Showing what still needs action'}
        </Txt>
        <Button
          label={showClosed ? 'Hide finished' : 'Show finished'}
          size="sm"
          variant="ghost"
          fullWidth={false}
          onPress={() => setShowClosed(value => !value)}
        />
      </View>
      ) : null}

      {actionError ? (
        <Txt variant="caption" color="error">
          {actionError}
        </Txt>
      ) : null}

      {status !== 'ready' && tab !== 'insights' ? (
        <LoadState
          status={status}
          noun="staff lists"
          placeholder="list"
          onRetry={() => {
            setStatus('loading');
            void load();
          }}
        />
      ) : null}

      {status === 'ready' && tab !== 'insights' && visibleCount === 0 ? (
        <EmptyState icon="check-circle" title="Nothing waiting" description="New orders, returns and bookings show up here." />
      ) : null}

      {status === 'ready' && tab === 'orders'
        ? visibleOrders.map(order => {
            const key = `order:${order.order_no}`;
            const next = NEXT_ORDER_STEP[order.status];
            const badge = ORDER_STATUS[order.status];
            return (
              <Card key={key} variant="elevated" padding={spacing.lg} style={styles.card}>
                <View style={styles.head}>
                  <Txt variant="titleLg" style={styles.flex}>
                    {order.order_no}
                  </Txt>
                  {order.is_test ? <Badge label="TEST" tone="neutral" /> : null}
                  <Badge label={badge.label} tone={badge.tone} />
                </View>
                <Txt variant="caption" color="onSurfaceVariant">
                  {`${when(order.created_at)} · ${order.store_name}`}
                </Txt>
                <Txt variant="bodySm">{customerLine(order.user_id, order.contact)}</Txt>
                <Txt variant="bodySm" color="onSurfaceVariant">
                  {order.address_line}
                </Txt>
                <Txt variant="bodySm" color="onSurfaceVariant">
                  {`${order.slot_label} · ${PAYMENT_LABEL[order.payment_method] ?? order.payment_method}`}
                </Txt>
                <Divider />
                {order.order_items.map((item, index) => (
                  <Txt key={`${item.name}-${index}`} variant="bodySm">
                    {`${item.quantity} × ${item.name}`}
                  </Txt>
                ))}
                <Divider />
                <View style={styles.head}>
                  <Txt variant="label" color="onSurfaceVariant" style={styles.flex}>
                    {`If out of stock: ${order.substitution === 'similar' ? 'replace with similar' : order.substitution === 'refund' ? 'refund the item' : 'call the customer'}`}
                  </Txt>
                  <Txt variant="titleLg" color="primary">
                    {formatKes(Number(order.amount_due))}
                  </Txt>
                </View>
                {order.points_redeemed > 0 ? (
                  <Txt variant="caption" color="onSurfaceVariant">
                    {`${order.points_redeemed.toLocaleString('en-KE')} Xana Club points used`}
                  </Txt>
                ) : null}
                {order.rx_reference ? (
                  <Txt variant="caption" color="onSurfaceVariant">
                    {`Prescription ref: ${order.rx_reference}`}
                  </Txt>
                ) : null}
                {next ? (
                  <View style={styles.actions}>
                    <Button
                      label={next.label}
                      size="sm"
                      fullWidth={false}
                      loading={busyKey === key}
                      disabled={busyKey !== null}
                      onPress={() => void setOrderStatus(order, next.status)}
                      style={styles.flex}
                    />
                    <Button
                      label={confirmKey === key ? 'Tap again to cancel' : 'Cancel order'}
                      size="sm"
                      variant={confirmKey === key ? 'danger' : 'outline'}
                      fullWidth={false}
                      disabled={busyKey !== null}
                      onPress={() => (confirmKey === key ? void setOrderStatus(order, 'cancelled') : setConfirmKey(key))}
                      style={styles.flex}
                    />
                  </View>
                ) : null}
                {ratings[order.order_no] ? (
                  <Txt variant="caption" color={ratings[order.order_no].service === 'down' || ratings[order.order_no].packing === 'down' || ratings[order.order_no].missing_items ? 'error' : 'onSurfaceVariant'}>
                    {`Customer rating: ${ratingLine(ratings[order.order_no])}`}
                  </Txt>
                ) : null}
                {order.status === 'out-for-delivery' && order.points_earned > 0 ? (
                  <Txt variant="caption" color="onSurfaceVariant">
                    {`Marking delivered adds ${order.points_earned} points to the customer.`}
                  </Txt>
                ) : null}
              </Card>
            );
          })
        : null}

      {status === 'ready' && tab === 'returns'
        ? visibleReturns.map(row => {
            const key = `return:${row.id}`;
            const badge = RETURN_STATUS[row.status];
            return (
              <Card key={key} variant="elevated" padding={spacing.lg} style={styles.card}>
                <View style={styles.head}>
                  <Txt variant="titleLg" style={styles.flex}>
                    {row.ref}
                  </Txt>
                  <Badge label={badge.label} tone={badge.tone} />
                </View>
                <Txt variant="caption" color="onSurfaceVariant">
                  {`${when(row.created_at)} · order ${row.order_no}`}
                </Txt>
                <Txt variant="bodySm">{customerLine(row.user_id)}</Txt>
                <Divider />
                {row.items.map((item, index) => (
                  <Txt key={`${item.name}-${index}`} variant="bodySm">
                    {`${item.quantity} × ${item.name}`}
                  </Txt>
                ))}
                <Txt variant="bodySm" color="onSurfaceVariant">
                  {`Reason: ${REASON_LABEL[row.reason] ?? row.reason}`}
                </Txt>
                {row.notes ? (
                  <Txt variant="bodySm" color="onSurfaceVariant">
                    {`“${row.notes}”`}
                  </Txt>
                ) : null}
                <Divider />
                <View style={styles.head}>
                  <Txt variant="label" color="onSurfaceVariant" style={styles.flex}>
                    {row.refund_to === 'mpesa' ? 'Refund to M-Pesa' : 'Refund as Xana Club credit'}
                  </Txt>
                  <Txt variant="titleLg" color="primary">
                    {formatKes(Number(row.refund_estimate))}
                  </Txt>
                </View>
                {row.status === 'requested' ? (
                  <View style={styles.actions}>
                    <Button
                      label="Approve"
                      size="sm"
                      fullWidth={false}
                      loading={busyKey === key}
                      disabled={busyKey !== null}
                      onPress={() => void setReturnStatus(row, 'approved')}
                      style={styles.flex}
                    />
                    <Button
                      label={confirmKey === key ? 'Tap again to reject' : 'Reject'}
                      size="sm"
                      variant={confirmKey === key ? 'danger' : 'outline'}
                      fullWidth={false}
                      disabled={busyKey !== null}
                      onPress={() => (confirmKey === key ? void setReturnStatus(row, 'rejected') : setConfirmKey(key))}
                      style={styles.flex}
                    />
                  </View>
                ) : null}
                {row.status === 'approved' ? (
                  <Button
                    label="Mark refunded"
                    size="sm"
                    loading={busyKey === key}
                    disabled={busyKey !== null}
                    onPress={() => void setReturnStatus(row, 'refunded')}
                  />
                ) : null}
              </Card>
            );
          })
        : null}

      {status === 'ready' && tab === 'bookings'
        ? visibleBookings.map(row => {
            const key = `booking:${row.id}`;
            const badge = BOOKING_STATUS[row.status];
            return (
              <Card key={key} variant="elevated" padding={spacing.lg} style={styles.card}>
                <View style={styles.head}>
                  <Txt variant="titleLg" style={styles.flex}>
                    {row.service_name}
                  </Txt>
                  <Badge label={badge.label} tone={badge.tone} />
                </View>
                <Txt variant="caption" color="onSurfaceVariant">
                  {`${row.ref} · booked ${when(row.created_at)}`}
                </Txt>
                <Txt variant="bodySm">{customerLine(row.user_id)}</Txt>
                <Txt variant="bodySm" color="onSurfaceVariant">
                  {`${row.slot_label} · ${row.store_name}`}
                </Txt>
                {row.notes ? (
                  <Txt variant="bodySm" color="onSurfaceVariant">
                    {`“${row.notes}”`}
                  </Txt>
                ) : null}
                <Txt variant="label" color="primary">
                  {formatKes(Number(row.price))}
                </Txt>
                {row.status === 'requested' ? (
                  <View style={styles.actions}>
                    <Button
                      label="Confirm slot"
                      size="sm"
                      fullWidth={false}
                      loading={busyKey === key}
                      disabled={busyKey !== null}
                      onPress={() => void setBookingStatus(row, 'confirmed')}
                      style={styles.flex}
                    />
                    <Button
                      label={confirmKey === key ? 'Tap again to cancel' : 'Cancel'}
                      size="sm"
                      variant={confirmKey === key ? 'danger' : 'outline'}
                      fullWidth={false}
                      disabled={busyKey !== null}
                      onPress={() => (confirmKey === key ? void setBookingStatus(row, 'cancelled') : setConfirmKey(key))}
                      style={styles.flex}
                    />
                  </View>
                ) : null}
                {row.status === 'confirmed' ? (
                  <View style={styles.actions}>
                    <Button
                      label="Mark done"
                      size="sm"
                      fullWidth={false}
                      loading={busyKey === key}
                      disabled={busyKey !== null}
                      onPress={() => void setBookingStatus(row, 'completed')}
                      style={styles.flex}
                    />
                    <Button
                      label={confirmKey === key ? 'Tap again to cancel' : 'Cancel'}
                      size="sm"
                      variant={confirmKey === key ? 'danger' : 'outline'}
                      fullWidth={false}
                      disabled={busyKey !== null}
                      onPress={() => (confirmKey === key ? void setBookingStatus(row, 'cancelled') : setConfirmKey(key))}
                      style={styles.flex}
                    />
                  </View>
                ) : null}
              </Card>
            );
          })
        : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  flex: { flex: 1 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  card: { gap: spacing.xs },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
});
