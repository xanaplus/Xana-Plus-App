import path from 'node:path';

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/** `npm run test:stories` runs every story as a test in a headless browser. */
export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        plugins: [storybookTest({ configDir: path.join(import.meta.dirname, '.storybook') })],
        test: {
          name: 'storybook',
          // Uses the Chrome already installed on the computer, so no browser download is needed.
          browser: { enabled: true, headless: true, provider: playwright({ launchOptions: { channel: 'chrome' } }), instances: [{ browser: 'chromium' }] },
        },
      },
    ],
  },
});
