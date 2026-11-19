import { todayKey } from './store';

/**
 * This week's theme: one extra yes / not-today question and a short tip.
 *
 * SAMPLE ONLY (19 Nov 2026): placeholders so the owner can see the Today card. Dr. Mumbi
 * writes and approves the real themes before launch; until then the card says "Sample".
 */
export type WeeklyTheme = { name: string; question: string; tip: string };

export const THEMES_ARE_SAMPLE = true;

export const WEEKLY_THEMES: WeeklyTheme[] = [
  { name: 'Salt week', question: 'Did you go easy on salt today?', tip: 'Taste before you add salt. Herbs, lemon and garlic add flavour without it.' },
  { name: 'Sleep week', question: 'Did you get 7 hours of sleep?', tip: 'Put the phone away half an hour before bed.' },
  { name: 'Sugar week', question: 'Did you skip sugary drinks today?', tip: 'Swap one soda for water or unsweetened tea.' },
  { name: 'Greens week', question: 'Did you eat something green today?', tip: 'Sukuma, spinach or managu all count.' },
];

/** Week number since 1 Jan 1970 in Nairobi, so the theme changes every Monday. */
function weekIndex(now = new Date()) {
  const [y, m, d] = todayKey(now).split('-').map(Number);
  const days = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  // 1 Jan 1970 was a Thursday; shift so weeks start on Monday.
  return Math.floor((days + 3) / 7);
}

export function themeOfTheWeek(now = new Date()): WeeklyTheme {
  return WEEKLY_THEMES[weekIndex(now) % WEEKLY_THEMES.length];
}
