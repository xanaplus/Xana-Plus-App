import { useCallback, useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { fetchProducts } from '@/data/live-catalogue';
import { productById } from '@/data/catalog';
import type { Product } from '@/data/types';

export type PrescriptionStatus = 'draft' | 'submitted' | 'clarification' | 'held' | 'quoted' | 'rejected' | 'ordered' | 'cancelled';
export type PrescriptionLine = {
  item_no: string; name: string; quantity: number; unit_price: number; instructions: string;
};
export type PrescriptionFile = { path: string; name: string };
export type Prescription = {
  id: string; user_id: string; patient_name: string; patient_kind: string; doctor: string;
  notes: string; status: PrescriptionStatus; files: PrescriptionFile[]; quote_lines: PrescriptionLine[];
  review_note: string; valid_until: string | null; quoted_at: string | null; created_at: string;
  order_no: string | null; clarification_response: string;
};
export type QuoteChoice = { itemNo: string; quantity: number; instructions: string };
export type PrescriptionEvent = {
  id: number; status: PrescriptionStatus; review_note: string; created_at: string;
};
export type PrescriptionOrderDetails = {
  paymentMethod: 'cod' | 'mpesa'; contact: string; addressLine: string; slotLabel: string; storeName: string; quoteVersion: string;
};
export const STATUS_LABELS: Record<PrescriptionStatus, string> = {
  draft: 'Draft', submitted: 'Awaiting pharmacist', quoted: 'Ready to confirm',
  rejected: 'Needs a new prescription', ordered: 'Ordered', cancelled: 'Cancelled',
  clarification: 'Your response needed', held: 'On hold with pharmacist',
};
export function prescriptionError(error: unknown): string {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  const known: Record<string, string> = {
    signed_out: 'Please sign in to manage your prescriptions.',
    not_reviewer: 'Only an authorised pharmacy reviewer can do this.',
    invalid_prescription: 'Please enter the patient name and confirm consent.',
    photo_required: 'Add at least one clear prescription photo before submitting.',
    not_editable: 'This prescription is no longer editable. Refresh its status.',
    not_reviewable: 'Another reviewer has already handled this prescription. Refresh the list.',
    invalid_quote: 'Choose in-stock medicines, whole quantities, and a future expiry date.',
    not_approved: 'This prescription needs pharmacist approval before ordering.',
    expired_quote: 'This approval or price quote has expired. Ask the pharmacist to review it again.',
    quote_changed: 'Price or availability has changed. Ask the pharmacist to refresh this quote.',
    invalid_order: 'Complete the contact number and delivery or collection details.',
    invalid_file: 'This photo could not be attached. Please try again.',
    already_ordered: 'This prescription has already been ordered.',
    consent_required: 'Confirm you are authorised to share this prescription and consent to pharmacist review.',
    restricted_item: 'This medicine is not available for online prescription ordering. Contact the pharmacy.',
    quote_updated: 'The pharmacist updated this quote. Refresh and review the new medicine list before confirming.',
    response_required: 'Enter a reply for the pharmacist before sending.',
  };
  for (const [code, label] of Object.entries(known)) if (message.includes(code)) return label;
  return 'We could not load or save this request. Please retry. No successful change has been confirmed.';
}
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}
export function usePrescriptionList(review = false) {
  const [records, setRecords] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data: session, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session.session) { setRecords([]); return; }
      let query = supabase.from('prescriptions').select('*').order('created_at', { ascending: false }).limit(100);
      if (!review) query = query.eq('user_id', session.session.user.id);
      const result = await query;
      if (result.error) throw result.error;
      setRecords(result.data as Prescription[]);
    } catch (cause) { setError(prescriptionError(cause)); }
    finally { setLoading(false); }
  }, [review]);
  useEffect(() => {
    const initialRefresh = setTimeout(() => { void refresh(); }, 0);
    const { data } = supabase.auth.onAuthStateChange(() => {
      setRecords([]);
      // Run after the auth callback to avoid waiting on the auth client's lock.
      setTimeout(() => { void refresh(); }, 0);
    });
    return () => {
      clearTimeout(initialRefresh);
      data.subscription.unsubscribe();
    };
  }, [refresh]);
  return { records, loading, error, refresh };
}
export async function getPrescription(id: string): Promise<Prescription> {
  const { data, error } = await supabase.from('prescriptions').select('*').eq('id', id).single();
  if (error) throw error;
  return data as Prescription;
}
export async function getPrescriptionEvents(id: string): Promise<PrescriptionEvent[]> {
  const { data, error } = await supabase.from('prescription_events')
    .select('id,status,review_note,created_at').eq('prescription_id', id).order('id', { ascending: true });
  if (error) throw error;
  return data as PrescriptionEvent[];
}
export const createPrescription = (patientName: string, patientKind: string, doctor: string, notes: string) =>
  rpc<string>('create_prescription', { p_patient: patientName, p_kind: patientKind, p_doctor: doctor, p_notes: notes, p_consent: true });
export const submitPrescription = (id: string) => rpc<void>('submit_prescription', { p_id: id });
export const cancelPrescription = (id: string) => rpc<void>('cancel_prescription', { p_id: id });
export const isPharmacyReviewer = () => rpc<boolean>('is_pharmacy_reviewer', {});
export const reviewPrescription = (id: string, lines: QuoteChoice[], note: string, validUntil: string, reject = false) =>
  rpc<void>('review_prescription', { p_id: id, p_lines: lines, p_note: note, p_valid_until: validUntil || null, p_reject: reject });
export const setPrescriptionReviewStatus = (id: string, status: 'clarification' | 'held', note: string) =>
  rpc<void>('set_prescription_review_status', { p_id: id, p_status: status, p_note: note });
export const respondToPrescription = (id: string, message: string) =>
  rpc<void>('respond_to_prescription', { p_id: id, p_message: message });

/** Photos stay private. Only the owning customer and assigned pharmacy reviewers can sign URLs. */
export async function prescriptionPhotoUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('prescriptions').createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}
export async function pickPrescriptionPhotos(camera = false): Promise<ImagePicker.ImagePickerAsset[]> {
  const permission = camera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('Allow access to add a prescription photo.');
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'], quality: 0.9, allowsMultipleSelection: !camera, selectionLimit: 5,
  };
  const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  return result.canceled ? [] : result.assets;
}
export async function uploadPrescriptionPhoto(id: string, asset: ImagePicker.ImagePickerAsset): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) throw new Error('signed_out');
  const response = await fetch(asset.uri);
  const bytes = await response.arrayBuffer();
  const mime = asset.mimeType || 'image/jpeg';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime) || bytes.byteLength > 10 * 1024 * 1024 || !bytes.byteLength)
    throw new Error('invalid_file');
  const extension = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  const path = `${session.session.user.id}/${id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const { error } = await supabase.storage.from('prescriptions').upload(path, bytes, { contentType: mime, upsert: false });
  if (error) throw error;
  try {
    await rpc<void>('attach_prescription_photo', { p_id: id, p_path: path, p_name: 'Prescription photo' });
  } catch (attachError) {
    await supabase.storage.from('prescriptions').remove([path]);
    throw attachError;
  }
}
export async function removePrescriptionPhoto(id: string, path: string): Promise<void> {
  await rpc<void>('remove_prescription_photo', { p_id: id, p_path: path });
  const { error } = await supabase.storage.from('prescriptions').remove([path]);
  if (error) throw error;
}
export async function quoteProducts(record: Prescription): Promise<{ product: Product; quantity: number }[]> {
  await fetchProducts(record.quote_lines.map(line => line.item_no));
  return record.quote_lines.map(line => {
    const product = productById(line.item_no);
    if (!product) throw new Error('quote_changed');
    return { product, quantity: line.quantity };
  });
}
export async function orderPrescription(id: string, details: PrescriptionOrderDetails): Promise<{ orderNo: string }> {
  return rpc('place_prescription_order', { p_id: id, p_details: details });
}
