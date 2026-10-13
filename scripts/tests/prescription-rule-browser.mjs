// Guest-only public catalogue/PDP checks. No login, SMS, prescription upload or order.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

assert.ok(process.env.REPLIT_DEV_DOMAIN && process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_KEY,
  'Prescription browser test configuration is missing');
const db = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_KEY,
  { auth: { persistSession: false } });
const sample = async (group, itemCategory) => {
  let query = db.from('catalogue').select('item_no,name,requires_rx').eq('category', group);
  if (itemCategory) query = query.eq('item_category_code', itemCategory);
  const { data, error } = await query.gt('stock', 0).order('item_no').limit(1);
  assert.equal(error, null, 'Public catalogue sample failed');
  assert.equal(data?.length, 1, 'A live in-stock sample is required');
  return data[0];
};
const controlled = await sample('CONTROLLED');
const otc = await sample('OVER THE COUNTER', 'PHARMACY');
assert.equal(controlled.requires_rx, true);
assert.equal(otc.requires_rx, false);

const browser = await chromium.launch({ executablePath: '/repl/tools/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 402, height: 874 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/functions/v1/*', route => {
    if (/\/(request-otp|verify-otp|place-order)(?:\?|$)/.test(route.request().url())) return route.abort('blockedbyclient');
    return route.continue();
  });
  const load = async product => {
    await page.goto(`https://${process.env.REPLIT_DEV_DOMAIN}/product/${encodeURIComponent(product.item_no)}`);
    await page.getByText(product.name, { exact: true }).filter({ visible: true }).first().waitFor();
  };
  const notice = page.getByText('Rx Required · Upload prescription at checkout', { exact: true }).filter({ visible: true });
  await load(controlled);
  await notice.waitFor();
  await page.screenshot({ path: '/tmp/xanaplus-controlled-prescription.png' });
  await load(otc);
  assert.equal(await notice.count(), 0, 'OTC item is still showing the prescription requirement');
  await page.getByRole('button', { name: /Add to Cart/ }).filter({ visible: true }).last().waitFor();
  assert.deepEqual(errors, [], 'Product screens raised runtime errors');
  console.log(`PASS: Controlled ${controlled.item_no} shows the prescription gate; OTC ${otc.item_no} with PHARMACY item category does not. No login, SMS, upload, payment or order.`);
} finally {
  await browser.close();
}
