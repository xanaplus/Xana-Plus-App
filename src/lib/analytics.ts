import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * Usage and crash tracking, written to Supabase (`app_events`, `app_errors`)
 * and read back only in Staff tools → Insights.
 *
 * Events are small and named for the shopping funnel: app_open, product_view,
 * add_to_cart, checkout_view, order_placed (plus order_failed, promo_applied,
 * rating_sent, screen). They are batched and sent every few seconds; a failed
 * send is dropped, never retried in a loop, and never gets in the shopper's way.
 * The customer can switch it off in Terms & Privacy.
 */

const DEVICE_KEY = 'xanaplus.device.v1';
/** A crash that stopped the app, kept so it can be sent on the next open. */
const PENDING_CRASH_KEY = 'xanaplus.crash.v1';
const FLUSH_MS = 5000;
const MAX_BATCH = 20;

type Props = Record<string, string | number | boolean | null | undefined>;
type EventRow = { name: string; props: Props; platform: string; app_version: string; created_at: string };
type ErrorRow = { message: string; stack: string | null; screen: string | null; fatal: boolean; platform: string; app_version: string };

const PLATFORM = Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web';
const APP_VERSION = (Constants.expoConfig?.version ?? '0').slice(0, 20);

let enabled = true;
let deviceId: Promise<string> | null = null;
let queue: EventRow[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let currentScreen: string | null = null;
let lastError = { message: '', at: 0 };

/** A random id for this install, made on first open. Not linked to the phone itself. */
const getDeviceId = (): Promise<string> => {
  deviceId ??= AsyncStorage.getItem(DEVICE_KEY)
    .then(async stored => {
      if (stored) return stored;
      const fresh = `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
      await AsyncStorage.setItem(DEVICE_KEY, fresh);
      return fresh;
    })
    .catch(() => `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`);
  return deviceId;
};

async function flush() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  const device = await getDeviceId();
  try {
    await supabase.from('app_events').insert(batch.map(row => ({ ...row, device_id: device })));
  } catch {
    // Dropped: tracking must never break the app.
  }
}

/** Records one event. Props are small facts (ids, counts, reasons), never names or phone numbers. */
export function track(name: string, props: Props = {}) {
  if (!enabled) return;
  queue.push({ name, props, platform: PLATFORM, app_version: APP_VERSION, created_at: new Date().toISOString() });
  if (queue.length >= MAX_BATCH) void flush();
  else timer ??= setTimeout(() => void flush(), FLUSH_MS);
}

/** The route the shopper is on, attached to crash reports. */
export function setScreen(route: string) {
  currentScreen = route;
}

const errorRow = (error: unknown, fatal: boolean): ErrorRow => {
  const err = error instanceof Error ? error : new Error(String(error));
  return {
    message: (err.message || err.name || 'Unknown error').slice(0, 500),
    stack: err.stack ? err.stack.slice(0, 4000) : null,
    screen: currentScreen?.slice(0, 120) ?? null,
    fatal,
    platform: PLATFORM,
    app_version: APP_VERSION,
  };
};

async function sendError(row: ErrorRow) {
  const device = await getDeviceId();
  try {
    await supabase.from('app_errors').insert({ ...row, device_id: device });
  } catch {
    // Nothing more to do.
  }
}

/** Sends a crash report. The same message twice within a minute is sent once. */
export function reportError(error: unknown, fatal = false) {
  if (!enabled) return;
  const row = errorRow(error, fatal);
  const now = Date.now();
  if (row.message === lastError.message && now - lastError.at < 60_000) return;
  lastError = { message: row.message, at: now };
  // A fatal crash may close the app before the send finishes, so keep a copy for next time.
  if (fatal) void AsyncStorage.setItem(PENDING_CRASH_KEY, JSON.stringify(row)).catch(() => {});
  void sendError(row).then(() => (fatal ? AsyncStorage.removeItem(PENDING_CRASH_KEY).catch(() => {}) : undefined));
}

/** Follows the customer's "usage and crash reports" setting. */
export function setTrackingEnabled(next: boolean) {
  enabled = next;
  if (!next) queue = [];
}

let installed = false;

/** Hooks up crash reporting and background sending. Call once, at startup. */
export function startTracking() {
  if (installed) return;
  installed = true;

  // A crash that closed the app last time.
  AsyncStorage.getItem(PENDING_CRASH_KEY)
    .then(stored => {
      if (!stored) return;
      void AsyncStorage.removeItem(PENDING_CRASH_KEY);
      if (enabled) void sendError(JSON.parse(stored) as ErrorRow);
    })
    .catch(() => {});

  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.addEventListener('error', event => reportError(event.error ?? event.message));
      window.addEventListener('unhandledrejection', event => reportError(event.reason));
    }
  } else {
    const errorUtils = (globalThis as { ErrorUtils?: { getGlobalHandler: () => (e: unknown, fatal?: boolean) => void; setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => void } }).ErrorUtils;
    const previous = errorUtils?.getGlobalHandler();
    errorUtils?.setGlobalHandler((error, fatal) => {
      reportError(error, fatal === true);
      previous?.(error, fatal);
    });
  }

  // Send what's waiting when the app goes to the background.
  AppState.addEventListener('change', state => {
    if (state !== 'active') void flush();
  });
}
