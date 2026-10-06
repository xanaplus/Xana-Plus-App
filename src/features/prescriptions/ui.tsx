import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';
import { Button, Card, Icon, Txt } from '@/components/ui';
import { prescriptionPhotoUrl, type PrescriptionFile } from './api';
import { colors, radius, spacing } from '@/theme';

export function Field({ label, value, onChangeText, placeholder, multiline = false, keyboardType }: {
  label: string; value: string; onChangeText: (value: string) => void; placeholder?: string;
  multiline?: boolean; keyboardType?: 'default' | 'phone-pad';
}) {
  return <View style={styles.field}><Txt variant="label">{label}</Txt><TextInput accessibilityLabel={label}
    value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.outline}
    multiline={multiline} keyboardType={keyboardType} textAlignVertical={multiline ? 'top' : 'center'}
    style={[styles.input, multiline && styles.multiline]} /></View>;
}

export function PhotoQueue({ assets, onRemove, onCamera, onGallery, disabled }: {
  assets: ImagePickerAsset[]; onRemove: (uri: string) => void; onCamera: () => void; onGallery: () => void; disabled?: boolean;
}) {
  return <Card variant="elevated" padding={spacing.lg} style={styles.card}>
    <View style={styles.titleRow}><Icon name="prescription" size={20} color="primaryContainer" /><Txt variant="label">Prescription photos</Txt></View>
    <Txt variant="caption" color="onSurfaceVariant">Use a clear, complete image showing the prescriber, date and signature. Up to 5 images, 10 MB each.</Txt>
    <View style={styles.actions}><Button label="Take photo" size="sm" icon="scan" iconPosition="leading" onPress={onCamera} disabled={disabled} style={styles.flex} />
      <Button label="Choose photos" size="sm" variant="outline" onPress={onGallery} disabled={disabled} style={styles.flex} /></View>
    {assets.map((asset, i) => <View key={asset.uri} style={styles.photoRow}>
      <Image source={{ uri: asset.uri }} contentFit="cover" style={styles.thumb} />
      <View style={styles.fileInfo}><Txt variant="label" numberOfLines={1}>{asset.fileName || `Photo ${i + 1}`}</Txt>
        <Txt variant="caption" color="onSurfaceVariant">{((asset.fileSize ?? 0) / 1024 / 1024).toFixed(1)} MB</Txt></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Remove photo" onPress={() => onRemove(asset.uri)}><Icon name="close" size={18} color="onSurfaceVariant" /></Pressable>
    </View>)}
  </Card>;
}

export function PrivatePhotos({ files }: { files: PrescriptionFile[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    setUrls({}); setFailed([]);
    Promise.all(files.map(async file => {
      try { const url = await prescriptionPhotoUrl(file.path); if (active) setUrls(old => ({ ...old, [file.path]: url })); }
      catch { if (active) setFailed(old => [...old, file.path]); }
    }));
    return () => { active = false; };
  }, [files]);
  if (!files.length) return <Txt variant="caption" color="onSurfaceVariant">No prescription photos attached.</Txt>;
  return <View style={styles.privatePhotos}>{files.map((file, i) => <View key={file.path} style={styles.privatePhoto}>
    {urls[file.path] ? <Image source={{ uri: urls[file.path] }} contentFit="cover" style={styles.privateImage} />
      : <View style={styles.privateUnavailable}><Icon name="receipt" size={22} color="outline" /><Txt variant="caption" color="onSurfaceVariant">{failed.includes(file.path) ? 'Photo access failed' : 'Loading private photo…'}</Txt></View>}
    <Txt variant="caption" color="onSurfaceVariant">Prescription image {i + 1}</Txt>
  </View>)}</View>;
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <View style={styles.error}><Txt variant="bodySm" color="error">{message}</Txt>{onRetry ? <Button label="Try again" size="sm" variant="outline" onPress={onRetry} /> : null}</View>;
}

export function confirmCancel(onConfirm: () => void) {
  Alert.alert('Cancel prescription?', 'This request will be marked cancelled. You can start a new prescription later.', [
    { text: 'Keep request', style: 'cancel' }, { text: 'Cancel prescription', style: 'destructive', onPress: onConfirm },
  ]);
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs }, input: { minHeight: 46, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerLowest, paddingHorizontal: spacing.md, color: colors.onSurface, fontSize: 15 },
  multiline: { minHeight: 92, paddingTop: spacing.md }, card: { gap: spacing.md }, titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm }, flex: { flex: 1 }, photoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  thumb: { width: 58, height: 58, borderRadius: radius.md, backgroundColor: colors.surfaceContainerLow }, fileInfo: { flex: 1, gap: spacing.xxs },
  privatePhotos: { gap: spacing.md }, privatePhoto: { gap: spacing.xs }, privateImage: { width: '100%', height: 220, borderRadius: radius.lg, backgroundColor: colors.surfaceContainerLow },
  privateUnavailable: { height: 92, borderRadius: radius.lg, backgroundColor: colors.surfaceContainerLow, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  error: { padding: spacing.md, gap: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.errorContainer },
});
