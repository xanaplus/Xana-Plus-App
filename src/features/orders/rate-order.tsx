import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, Chip, Icon, Txt } from '@/components/ui';
import { track } from '@/lib/analytics';
import { successFeedback } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/store/session';
import { colors, radius, spacing } from '@/theme';

/**
 * "How was your order?" on a delivered order: a thumb for the rider (or the
 * counter, for pickup) and for the packing, a "something was missing" flag and
 * an optional note. One rating per order; staff read them in Staff tools.
 */

type Thumb = 'up' | 'down';
type Saved = { service: Thumb | null; packing: Thumb | null; missing_items: boolean; comment: string | null };

const MAX_COMMENT = 500;

export function RateOrder({ orderNo, pickup }: { orderNo: string; pickup: boolean }) {
  const { user } = useSession();
  const userId = user?.id;
  const [status, setStatus] = useState<'loading' | 'open' | 'sending' | 'done'>('loading');
  const [saved, setSaved] = useState<Saved | null>(null);
  const [service, setService] = useState<Thumb | null>(null);
  const [packing, setPacking] = useState<Thumb | null>(null);
  const [missing, setMissing] = useState(false);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!userId) return;
    let live = true;
    supabase
      .from('order_ratings')
      .select('service, packing, missing_items, comment')
      // Staff can read everyone's ratings, so ask for this customer's own.
      .eq('user_id', userId)
      .eq('order_no', orderNo)
      .maybeSingle()
      .then(({ data }) => {
        if (!live) return;
        if (data) {
          setSaved(data as Saved);
          setStatus('done');
        } else setStatus('open');
      });
    return () => {
      live = false;
    };
  }, [userId, orderNo]);

  if (!userId || status === 'loading') return null;

  const serviceLabel = pickup ? 'Counter service' : 'Rider';

  if (status === 'done') {
    const s = saved;
    const parts = s
      ? [
          s.service ? `${serviceLabel}: ${s.service === 'up' ? 'good' : 'poor'}` : null,
          s.packing ? `Packing: ${s.packing === 'up' ? 'good' : 'poor'}` : null,
          s.missing_items ? 'Something was missing' : null,
        ].filter(Boolean)
      : [];
    return (
      <Card variant="elevated" padding={spacing.lg} style={styles.card}>
        <View style={styles.head}>
          <Icon name="check-circle" size={18} color="primaryContainer" />
          <Txt variant="label">Thanks for rating this order</Txt>
        </View>
        {parts.length > 0 ? (
          <Txt variant="caption" color="onSurfaceVariant">
            {parts.join(' · ')}
          </Txt>
        ) : null}
        {s?.missing_items ? (
          <Txt variant="caption" color="onSurfaceVariant">
            The branch will call you about the missing item. You can also request a return below.
          </Txt>
        ) : null}
      </Card>
    );
  }

  const ready = service !== null || packing !== null || missing || comment.trim() !== '';

  const send = async () => {
    setStatus('sending');
    setError('');
    const row: Saved = { service, packing, missing_items: missing, comment: comment.trim() || null };
    const { error: insertError } = await supabase.from('order_ratings').insert({ ...row, order_no: orderNo });
    // 23505: already rated (from another phone) — treat it as sent.
    if (insertError && insertError.code !== '23505') {
      setStatus('open');
      setError("That didn't send. Check your connection and try again.");
      return;
    }
    successFeedback();
    track('rating_sent', { service, packing, missing });
    setSaved(row);
    setStatus('done');
  };

  return (
    <Card variant="elevated" padding={spacing.lg} style={styles.card}>
      <Txt variant="titleLg">How was your order?</Txt>
      <Txt variant="caption" color="onSurfaceVariant">
        One tap is enough. It goes straight to the branch.
      </Txt>

      <ThumbRow label={serviceLabel} value={service} onChange={setService} />
      <ThumbRow label="Packing" value={packing} onChange={setPacking} />

      <View style={styles.chips}>
        <Chip label="Something was missing" icon="alert-triangle" tone="outline" selected={missing} onPress={() => setMissing(v => !v)} />
      </View>

      <View style={styles.inputWrap}>
        <TextInput
          value={comment}
          onChangeText={text => setComment(text.slice(0, MAX_COMMENT))}
          placeholder="Anything else? (optional)"
          placeholderTextColor={colors.outline}
          multiline
          accessibilityLabel="Comment about this order"
          style={styles.input}
        />
      </View>

      {error ? (
        <Txt variant="caption" tint={colors.error}>
          {error}
        </Txt>
      ) : null}

      <Button label="Send rating" size="sm" loading={status === 'sending'} disabled={!ready || status === 'sending'} onPress={() => void send()} />
    </Card>
  );
}

function ThumbRow({ label, value, onChange }: { label: string; value: Thumb | null; onChange: (next: Thumb | null) => void }) {
  return (
    <View style={styles.row}>
      <Txt variant="bodySm" style={styles.flex}>
        {label}
      </Txt>
      <Chip
        label="Good"
        icon={value === 'up' ? 'thumbs-up-filled' : 'thumbs-up'}
        tone="outline"
        selected={value === 'up'}
        onPress={() => onChange(value === 'up' ? null : 'up')}
      />
      <Chip
        label="Poor"
        icon={value === 'down' ? 'thumbs-down-filled' : 'thumbs-down'}
        tone="outline"
        selected={value === 'down'}
        onPress={() => onChange(value === 'down' ? null : 'down')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  inputWrap: {
    minHeight: 72,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineSoft30,
    backgroundColor: colors.surface,
  },
  input: { flex: 1, color: colors.onSurface, fontSize: 15, padding: 0, textAlignVertical: 'top' },
});
