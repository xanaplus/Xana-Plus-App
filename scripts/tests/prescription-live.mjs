// Owner-approved no-SMS live verification. No credentials/session states/traces
// are written to disk. Requires explicit opt-in on every run.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

assert.ok(process.argv.includes('--approved-temporary-no-sms'),
  'Explicit owner approval is required: --approved-temporary-no-sms');
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;
const token = process.env.SUPABASE_ACCESS_TOKEN;
assert.ok(url && key && token, 'Required existing backend configuration is missing');
const project = new URL(url).hostname.split('.')[0];
const options = { auth: { persistSession: false, autoRefreshToken: false } };
let stage = 'backend access';
const accounts = [];
const files = [];
let admin, browser, reviewerId, retainedOwner = false, baseline;
const check = (condition, label) => assert.ok(condition, `CHECK: ${label}`);
async function ok(result, label) {
  check(!result.error, label);
  return result.data;
}
async function rpc(client, name, args) {
  return ok(await client.rpc(name, args), name);
}
async function record(client, id) {
  return ok(await client.from('prescriptions').select('*').eq('id', id).single(), 'read own prescription');
}
async function makeAccount(label, run) {
  const password = randomBytes(32).toString('base64url');
  const email = `rx-${run}-${label}@example.invalid`;
  const auth = await ok(await admin.auth.admin.createUser({ email, password, email_confirm: true }), 'create synthetic account');
  accounts.push(auth.user.id);
  await ok(await admin.from('profiles').insert({
    id: auth.user.id, phone: `TEST-NO-SMS-${run}-${label}`, name: `Synthetic ${label} — DO NOT FULFIL`,
    preferences: { pushEnabled: false, privacy: { usageAnalytics: false } },
  }), 'create synthetic profile');
  const client = createClient(url, key, options);
  const signed = await ok(await client.auth.signInWithPassword({ email, password }), 'no-SMS password sign-in');
  return { id: auth.user.id, client, session: signed.session };
}
async function pageFor(account) {
  const context = await browser.newContext({ viewport: { width: 430, height: 1000 } });
  await context.addInitScript(({ storageKey, session }) => {
    localStorage.setItem(storageKey, JSON.stringify(session));
  }, { storageKey: account.client.auth.storageKey, session: account.session });
  // Any accidental request to the app's SMS/auth Edge Functions fails closed.
  await context.route('**/functions/v1/request-otp', route => route.abort());
  await context.route('**/functions/v1/verify-otp', route => route.abort());
  return context.newPage();
}
async function go(page, path) {
  await page.goto(`https://${process.env.REPLIT_DEV_DOMAIN}${path}`);
  await page.getByText('Sign in to view this request', { exact: true }).waitFor({ state: 'hidden' });
}
const click = (page, name) => page.getByRole('button', { name, exact: true }).click();
async function text(page, value) { await page.getByText(value, { exact: false }).first().waitFor(); }
async function chooseReview(page, patient) {
  await go(page, '/pharmacy/review');
  await page.getByRole('button', { name: new RegExp(`Review request for ${patient},`) }).click();
}
async function confirm(page) {
  await click(page, 'Confirm quoted order');
  await click(page, 'Confirm order');
}
async function fixture(customer, patient, image) {
  const id = await rpc(customer.client, 'create_prescription', {
    p_patient: patient, p_kind: 'myself', p_doctor: 'Synthetic', p_notes: 'DO NOT FULFIL — no clinical data', p_consent: true,
  });
  const path = `${customer.id}/${id}/synthetic.png`;
  files.push(path);
  await ok(await customer.client.storage.from('prescriptions').upload(path, image, { contentType: 'image/png' }), 'real image upload');
  await rpc(customer.client, 'attach_prescription_photo', { p_id: id, p_path: path, p_name: 'Synthetic image' });
  await rpc(customer.client, 'submit_prescription', { p_id: id });
  return id;
}
try {
  const keysResponse = await fetch(`https://api.supabase.com/v1/projects/${project}/api-keys?reveal=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  check(keysResponse.ok, 'existing management access');
  const keys = await keysResponse.json();
  const service = keys.find(k => k.name === 'service_role')?.api_key;
  check(service, 'server-only test access');
  admin = createClient(url, service, options);
  baseline = await ok(await admin.from('pharmacy_reviewers').select('user_id'), 'snapshot designated membership');
  const run = randomUUID().replaceAll('-', '').slice(0, 12);
  stage = 'temporary no-SMS accounts';
  const customer = await makeAccount('customer', run);
  const reviewer = await makeAccount('reviewer', run);
  const stranger = await makeAccount('other', run);
  reviewerId = reviewer.id;
  await ok(await admin.from('pharmacy_reviewers').insert({ user_id: reviewer.id }), 'temporary approved reviewer');
  check(await rpc(customer.client, 'is_pharmacy_reviewer', {}) === false, 'customer role unchanged');
  check(await rpc(reviewer.client, 'is_pharmacy_reviewer', {}) === true, 'temporary reviewer access');
  browser = await chromium.launch({ executablePath: '/repl/tools/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const cp = await pageFor(customer);
  const rp = await pageFor(reviewer);
  const op = await pageFor(stranger);
  cp.setDefaultTimeout(25000); rp.setDefaultTimeout(25000); op.setDefaultTimeout(25000);
  const image = Buffer.from(await cp.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 320;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 640, 320);
    ctx.fillStyle = '#000'; ctx.font = '24px sans-serif';
    ctx.fillText('SYNTHETIC TEST — NOT A PRESCRIPTION', 20, 80);
    ctx.fillText('DO NOT DISPENSE / DO NOT FULFIL', 20, 130);
    return canvas.toDataURL('image/png').split(',')[1];
  }), 'base64');

  stage = 'live gallery selection and network retries';
  await go(cp, '/pharmacy/upload');
  const chooser = cp.waitForEvent('filechooser');
  await click(cp, 'Choose photos');
  await (await chooser).setFiles({ name: 'synthetic-test.png', mimeType: 'image/png', buffer: image });
  const patient = `Synthetic ${run} main`;
  await cp.getByLabel('Your full name').fill(patient);
  await cp.getByLabel('Note for pharmacist (optional)').fill('DO NOT FULFIL — no clinical data');
  await cp.getByRole('checkbox').click();
  let uploadCalls = 0, createCalls = 0, submitCalls = 0;
  await cp.route('**/storage/v1/object/prescriptions/**', async route => {
    if (route.request().method() === 'POST') {
      uploadCalls++;
      if (uploadCalls === 1) return route.abort();
    }
    await route.continue();
  });
  await cp.route('**/rest/v1/rpc/create_prescription', async route => { createCalls++; await route.continue(); });
  await cp.route('**/rest/v1/rpc/submit_prescription', async route => {
    submitCalls++;
    if (submitCalls === 1) return route.abort();
    await route.continue();
  });
  await click(cp, 'Submit for pharmacist review');
  await text(cp, 'Draft saved for retry');
  await click(cp, 'Retry submission');
  await text(cp, 'No successful change has been confirmed');
  await click(cp, 'Retry submission');
  await cp.waitForURL('**/pharmacy/prescription/*');
  await text(cp, 'Awaiting pharmacist');
  const id = new URL(cp.url()).pathname.split('/').pop();
  let rx = await record(customer.client, id);
  check(rx.status === 'submitted' && rx.files.length === 1, 'real submission after retry');
  check(createCalls === 1 && uploadCalls === 2 && submitCalls === 2, 'retry does not duplicate draft or successful photo');
  files.push(rx.files[0].path);
  console.log('PASS: real browser gallery selection, failed upload/submission retries, one draft and one attached image.');

  stage = 'real private storage and role boundaries';
  const path = rx.files[0].path;
  const signed = await ok(await customer.client.storage.from('prescriptions').createSignedUrl(path, 300), 'owner signed URL');
  check((await fetch(signed.signedUrl)).status === 200, 'owner reads actual image');
  await ok(await reviewer.client.storage.from('prescriptions').download(path), 'reviewer reads actual image');
  check((await stranger.client.storage.from('prescriptions').createSignedUrl(path, 300)).error, 'other customer denied image');
  const anon = createClient(url, key, options);
  check((await anon.storage.from('prescriptions').createSignedUrl(path, 300)).error, 'anonymous signing denied');
  check((await fetch(`${url}/storage/v1/object/public/prescriptions/${path}`)).status !== 200, 'public URL denied');
  const otherRecords = await ok(await stranger.client.from('prescriptions').select('id').eq('id', id), 'cross-user RLS query');
  check(otherRecords.length === 0, 'other customer cannot read prescription');
  await go(op, '/pharmacy/review');
  await text(op, 'Reviewer access required');
  console.log('PASS: real owner/reviewer image access, anonymous/public/cross-customer denial and customer reviewer-screen denial.');

  stage = 'live clarification and hold';
  await chooseReview(rp, patient);
  await rp.getByLabel('Reviewer note', { exact: true }).fill('Synthetic clarification: confirm test image label');
  await click(rp, 'Request clarification');
  await go(cp, `/pharmacy/prescription/${id}`);
  await cp.getByLabel('Message for pharmacist').fill('Synthetic reply: test image only');
  await click(cp, 'Send response');
  await text(cp, 'Awaiting pharmacist');
  rx = await record(customer.client, id);
  check(rx.clarification_response === 'Synthetic reply: test image only', 'real clarification persistence');
  await chooseReview(rp, patient);
  await rp.getByLabel('Reviewer note', { exact: true }).fill('Synthetic hold — checking test fixture');
  await click(rp, 'Place on hold');
  await go(cp, `/pharmacy/prescription/${id}`);
  await text(cp, 'On hold with pharmacist');
  check(await cp.getByRole('button', { name: 'Confirm quoted order', exact: true }).count() === 0, 'held request cannot order');
  console.log('PASS: live pharmacist clarification, customer reply, hold and no held-request checkout.');

  stage = 'live catalogue and exact pharmacist quote';
  const products = await ok(await customer.client.from('catalogue').select('item_no,name,price,stock')
    .eq('category', 'GENERAL').eq('age_restricted', false).gte('stock', 2).gt('price', 0).limit(30), 'live catalogue');
  const product = products.find(p => !/digoxin|lithium|carbamazepine/i.test(p.name));
  check(product, 'suitable stocked medicine');
  await chooseReview(rp, patient);
  await rp.getByLabel('Search live medicine catalogue').fill(product.item_no);
  await click(rp, 'Add');
  await rp.getByRole('button', { name: `Increase ${product.name} quantity`, exact: true }).click();
  await rp.getByLabel(`Instructions for ${product.name}`, { exact: true }).fill('Synthetic quote — DO NOT DISPENSE');
  const expiry = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await rp.getByLabel('Quote expiry date').fill(expiry);
  await rp.getByLabel('Reviewer note', { exact: true }).fill('Synthetic priced quote — DO NOT FULFIL');
  await click(rp, 'Send priced quote');
  await text(rp, 'Open request');
  rx = await record(customer.client, id);
  check(rx.status === 'quoted' && rx.quote_lines[0].quantity === 2 &&
    Number(rx.quote_lines[0].unit_price) === Number(product.price), 'exact real server-priced quote');
  await go(cp, `/pharmacy/prescription/${id}`);
  await text(cp, 'Quoted subtotal');
  await cp.getByLabel('Contact number', { exact: true }).fill('TEST ONLY — DO NOT FULFIL');
  await cp.getByLabel('Delivery address', { exact: true }).fill('TEST ONLY — DO NOT FULFIL');
  await click(cp, 'Cash on delivery · test');

  stage = 'live changed quote, price and stock gates';
  const quoteArgs = { p_id: id, p_lines: [{ itemNo: product.item_no, quantity: 2, instructions: 'Synthetic — DO NOT DISPENSE' }],
    p_note: 'Synthetic refreshed quote — DO NOT FULFIL', p_valid_until: expiry, p_reject: false };
  await rpc(reviewer.client, 'review_prescription', quoteArgs);
  await confirm(cp);
  await text(cp, 'The pharmacist updated this quote');
  rx = await record(customer.client, id);
  // Mutate only our synthetic prescription snapshot, never real catalogue data.
  await ok(await admin.from('prescriptions').update({
    quote_lines: rx.quote_lines.map(l => ({ ...l, unit_price: Number(l.unit_price) + 1 })),
  }).eq('id', id), 'synthetic price mismatch');
  await go(cp, `/pharmacy/prescription/${id}`);
  await confirm(cp);
  await text(cp, 'Price or availability has changed');
  await ok(await admin.from('prescriptions').update({
    quote_lines: rx.quote_lines.map(l => ({ ...l, quantity: Math.floor(Number(product.stock)) + 1 })),
  }).eq('id', id), 'synthetic insufficient stock snapshot');
  await go(cp, `/pharmacy/prescription/${id}`);
  await confirm(cp);
  await text(cp, 'Price or availability has changed');
  await rpc(reviewer.client, 'review_prescription', quoteArgs);
  console.log('PASS: live stale displayed quote, price mismatch and insufficient-stock rejection; real catalogue unchanged.');

  stage = 'live decline and cancellation';
  const declinedPatient = `Synthetic ${run} decline`;
  const declined = await fixture(customer, declinedPatient, image);
  await chooseReview(rp, declinedPatient);
  await rp.getByLabel('Reviewer note', { exact: true }).fill('Synthetic decline — not a real prescription');
  await click(rp, 'Decline request');
  await go(cp, `/pharmacy/prescription/${declined}`);
  await text(cp, 'Needs a new prescription');
  await text(cp, 'Synthetic decline — not a real prescription');
  await click(cp, 'Cancel prescription');
  await click(cp, 'Keep request');
  check((await record(customer.client, declined)).status === 'rejected', 'keeping request does not cancel');
  await click(cp, 'Cancel prescription');
  await cp.getByRole('button', { name: 'Cancel prescription', exact: true }).last().click();
  await text(cp, 'Cancelled');
  check((await record(customer.client, declined)).status === 'cancelled', 'live cancellation persists');
  console.log('PASS: live decline reason, keep-request and confirmed cancellation.');

  stage = 'live confirmation and existing order navigation';
  await go(cp, `/pharmacy/prescription/${id}`);
  await cp.getByLabel('Contact number', { exact: true }).fill('TEST ONLY — DO NOT FULFIL');
  await cp.getByLabel('Delivery address', { exact: true }).fill('TEST ONLY — DO NOT FULFIL');
  await click(cp, 'Cash on delivery · test');
  await click(cp, 'Confirm quoted order');
  await cp.getByRole('button', { name: 'Confirm order', exact: true }).evaluate(node => { node.click(); node.click(); });
  await text(cp, 'View order');
  retainedOwner = true;
  rx = await record(customer.client, id);
  const details = { paymentMethod: 'cod', contact: 'TEST ONLY — DO NOT FULFIL', addressLine: 'TEST ONLY — DO NOT FULFIL',
    slotLabel: 'Test only', storeName: 'Test only', quoteVersion: rx.quoted_at };
  const repeated = await Promise.all([
    rpc(customer.client, 'place_prescription_order', { p_id: id, p_details: details }),
    rpc(customer.client, 'place_prescription_order', { p_id: id, p_details: details }),
  ]);
  check(repeated.every(r => r.orderNo === rx.order_no), 'parallel repeated confirmations return the existing order');
  const orders = await ok(await customer.client.from('orders').select('*,order_items(*)').eq('prescription_id', id), 'persisted test order');
  check(orders.length === 1, 'only one live order');
  const order = orders[0];
  check(order.is_test && order.payment_status === 'simulated' && order.points_redeemed === 0 &&
    order.points_earned === 0 && order.address_line.includes('DO NOT FULFIL'), 'test/simulated/no loyalty/labelled order');
  check(Number(order.items_subtotal) === Number(product.price) * 2 &&
    Number(order.total) === Number(product.price) * 2 + 20, 'exact persisted order totals');
  check(order.order_items.length === 1 && order.order_items[0].quantity === 2 &&
    Number(order.order_items[0].unit_price) === Number(product.price), 'exact persisted order lines');
  await cp.getByRole('link', { name: `Open order ${rx.order_no}`, exact: true }).click();
  await cp.waitForURL('**/orders/*');
  await text(cp, rx.order_no);
  console.log('PASS: real signed-in UI confirmation, concurrent repeat calls, one simulated labelled order, exact saved totals and existing order navigation.');
  console.log('LIMIT: native camera/gallery permissions and device capture are not verified by this web run.');
} catch (error) {
  console.error(`FAIL at ${stage}: ${error.message?.startsWith('CHECK:') ? error.message : error.name}. Sensitive details withheld.`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (admin) {
    let cleanupFailed = false;
    if (files.length) {
      const removed = await admin.storage.from('prescriptions').remove(files);
      cleanupFailed ||= !!removed.error;
    }
    if (reviewerId) {
      const removed = await admin.from('pharmacy_reviewers').delete().eq('user_id', reviewerId);
      cleanupFailed ||= !!removed.error;
    }
    // A test order must remain auditable. Do not delete orders to remove its owner.
    // Disable that synthetic account; delete other freshly created test accounts.
    for (const id of accounts) {
      const orders = await admin.from('orders').select('id').eq('user_id', id);
      if (orders.error) { cleanupFailed = true; continue; }
      if (orders.data.length) {
        retainedOwner = true;
        const banned = await admin.auth.admin.updateUserById(id, { ban_duration: '876000h', password: randomBytes(32).toString('base64url') });
        cleanupFailed ||= !!banned.error;
      } else {
        const removed = await admin.auth.admin.deleteUser(id);
        cleanupFailed ||= !!removed.error;
      }
    }
    if (baseline) {
      const membership = await admin.from('pharmacy_reviewers').select('user_id');
      cleanupFailed ||= !!membership.error ||
        JSON.stringify(membership.data?.map(r => r.user_id).sort()) !== JSON.stringify(baseline.map(r => r.user_id).sort());
    }
    if (cleanupFailed) {
      console.error('FAIL: synthetic cleanup or preserved pharmacist membership verification failed.');
      process.exitCode = 1;
    } else {
      console.log(`CLEANUP: uploaded test objects removed, temporary reviewer revoked, original membership preserved. ${retainedOwner
        ? 'One disabled synthetic customer account and labelled test order remain for audit; never fulfil.'
        : 'All temporary accounts removed; no orders remain.'}`);
    }
  }
}
