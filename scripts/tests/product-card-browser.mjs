// Guest catalogue and local cart only. Blocks login/order functions; no shared orders or payments.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/repl/tools/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 402, height: 874 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/functions/v1/*', route => route.abort());
  const base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
  for (const theme of ['light', 'dark']) {
    await page.addInitScript(value => localStorage.setItem('xanaplus.appearance.v1', JSON.stringify(value)), theme);
    await page.goto(`${base}/categories?vertical=groceries&t=card-${theme}`);
    const adds = page.getByRole('button', { name: /^Add .+ to cart$/ });
    await adds.first().waitFor({ timeout: 20000 });
    const first = adds.nth(0), second = adds.nth(1);
    assert.match(await first.innerText(), /\+ Add/);
    const a = await first.boundingBox(), b = await second.boundingBox();
    assert.ok(a.height >= 44 && b.height >= 44, 'Add controls must have 44px targets');
    assert.ok(Math.abs(a.y - b.y) < 1, 'Neighbouring add controls must align');
    const price = first.locator('..').locator('div').filter({ hasText: /^KES/ }).first();
    assert.ok(await price.count() > 0);
    const firstPrice = await first.locator('..').getByText(/^KES/).first().boundingBox();
    const secondPrice = await second.locator('..').getByText(/^KES/).first().boundingBox();
    assert.ok(Math.abs(firstPrice.y - secondPrice.y) < 1, 'Neighbouring price labels must align');
    const name = (await first.getAttribute('aria-label')).replace(/^Add /, '').replace(/ to cart$/, '');
    const before = new URL(page.url()).pathname;
    await first.click();
    assert.equal(new URL(page.url()).pathname, before, 'Add must not navigate to the product');
    assert.equal(await page.getByRole('button', { name: `Add ${name} to cart`, exact: true }).count(), 0, 'Quantity display must replace Add');
    await page.screenshot({ path: `/tmp/product-cards-${theme}.png` });
    await page.setViewportSize({ width: 320, height: 874 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.setViewportSize({ width: 402, height: 874 });
    await page.evaluate(() => localStorage.removeItem('xanaplus.cart.v1'));
  }
  await page.goto(`${base}/categories?vertical=deli&t=rail-check`);
  const add = page.getByRole('button', { name: /^Add .+ to cart$/ }).first();
  await add.waitFor();
  await add.click();
  const increase = page.getByRole('button', { name: 'Increase quantity', exact: true }).first();
  await increase.waitFor();
  assert.equal(await page.getByRole('button', { name: 'Decrease quantity', exact: true }).first().isDisabled(), true);
  await increase.click();
  assert.equal(await page.getByRole('button', { name: 'Decrease quantity', exact: true }).first().isEnabled(), true);
  assert.deepEqual(errors, []);
  console.log('PASS: aligned 44px + Add pills, light/dark mode, narrow layout, independent cart/navigation actions and unchanged rail quantity limits. Guest/local cart only.');
} finally {
  await browser.close();
}
