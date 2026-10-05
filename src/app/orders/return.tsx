import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  Chip,
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
import { formatKes } from '@/lib/format';
import { successFeedback } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { unitPrice } from '@/store/cart';
import { useOrders } from '@/store/orders';
import { colors, radius, spacing } from '@/theme';

type Reason = 'wrong-item' | 'damaged' | 'expired' | 'no-longer-needed' | 'other';

const REASONS: { value: Reason; label: string }[] = [
  { value: 'wrong-item', label: 'Wrong item' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'expired', label: 'Expired' },
  { value: 'no-longer-needed', label: 'No longer needed' },
  { value: 'other', label: 'Other' },
];

type RefundDestination = 'mpesa' | 'club-credit';

/** Xana Club account credit carries a 5% bonus over the cash refund value. */
const CLUB_CREDIT_BONUS = 0.05;

/** Screen: Request a Return & Refund (FR-E.6) — reached from a delivered order. */
export default function RequestReturnRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orderById } = useOrders();
  const order = orderById(String(id));

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState<Reason | null>(null);
  const [notes, setNotes] = useState('');
  const [destination, setDestination] = useState<RefundDestination>('mpesa');
  const [submitted, setSubmitted] = useState<{ ref: string; at: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/orders'));

  const lines = useMemo(() => {
    if (!order) return [];
    return order.lines.flatMap(line => {
      const product = productById(line.productId);
      if (!product) return [];
      const lineTotal = unitPrice(product, line.quantity) * line.quantity;
      return [{ product, quantity: line.quantity, lineTotal }];
    });
  }, [order]);

  const selectedLines = lines.filter(line => selected[line.product.id]);
  const refundEstimate = selectedLines.reduce((sum, line) => sum + line.lineTotal, 0);
  const creditValue = Math.round(refundEstimate * (1 + CLUB_CREDIT_BONUS));
  const canSubmit = selectedLines.length > 0 && reason !== null;

  const toggle = (productId: string) => setSelected(current => ({ ...current, [productId]: !current[productId] }));

  // Saved to Supabase so the branch sees it in Staff tools; the reference comes back from the database.
  const submit = async () => {
    if (!canSubmit || sending || !order) return;
    setSending(true);
    setSendFailed(false);
    const { data, error } = await supabase
      .from('return_requests')
      .insert({
        order_no: order.id,
        items: selectedLines.map(line => ({
          item_no: line.product.id,
          name: line.product.name,
          quantity: line.quantity,
          line_total: line.lineTotal,
        })),
        reason,
        notes: notes.trim() || null,
        refund_to: destination,
        refund_estimate: destination === 'mpesa' ? refundEstimate : creditValue,
      })
      .select('ref, created_at')
      .single();
    setSending(false);
    if (error || !data) {
      setSendFailed(true);
      return;
    }
    successFeedback();
    setSubmitted({
      ref: data.ref,
      at: new Date(data.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }),
    });
  };

  if (!order) {
    return (
      <Screen padded>
        <TopBar title="Request a Return" onBack={goBack} />
        <EmptyState icon="delivery" title="Order not found" description="This order is no longer available." />
      </Screen>
    );
  }

  if (submitted) {
    return (
      <Screen padded contentStyle={styles.content}>
        <TopBar title="Request a Return" onBack={goBack} />
        <Card variant="elevated" padding={spacing.lg} style={styles.confirmCard}>
          <View style={styles.confirmHead}>
            <View style={styles.confirmIcon}>
              <Icon name="check-circle" size={22} color="primaryContainer" />
            </View>
            <View style={styles.flex}>
              <Txt variant="titleLg">Return request sent</Txt>
              <Badge label={`REF #${submitted.ref}`} tone="info" />
            </View>
          </View>
          <Txt variant="bodySm" color="onSurfaceVariant">
            {`Submitted today at ${submitted.at}`}
          </Txt>
          <Txt variant="bodySm" color="onSurfaceVariant">
            The {order.storeName} team reviews your request.{' '}
            {destination === 'mpesa'
              ? 'Once it is approved, the branch raises a credit note and pays your M-Pesa refund.'
              : 'Once it is approved, the branch adds the credit to your Xana Club account.'}{' '}
            Quote the reference above if you call the branch.
          </Txt>
          <View style={styles.confirmTotal}>
            <Txt variant="label" color="onSurfaceVariant">Refund amount</Txt>
            <Txt variant="headlineSm" color="primary">
              {destination === 'mpesa' ? formatKes(refundEstimate) : `${formatKes(creditValue)} credit`}
            </Txt>
          </View>
        </Card>
        <View style={styles.confirmActions}>
          <Button label="Back to Orders" variant="outline" style={styles.flex} onPress={() => router.replace('/orders')} />
          <Button label="View Order" style={styles.flex} onPress={() => router.replace(`/orders/${order.id}`)} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      padded
      contentStyle={styles.content}
      footer={
        <View style={styles.footer}>
          {sendFailed ? (
            <Txt variant="caption" color="error" align="center">
              Couldn&apos;t send your request. Check your connection and try again.
            </Txt>
          ) : null}
          <Button
            label={sending ? 'Sending…' : `Submit request${selectedLines.length > 0 ? ` · ${formatKes(refundEstimate)}` : ''}`}
            icon="check-circle"
            iconPosition="leading"
            size="lg"
            disabled={!canSubmit || sending}
            onPress={() => void submit()}
          />
        </View>
      }
    >
      <TopBar title="Request a Return" onBack={goBack} />

      <Card variant="outline" padding={spacing.lg} style={styles.card}>
        <View style={styles.orderHead}>
          <View>
            <Txt variant="overline" color="onSurfaceVariant">REFERENCE</Txt>
            <Txt variant="titleLg">{`Order #${order.id}`}</Txt>
          </View>
          <Badge label="Delivered" tone="fresh" />
        </View>
        <Txt variant="bodySm" color="onSurfaceVariant">{`${order.placed} · ${order.storeName}`}</Txt>
      </Card>

      <SectionHeader title="Select items to return" style={styles.sectionHead} />
      <Card variant="outline" padding={spacing.none} style={styles.card}>
        {lines.map((line, index) => (
          <View key={line.product.id}>
            {index > 0 ? <Divider inset={spacing.lg} /> : null}
            <SelectableOption
              title={line.product.name}
              description={`${line.product.pack} · Qty: ${line.quantity} · ${formatKes(line.lineTotal)}`}
              indicator="check"
              selected={!!selected[line.product.id]}
              onPress={() => toggle(line.product.id)}
            />
          </View>
        ))}
      </Card>

      {selectedLines.length > 0 ? (
        <View style={[styles.refundPill, styles.inset]}>
          <Txt variant="label" color="onSurfaceVariant">{`Refund estimate (${selectedLines.length} ${selectedLines.length === 1 ? 'item' : 'items'})`}</Txt>
          <Txt variant="titleLg" color="primary">{formatKes(refundEstimate)}</Txt>
        </View>
      ) : null}

      <SectionHeader title="Reason for return" style={styles.sectionHead} />
      <View style={[styles.chipRow, styles.inset]}>
        {REASONS.map(option => (
          <Chip key={option.value} label={option.label} selected={reason === option.value} onPress={() => setReason(option.value)} />
        ))}
      </View>
      <View style={styles.inset}>
        <TextInput
          value={notes}
          onChangeText={text => setNotes(text.slice(0, 200))}
          placeholder="Additional notes for our QA team (optional)"
          placeholderTextColor={colors.outline}
          multiline
          style={styles.textarea}
        />
        <Txt variant="caption" color="onSurfaceVariant" align="right">{`${notes.length}/200`}</Txt>
      </View>

      <SectionHeader title="Refund destination" style={styles.sectionHead} />
      <View style={[styles.card, styles.inset]}>
        <SelectableOption
          title="M-Pesa (same number used to pay)"
          description="Refunded to your M-Pesa line once approved and a credit note is raised."
          indicator="radio"
          selected={destination === 'mpesa'}
          onPress={() => setDestination('mpesa')}
        />
        <SelectableOption
          title="Xana Club account credit"
          description={`Immediate store credit · 5% bonus applied${selectedLines.length > 0 ? ` (${formatKes(creditValue)})` : ''}.`}
          indicator="radio"
          selected={destination === 'club-credit'}
          onPress={() => setDestination('club-credit')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: { gap: spacing.sm },
  content: { gap: spacing.md, paddingBottom: spacing.giant },
  card: { gap: spacing.sm },
  inset: {},
  sectionHead: { marginTop: spacing.sm },

  orderHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },

  refundPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.mintSubtle,
  },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  textarea: {
    minHeight: 72,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineSoft30,
    backgroundColor: colors.surface,
    color: colors.onSurface,
    fontSize: 14,
    textAlignVertical: 'top',
  },

  confirmCard: { gap: spacing.md, borderWidth: 1, borderColor: colors.mintEdge },
  confirmHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  confirmIcon: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.mintSurface, alignItems: 'center', justifyContent: 'center' },
  confirmTotal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.surfaceContainerHigh },
  confirmActions: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
