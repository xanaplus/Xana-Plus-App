import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadSnapshot } from '@/lib/storage';
import { ThemeProvider, useTheme, useThemeStyles } from '@/theme/provider';
import type { Palette } from '@/theme/tokens';

const storage = vi.hoisted(() => ({
  value: null as string | null,
  fail: false,
  defer: false,
  writes: [] as { value: string; resolve: () => void; reject: () => void }[],
}));
const appearance = vi.hoisted(() => ({ scheme: 'light' as 'light' | 'dark' | null }));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    multiGet: async (keys: string[]) => keys.map(key => [key, key === 'xanaplus.appearance.v1' ? storage.value : null]),
    setItem: async (_key: string, value: string) => {
      if (storage.fail) throw new Error('unavailable');
      if (storage.defer) {
        return new Promise<void>((resolve, reject) => storage.writes.push({
          value,
          resolve: () => { storage.value = value; resolve(); },
          reject: () => reject(new Error('unavailable')),
        }));
      }
      storage.value = value;
    },
  },
}));
vi.mock('react-native', () => ({ useColorScheme: () => appearance.scheme }));

const stylesFor = (palette: Palette) => ({ background: palette.background });
function Probe() {
  const theme = useTheme();
  const styles = useThemeStyles(stylesFor);
  return (
    <React.Fragment>
      <span>{theme.appearance}</span>
      <span>{theme.resolved}</span>
      <button onClick={() => void theme.setAppearance('dark')}>dark</button>
      <button onClick={() => void theme.setAppearance('light')}>light</button>
      <button onClick={() => void theme.retryAppearance()}>retry</button>
      <span>{theme.appearanceError}</span>
      <span>{String(theme.appearanceSaving)}</span>
      <span>{styles.background}</span>
    </React.Fragment>
  );
}

async function mount() {
  await loadSnapshot();
  let root!: ReturnType<typeof create>;
  await act(async () => {
    root = create(<ThemeProvider><Probe /></ThemeProvider>);
  });
  return root;
}
const spans = (root: ReturnType<typeof create>) => root.root.findAllByType('span').map(node => node.props.children);
const click = (root: ReturnType<typeof create>, index: number) => root.root.findAllByType('button')[index].props.onClick();

describe('device appearance preference', () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    storage.value = null;
    storage.fail = false;
    storage.defer = false;
    storage.writes = [];
    appearance.scheme = 'light';
  });

  it('defaults to light and ignores changes to the device appearance', async () => {
    const root = await mount();
    const lightBackground = spans(root)[4];
    expect(spans(root).slice(0, 2)).toEqual(['light', 'light']);
    appearance.scheme = 'dark';
    await act(async () => root.update(<ThemeProvider><Probe /></ThemeProvider>));
    expect(spans(root).slice(0, 2)).toEqual(['light', 'light']);
    expect(spans(root)[4]).toEqual(lightBackground);
    await act(async () => root.unmount());
  });

  it('updates palette and memoized styles only when the user chooses dark or light', async () => {
    const root = await mount();
    const lightBackground = spans(root)[4];
    await act(async () => click(root, 0));
    appearance.scheme = 'light';
    await act(async () => root.update(<ThemeProvider><Probe /></ThemeProvider>));
    expect(spans(root).slice(0, 2)).toEqual(['dark', 'dark']);
    expect(spans(root)[4]).not.toEqual(lightBackground);
    await act(async () => click(root, 1));
    expect(spans(root).slice(0, 2)).toEqual(['light', 'light']);
    expect(spans(root)[4]).toEqual(lightBackground);
    await act(async () => root.unmount());
  });

  it.each(['dark', 'light'] as const)('persists and hydrates explicit %s after remount', async choice => {
    const root = await mount();
    await act(async () => click(root, choice === 'dark' ? 0 : 1));
    expect(storage.value).toBe(JSON.stringify(choice));
    await act(async () => root.unmount());
    const hydrated = await mount();
    expect(spans(hydrated).slice(0, 2)).toEqual([choice, choice]);
    await act(async () => hydrated.unmount());
  });

  it.each(['"system"', '"sepia"', '{invalid json', '{}', 'false'])('uses light for legacy or invalid saved appearance %s', async value => {
    storage.value = value;
    appearance.scheme = 'dark';
    const root = await mount();
    expect(spans(root).slice(0, 2)).toEqual(['light', 'light']);
    await act(async () => root.unmount());
  });

  it('uses light when the device does not expose an appearance preference', async () => {
    appearance.scheme = null;
    const root = await mount();
    expect(spans(root).slice(0, 2)).toEqual(['light', 'light']);
    await act(async () => root.unmount());
  });

  it('reports failed writes and retries without falsely claiming the choice was saved', async () => {
    const root = await mount();
    storage.fail = true;
    await act(async () => click(root, 0));
    expect(spans(root)[2]).toMatch(/was not saved/);
    expect(storage.value).toBeNull();
    storage.fail = false;
    await act(async () => click(root, 2));
    expect(storage.value).toBe('"dark"');
    expect(spans(root)[2]).toBeNull();
    await act(async () => root.unmount());
  });

  it('serializes rapid selections and ignores a stale failure once the latest choice succeeds', async () => {
    const root = await mount();
    storage.defer = true;
    await act(async () => { click(root, 0); click(root, 1); });
    expect(spans(root).slice(0, 2)).toEqual(['light', 'light']);
    expect(spans(root)[3]).toBe('true');
    expect(storage.writes.map(write => write.value)).toEqual(['"dark"']);
    await act(async () => storage.writes[0].reject());
    expect(spans(root)[2]).toBeNull();
    expect(spans(root)[3]).toBe('true');
    expect(storage.writes.map(write => write.value)).toEqual(['"dark"', '"light"']);
    await act(async () => storage.writes[1].resolve());
    expect(storage.value).toBe('"light"');
    expect(spans(root)[2]).toBeNull();
    expect(spans(root)[3]).toBe('false');
    await act(async () => root.unmount());
  });
});
