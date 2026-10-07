// Offline adapter tests; no network or credentials used.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ db: {}, picker: {} }));
vi.mock('@/lib/supabase', () => ({ supabase: m.db }));
vi.mock('@/data/live-catalogue', () => ({ fetchProducts: vi.fn() }));
vi.mock('@/data/catalog', () => ({ productById: vi.fn() }));
vi.mock('expo-image-picker', () => m.picker);
import { pickPrescriptionPhotos, uploadPrescriptionPhoto, prescriptionPhotoUrl, prescriptionError,
  orderPrescription } from '@/features/prescriptions/api';
beforeEach(() => {
  m.db.auth = { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'synthetic-owner' } } } }) };
  m.db.rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  m.db.bucket = {
    upload: vi.fn().mockResolvedValue({ error: null }), remove: vi.fn().mockResolvedValue({ error: null }),
    createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://example.invalid/private' }, error: null }),
  };
  m.db.storage = { from: vi.fn(() => m.db.bucket) };
  for (const name of ['requestCameraPermissionsAsync', 'requestMediaLibraryPermissionsAsync'])
    m.picker[name] = vi.fn().mockResolvedValue({ granted: true });
  for (const name of ['launchCameraAsync', 'launchImageLibraryAsync'])
    m.picker[name] = vi.fn().mockResolvedValue({ canceled: false, assets: [{ uri: 'file://synthetic' }] });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(32) }));
});
afterEach(() => vi.unstubAllGlobals());
describe('prescription adapters (offline mocks)', () => {
  it.each([true, false])('selects the proper permission and picker for camera=%s', async camera => {
    expect(await pickPrescriptionPhotos(camera)).toEqual([{ uri: 'file://synthetic' }]);
    expect(m.picker[camera ? 'requestCameraPermissionsAsync' : 'requestMediaLibraryPermissionsAsync']).toHaveBeenCalledOnce();
    expect(m.picker[camera ? 'launchCameraAsync' : 'launchImageLibraryAsync'])
      .toHaveBeenCalledWith(expect.objectContaining({ allowsMultipleSelection: !camera, selectionLimit: 5 }));
  });
  it('handles permission denial and cancellation without a photo', async () => {
    m.picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: false });
    await expect(pickPrescriptionPhotos(true)).rejects.toThrow('Allow access');
    expect(m.picker.launchCameraAsync).not.toHaveBeenCalled();
    m.picker.launchImageLibraryAsync.mockResolvedValue({ canceled: true });
    expect(await pickPrescriptionPhotos(false)).toEqual([]);
  });
  it('uploads into the private owner/draft prefix before attachment and signs for five minutes', async () => {
    await uploadPrescriptionPhoto('synthetic-draft', { uri: 'file://synthetic', mimeType: 'image/png' });
    const [path, bytes, options] = m.db.bucket.upload.mock.calls[0];
    expect(path).toMatch(/^synthetic-owner\/synthetic-draft\/.+\.png$/);
    expect(bytes.byteLength).toBe(32);
    expect(options).toEqual({ contentType: 'image/png', upsert: false });
    expect(m.db.storage.from).toHaveBeenCalledWith('prescriptions');
    expect(m.db.rpc).toHaveBeenCalledWith('attach_prescription_photo',
      { p_id: 'synthetic-draft', p_path: path, p_name: 'Prescription photo' });
    expect(await prescriptionPhotoUrl(path)).toBe('https://example.invalid/private');
    expect(m.db.bucket.createSignedUrl).toHaveBeenCalledWith(path, 300);
  });
  it('removes an uploaded object when attachment fails and propagates failure', async () => {
    m.db.rpc.mockResolvedValue({ error: new Error('invalid_file') });
    await expect(uploadPrescriptionPhoto('draft', { uri: 'file://synthetic' })).rejects.toThrow('invalid_file');
    expect(m.db.bucket.remove).toHaveBeenCalledWith([m.db.bucket.upload.mock.calls[0][0]]);
  });
  it('does not attach after a failed upload and permits a fresh retry', async () => {
    m.db.bucket.upload.mockResolvedValueOnce({ error: new Error('offline') });
    await expect(uploadPrescriptionPhoto('draft', { uri: 'file://synthetic' })).rejects.toThrow('offline');
    expect(m.db.rpc).not.toHaveBeenCalled();
    await uploadPrescriptionPhoto('draft', { uri: 'file://synthetic' });
    expect(m.db.rpc).toHaveBeenCalledOnce();
  });
  it.each([0, 10 * 1024 * 1024 + 1])('rejects invalid actual file length %s before upload', async size => {
    fetch.mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(size) });
    await expect(uploadPrescriptionPhoto('draft', { uri: 'file://synthetic' })).rejects.toThrow('invalid_file');
    expect(m.db.bucket.upload).not.toHaveBeenCalled();
  });
  it('propagates stock/price errors and passes only the approved quote version/order details', async () => {
    const details = { paymentMethod: 'cod', contact: 'Synthetic', addressLine: 'DO NOT FULFIL',
      storeName: 'Test', slotLabel: 'Test', quoteVersion: 'test-version' };
    m.db.rpc.mockResolvedValue({ error: new Error('quote_changed') });
    await expect(orderPrescription('draft', details)).rejects.toThrow('quote_changed');
    expect(m.db.rpc).toHaveBeenCalledWith('place_prescription_order', { p_id: 'draft', p_details: details });
    expect(prescriptionError(new Error('quote_changed'))).toContain('Price or availability has changed');
    expect(prescriptionError(new Error('quote_updated'))).toContain('updated this quote');
  });
});
