// Owner-approved no-SMS live verification. No credentials/session states/traces
// are written to disk. Requires explicit opt-in on every run.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
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
let retainedOrders = 0;
let blockedAuthCalls = 0;
let customerPage;
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
  await context.route('**/functions/v1/**', route => {
    blockedAuthCalls++;
    return route.abort();
  });
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
async function orderDenied(client, id, details, reason) {
  const result = await client.rpc('place_prescription_order', { p_id: id, p_details: details });
  check(result.error?.message === reason, `ordering denied: ${reason}`);
  const orders = await ok(await client.from('orders').select('id').eq('prescription_id', id), 'no failed order');
  check(orders.length === 0, 'rejected confirmation creates no order');
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
  baseline = await ok(await admin.from('pharmacy_reviewers').select('*'), 'snapshot designated membership');
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
  customerPage = cp;
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
  stage = 'browser gallery file chooser';
  const chooser = cp.waitForEvent('filechooser');
  await click(cp, 'Choose photos');
  await (await chooser).setFiles({ name: 'synthetic-test.png', mimeType: 'image/png', buffer: image });
  const patient = `Synthetic ${run} main`;
  stage = 'browser patient details and consent';
  await cp.getByLabel('Your full name').fill(patient);
  await cp.getByLabel('Note for pharmacist (optional)').fill('DO NOT FULFIL — no clinical data');
  await cp.getByRole('checkbox').click();
  let uploadCalls = 0, createCalls = 0, submitCalls = 0;
  await cp.route('**/storage/v1/object/prescriptions/**', async route => {
    if (route.request().method() === 'POST') {
      files.push(decodeURIComponent(new URL(route.request().url()).pathname.split('/object/prescriptions/')[1]));
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
  await cp.getByText('Sign in is required before submission.', { exact: true }).waitFor({ state: 'hidden' });
  stage = 'browser failed upload retry';
  await click(cp, 'Submit for pharmacist review');
  await text(cp, 'Draft saved for retry');
  await text(cp, 'No successful change has been confirmed');
  await click(cp, 'Retry submission');
  stage = 'browser failed submission retry';
  await text(cp, 'No successful change has been confirmed');
  await click(cp, 'Retry submission');
  stage = 'browser submitted detail';
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
  const imageResponse = await fetch(signed.signedUrl);
  check(imageResponse.status === 200 && Buffer.from(await imageResponse.arrayBuffer()).equals(image), 'owner reads exact image bytes');
  const reviewerImage = await ok(await reviewer.client.storage.from('prescriptions').download(path), 'reviewer reads actual image');
  check(Buffer.from(await reviewerImage.arrayBuffer()).equals(image), 'reviewer reads exact image bytes');
  check((await stranger.client.storage.from('prescriptions').createSignedUrl(path, 300)).error, 'other customer denied image');
  check((await stranger.client.storage.from('prescriptions').download(path)).error, 'other customer download denied');
  const anon = createClient(url, key, options);
  check((await anon.storage.from('prescriptions').createSignedUrl(path, 300)).error, 'anonymous signing denied');
  check((await anon.storage.from('prescriptions').download(path)).error, 'anonymous download denied');
  check((await fetch(`${url}/storage/v1/object/public/prescriptions/${path}`)).status !== 200, 'public URL denied');
  const otherRecords = await ok(await stranger.client.from('prescriptions').select('id').eq('id', id), 'cross-user RLS query');
  check(otherRecords.length === 0, 'other customer cannot read prescription');
  check((await anon.from('prescriptions').select('id').eq('id', id)).error, 'anonymous record denied');
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
  await orderDenied(customer.client, id, {}, 'not_approved');
  console.log('PASS: live pharmacist clarification, customer reply, hold and no held-request checkout.');

  stage = 'live catalogue and exact pharmacist quote';
  const products = await ok(await customer.client.from('catalogue').select('item_no,name,price,stock')
    .eq('category', 'GENERAL').eq('age_restricted', false).gte('stock', 2).gt('price', 0).limit(30), 'live catalogue');
  const product = products.find(p => !/digoxin|lithium|carbamazepine/i.test(p.name));
  check(product, 'suitable stocked medicine');
  await chooseReview(rp, patient);
  stage = 'live catalogue name search';
  // The app searches names/categories, not item numbers.
  await rp.getByLabel('Search live medicine catalogue').fill(product.name.replace(/[^a-z0-9 ]/gi, ' ').trim());
  const productRow = rp.getByText(`${product.item_no} · KSh`, { exact: false }).locator('../..');
  await productRow.getByRole('button', { name: 'Add', exact: true }).click();
  stage = 'live pharmacist quote editor';
  await rp.getByRole('button', { name: `Increase ${product.name} quantity`, exact: true }).click();
  await rp.getByLabel(`Instructions for ${product.name}`, { exact: true }).fill('Synthetic quote — DO NOT DISPENSE');
  const expiry = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await rp.getByLabel('Quote expiry date').fill(expiry);
  await rp.getByLabel('Reviewer note', { exact: true }).fill('Synthetic priced quote — DO NOT FULFIL');
  const quoteResponse = rp.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/review_prescription'));
  await click(rp, 'Send priced quote');
  stage = 'live quote saved and displayed';
  const savedQuote = await quoteResponse;
  if (!savedQuote.ok()) {
    const result = await savedQuote.json();
    const safeCode = /^[A-Z0-9]{5}$/.test(result.code) ? result.code : 'withheld';
    console.log(`Quote response: HTTP ${savedQuote.status()}, database code ${safeCode}.`);
  }
  check(savedQuote.ok(), 'browser priced quote accepted by backend');
  await text(rp, 'Open request');
  stage = 'live saved quote record';
  rx = await record(customer.client, id);
  check(rx.status === 'quoted' && rx.quote_lines[0].quantity === 2 &&
    Number(rx.quote_lines[0].unit_price) === Number(product.price), 'exact real server-priced quote');
  await go(cp, `/pharmacy/prescription/${id}`);
  stage = 'live customer quote subtotal';
  await text(cp, 'Quoted subtotal');
  const money = value => `KSh ${Number(value).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  stage = 'live customer displayed unit price';
  await text(cp, `${money(product.price)} each`);
  stage = 'live customer displayed subtotal amount';
  await text(cp, money(Number(product.price) * 2));
  stage = 'live customer displayed quantity';
  // React Native Web can split interpolated Text into adjacent spans.
  const quoteLine = cp.getByText(/^Quantity\s*2\s*·/).first();
  await quoteLine.waitFor();
  const quantityText = await quoteLine.innerText();
  check(/Quantity\s*2\s*·/.test(quantityText) && quantityText.includes(product.item_no.trim()), 'displayed quoted quantity and item');
  await cp.getByLabel('Contact number', { exact: true }).fill('TEST ONLY — DO NOT FULFIL');
  await cp.getByLabel('Delivery address', { exact: true }).fill('TEST ONLY — DO NOT FULFIL');
  stage = 'live customer test payment selection';
  await cp.getByRole('button', { name: /Cash on delivery · test/ }).click();

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
  await cp.getByLabel('Contact number', { exact: true }).fill('TEST ONLY — DO NOT FULFIL');
  await cp.getByLabel('Delivery address', { exact: true }).fill('TEST ONLY — DO NOT FULFIL');
  await confirm(cp);
  await text(cp, 'Price or availability has changed');
  await ok(await admin.from('prescriptions').update({
    quote_lines: rx.quote_lines.map(l => ({ ...l, quantity: Math.floor(Number(product.stock)) + 1 })),
  }).eq('id', id), 'synthetic insufficient stock snapshot');
  await go(cp, `/pharmacy/prescription/${id}`);
  await cp.getByLabel('Contact number', { exact: true }).fill('TEST ONLY — DO NOT FULFIL');
  await cp.getByLabel('Delivery address', { exact: true }).fill('TEST ONLY — DO NOT FULFIL');
  await confirm(cp);
  await text(cp, 'Price or availability has changed');
  await rpc(reviewer.client, 'review_prescription', quoteArgs);
  console.log('PASS: live stale displayed quote, price mismatch and insufficient-stock rejection; real catalogue unchanged.');

  stage = 'live expiry gates';
  rx = await record(customer.client, id);
  const safeDetails = { paymentMethod: 'cod', contact: 'TEST ONLY — DO NOT FULFIL', addressLine: 'TEST ONLY — DO NOT FULFIL',
    slotLabel: 'Test only', storeName: 'Test only', quoteVersion: rx.quoted_at };
  await ok(await admin.from('prescriptions').update({
    valid_until: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
  }).eq('id', id), 'synthetic expired quote');
  await go(cp, `/pharmacy/prescription/${id}`);
  await text(cp, 'This quote is expired or missing its review timestamp');
  check(await cp.getByRole('button', { name: 'Confirm quoted order', exact: true }).isDisabled(), 'expired quote disabled');
  await orderDenied(customer.client, id, safeDetails, 'expired_quote');
  await ok(await admin.from('prescriptions').update({
    valid_until: expiry, quoted_at: new Date(Date.now() - 49 * 3600000).toISOString(),
  }).eq('id', id), 'synthetic aged quote');
  await go(cp, `/pharmacy/prescription/${id}`);
  await text(cp, 'This quote is expired or missing its review timestamp');
  check(await cp.getByRole('button', { name: 'Confirm quoted order', exact: true }).isDisabled(), 'aged quote disabled');
  await orderDenied(customer.client, id, safeDetails, 'expired_quote');
  await rpc(reviewer.client, 'review_prescription', quoteArgs);
  console.log('PASS: live expired-date and over-48-hour quotes disabled in browser and rejected by backend without an order.');

  stage = 'live decline and cancellation';
  const declinedPatient = `Synthetic ${run} decline`;
  const declined = await fixture(customer, declinedPatient, image);
  await chooseReview(rp, declinedPatient);
  await rp.getByLabel('Reviewer note', { exact: true }).fill('Synthetic decline — not a real prescription');
  await click(rp, 'Decline request');
  await go(cp, `/pharmacy/prescription/${declined}`);
  await text(cp, 'Needs a new prescription');
  await text(cp, 'Synthetic decline — not a real prescription');
  await orderDenied(customer.client, declined, safeDetails, 'not_approved');
  await click(cp, 'Cancel prescription');
  await click(cp, 'Keep request');
  await cp.getByRole('button', { name: 'Keep request', exact: true }).waitFor({ state: 'hidden' });
  check((await record(customer.client, declined)).status === 'rejected', 'keeping request does not cancel');
  await click(cp, 'Cancel prescription');
  const cancelResponse = cp.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/cancel_prescription'));
  await cp.getByRole('button', { name: 'Cancel prescription', exact: true }).last().click();
  check((await cancelResponse).ok(), 'browser cancellation accepted');
  await cp.getByRole('button', { name: 'Keep request', exact: true }).waitFor({ state: 'hidden' });
  await cp.getByText('Cancelled', { exact: true }).first().waitFor();
  check((await record(customer.client, declined)).status === 'cancelled', 'live cancellation persists');
  await orderDenied(customer.client, declined, safeDetails, 'not_approved');
  check(await cp.getByRole('button', { name: 'Confirm quoted order', exact: true }).count() === 0, 'cancelled request has no checkout');
  console.log('PASS: live decline reason, keep-request and confirmed cancellation.');

  stage = 'live confirmation and existing order navigation';
  await go(cp, `/pharmacy/prescription/${id}`);
  await cp.getByLabel('Contact number', { exact: true }).fill('TEST ONLY — DO NOT FULFIL');
  await cp.getByLabel('Delivery address', { exact: true }).fill('TEST ONLY — DO NOT FULFIL');
  await cp.getByRole('button', { name: /Cash on delivery · test/ }).click();
  await click(cp, 'Confirm quoted order');
  const historyRefresh = cp.waitForResponse(response => {
    const target = new URL(response.url());
    return target.pathname === '/rest/v1/orders' && target.searchParams.get('select')?.startsWith('order_no,');
  }).catch(() => null);
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
  console.log('PASS: real signed-in UI confirmation, concurrent repeat calls, one simulated labelled order and exact saved totals.');

  stage = 'concurrent first confirmation';
  const concurrent = await fixture(customer, `Synthetic ${run} concurrent`, image);
  await rpc(reviewer.client, 'review_prescription', { ...quoteArgs, p_id: concurrent });
  const freshQuote = await record(customer.client, concurrent);
  // Separate clients avoid the SDK auth lock serializing the requests.
  const clients = await Promise.all([0, 1].map(async () => {
    const client = createClient(url, key, options);
    await ok(await client.auth.setSession(customer.session), 'parallel customer session');
    return client;
  }));
  const firstCalls = await Promise.all(clients.map(client => rpc(client, 'place_prescription_order', {
    p_id: concurrent, p_details: { ...safeDetails, quoteVersion: freshQuote.quoted_at },
  })));
  check(firstCalls[0].orderNo === firstCalls[1].orderNo, 'concurrent first calls return the same order');
  const concurrentOrders = await ok(await customer.client.from('orders').select('*').eq('prescription_id', concurrent), 'concurrent saved order');
  check(concurrentOrders.length === 1 && concurrentOrders[0].is_test &&
    concurrentOrders[0].payment_status === 'simulated' && concurrentOrders[0].points_redeemed === 0 &&
    concurrentOrders[0].points_earned === 0 && concurrentOrders[0].address_line.includes('DO NOT FULFIL'), 'one safe concurrent order');
  console.log('PASS: concurrent first confirmations from separate clients create one simulated order.');
  stage = 'existing order history refresh and navigation';
  const refreshedHistory = await historyRefresh;
  check(refreshedHistory, 'order history refresh was requested');
  check(refreshedHistory.ok(), 'order history refresh accepted by backend');
  const historyRows = await refreshedHistory.json();
  check(historyRows.some(row => row.order_no === rx.order_no), 'refreshed history contains the confirmed order');
  await cp.getByRole('link', { name: `Open order ${rx.order_no}`, exact: true }).click();
  await cp.waitForURL('**/orders/*');
  // Expo Router keeps the previous screen mounted but hidden. Match the order
  // screen's unique heading, not the hidden prescription screen's order link.
  await cp.getByText(`Order #${rx.order_no}`, { exact: true }).waitFor();
  console.log('PASS: existing order navigation displays the confirmed order without reloading the app.');
  await go(cp, '/pharmacy/prescriptions');
  await cp.getByRole('button').filter({ hasText: patient }).click();
  await cp.waitForURL(`**/pharmacy/prescription/${id}`);
  await text(cp, 'View order');
  check(blockedAuthCalls === 0, 'no Edge Function, OTP, payment or SMS requests attempted');
  console.log('PASS: customer history opens the existing prescription request.');
  console.log('LIMIT: native camera/gallery permissions and device capture are not verified by this web run.');
} catch (error) {
  console.error(`FAIL at ${stage}: ${error.message?.startsWith('CHECK:') ? error.message : error.name}. Sensitive details withheld.`);
  const locations = error.stack?.match(/prescription-live\.mjs:\d+:\d+/g);
  if (locations) console.error(`Harness locations: ${locations.join(', ')}`);
  if (customerPage && !customerPage.isClosed()) {
    for (const notice of ['Order not found', 'Something went wrong', 'Could not sync your order history']) {
      const count = await customerPage.getByText(notice, { exact: false }).count().catch(() => 0);
      if (count) console.error(`Visible app state: ${notice}`);
    }
  }
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (admin) {
    let cleanupFailed = false;
    // Discover objects by the exact freshly created owner prefixes as well:
    // failure before attachment must not strand an untracked uploaded image.
    for (const id of accounts) {
      const drafts = await admin.storage.from('prescriptions').list(id, { limit: 1000 });
      cleanupFailed ||= !!drafts.error;
      for (const folder of drafts.data || []) {
        const objects = await admin.storage.from('prescriptions').list(`${id}/${folder.name}`, { limit: 1000 });
        cleanupFailed ||= !!objects.error;
        for (const object of objects.data || []) files.push(`${id}/${folder.name}/${object.name}`);
      }
    }
    if (files.length) {
      const removed = await admin.storage.from('prescriptions').remove([...new Set(files)]);
      cleanupFailed ||= !!removed.error;
      for (const path of new Set(files)) {
        const remaining = await admin.storage.from('prescriptions').list(path.slice(0, path.lastIndexOf('/')), { limit: 1000 });
        cleanupFailed ||= !!remaining.error || remaining.data?.some(object => object.name === path.split('/').pop());
      }
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
        retainedOrders += orders.data.length;
        const drafts = await admin.from('prescriptions').delete().eq('user_id', id).neq('status', 'ordered');
        cleanupFailed ||= !!drafts.error;
        const banned = await admin.auth.admin.updateUserById(id, { ban_duration: '876000h', password: randomBytes(32).toString('base64url') });
        cleanupFailed ||= !!banned.error;
        const user = await admin.auth.admin.getUserById(id);
        cleanupFailed ||= !!user.error || !(new Date(user.data.user?.banned_until).getTime() > Date.now());
        const remainingDrafts = await admin.from('prescriptions').select('id').eq('user_id', id).neq('status', 'ordered');
        cleanupFailed ||= !!remainingDrafts.error || remainingDrafts.data?.length !== 0;
      } else {
        const removed = await admin.auth.admin.deleteUser(id);
        cleanupFailed ||= !!removed.error;
        const user = await admin.auth.admin.getUserById(id);
        cleanupFailed ||= !!user.data?.user || user.error?.status !== 404;
      }
    }
    if (baseline) {
      const membership = await admin.from('pharmacy_reviewers').select('*');
      const sorted = rows => rows?.sort((a, b) => a.user_id.localeCompare(b.user_id));
      cleanupFailed ||= !!membership.error ||
        JSON.stringify(sorted(membership.data)) !== JSON.stringify(sorted(baseline));
    }
    if (cleanupFailed) {
      console.error('FAIL: synthetic cleanup or preserved pharmacist membership verification failed.');
      process.exitCode = 1;
    } else {
      console.log(`CLEANUP: uploaded test objects removed, temporary reviewer revoked, original membership preserved. ${retainedOwner
        ? `One disabled synthetic customer account and ${retainedOrders} labelled test orders remain for audit; never fulfil. Non-order drafts removed.`
        : 'All temporary accounts removed; no orders remain.'}`);
    }
  }
}
