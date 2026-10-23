import { useCallback } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Badge, Button, Card, Icon, Screen, TopBar, Txt } from '@/components/ui';
import { STATUS_LABELS, usePrescriptionList, type Prescription } from '@/features/prescriptions/api';
import { ErrorNotice } from '@/features/prescriptions/ui';
import { useSession } from '@/store/session';
import { radius, spacing } from '@/theme';
import { useTheme, useThemeStyles } from '@/theme/provider';
import type { Palette } from '@/theme';

function tone(status: Prescription['status']): 'neutral' | 'info' | 'fresh' | 'warning' {
  const tones: Record<string, 'neutral' | 'info' | 'fresh' | 'warning'> = {
    draft: 'neutral', submitted: 'info', quoted: 'fresh', rejected: 'warning', ordered: 'fresh', cancelled: 'neutral',
    clarification: 'info', held: 'warning',
  };
  return tones[status] ?? 'neutral';
}

export default function PrescriptionHistoryScreen() {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const router = useRouter();
  const { isAuthenticated } = useSession();
  const { records, loading, error, refresh } = usePrescriptionList();
  useFocusEffect(useCallback(() => { if (isAuthenticated) void refresh(); }, [isAuthenticated, refresh]));

  return <Screen padded contentStyle={styles.content}>
    <TopBar title="Prescription history" onBack={() => router.replace('/pharmacy/prescriptions')} />
    <Card variant="tinted" padding={spacing.lg} style={styles.notice}>
      <Icon name="info" size={18} color="primaryAccent" />
      <Txt variant="bodySm" color="onSurfaceVariant" style={styles.flex}>
        This does not reorder medicine. To get it again, upload a current prescription for pharmacist review.
      </Txt>
    </Card>
    {!isAuthenticated ? <Card variant="elevated" padding={spacing.lg} style={styles.state}>
      <Icon name="lock" size={22} color="primaryAccent" />
      <Txt variant="title">Sign in to view your history</Txt>
      <Txt variant="bodySm" color="onSurfaceVariant">Prescription records are private to your account.</Txt>
      <Button label="Sign in" onPress={() => router.push('/login')} />
      <Button label="Back to pharmacy" variant="outline" onPress={() => router.replace('/(tabs)/pharmacy')} />
    </Card> : <>
      <Button label="Upload a new prescription" icon="prescription" iconPosition="leading" fullWidth onPress={() => router.push('/pharmacy/upload')} />
      {loading && records.length === 0 ? <Card variant="flat" padding={spacing.lg} style={styles.state}>
        <View style={styles.skeletonWide} /><View style={styles.skeletonShort} />
        <ActivityIndicator accessibilityLabel="Loading prescription history" color={colors.primaryAccent} />
      </Card> : error ? <ErrorNotice message={error} onRetry={() => void refresh()} /> : records.length === 0 ? <Card variant="elevated" padding={spacing.lg} style={styles.state}>
        <View style={styles.emptyGlyph}><Icon name="prescription" size={23} color="primaryAccent" /></View>
        <Txt variant="title">No prescription history yet</Txt>
        <Button label="Upload a new prescription" onPress={() => router.push('/pharmacy/upload')} />
      </Card> : <View style={styles.list}>
        <View style={styles.listHead}><Txt variant="titleLg">Requests</Txt><Pressable accessibilityRole="button" accessibilityLabel="Refresh prescription history" onPress={() => void refresh()}><Txt variant="label" color="primaryAccent">Refresh</Txt></Pressable></View>
        {records.map(record => <Pressable key={record.id} accessibilityRole="button" accessibilityLabel={`Open prescription for ${record.patient_name}`} onPress={() => router.push(`/pharmacy/prescription/${record.id}`)}>
          <Card variant="elevated" padding={spacing.lg} style={styles.record}>
            <View style={styles.recordHead}>
              <View style={styles.flex}><Txt variant="title">{record.patient_name}</Txt><Txt variant="caption" color="onSurfaceVariant">{new Date(record.created_at).toLocaleDateString('en-KE')}</Txt></View>
              <Badge label={STATUS_LABELS[record.status]} tone={tone(record.status)} />
            </View>
            {record.doctor ? <Txt variant="caption" color="onSurfaceVariant">Prescriber: {record.doctor}</Txt> : null}
            {record.order_no ? <Txt variant="caption" color="onSurfaceVariant">Existing order {record.order_no}</Txt> : null}
            <View style={styles.openRow}><Txt variant="label" color="primaryAccent">View request</Txt><Icon name="arrow-right" size={16} color="primaryAccent" /></View>
          </Card>
        </Pressable>)}
      </View>}
      {loading && records.length > 0 ? <Txt variant="caption" color="onSurfaceVariant" align="center">Refreshing…</Txt> : null}
    </>}
  </Screen>;
}

const createStyles = (colors: Palette) => StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.giant },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }, flex: { flex: 1, gap: spacing.xs },
  state: { gap: spacing.md, alignItems: 'flex-start' }, emptyGlyph: { width: 48, height: 48, borderRadius: radius.pill, backgroundColor: colors.mintSurface, alignItems: 'center', justifyContent: 'center' },
  list: { gap: spacing.md }, listHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  record: { gap: spacing.md }, recordHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  openRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.outlineVariant },
  skeletonWide: { height: 22, width: '62%', borderRadius: radius.sm, backgroundColor: colors.surfaceContainerLow },
  skeletonShort: { height: 14, width: '38%', borderRadius: radius.sm, backgroundColor: colors.surfaceContainerLow },
});
