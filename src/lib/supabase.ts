import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

/**
 * The app's one Supabase client. The URL and publishable key are public by
 * design (they ship inside the app); anything secret stays in Edge Functions.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '';

// Without these (Expo started before .env was filled in) the app still opens;
// sign-in then fails with the "No connection" message instead of a blank screen.
if (!url || !key) console.warn('Supabase settings missing: restart Expo so it reads EXPO_PUBLIC_SUPABASE_URL / _KEY from .env.');

export const supabase = createClient(url || 'https://missing-supabase-url.invalid', key || 'missing-key', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Refresh the session only while the app is in the foreground (native only).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', state => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/** Error codes the sign-in Edge Functions return, plus `network` for no reply at all. */
export type FunctionError =
  | 'invalid_phone'
  | 'too_soon'
  | 'too_many'
  | 'sms_failed'
  | 'sms_limit'
  | 'sms_paused'
  | 'sms_blocked'
  | 'wrong_code'
  | 'expired'
  | 'too_many_attempts'
  // email-code (the website team's function, shared with the app)
  | 'invalid_email'
  | 'email_limit'
  | 'email_failed'
  | 'email_unavailable'
  | 'email_taken'
  | 'already_confirmed'
  | 'session_expired'
  // passwords (the email-code `password` action and Supabase's own sign-in)
  | 'invalid_credentials'
  | 'too_many_tries'
  | 'wrong_password'
  | 'weak_password'
  | 'same_password'
  | 'server_error'
  | 'network';

const FUNCTION_ERRORS: readonly FunctionError[] = [
  'invalid_phone', 'too_soon', 'too_many', 'sms_failed', 'sms_blocked',
  'sms_limit', 'sms_paused',
  'wrong_code', 'expired', 'too_many_attempts', 'server_error',
  'invalid_email', 'email_limit', 'email_failed', 'email_unavailable', 'email_taken', 'already_confirmed', 'session_expired',
  'invalid_credentials', 'too_many_tries',
];

/** Supabase sign-in errors in the same words as the Edge Functions'. */
export function authErrorCode(error: { code?: string; status?: number; name?: string; message?: string } | null): FunctionError {
  if (!error) return 'server_error';
  const text = (error.message ?? '').toLowerCase();
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) return 'network';
  if (error.code === 'invalid_credentials' || text.includes('invalid login credentials')) return 'invalid_credentials';
  if (error.code === 'weak_password' || text.includes('password should')) return 'weak_password';
  if (error.code === 'same_password' || text.includes('different from the old password')) return 'same_password';
  if (error.code === 'over_request_rate_limit' || error.status === 429) return 'too_many_tries';
  if (error.status === 401 || error.status === 403) return 'session_expired';
  return 'server_error';
}

/** POSTs to an Edge Function and returns its JSON, or the error code it sent back. */
export async function callFunction<T>(
  name: string,
  body: Record<string, unknown>,
  /** The signed-in user's access token, for actions that act on their own account. */
  accessToken?: string,
): Promise<{ data: T } | { error: FunctionError }> {
  try {
    const response = await fetch(`${url}/functions/v1/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify(body),
    });
    const json = await response.json().catch(() => null);
    if (!response.ok) return { error: FUNCTION_ERRORS.includes(json?.error) ? json.error : 'server_error' };
    if (!json || typeof json !== 'object') return { error: 'server_error' };
    return { data: json as T };
  } catch {
    return { error: 'network' };
  }
}
