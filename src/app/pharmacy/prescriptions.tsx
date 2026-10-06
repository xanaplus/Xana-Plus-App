import { useCallback } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Badge, Button, Card, Icon, Screen, TopBar, Txt } from '@/components/ui';
import { STATUS_LABELS, usePrescriptionList, type Prescription } from '@/features/prescriptions/api';
import { ErrorNotice } from '@/features/prescriptions/ui';
import { useSession } from '@/store/session';
import { colors, radius, spacing } from '@/theme';

const tone = (status: Prescription['status']): 'neutral' | 'info' | 'fresh' | 'warning' => ({
  draft: 'neutral', submitted: 'info', quoted: 'fresh', rejected: 'warning', ordered: 'fresh', cancelled: 'neutral',
}[status] as 'neutral' | 'info' | 'fresh' | 'warning');

export default function PrescriptionsScreen() {
  const router = useRouter();
  const { isAuthenticated } = useSession();
  const { records, loading, error, refresh } = usePrescriptionList();
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  return <Screen padded contentStyle={styles.content}>
    <TopBar title="My prescriptions" subtitle="Private requests and pharmacist quotes" onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/pharmacy')} />
    <View style={styles.actions}><Button label="Upload a prescription" icon="prescription" iconPosition="leading" fullWidth onPress={() => router.push('/pharmacy/upload')} /></View>
    <Card variant="tinted" padding={spacing.lg} style={styles.explainer}><Icon name="shield" size={18} color="primaryContainer" /><Txt variant="bodySm" color="onSurfaceVariant" style={styles.explainerText}>A pharmacist reviews your prescription and sends an exact priced list. Nothing is ordered until you confirm that quote.</Txt></Card>
    <View style={styles.listHead}><Txt variant="titleLg">Your requests</Txt><Pressable accessibilityRole="button" onPress={() => void refresh()}><Txt variant="label" color="primaryContainer">Refresh</Txt></Pressable></View>
    {!isAuthenticated ? <Card variant="elevated" padding={spacing.lg} style={styles.empty}><Txt variant="title">Sign in to view your prescriptions</Txt><Txt variant="bodySm" color="onSurfaceVariant">Prescription records are private to your account.</Txt><Button label="Sign in" onPress={() => router.push('/login')} /></Card> :
      loading && records.length === 0 ? <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Txt variant="bodySm" color="onSurfaceVariant">Loading your requests…</Txt></View> :
      error ? <ErrorNotice message={error} onRetry={() => void refresh()} /> :
      records.length === 0 ? <Card variant="elevated" padding={spacing.lg} style={styles.empty}><View style={styles.emptyGlyph}><Icon name="prescription" size={23} color="primaryContainer" /></View><Txt variant="title">No prescription requests yet</Txt><Txt variant="bodySm" color="onSurfaceVariant">Start by adding a clear photo of the prescription. A quote comes back here for your review.</Txt><Button label="Upload prescription" onPress={() => router.push('/pharmacy/upload')} /></Card> :
      <View style={styles.list}>{records.map(record => <Pressable key={record.id} accessibilityRole="button" onPress={() => router.push(`/pharmacy/prescription/${record.id}`)}>
        <Card variant="elevated" padding={spacing.lg} style={styles.record}>
          <View style={styles.recordHead}><View style={styles.recordTitle}><Txt variant="title">{record.patient_name}</Txt><Txt variant="caption" color="onSurfaceVariant">{new Date(record.created_at).toLocaleDateString('en-KE')} · {record.files.length} {record.files.length === 1 ? 'photo' : 'photos'}</Txt></View><Badge label={STATUS_LABELS[record.status]} tone={tone(record.status)} /></View>
          <Txt variant="caption" color="onSurfaceVariant" numberOfLines={1}>{record.doctor ? `Prescriber: ${record.doctor}` : 'Prescription review request'}</Txt>
          {record.status === 'quoted' ? <Txt variant="label" color="primaryContainer">Quote ready · review and confirm</Txt> : null}
          {record.status === 'draft' ? <Txt variant="label" color="secondary">Continue adding photos and submit</Txt> : null}
          <View style={styles.openRow}><Txt variant="label" color="primaryContainer">View request</Txt><Icon name="arrow-right" size={16} color="primaryContainer" /></View>
        </Card>
      </Pressable>)}</View>}
    {loading && records.length > 0 ? <Txt variant="caption" color="onSurfaceVariant" align="center">Refreshing…</Txt> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.giant }, actions: { marginTop: spacing.xs }, explainer: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }, explainerText: { flex: 1 },
  listHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md }, list: { gap: spacing.md },
  record: { gap: spacing.md }, recordHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }, recordTitle: { flex: 1, gap: spacing.xxs },
  openRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.outlineVariant },
  empty: { gap: spacing.md, alignItems: 'flex-start' }, emptyGlyph: { width: 48, height: 48, borderRadius: radius.pill, backgroundColor: colors.mintSurface, alignItems: 'center', justifyContent: 'center' },
  loading: { padding: spacing.xxl, alignItems: 'center', gap: spacing.md },
});
