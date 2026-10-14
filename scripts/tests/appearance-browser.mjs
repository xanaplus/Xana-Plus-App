// Guest-only checks. Never signs in, sends SMS, creates orders or takes payments.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

assert.ok(process.env.REPLIT_DEV_DOMAIN, 'Development preview domain is required');
const browser = await chromium.launch({
  executablePath: '/repl/tools/bin/chromium',
  headless: true,
  args: ['--no-sandbox'],
});
const errors = [];
try {
  const context = await browser.newContext({
    viewport: { width: 402, height: 874 },
    colorScheme: 'dark',
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/functions/v1/*', route => {
    if (/\/(request-otp|verify-otp|place-order)(?:\?|$)/.test(route.request().url())) {
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  const visibleText = text => page.getByText(text, { exact: true }).filter({ visible: true }).last();
  const button = name => page.getByRole('button', { name }).filter({ visible: true }).last();
  const choice = name => page.getByRole('radio', { name: new RegExp(`^${name}(?:[.\\s]|$)`) }).filter({ visible: true }).last();
  const openSettings = async () => {
    await button('Settings').click();
    await visibleText('Appearance').waitFor();
    // Wait for the spring animation and the footer's actionability before
    // measuring or capturing the sheet, without actually closing it.
    await button('Done').click({ trial: true });
  };
  // Inspect a real rendered screen surface, not only the body's browser background.
  const surface = async title => page.getByText(title, { exact: true }).filter({ visible: true }).first().evaluate(element => {
    for (let node = element; node; node = node.parentElement) {
      const color = getComputedStyle(node).backgroundColor;
      if (color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)') return color;
    }
    throw new Error('No opaque screen surface found');
  });
  const lightness = color => {
    const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
    assert.equal(channels?.length, 3, `Unexpected color: ${color}`);
    return channels.reduce((sum, value) => sum + value, 0) / 3;
  };
  const assertNeutral = color => {
    const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number);
    assert.ok(Math.max(...channels) - Math.min(...channels) <= 4, `Dark surface is tinted instead of neutral: ${color}`);
  };
  const waitSurface = async (title, dark) => {
    await page.waitForFunction(({ title, dark }) => {
      const elements = [...document.querySelectorAll('div')].filter(node =>
        node.textContent === title && node.getBoundingClientRect().height > 0);
      const element = elements.sort((a, b) =>
        a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
      for (let node = element; node; node = node.parentElement) {
        const color = getComputedStyle(node).backgroundColor;
        if (color === 'transparent' || color === 'rgba(0, 0, 0, 0)') continue;
        const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
        if (!channels || channels.length !== 3) return false;
        const value = channels.reduce((sum, channel) => sum + channel, 0) / 3;
        return dark ? value < 80 : value > 180;
      }
      return false;
    }, { title, dark });
  };
  const assertReadable = async text => {
    const pair = await visibleText(text).evaluate(element => {
      const foreground = getComputedStyle(element).color;
      for (let node = element; node; node = node.parentElement) {
        const background = getComputedStyle(node).backgroundColor;
        if (background !== 'transparent' && background !== 'rgba(0, 0, 0, 0)') {
          return { foreground, background };
        }
      }
      throw new Error(`No background found for ${element.textContent}`);
    });
    const luminance = color => {
      const channels = color.match(/[\d.]+/g).slice(0, 3).map(value => {
        const channel = Number(value) / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const values = [luminance(pair.foreground), luminance(pair.background)].sort((a, b) => a - b);
    const contrast = (values[1] + 0.05) / (values[0] + 0.05);
    assert.ok(contrast >= 4.5, `${text} contrast is too low (${contrast.toFixed(2)}:1)`);
  };
  await page.goto(`https://${process.env.REPLIT_DEV_DOMAIN}/profile`);
  await button('Settings').waitFor();
  await waitSurface('Profile', false);
  const originalLight = await surface('Profile');
  await openSettings();
  await choice('Light').waitFor();
  assert.equal(await choice('Light').getAttribute('aria-checked'), 'true');
  assert.equal(await page.getByRole('radio', { name: /Use device setting|Follow system/ }).count(), 0);
  const appearanceBox = await visibleText('Appearance').boundingBox();
  const storeBox = await visibleText('Fulfilment store').boundingBox();
  assert.ok(appearanceBox.y < storeBox.y, 'Appearance must precede store settings');
  const storeOptions = page.getByRole('radio').filter({ hasText: /·/ }).filter({ visible: true });
  assert.ok(await storeOptions.count() > 1, 'Store selection is missing');
  const alternateStore = storeOptions.nth(1);
  const alternateStoreName = (await alternateStore.getAttribute('aria-label')).split('. ')[0];
  await alternateStore.click();
  await button('Done').click();
  await visibleText(alternateStoreName).waitFor();
  await button('Change fulfilment store').click();
  await visibleText('Appearance').waitFor();
  await choice('Dark').click();
  await button('Done').click();
  await waitSurface('Profile', true);
  assertNeutral(await surface('Profile'));
  assert.ok(lightness(await surface('Profile')) < lightness(originalLight), 'Profile surface did not change');
  await page.emulateMedia({ colorScheme: 'light' });
  await waitSurface('Profile', true); // Explicit Dark stays dark on a light OS.
  await page.reload();
  await button('Settings').waitFor();
  await waitSurface('Profile', true);
  await assertReadable('Profile');
  await page.screenshot({ path: '/tmp/xanaplus-dark-profile.png', fullPage: true });
  await openSettings();
  await assertReadable('Appearance');
  await assertReadable('Dark');
  await assertReadable('Done');
  await page.screenshot({ path: '/tmp/xanaplus-dark-settings.png', fullPage: true });
  await button('Done').click();
  // Confirm real shared-screen and navigation styles update on cached transitions.
  await button('Cart').click();
  await waitSurface('Cart Checkout', true);
  await page.screenshot({ path: '/tmp/xanaplus-dark-cart.png', fullPage: true });
  await button('Profile').click();
  await button('Settings').waitFor();
  await openSettings();
  await choice('Light').click();
  await button('Done').click();
  await waitSurface('Profile', false);
  await page.emulateMedia({ colorScheme: 'dark' });
  await waitSurface('Profile', false); // Explicit Light overrides the device.
  await page.reload();
  await button('Settings').waitFor();
  await waitSurface('Profile', false); // Explicit Light survives reload on a dark OS.
  await page.emulateMedia({ colorScheme: 'light' });
  await waitSurface('Profile', false); // OS changes never change the app's choice.
  await page.evaluate(() => localStorage.setItem('xanaplus.appearance.v1', '"system"'));
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  await button('Settings').waitFor();
  await waitSurface('Profile', false); // Legacy system preference now defaults to Light.
  await openSettings();
  assert.equal(await choice('Light').getAttribute('aria-checked'), 'true');
  await button('Done').click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await openSettings();
  await page.screenshot({ path: '/tmp/xanaplus-light-settings-desktop.png', fullPage: true });
  const failureContext = await browser.newContext({
    viewport: { width: 402, height: 874 },
    colorScheme: 'light',
  });
  const failurePage = await failureContext.newPage();
  failurePage.on('pageerror', error => errors.push(error.message));
  await failurePage.addInitScript(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'xanaplus.appearance.v1' && !globalThis.__appearanceTestAllowWrite) {
        throw new DOMException('Test device storage is full', 'QuotaExceededError');
      }
      return write.call(this, key, value);
    };
  });
  await failurePage.goto(`https://${process.env.REPLIT_DEV_DOMAIN}/profile`);
  await failurePage.getByRole('button', { name: 'Settings', exact: true }).click();
  await failurePage.getByRole('radio', { name: /^Dark[.\s]/ }).click();
  const saveError = failurePage.getByText(/Your appearance setting was not saved/);
  await saveError.waitFor();
  await failurePage.evaluate(() => { globalThis.__appearanceTestAllowWrite = true; });
  await failurePage.getByRole('button', { name: 'Retry', exact: true }).click();
  await saveError.waitFor({ state: 'hidden' });
  await failurePage.reload();
  await failurePage.getByRole('button', { name: 'Settings', exact: true }).click();
  assert.equal(
    await failurePage.getByRole('radio', { name: /^Dark[.\s]/ }).getAttribute('aria-checked'),
    'true',
    'Retry must save the selected appearance for the next reload',
  );
  await failureContext.close();
  assert.deepEqual(errors, [], 'Browser raised runtime errors');
  console.log('PASS: Light default on a dark OS; only Light/Dark choices; screen and tab updates; remembered explicit choices; ignored OS changes; legacy system preference fallback; save failure and retry; mobile and desktop layout. No login, SMS, payment or order.');
} finally {
  await browser.close();
}
