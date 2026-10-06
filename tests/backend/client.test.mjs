import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native-url-polyfill/auto', () => ({}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));
vi.mock('react-native', () => ({ AppState: {}, Platform: { OS: 'web' } }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));
import { callFunction } from '@/lib/supabase';

afterEach(() => vi.unstubAllGlobals());
describe('sign-in error handling', () => {
  it.each(['too_soon', 'too_many', 'sms_failed', 'sms_blocked', 'wrong_code', 'expired', 'too_many_attempts'])('preserves %s', async error => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error }), { status: 400 })));
    expect(await callFunction('request-otp', {})).toEqual({ error });
  });
  it.each(['not-json', '{"error":"unexpected"}', 'null'])('handles unexpected error replies: %s', async body => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 502 })));
    expect(await callFunction('verify-otp', {})).toEqual({ error: 'server_error' });
  });
  it('rejects a malformed success response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not-json')));
    expect(await callFunction('verify-otp', {})).toEqual({ error: 'server_error' });
  });
  it('reports network failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await callFunction('request-otp', {})).toEqual({ error: 'network' });
  });
});
