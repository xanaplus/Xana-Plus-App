import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, Divider, EmptyState, Icon, Screen, SelectableOption, TopBar, Txt } from '@/components/ui';
import { clinicalServiceById } from '@/data/clinical';
import { stores } from '@/data/catalog';
import { AuthSheet } from '@/features/auth/auth-sheet';
import { successFeedback } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/store/session';
import { colors, radius, spacing } from '@/theme';

const TIME_SLOTS = ['09:30 AM', '10:15 AM', '11:00 AM', '02:30 PM', '04:00 PM', '05:15 PM'];

/** Next 5 days, matching the horizontal date strip on the frame. */
const upcomingDays = () => {
  const days: { label: string; date: number; day: string }[] = [];
  const today = new Date();
  for (let i = 0; i < 5; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push({
      label: i === 0 ? 'TODAY' : i === 1 ? 'TMRW' : d.toLocaleDateString('en-KE', { weekday: 'short' }).toUpperCase(),
      date: d.getDate(),
      day: d.toLocaleDateString('en-KE', { weekday: 'short' }),
    });
  }
  return days;
};

/** Screen 2: Clinical Service Booking Detail (FR-F.10). */
export default function ClinicalBookingRoute() {
  const router = useRouter();
  const { serviceId } = useLocalSearchParams<{ serviceId: string }>();
  const service = clinicalServiceById(String(serviceId));

  const days = useMemo(() => upcomingDays(), []);
  const [branchId, setBranchId] = useState<string>(stores[0]?.id ?? '');
  const [dayIndex, setDayIndex] = useState(0);
  const [slot, setSlot] = useState(TIME_SLOTS[1]);
  const [notes, setNotes] = useState('');
  const [confirmed, setConfirmed] = useState<{ branch: string; when: string; ref: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const { isAuthenticated } = useSession();

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/pharmacy'));
  const branch = stores.find(s => s.id === branchId) ?? stores[0];
  const day = days[dayIndex];

  if (!service) {
    return (
      <Screen padded>
        <TopBar title="Book a service" onBack={goBack} />
        <EmptyState icon="stethoscope" title="Service not found" description="This clinical service is no longer listed." />
      </Screen>
    );
  }

  const when = `${day.label === 'TODAY' ? 'Today' : day.day} ${day.date} at ${slot}`;

  // Saved to Supabase so the branch sees it in Staff tools. A booking needs an account the branch can call.
  const confirm = async () => {
    if (saving) return;
    if (!isAuthenticated) {
      setSignInOpen(true);
      return;
    }
    setSaving(true);
    setSaveFailed(false);
    const { data, error } = await supabase
      .from('clinic_bookings')
      .insert({
        service_id: service.id,
        service_name: service.name,
        price: service.price,
        store_name: branch.name,
        slot_label: when,
        notes: notes.trim() || null,
      })
      .select('ref')
      .single();
    setSaving(false);
    if (error || !data) {
      setSaveFailed(true);
      return;
    }
    successFeedback();
    setConfirmed({ branch: branch.name, when, ref: data.ref });
  };

  if (confirmed) {
    return (
      <Screen padded contentStyle={styles.content}>
        <TopBar title="Booking requested" onBack={goBack} />
        <Card variant="elevated" padding={spacing.lg} style={styles.confirmCard}>
          <View style={styles.confirmIcon}>
            <Icon name="check-circle" size={28} color="primaryContainer" />
          </View>
          <Txt variant="titleLg">{service.name}</Txt>
          <Txt variant="bodySm" color="onSurfaceVariant">
            {`${confirmed.branch} · ${confirmed.when}`}
          </Txt>
          <Txt variant="bodySm" color="onSurfaceVariant">
            {`Total due: KES ${service.price.toLocaleString('en-KE')} · pay at clinic or via M-Pesa`}
          </Txt>
          <Txt variant="caption" color="onSurfaceVariant">
            {`Reference ${confirmed.ref} · the branch will call to confirm your slot.`}
          </Txt>
        </Card>
        <Button
          label="Back to Clinical Services"
          onPress={() => router.replace('/pharmacy/clinical' as Parameters<typeof router.replace>[0])}
        />
      </Screen>
    );
  }

  return (
    <Screen
      padded
      contentStyle={styles.content}
      footer={
        <View style={styles.footer}>
          {saveFailed ? (
            <Txt variant="caption" color="error" align="center">
              Couldn&apos;t send your booking. Check your connection and try again.
            </Txt>
          ) : null}
          <Button
            label={saving ? 'Sending…' : `Confirm Booking · KES ${service.price.toLocaleString('en-KE')}`}
            icon="check-circle"
            iconPosition="leading"
            size="lg"
            disabled={saving}
            onPress={() => void confirm()}
          />
          <Txt variant="caption" color="onSurfaceVariant" align="center">
            {isAuthenticated ? 'Free cancellation up to 1h prior · the branch calls to confirm' : 'Log in to book · the branch calls to confirm'}
          </Txt>
        </View>
      }
    >
      <TopBar title="Service Details & Screening" subtitle="Xana Plus" onBack={goBack} />

      <Card variant="outline" padding={spacing.lg} style={styles.card}>
        <View style={styles.heroTop}>
          <Txt variant="caption" color="onSurfaceVariant">{`Preventive Care · ${service.durationMinutes} mins`}</Txt>
          <View style={styles.heroPrice}>
            <Txt variant="titleLg" color="primary">{`KES ${service.price.toLocaleString('en-KE')}`}</Txt>
            <Txt variant="caption" color="onSurfaceVariant">Self-pay or M-Pesa</Txt>
          </View>
        </View>
        <Txt variant="headlineSm">{service.name}</Txt>
        <Txt variant="bodySm" color="onSurfaceVariant">{service.description}</Txt>
      </Card>

      <View style={styles.sectionHead}>
        <Icon name="store" size={16} color="onSurfaceVariant" />
        <Txt variant="titleLg">Select Pharmacy Branch</Txt>
      </View>
      <View style={styles.card}>
        {stores.map((entry, index) => (
          <View key={entry.id}>
            {index > 0 ? <Divider /> : null}
            <SelectableOption
              title={entry.name}
              description={`${entry.address}`}
              indicator="radio"
              selected={branchId === entry.id}
              onPress={() => setBranchId(entry.id)}
            />
          </View>
        ))}
      </View>

      <View style={styles.sectionHead}>
        <Icon name="calendar" size={16} color="onSurfaceVariant" />
        <Txt variant="titleLg">Select Date</Txt>
      </View>
      <View style={styles.dateRow}>
        {days.map((entry, index) => {
          const active = dayIndex === index;
          return (
            <Pressable key={entry.label + entry.date} accessibilityRole="button" onPress={() => setDayIndex(index)} style={[styles.dateChip, active ? styles.dateChipActive : null]}>
              <Txt variant="micro" tint={active ? colors.onPrimary : colors.onSurfaceVariant}>{entry.label}</Txt>
              <Txt variant="titleLg" tint={active ? colors.onPrimary : colors.onSurface}>{entry.date}</Txt>
              <Txt variant="caption" tint={active ? colors.onPrimary : colors.onSurfaceVariant}>{entry.day}</Txt>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.sectionHead}>
        <Icon name="clock" size={16} color="onSurfaceVariant" />
        <Txt variant="titleLg">Available Time Slots</Txt>
      </View>
      <View style={styles.slotRow}>
        {TIME_SLOTS.map(time => {
          const active = slot === time;
          return (
            <Pressable key={time} accessibilityRole="button" onPress={() => setSlot(time)} style={[styles.slotChip, active ? styles.slotChipActive : null]}>
              <Txt variant="label" tint={active ? colors.onPrimary : colors.onSurface}>{time}</Txt>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.sectionHead}>
        <Icon name="edit" size={16} color="onSurfaceVariant" />
        <Txt variant="titleLg">Notes or symptoms for pharmacist</Txt>
        <Txt variant="caption" color="onSurfaceVariant">(Optional)</Txt>
      </View>
      <TextInput
        value={notes}
        onChangeText={text => setNotes(text.slice(0, 200))}
        placeholder="e.g. routine check-up, any symptoms to flag"
        placeholderTextColor={colors.outline}
        multiline
        style={styles.textarea}
      />
      <Txt variant="caption" color="onSurfaceVariant" align="right">{`${notes.length}/200`}</Txt>

      <Card variant="outline" padding={spacing.lg} style={styles.card}>
        <Txt variant="titleLg">Booking Breakdown</Txt>
        <SummaryLine label="Service" value={`${service.name} · KES ${service.price.toLocaleString('en-KE')}`} />
        <SummaryLine label="Location" value={branch.name} />
        <SummaryLine label="Date & Time" value={`${day.label === 'TODAY' ? 'Today' : day.day} ${day.date} at ${slot}`} />
        <SummaryLine label="Attending" value="Licensed Clinical Pharmacist" />
        <Divider />
        <View style={styles.totalRow}>
          <Txt variant="titleLg">Total Due</Txt>
          <Txt variant="titleLg" color="primary">{`KES ${service.price.toLocaleString('en-KE')}`}</Txt>
        </View>
      </Card>
      <AuthSheet visible={signInOpen} onClose={() => setSignInOpen(false)} onSuccess={() => setSignInOpen(false)} />
    </Screen>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Txt variant="bodySm" color="onSurfaceVariant" style={styles.flex} numberOfLines={2}>{label}</Txt>
      <Txt variant="label" numberOfLines={2} style={styles.summaryValue}>{value}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.giant },
  card: { gap: spacing.sm },
  flex: { flex: 1 },

  heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  heroPrice: { alignItems: 'flex-end' },

  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },

  dateRow: { flexDirection: 'row', gap: spacing.sm },
  dateChip: { flex: 1, alignItems: 'center', gap: spacing.xxs, paddingVertical: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.surfaceContainerLow },
  dateChipActive: { backgroundColor: colors.primary },

  slotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slotChip: { paddingHorizontal: spacing.md, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceContainerLow },
  slotChipActive: { backgroundColor: colors.primary },

  textarea: { minHeight: 72, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outlineSoft30, backgroundColor: colors.surface, color: colors.onSurface, fontSize: 14, textAlignVertical: 'top' },

  summaryRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  summaryValue: { flexShrink: 1, textAlign: 'right' },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  confirmCard: { gap: spacing.sm, alignItems: 'flex-start', borderWidth: 1, borderColor: colors.mintEdge },
  confirmIcon: { width: 48, height: 48, borderRadius: radius.pill, backgroundColor: colors.mintSurface, alignItems: 'center', justifyContent: 'center' },
  footer: { gap: spacing.sm },
});
