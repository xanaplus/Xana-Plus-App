import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';
import { Button, Card, Chip, Icon, Screen, TopBar, Txt } from '@/components/ui';
import { createPrescription, pickPrescriptionPhotos, prescriptionError, submitPrescription, uploadPrescriptionPhoto } from '@/features/prescriptions/api';
import { ErrorNotice, Field, PhotoQueue } from '@/features/prescriptions/ui';
import { useSession } from '@/store/session';
import { colors, radius, spacing } from '@/theme';

export default function UploadPrescriptionScreen() {
  const router = useRouter();
  const { isAuthenticated } = useSession();
  const [assets, setAssets] = useState<ImagePickerAsset[]>([]);
  const [patientName, setPatientName] = useState('');
  const [kind, setKind] = useState<'myself' | 'dependant'>('myself');
  const [doctor, setDoctor] = useState('');
  const [notes, setNotes] = useState('');
  const [consent, setConsent] = useState(false);
  const [draftId, setDraftId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [backendUnavailable, setBackendUnavailable] = useState(false);

  const checkBackendError = (cause: unknown) => {
    const message = cause && typeof cause === 'object'
      ? `${'message' in cause ? String(cause.message) : ''} ${'code' in cause ? String(cause.code) : ''}`.toLowerCase()
      : '';
    setBackendUnavailable(['does not exist', 'schema cache', 'could not find function', 'pgrst202', 'pgrst205', '42p01', 'bucket not found'].some(part => message.includes(part)));
  };

  const addPhotos = async (camera: boolean) => {
    setError('');
    try {
      const picked = await pickPrescriptionPhotos(camera);
      const usable = picked.filter(asset => {
        const size = asset.fileSize ?? 0;
        const mime = asset.mimeType || 'image/jpeg';
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime) || size > 10 * 1024 * 1024) {
          setError('Images must be JPEG, PNG or WebP and no larger than 10 MB each.');
          return false;
        }
        return true;
      });
      setAssets(current => [...current, ...usable.filter(a => !current.some(existing => existing.uri === a.uri))].slice(0, 5));
    } catch (e) { checkBackendError(e); setError(e instanceof Error ? e.message : prescriptionError(e)); }
  };

  const submit = async () => {
    if (!isAuthenticated) { setError('Sign in to securely submit this prescription. Your photos and details remain on this screen.'); return; }
    if (!patientName.trim() || !consent) { setError('Enter the patient name and confirm consent before continuing.'); return; }
    if (assets.length === 0 && !draftId) { setError('Add at least one prescription photo.'); return; }
    setBusy(true); setError(''); setBackendUnavailable(false);
    try {
      let id = draftId;
      if (!id) {
        id = await createPrescription(patientName.trim(), kind, doctor.trim(), notes.trim());
        setDraftId(id);
      }
      for (const asset of [...assets]) {
        await uploadPrescriptionPhoto(id, asset);
        setAssets(current => current.filter(item => item.uri !== asset.uri));
      }
      await submitPrescription(id);
      router.replace(`/pharmacy/prescription/${id}`);
    } catch (e) { checkBackendError(e); setError(prescriptionError(e)); }
    finally { setBusy(false); }
  };

  return <Screen padded contentStyle={styles.content}>
    <TopBar title="Upload prescription" subtitle="Prescription first, then a priced list to review" onBack={() => router.canGoBack() ? router.back() : router.replace('/pharmacy/prescriptions')} />
    <Card variant="tinted" padding={spacing.lg} style={styles.notice}>
      <Icon name="shield" size={18} color="primaryContainer" />
      <Txt variant="bodySm" color="onSurfaceVariant" style={styles.noticeText}>Your prescription is private. It is shared with an authorised pharmacist for review. You will see the exact priced medicine list before confirming an order.</Txt>
    </Card>
    <PhotoQueue assets={assets} onRemove={uri => setAssets(current => current.filter(asset => asset.uri !== uri))} onCamera={() => void addPhotos(true)} onGallery={() => void addPhotos(false)} disabled={busy || assets.length >= 5} />
    <Card variant="elevated" padding={spacing.lg} style={styles.card}>
      <Txt variant="title">Who is the prescription for?</Txt>
      <View style={styles.choiceRow}><Chip label="Myself" selected={kind === 'myself'} onPress={() => { if (!draftId && !busy) { setKind('myself'); setPatientName(''); } }} />
        <Chip label="A dependant" selected={kind === 'dependant'} onPress={() => { if (!draftId && !busy) { setKind('dependant'); setPatientName(''); } }} /></View>
      <Field label={kind === 'myself' ? 'Your full name' : 'Dependant’s full name'} value={patientName} onChangeText={setPatientName} editable={!draftId && !busy} placeholder="Name as written on prescription" />
      <Field label="Doctor or facility (optional)" value={doctor} onChangeText={setDoctor} editable={!draftId && !busy} placeholder="Prescriber or clinic" />
      <Field label="Note for pharmacist (optional)" value={notes} onChangeText={setNotes} editable={!draftId && !busy} placeholder="Anything relevant to the review" multiline />
    </Card>
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: consent }} onPress={() => setConsent(v => !v)} style={styles.consent}>
      <View style={[styles.checkbox, consent && styles.checked]}>{consent ? <Icon name="check" size={13} color="onPrimary" /> : null}</View>
      <Txt variant="caption" color="onSurfaceVariant" style={styles.consentText}>I am authorised to share this prescription and consent to pharmacist review and pricing. This does not place an order.</Txt>
    </Pressable>
    {!isAuthenticated ? <Card variant="flat" padding={spacing.md}><Txt variant="label">Sign in is required before submission.</Txt><Button label="Sign in" size="sm" variant="outline" onPress={() => router.push('/login')} /></Card> : null}
    {error ? <>
      {backendUnavailable ? <Card variant="tinted" padding={spacing.md}><Txt variant="caption" color="onSurfaceVariant">The prescription backend or private photo storage service is unavailable in this environment. No request has been confirmed.</Txt></Card> : null}
      <ErrorNotice message={error} />
    </> : null}
    {draftId ? <Txt variant="caption" color="onSurfaceVariant">Draft saved for retry. Successfully uploaded photos will not be uploaded again.</Txt> : null}
    <Button label={busy ? 'Saving securely…' : draftId ? 'Retry submission' : 'Submit for pharmacist review'} fullWidth size="lg" disabled={busy || !consent || !patientName.trim() || (!assets.length && !draftId)} onPress={() => void submit()} />
  </Screen>;
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.giant }, notice: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  noticeText: { flex: 1 }, card: { gap: spacing.md }, choiceRow: { flexDirection: 'row', gap: spacing.sm },
  consent: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', paddingVertical: spacing.sm },
  consentText: { flex: 1 }, checkbox: { width: 22, height: 22, borderWidth: 1.5, borderColor: colors.outlineVariant, borderRadius: radius.xs, alignItems: 'center', justifyContent: 'center' },
  checked: { backgroundColor: colors.primaryContainer, borderColor: colors.primaryContainer },
});
