import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { STORAGE_KEYS, parsePersisted, persisted, saveWithResult } from '@/lib/storage';
import { colors as lightColors, darkColors, gradients as lightGradients, darkGradients } from '@/theme/tokens';
import type { GradientPalette, Palette } from '@/theme/tokens';

export type AppearanceChoice = 'light' | 'dark' | 'system';
type ThemeContextValue = {
  appearance: AppearanceChoice;
  resolved: 'light' | 'dark';
  colors: Palette;
  gradients: GradientPalette;
  appearanceSaving: boolean;
  appearanceError: string | null;
  setAppearance: (choice: AppearanceChoice) => Promise<boolean>;
  retryAppearance: () => Promise<boolean>;
};

const isAppearance = (value: unknown): value is AppearanceChoice =>
  value === 'light' || value === 'dark' || value === 'system';
const appearanceGuard = (value: unknown): value is AppearanceChoice => isAppearance(value);
const ThemeContext = createContext<ThemeContextValue | null>(null);
const FALLBACK_THEME: ThemeContextValue = {
  appearance: 'system',
  resolved: 'light',
  colors: lightColors,
  gradients: lightGradients,
  appearanceSaving: false,
  appearanceError: null,
  setAppearance: async () => false,
  retryAppearance: async () => false,
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const saved = parsePersisted(persisted().appearance, appearanceGuard);
  const [appearance, setAppearanceState] = useState<AppearanceChoice>(saved ?? 'system');
  const [appearanceSaving, setAppearanceSaving] = useState(false);
  const [appearanceError, setAppearanceError] = useState<string | null>(null);
  const [failedChoice, setFailedChoice] = useState<AppearanceChoice | null>(null);
  const latestWrite = useRef(0);
  const writeQueue = useRef<Promise<boolean>>(Promise.resolve(true));
  const resolved = appearance === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : appearance;

  const persistChoice = useCallback(async (choice: AppearanceChoice) => {
    const request = ++latestWrite.current;
    setAppearanceSaving(true);
    setAppearanceError(null);
    // Serialize device writes: rapid selections must retain the latest choice,
    // even if a native storage operation finishes slowly or fails.
    const pending = writeQueue.current.then(() => saveWithResult(STORAGE_KEYS.appearance, choice));
    writeQueue.current = pending;
    const ok = await pending;
    if (request !== latestWrite.current) return ok;
    setAppearanceSaving(false);
    if (!ok) {
      setFailedChoice(choice);
      setAppearanceError('Your appearance setting was not saved. Check your device storage and retry.');
      return false;
    }
    setFailedChoice(null);
    setAppearanceError(null);
    return true;
  }, []);

  const setAppearance = useCallback(async (choice: AppearanceChoice) => {
    if (!isAppearance(choice)) return false;
    setAppearanceState(choice);
    return persistChoice(choice);
  }, [persistChoice]);
  const retryAppearance = useCallback(
    () => (failedChoice ? persistChoice(failedChoice) : Promise.resolve(true)),
    [failedChoice, persistChoice],
  );

  const value = useMemo<ThemeContextValue>(() => ({
    appearance,
    resolved,
    colors: resolved === 'dark' ? darkColors : lightColors,
    gradients: resolved === 'dark' ? darkGradients : lightGradients,
    appearanceSaving,
    appearanceError,
    setAppearance,
    retryAppearance,
  }), [appearance, resolved, appearanceSaving, appearanceError, setAppearance, retryAppearance]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  return value ?? FALLBACK_THEME;
}

/** Create a fresh, palette-specific native StyleSheet only when the resolved palette changes. */
export function useThemeStyles<T>(factory: (palette: Palette) => T): T {
  const { colors } = useTheme();
  return useMemo(() => factory(colors), [colors, factory]);
}
