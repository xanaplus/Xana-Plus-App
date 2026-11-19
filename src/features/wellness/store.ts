import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';

/**
 * Daily wellness check-ins (owner, 18 Nov 2026): water, how you feel, moving, and the
 * question that goes with this week's theme.
 * Health data under Kenya's Data Protection Act 2019, so it stays on this phone: no
 * account sync until the consent step and its private table exist. No streaks, no
 * scores: "Low" is a valid answer.
 */
export type Mood = 'great' | 'okay' | 'low';
/** The answer to this week's theme question; "not today" is as fine as "yes". */
export type WeeklyAnswer = 'yes' | 'notToday';
export type DayCheckIn = { water: number; mood?: Mood; moved?: boolean; weekly?: WeeklyAnswer };
type WellnessState = { goal: number; days: Record<string, DayCheckIn> };

const KEY = 'xanaplus.wellness.v1';
const KEEP_DAYS = 31;
export const DEFAULT_WATER_GOAL = 8;
const MAX_GLASSES = 20;

let state: WellnessState = { goal: DEFAULT_WATER_GOAL, days: {} };
let loaded = false;
const listeners = new Set<() => void>();

/** Today in Nairobi, YYYY-MM-DD. */
export const todayKey = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

const isState = (value: unknown): value is WellnessState =>
  typeof value === 'object' && value !== null &&
  typeof (value as WellnessState).goal === 'number' && typeof (value as WellnessState).days === 'object';

function load() {
  if (loaded) return;
  loaded = true;
  AsyncStorage.getItem(KEY)
    .then(raw => {
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (isState(parsed)) {
        state = parsed;
        listeners.forEach(listener => listener());
      }
    })
    .catch(() => undefined);
}

function commit(next: WellnessState) {
  // Keep the last month only.
  const keys = Object.keys(next.days).sort().slice(-KEEP_DAYS);
  state = { goal: next.goal, days: Object.fromEntries(keys.map(key => [key, next.days[key]])) };
  listeners.forEach(listener => listener());
  AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => undefined);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const snapshot = () => state;

function updateToday(change: (day: DayCheckIn) => DayCheckIn) {
  const key = todayKey();
  const day = state.days[key] ?? { water: 0 };
  commit({ ...state, days: { ...state.days, [key]: change(day) } });
}

export const wellness = {
  addGlass: () => updateToday(day => ({ ...day, water: Math.min(MAX_GLASSES, day.water + 1) })),
  removeGlass: () => updateToday(day => ({ ...day, water: Math.max(0, day.water - 1) })),
  setMood: (mood: Mood) => updateToday(day => ({ ...day, mood: day.mood === mood ? undefined : mood })),
  toggleMoved: () => updateToday(day => ({ ...day, moved: !day.moved })),
  setWeekly: (answer: WeeklyAnswer) => updateToday(day => ({ ...day, weekly: day.weekly === answer ? undefined : answer })),
  setGoal: (goal: number) => commit({ ...state, goal: Math.min(MAX_GLASSES, Math.max(1, Math.round(goal))) }),
};

/** Today's check-in and the water goal, shared by Home and the Wellness tab. */
export function useWellness() {
  useEffect(load, []);
  const current = useSyncExternalStore(subscribe, snapshot, snapshot);
  const today = current.days[todayKey()] ?? { water: 0 };
  return { today, goal: current.goal };
}
