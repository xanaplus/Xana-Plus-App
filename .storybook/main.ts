import path from 'node:path';

import type { StorybookConfig } from '@storybook/react-native-web-vite';

/**
 * Storybook for the app's building blocks, rendered in the browser through
 * react-native-web. Stories live next to their component (`*.stories.tsx`).
 * The database is swapped for a fake (`.storybook/mocks/supabase.ts`) so every
 * story runs on its own, with no network and no sign-in.
 */
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-vitest'],
  framework: {
    name: '@storybook/react-native-web-vite',
    options: {
      modulesToTranspile: ['expo-router', '@expo/vector-icons'],
    },
  },
  viteFinal: async viteConfig => {
    viteConfig.resolve ??= {};
    const aliases = Array.isArray(viteConfig.resolve.alias) ? viteConfig.resolve.alias : [];
    viteConfig.resolve.alias = [
      // Fakes first, so they win over the real modules.
      { find: /^@\/lib\/supabase$/, replacement: path.resolve(import.meta.dirname, 'mocks/supabase.ts') },
      { find: /^expo-router$/, replacement: path.resolve(import.meta.dirname, 'mocks/expo-router.tsx') },
      { find: /^@\/assets\/(.*)$/, replacement: path.resolve(import.meta.dirname, '../assets/$1') },
      { find: /^@\/(.*)$/, replacement: path.resolve(import.meta.dirname, '../src/$1') },
      ...aliases,
    ];
    // Expo ships this package as TypeScript source whose type-only imports trip the pre-bundler.
    viteConfig.optimizeDeps = {
      ...viteConfig.optimizeDeps,
      exclude: [...(viteConfig.optimizeDeps?.exclude ?? []), 'expo-modules-core'],
      include: [...(viteConfig.optimizeDeps?.include ?? []), 'expo-modules-core > invariant'],
    };
    // That package's ts-declarations/global.ts holds only type declarations; serve it empty.
    viteConfig.plugins = [
      {
        name: 'xanaplus:expo-type-declarations',
        enforce: 'pre',
        load: id => (/expo-modules-core[\/]src[\/]ts-declarations[\/]global\.ts/.test(id) ? 'export {};' : null),
      },
      ...(viteConfig.plugins ?? []),
    ];
    viteConfig.define = { ...viteConfig.define, 'process.env.EXPO_OS': JSON.stringify('web') };
    return viteConfig;
  },
};

export default config;
