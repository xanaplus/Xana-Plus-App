// Read-only catalogue searches. Never adds to cart, signs in or changes account data.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ executablePath: '/repl/tools/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ isMobile: true, deviceScaleFactor: 2.75 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const [width, zoom] of [[320, 1], [393, 1], [428, 1], [430, 1], [393, 1.1], [428, 1.25], [393, 0.9], [1280, 1]]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`https://${process.env.REPLIT_DEV_DOMAIN}/search?q=Milk`);
    await page.getByText(/^Showing [1-9]\d* results for "Milk"$/).waitFor({ timeout: 30000 });
    await page.addStyleTag({ content: `html{zoom:${zoom}}` });
    const input = page.getByRole('textbox', { name: 'Search groceries, meds & more' });
    assert.ok(await input.evaluate(element => parseFloat(getComputedStyle(element).fontSize)) >= 16, 'Web search text must avoid the iOS small-input zoom trigger');
    await input.focus();
    // Wait for ResizeObserver/onLayout and the entering animation, not a backend mutation.
    await page.waitForTimeout(500);
    const metrics = await page.evaluate(() => {
      const grid = [...document.querySelectorAll('div')].find(element => {
        const style = getComputedStyle(element);
        return style.flexWrap === 'wrap' && style.flexDirection === 'row' && style.gap === '12px' && element.children.length >= 2;
      });
      if (!grid) throw new Error('No populated two-column results grid');
      return {
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
        grid: grid.getBoundingClientRect().toJSON(),
        cards: [...grid.children].slice(0, 2).map(element => element.getBoundingClientRect().toJSON()),
      };
    });
    assert.ok(metrics.scroll <= metrics.client + 1, `No horizontal page overflow at ${width}px / ${zoom} scaling`);
    assert.ok(Math.abs(metrics.cards[0].y - metrics.cards[1].y) < 1, `Both columns must share a row at ${width}px / ${zoom} scaling`);
    for (const card of metrics.cards) {
      assert.ok(card.x >= metrics.grid.x - 1 && card.right <= metrics.grid.right + 1, 'Result cards must fit the actual grid');
    }
    console.log(`PASS: ${width}px, ${zoom} scaling; 16px search input, two columns, no page overflow.`);
    if (width === 393 && zoom === 1.1) await page.screenshot({ path: '/tmp/search-mobile-scaled-after.png' });
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
