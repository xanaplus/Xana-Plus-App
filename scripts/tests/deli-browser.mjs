// Guest-only reads and navigation. Never signs in, uploads, places orders or pays.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_KEY,
  { auth: { persistSession: false } });
assert.ok(process.env.REPLIT_DEV_DOMAIN, 'Development preview is required');
const { data, error } = await db.from('catalogue').select('item_no,name,price,stock,requires_rx,age_restricted,photo_url,price_tiers')
  .ilike('item_no', 'DEL%').gt('stock', 0).order('has_photo', { ascending: false }).order('stock', { ascending: false }).limit(1);
assert.equal(error, null, 'Public Deli sample failed');
assert.equal(data?.length, 1, 'An in-stock visible DEL item is required');
const sample = data[0];
const name = sample.name.trim();
const browser = await chromium.launch({ executablePath: '/repl/tools/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 402, height: 874 } });
  const errors = [];
  page.on('pageerror', value => errors.push(value.message));
  await page.route('**/functions/v1/*', route =>
    /\/(request-otp|verify-otp|place-order)(?:\?|$)/.test(route.request().url())
      ? route.abort('blockedbyclient') : route.continue());
  const base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
  await page.goto(base);
  await page.getByText('Deli', { exact: true }).filter({ visible: true }).first().click();
  await page.getByText('Deli Kitchen', { exact: true }).filter({ visible: true }).first().waitFor();
  await page.getByText(name, { exact: true }).filter({ visible: true }).first().waitFor();
  await page.goto(`${base}/search?q=Deli%20Kitchen`);
  await page.getByText(name, { exact: true }).filter({ visible: true }).first().waitFor();

  // Restore a real public product with its previous, incorrect aisle assignment.
  // Financial and regulatory data stay exactly as returned by the backend.
  await page.addInitScript(product => {
    localStorage.setItem('xanaplus.products.v2', JSON.stringify([product]));
  }, {
    id: sample.item_no, name, category: 'bakery', price: Number(sample.price), pack: '', image: sample.photo_url ?? '',
    priceTiers: sample.price_tiers, rxRequired: sample.requires_rx, ageRestricted: sample.age_restricted,
    inStock: Number(sample.stock) > 0,
  });
  await page.goto(`${base}/product/${encodeURIComponent(sample.item_no)}`);
  await page.getByText('Deli Kitchen', { exact: true }).filter({ visible: true }).first().waitFor();
  await page.getByText(name, { exact: true }).filter({ visible: true }).first().waitFor();
  assert.deepEqual(errors, [], 'Deli navigation raised runtime errors');
  console.log(`PASS: ${sample.item_no} appears in Deli Kitchen, its See All search, and the Deli product page after restoring an old cached aisle. No SMS, uploads, orders or payments.`);
} finally {
  await browser.close();
}
