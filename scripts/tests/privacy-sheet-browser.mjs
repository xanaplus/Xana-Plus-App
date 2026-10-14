// Guest-only: never signs in, changes preferences, deletes accounts or opens external policies.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/repl/tools/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Icon glyphs are part of the shared button's accessible name on web.
  const visibleButton = name => page.getByRole('button', { name: new RegExp(`${name}$`) }).filter({ visible: true }).last();
  for (const [width, height, theme] of [[402, 874, 'light'], [320, 568, 'light'], [402, 568, 'dark'], [1280, 800, 'light']]) {
    await page.setViewportSize({ width, height });
    await page.addInitScript(theme => localStorage.setItem('xanaplus.appearance.v1', JSON.stringify(theme)), theme);
    await page.goto(`https://${process.env.REPLIT_DEV_DOMAIN}/profile`);
    await visibleButton('Terms & Privacy').click();
    const back = visibleButton('Back to Profile');
    await back.click({ trial: true }); // Wait until opening animation/actionability settles.
    const close = visibleButton('Close');
    const header = page.getByText('Terms & Privacy', { exact: true }).filter({ visible: true }).last();
    const bounds = async locator => {
      const box = await locator.boundingBox();
      assert.ok(box.y >= 0 && box.y + box.height <= height + 1, 'Control extends outside viewport');
      return box;
    };
    const headerBefore = await bounds(header), backBefore = await bounds(back);
    const closeBox = await bounds(close);
    assert.ok(closeBox.height >= 44 && closeBox.width >= 44);
    const policy = visibleButton('Read the full privacy policy');
    await policy.evaluate(element => {
      let container = element.parentElement;
      while (container && !['auto', 'scroll'].includes(getComputedStyle(container).overflowY)) container = container.parentElement;
      if (!container) throw new Error('Privacy content has no scroll container');
      container.scrollTop = container.scrollHeight;
    });
    await policy.click({ trial: true });
    const headerAfter = await bounds(header), backAfter = await bounds(back);
    assert.ok(Math.abs(headerBefore.y - headerAfter.y) < 1, 'Header must stay fixed while body scrolls');
    assert.ok(Math.abs(backBefore.y - backAfter.y) < 1, 'Back button must stay fixed while body scrolls');
    await page.screenshot({ path: `/tmp/privacy-sheet-${width}-${height}-${theme}.png` });
    await back.click();
    await back.waitFor({ state: 'hidden' });
    await visibleButton('Terms & Privacy').click();
    await close.click();
    await back.waitFor({ state: 'hidden' });
  }
  assert.deepEqual(errors, []);
  console.log('PASS: privacy content scrolls; heading, 44px close and Back to Profile stay visible; both exits work; small/mobile/desktop layouts and both themes. Guest-only.');
} finally { await browser.close(); }
