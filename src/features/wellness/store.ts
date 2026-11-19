import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';

import { supabase } from '@/lib/supabase';

/**
 * Daily wellness check-ins (owner, 18 Nov 2026): water, how you feel, moving, and the
 * question that goes with this week's theme. Health data under Kenya's Data Protection Act
 * 2019: they stay on this phone unless the signed-in user says yes to saving them to their
 * account (`wellness_consent` / `wellness_checkins`, readable only by that user). No streaks,
 * no scores: "Low" is a valid answer.
 */
export type Mood = 'great' | 'okay' | 'low';
/** The answer to this week's theme question; "not today" is as fine as "yes". */
export type WeeklyAnswer = 'yes' | 'notToday';
/** `at` = when this day last changed on this phone (ms), so the newer copy wins when syncing. */
export type DayCheckIn = { water: number; mood?: Mood; moved?: boolean; weekly?: WeeklyAnswer; at?: number };
type WellnessState = { goal: number; days: Record<string, DayCheckIn> };

/**
 * signedOut: on this phone only, nothing to ask. loading: checking the account.
 * unasked: signed in, no answer yet. sync: saved to the account. phone: they said no.
 */
export type SyncStatus = 'signedOut' | 'loading' | 'unasked' | 'sync' | 'phone';

const KEY = 'xanaplus.wellness.v1';
const KEEP_DAYS = 31;
export const DEFAULT_WATER_GOAL = 8;
const MAX_GLASSES = 20;
const PUSH_DELAY_MS = 1500;

let state: WellnessState = { goal: DEFAULT_WATER_GOAL, days: {} };
let sync: { status: SyncStatus; userId: string | null } = { status: 'signedOut', userId: null };
/** Days changed on this phone that still need saving to the account. */
const dirty = new Set<string>();
let goalDirty = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

/** Today in Nairobi, YYYY-MM-DD. */
export const todayKey = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

const isState = (value: unknown): value is WellnessState =>
  typeof value === 'object' && value !== null &&
  typeof (value as WellnessState).goal === 'number' && typeof (value as WellnessState).days === 'object';

let loading: Promise<void> | null = null;
function load(): Promise<void> {
  if (loading) return loading;
  loading = AsyncStorage.getItem(KEY)
    .then(raw => {
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      // A change made before the file finished loading wins over the file.
      if (isState(parsed)) state = { goal: parsed.goal, days: { ...parsed.days, ...state.days } };
    })
    .catch(() => undefined)
    .finally(notify);
  return loading;
}

function commit(next: WellnessState) {
  // Keep the last month only.
  const keys = Object.keys(next.days).sort().slice(-KEEP_DAYS);
  state = { goal: next.goal, days: Object.fromEntries(keys.map(key => [key, next.days[key]])) };
  notify();
  AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => undefined);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const snapshot = () => state;
const syncSnapshot = () => sync;

function setSync(next: typeof sync) {
  sync = next;
  notify();
}

function updateToday(change: (day: DayCheckIn) => DayCheckIn) {
  const key = todayKey();
  const day = state.days[key] ?? { water: 0 };
  commit({ ...state, days: { ...state.days, [key]: { ...change(day), at: Date.now() } } });
  dirty.add(key);
  schedulePush();
}

/* ---------- Saving to the account ---------- */

type Row = { day: string; water: number; mood: Mood | null; moved: boolean | null; weekly: WeeklyAnswer | null; updated_at: string };

const toRow = (userId: string, day: string, entry: DayCheckIn) => ({
  user_id: userId,
  day,
  water: entry.water,
  mood: entry.mood ?? null,
  moved: entry.moved ?? null,
  weekly: entry.weekly ?? null,
  updated_at: new Date(entry.at ?? Date.now()).toISOString(),
});

function schedulePush() {
  if (sync.status !== 'sync') return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void push(), PUSH_DELAY_MS);
}

/** Saves changed days (and the goal) to the account. Failed saves stay queued for next time. */
async function push() {
  pushTimer = null;
  const userId = sync.userId;
  if (sync.status !== 'sync' || !userId) return;
  const days = [...dirty].filter(day => state.days[day]);
  dirty.clear();
  if (days.length > 0) {
    const { error } = await supabase.from('wellness_checkins').upsert(days.map(day => toRow(userId, day, state.days[day])));
    if (error) days.forEach(day => dirty.add(day));
  }
  if (goalDirty) {
    goalDirty = false;
    const { error } = await supabase.from('wellness_consent').update({ water_goal: state.goal }).eq('user_id', userId);
    if (error) goalDirty = true;
  }
}

/** Account copy and phone copy together: the newer copy of each day wins. */
async function pullAndMerge(userId: string) {
  const since = Object.keys(state.days).sort()[0];
  const oldest = todayKey(new Date(Date.now() - KEEP_DAYS * 86_400_000));
  const { data, error } = await supabase
    .from('wellness_checkins')
    .select('day, water, mood, moved, weekly, updated_at')
    .gte('day', since && since < oldest ? since : oldest);
  if (error || sync.userId !== userId) return;
  const days = { ...state.days };
  const remote = new Set<string>();
  for (const row of (data ?? []) as Row[]) {
    remote.add(row.day);
    const at = Date.parse(row.updated_at);
    const local = days[row.day];
    if (local && (local.at ?? 0) > at) {
      dirty.add(row.day);
      continue;
    }
    days[row.day] = { water: row.water, mood: row.mood ?? undefined, moved: row.moved ?? undefined, weekly: row.weekly ?? undefined, at };
  }
  // Days only on this phone go up too.
  Object.keys(days).forEach(day => { if (!remote.has(day)) dirty.add(day); });
  commit({ ...state, days });
  schedulePush();
}

/**
 * Called by the root layout whenever the signed-in user changes. Reads their choice and,
 * if they save to the account, merges both copies. Signing out of a synced account clears
 * this phone's copy: it lives in the account, and the next person on this phone shouldn't see it.
 */
export async function connectWellness(userId: string | null) {
  await load();
  const previous = sync;
  if (previous.userId === userId && previous.status !== 'signedOut') return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = null;
  dirty.clear();
  goalDirty = false;

  if (!userId) {
    if (previous.status === 'sync') commit({ goal: DEFAULT_WATER_GOAL, days: {} });
    setSync({ status: 'signedOut', userId: null });
    return;
  }
  setSync({ status: 'loading', userId });
  const { data, error } = await supabase.from('wellness_consent').select('sync, water_goal').eq('user_id', userId).maybeSingle();
  if (sync.userId !== userId) return;
  if (error) {
    // Can't tell right now: behave as phone-only, without asking, until the next sign-in.
    setSync({ status: 'phone', userId });
    return;
  }
  if (!data) {
    setSync({ status: 'unasked', userId });
    return;
  }
  if (!data.sync) {
    setSync({ status: 'phone', userId });
    return;
  }
  if (typeof data.water_goal === 'number') commit({ ...state, goal: data.water_goal });
  setSync({ status: 'sync', userId });
  await pullAndMerge(userId);
}

/** The answer to "Save your check-ins to your account?". */
async function choose(saveToAccount: boolean): Promise<boolean> {
  const userId = sync.userId;
  if (!userId) return false;
  const { error } = await supabase
    .from('wellness_consent')
    .upsert({ user_id: userId, sync: saveToAccount, decided_at: new Date().toISOString(), water_goal: saveToAccount ? state.goal : null });
  if (error || sync.userId !== userId) return false;
  setSync({ status: saveToAccount ? 'sync' : 'phone', userId });
  if (saveToAccount) await pullAndMerge(userId);
  return true;
}

/** "Stop saving to my account": consent off and the saved copy deleted. This phone's copy stays. */
async function stopSaving(): Promise<boolean> {
  const userId = sync.userId;
  if (!userId) return false;
  const { error } = await supabase.rpc('wellness_stop_sync');
  if (error || sync.userId !== userId) return false;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = null;
  dirty.clear();
  setSync({ status: 'phone', userId });
  return true;
}

export const wellness = {
  addGlass: () => updateToday(day => ({ ...day, water: Math.min(MAX_GLASSES, day.water + 1) })),
  removeGlass: () => updateToday(day => ({ ...day, water: Math.max(0, day.water - 1) })),
  setMood: (mood: Mood) => updateToday(day => ({ ...day, mood: day.mood === mood ? undefined : mood })),
  toggleMoved: () => updateToday(day => ({ ...day, moved: !day.moved })),
  setWeekly: (answer: WeeklyAnswer) => updateToday(day => ({ ...day, weekly: day.weekly === answer ? undefined : answer })),
  setGoal: (goal: number) => {
    commit({ ...state, goal: Math.min(MAX_GLASSES, Math.max(1, Math.round(goal))) });
    goalDirty = true;
    schedulePush();
  },
  saveToAccount: () => choose(true),
  keepOnPhone: () => choose(false),
  stopSaving,
};

/** Today's check-in and the water goal, shared by Home and the Wellness tab. */
export function useWellness() {
  useEffect(() => { void load(); }, []);
  const current = useSyncExternalStore(subscribe, snapshot, snapshot);
  const today = current.days[todayKey()] ?? { water: 0 };
  return { today, goal: current.goal };
}

/** Whether check-ins are saved to the account, for the Today card. */
export function useWellnessSync(): SyncStatus {
  return useSyncExternalStore(subscribe, syncSnapshot, syncSnapshot).status;
}
