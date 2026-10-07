import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

// Uses only the existing no-SMS demo session. Never logs credentials or sessions.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;
// Deliberately separate from a delivered/consumed real-recipient test OTP.
const demoCode = process.env.XANAPLUS_TEST_DEMO_CODE;
assert.ok(url && key && demoCode, 'Required test configuration is missing');
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const phone = '+254700000000';
// Verify the owner-supplied fixed demo code directly. Do not call request-otp:
// even a misconfigured demo-phone setting must never turn this test into an SMS.
const result = await db.functions.invoke('verify-otp', { body: { phone, code: demoCode } });
assert.ok(!result.error, 'verify-otp demo verification failed');
const session = await db.auth.setSession(result.data);
assert.ok(!session.error && session.data.session, 'Demo session was not created');
const { data: auth } = await db.auth.getUser();
assert.ok(auth.user, 'Demo user unavailable');
const created = await db.rpc('create_prescription', {
  p_patient: 'Synthetic storage verification — not for dispensing',
  p_kind: 'myself', p_doctor: '', p_notes: 'No clinical data. Storage test only.', p_consent: true,
});
assert.ok(!created.error && created.data, 'Prescription draft creation failed');
const id = created.data;
const path = `${auth.user.id}/${id}/storage-verification.png`;
const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jAXcAAAAASUVORK5CYII=', 'base64');
try {
  const upload = await db.storage.from('prescriptions').upload(path, bytes, { contentType: 'image/png' });
  assert.ok(!upload.error, 'Private photo upload failed');
  const attach = await db.rpc('attach_prescription_photo', { p_id: id, p_path: path, p_name: 'Synthetic image' });
  assert.ok(!attach.error, 'Photo attachment failed');
  const signed = await db.storage.from('prescriptions').createSignedUrl(path, 300);
  assert.ok(!signed.error && signed.data.signedUrl, 'Owner could not sign the private image');
  assert.equal((await fetch(signed.data.signedUrl)).status, 200, 'Signed photo was not readable');
  const publicImage = await fetch(`${url}/storage/v1/object/public/prescriptions/${path}`);
  assert.notEqual(publicImage.status, 200, 'Private prescription image was publicly accessible');
  const permission = await db.rpc('is_pharmacy_reviewer');
  assert.equal(permission.data, false, 'Demo customer unexpectedly has reviewer access');
  const events = await db.from('prescription_events').select('id').eq('prescription_id', id);
  assert.ok(!events.error && events.data.length >= 2, 'Owner audit history unavailable');
  console.log('PASS: no-SMS demo session, private real upload, attachment, signed URL, denied public URL, audit visibility and customer role.');
} finally {
  const detach = await db.rpc('remove_prescription_photo', { p_id: id, p_path: path });
  const removed = await db.storage.from('prescriptions').remove([path]);
  const cancelled = await db.rpc('cancel_prescription', { p_id: id });
  assert.ok(!detach.error && !removed.error && !cancelled.error, 'Synthetic test cleanup failed');
  console.log('Synthetic image removed; a clearly labelled cancelled draft remains in demo history. No order was placed.');
}
