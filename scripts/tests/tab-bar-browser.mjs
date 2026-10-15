// Guest-only navigation checks: no login, checkout or backend mutations.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ executablePath: '/repl/tools/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [320, 402, 768, 1280]) {
    await page.setViewportSize({ width, height: 874 });
    await page.goto(`https://${process.env.REPLIT_DEV_DOMAIN}/`);
    const tab = name => page.getByRole('button', { name, exact: true }).filter({ visible: true }).last();
    await tab('Home').waitFor();
    const bar = tab('Home').locator('..');
    const box = await bar.boundingBox();
    assert.ok(Math.abs(box.width - Math.min(width, 480)) <= 1, 'Bar must match mobile content width');
    assert.ok(Math.abs(box.x - (width - box.width) / 2) <= 1, 'Bar must be horizontally centered');
    assert.ok(Math.abs(box.y + box.height - 874) <= 1, 'Bar must stay at the bottom');
    for (const name of ['Home', 'Categories', 'Pharmacy', 'Cart', 'Profile']) {
      const bounds = await tab(name).boundingBox();
      assert.ok(bounds.width >= 44 && bounds.height >= 44, `${name} must retain its touch target`);
      assert.ok(bounds.x >= box.x - 1 && bounds.x + bounds.width <= box.x + box.width + 1, `${name} must fit inside the bar`);
    }
    await tab('Profile').click();
    await page.waitForURL(/\/profile$/);
    await tab('Home').click();
    await page.waitForURL(url => url.pathname === '/');
  }
  assert.deepEqual(errors, []);
  console.log('PASS: bottom bar stays centered at 480px max, fills small screens, keeps five touch targets and working navigation at 320/402/768/1280px.');
} finally {
  await browser.close();
}
