import type { ImagePickerAsset } from 'expo-image-picker';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { Button, Icon, SelectableOption, Txt } from '@/components/ui';
import { TextField } from '@/features/auth/auth-sheet';
import { createPrescription, pickPrescriptionPhotos, prescriptionError, uploadPrescriptionPhoto } from '@/features/prescriptions/api';
import { radius, spacing } from '@/theme';
import { useThemeStyles } from '@/theme/provider';
import type { Palette } from '@/theme';

/**
 * The prescription attached at checkout when the basket has prescription
 * medicines (owner, 29 Oct 2026, as on the website): patient, photos and
 * consent. Sent with the order as a draft prescription; the pharmacist then
 * approves the order in the admin app and sets the quantities.
 */

const MAX_PHOTOS = 5;

export type PatientKind = 'myself' | 'dependant';

export function useRxAttachment(defaultPatient: string) {
  const [patient, setPatient] = useState(defaultPatient);
  const [kind, setKind] = useState<PatientKind>('myself');
  const [doctor, setDoctor] = useState('');
  const [photos, setPhotos] = useState<ImagePickerAsset[]>([]);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The draft already made for these photos, so a retried order doesn't upload them twice. */
  const [sent, setSent] = useState<{ id: string; uris: string } | null>(null);

  const ready = patient.trim() !== '' && photos.length > 0 && consent;

  const addPhotos = async (camera: boolean) => {
    setError(null);
    try {
      const picked = await pickPrescriptionPhotos(camera);
      setPhotos(current => [...current, ...picked].slice(0, MAX_PHOTOS));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not add the photo. Please try again.');
    }
  };

  const removePhoto = (uri: string) => setPhotos(current => current.filter(photo => photo.uri !== uri));

  /** Saves the draft prescription with its photos; its id goes with the order. Throws a message for the shopper. */
  const send = async (): Promise<string> => {
    const uris = photos.map(photo => photo.uri).join('|');
    if (sent && sent.uris === uris) return sent.id;
    try {
      const id = await createPrescription(patient.trim(), kind, doctor.trim(), '');
      for (const photo of photos) await uploadPrescriptionPhoto(id, photo);
      setSent({ id, uris });
      return id;
    } catch (failure) {
      throw new Error(prescriptionError(failure));
    }
  };

  /** After an order is placed: the next basket starts fresh. */
  const reset = () => {
    setPhotos([]);
    setConsent(false);
    setSent(null);
    setError(null);
  };

  return { patient, setPatient, kind, setKind, doctor, setDoctor, photos, addPhotos, removePhoto, consent, setConsent, error, ready, send, reset };
}

export type RxAttachment = ReturnType<typeof useRxAttachment>;

export function RxCheckoutPanel({ rx, medicines, onRemove }: { rx: RxAttachment; medicines: string; onRemove: () => void }) {
  const styles = useThemeStyles(createStyles);
  return (
    <View style={styles.panel}>
      <View style={styles.head}>
        <View style={styles.icon}>
          <Icon name="prescription" size={18} color="primaryAccent" />
        </View>
        <Txt variant="titleLg" style={styles.flex}>
          Your prescription
        </Txt>
      </View>

      <Txt variant="bodySm" color="onSurfaceVariant">
        {`${medicines} need${medicines.includes(',') ? '' : 's'} a prescription. Add a clear photo of it. A pharmacist checks it, sets the quantities and the price, and we text you to confirm before anything is prepared.`}
      </Txt>

      <TextField label="Patient's name" icon="user" value={rx.patient} onChangeText={rx.setPatient} autoCapitalize="words" maxLength={100} />

      <View style={styles.kinds}>
        <SelectableOption title="For me" selected={rx.kind === 'myself'} onPress={() => rx.setKind('myself')} indicator="radio" style={styles.flex} />
        <SelectableOption title="Someone else" selected={rx.kind === 'dependant'} onPress={() => rx.setKind('dependant')} indicator="radio" style={styles.flex} />
      </View>

      <TextField label="Doctor or clinic (optional)" icon="prescription" value={rx.doctor} onChangeText={rx.setDoctor} maxLength={100} />

      <Txt variant="overline" color="onSurfaceVariant">
        {`Prescription photos (${rx.photos.length} of ${MAX_PHOTOS})`}
      </Txt>
      {rx.photos.length > 0 ? (
        <View style={styles.photos}>
          {rx.photos.map(photo => (
            <View key={photo.uri} style={styles.photo}>
              <Image source={{ uri: photo.uri }} style={styles.photoImage} accessibilityLabel="Prescription photo" />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove this photo"
                hitSlop={8}
                onPress={() => rx.removePhoto(photo.uri)}
                style={styles.photoRemove}
              >
                <Icon name="close" size={12} color="onPrimary" />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      {rx.photos.length < MAX_PHOTOS ? (
        <View style={styles.actions}>
          <Button label="Take photo" icon="camera" iconPosition="leading" variant="tonal" size="sm" onPress={() => void rx.addPhotos(true)} style={styles.flex} />
          <Button label="Choose photos" icon="image" iconPosition="leading" variant="tonal" size="sm" onPress={() => void rx.addPhotos(false)} style={styles.flex} />
        </View>
      ) : null}

      <SelectableOption
        title="I may share this prescription"
        description="I am the patient or authorised by them, and I agree to a pharmacist reviewing it."
        selected={rx.consent}
        onPress={() => rx.setConsent(!rx.consent)}
        indicator="check"
      />

      {rx.error ? (
        <Txt variant="caption" color="error">
          {rx.error}
        </Txt>
      ) : null}

      <Pressable accessibilityRole="button" onPress={onRemove} style={styles.removeLink}>
        <Txt variant="label" color="primaryAccent">
          No prescription? Remove these medicines
        </Txt>
      </Pressable>
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  panel: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.mintEdge,
    backgroundColor: colors.surface,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  icon: { width: 32, height: 32, borderRadius: radius.pill, backgroundColor: colors.mintSurface, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  kinds: { flexDirection: 'row', gap: spacing.sm },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photo: { width: 72, height: 72, borderRadius: radius.md, overflow: 'hidden' },
  photoImage: { width: '100%', height: '100%' },
  photoRemove: {
    position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: radius.pill,
    backgroundColor: colors.inverseSurface, alignItems: 'center', justifyContent: 'center',
  },
  actions: { flexDirection: 'row', gap: spacing.sm },
  removeLink: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
});
