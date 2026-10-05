import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { User } from '@/data/types';
import { unregisterPush } from '@/lib/notifications';
import { parsePersisted, persisted, save, STORAGE_KEYS } from '@/lib/storage';
import { callFunction, supabase, type FunctionError } from '@/lib/supabase';

/**
 * Real sign-in: the `request-otp` Edge Function texts a six-digit code through
 * Africa's Talking, `verify-otp` checks it and returns a Supabase session, and
 * the customer's `profiles` row becomes `user`.
 *
 * The last signed-in user is also cached on the device so the app opens
 * signed in straight away; the Supabase session is then checked and wins.
 */
const PHONE_PATTERN = /^\+254[17]\d{8}$/;
/** NFR-S.5: an account unused for 30 days is signed out on next launch. */
const INACTIVE_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
/** Shown until the customer enters their own name. */
const UNNAMED = 'Xana member';
const MAX_NAME_LENGTH = 60;
/** The demo number (0700 000 000) that signs in with a fixed code and never gets an SMS. */
const DEMO_DIGITS = '254700000000';

/** App settings kept on the customer's profile row (`profiles.preferences`). */
export type Preferences = {
  pushEnabled?: boolean;
  alerts?: Record<string, boolean>;
  privacy?: Record<string, boolean>;
};

type PersistedSession = { user: User | null; lastSeenAt: number };

const isUser = (value: unknown): value is User =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as User).id === 'string' &&
  typeof (value as User).name === 'string' &&
  typeof (value as User).phone === 'string' &&
  typeof (value as User).clubTier === 'string' &&
  typeof (value as User).clubPoints === 'number';

const isPersistedSession = (value: unknown): value is PersistedSession =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as PersistedSession).lastSeenAt === 'number' &&
  ((value as PersistedSession).user === null || isUser((value as PersistedSession).user));

const storedSession = () => parsePersisted(persisted().session, isPersistedSession);

/** Restores the cached shopper from device storage, or null. */
const hydrateUser = (): User | null => {
  const stored = storedSession();
  if (!stored || stored.user === null) return null;
  if (Date.now() - stored.lastSeenAt > INACTIVE_SESSION_MS) return null;
  return stored.user;
};

export type SignInResult = { ok: true } | { ok: false; error: FunctionError };

export type SessionContextValue = {
  user: User | null;
  /** Phone number awaiting verification, or null when idle. */
  pendingPhone: string | null;
  isAuthenticated: boolean;
  /** Texts a code to `phone`; resolves once the SMS has been accepted for delivery. */
  requestOtp: (phone: string) => Promise<SignInResult & { phone: string }>;
  /** Checks the code for the pending phone and, on success, signs the customer in. */
  verify: (code: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  /** True once signed in with no name on the profile yet (a first sign-in). */
  needsName: boolean;
  /** Saves the customer's name to their profile. */
  updateName: (name: string) => Promise<boolean>;
  /** Settings saved on the profile; empty until loaded, so screens fall back to their defaults. */
  preferences: Preferences;
  /** Merges `patch` into the saved settings. The switch flips straight away; the save happens behind it. */
  updatePreferences: (patch: Preferences) => void;
  /** Deletes the account on the server (profile, addresses, sign-in), then signs out. */
  deleteAccount: () => Promise<boolean>;
  /** Signed in with the demo number, which also sees the app's sample orders and data. */
  isDemo: boolean;
  /** The account is on the staff list, so it can open Staff tools. */
  isStaff: boolean;
  /** Re-reads the profile, e.g. after staff deliver an order and points are added. */
  refreshProfile: () => Promise<void>;
  /** Deducts redeemed Xana Club points once an order is confirmed (on this device until orders reach the server). */
  spendPoints: (points: number) => void;
};

/** Exported so Storybook stories can supply a fake signed-in customer. */
export const SessionContext = createContext<SessionContextValue | null>(null);

const normalizePhone = (phone: string) => {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('+254')) return digits;
  if (digits.startsWith('254')) return `+${digits}`;
  if (digits.startsWith('0')) return `+254${digits.slice(1)}`;
  return digits;
};

/** `+254712345678` → `+254 712 345 678`, the format the screens display. */
const displayPhone = (phone: string) => phone.replace(/^\+254(\d{3})(\d{3})(\d{3})$/, '+254 $1 $2 $3');

type Profile = { user: User; named: boolean; preferences: Preferences; isStaff: boolean };

/** Reads the signed-in customer's profile row into the app's `User` shape. */
async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*') // '*' rather than a column list, so sign-in still works before the preferences column exists
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return null;
  // A row in `staff` is readable only by its owner, so this is empty for customers.
  const { data: staffRow } = await supabase.from('staff').select('user_id').eq('user_id', userId).maybeSingle();
  const name = data.name?.trim() ?? '';
  return {
    user: {
      id: data.id,
      name: name || UNNAMED,
      phone: displayPhone(data.phone),
      clubTier: data.club_tier as User['clubTier'],
      clubPoints: data.club_points,
    },
    named: name !== '',
    preferences: (data.preferences as Preferences | null) ?? {},
    isStaff: staffRow !== null,
  };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(hydrateUser);
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  // Assume a cached user is named until the profile says otherwise, so the name prompt never flashes.
  const [named, setNamed] = useState(true);
  const [preferences, setPreferences] = useState<Preferences>({});
  const [isStaff, setIsStaff] = useState(false);

  const applyProfile = useCallback((profile: Profile | null) => {
    setUser(profile?.user ?? null);
    setNamed(profile?.named ?? true);
    setPreferences(profile?.preferences ?? {});
    setIsStaff(profile?.isStaff ?? false);
  }, []);

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    const profile = await loadProfile(data.session.user.id);
    if (profile) setUser(profile.user);
  }, []);

  // Reconcile the cached user with the real Supabase session on launch.
  useEffect(() => {
    let live = true;
    const stored = storedSession();
    const expired = stored ? Date.now() - stored.lastSeenAt > INACTIVE_SESSION_MS : false;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!live) return;
      if (!data.session || expired) {
        if (data.session) await supabase.auth.signOut();
        if (live) setUser(null);
        return;
      }
      const profile = await loadProfile(data.session.user.id);
      if (live) applyProfile(profile);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') applyProfile(null);
    });
    return () => {
      live = false;
      listener.subscription.unsubscribe();
    };
  }, [applyProfile]);

  const requestOtp = useCallback(async (phone: string) => {
    const normalized = normalizePhone(phone);
    if (!PHONE_PATTERN.test(normalized)) return { ok: false as const, error: 'invalid_phone' as const, phone: normalized };
    const result = await callFunction<{ ok: true }>('request-otp', { phone: normalized });
    if ('error' in result) return { ok: false as const, error: result.error, phone: normalized };
    setPendingPhone(normalized);
    return { ok: true as const, phone: normalized };
  }, []);

  const verify = useCallback(
    async (code: string): Promise<SignInResult> => {
      if (!pendingPhone) return { ok: false, error: 'expired' };
      const result = await callFunction<{ access_token: string; refresh_token: string }>('verify-otp', {
        phone: pendingPhone,
        code,
      });
      if ('error' in result) return { ok: false, error: result.error };

      const { data, error } = await supabase.auth.setSession(result.data);
      if (error || !data.session) return { ok: false, error: 'server_error' };
      const profile = await loadProfile(data.session.user.id);
      if (!profile) return { ok: false, error: 'server_error' };

      applyProfile(profile);
      setPendingPhone(null);
      return { ok: true };
    },
    [pendingPhone, applyProfile],
  );

  const signOut = useCallback(async () => {
    // Drop this device's push token first; once the session is gone RLS refuses it.
    await unregisterPush();
    applyProfile(null);
    setPendingPhone(null);
    await supabase.auth.signOut();
  }, [applyProfile]);

  const updateName = useCallback(
    async (input: string) => {
      const name = input.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
      if (!user || !name) return false;
      const { error } = await supabase.from('profiles').update({ name }).eq('id', user.id);
      if (error) return false;
      setUser(current => (current ? { ...current, name } : current));
      setNamed(true);
      return true;
    },
    [user],
  );

  const updatePreferences = useCallback(
    (patch: Preferences) => {
      if (!user) return;
      setPreferences(current => {
        const next: Preferences = {
          ...current,
          ...patch,
          alerts: { ...current.alerts, ...patch.alerts },
          privacy: { ...current.privacy, ...patch.privacy },
        };
        // Fire-and-forget (the `.then` is what sends it): a failed save leaves the switch where the customer put it for this visit.
        void supabase.from('profiles').update({ preferences: next }).eq('id', user.id).then(() => {});
        return next;
      });
    },
    [user],
  );

  const deleteAccount = useCallback(async () => {
    const { error } = await supabase.functions.invoke('delete-account', { body: {} });
    if (error) return false;
    signOut();
    return true;
  }, [signOut]);

  const spendPoints = useCallback((points: number) => {
    if (points <= 0) return;
    setUser(current => (current ? { ...current, clubPoints: Math.max(0, current.clubPoints - points) } : current));
  }, []);

  useEffect(() => {
    save(STORAGE_KEYS.session, { user, lastSeenAt: Date.now() });
  }, [user]);

  const value = useMemo<SessionContextValue>(
    () => ({
      user,
      pendingPhone,
      isAuthenticated: user !== null,
      requestOtp,
      verify,
      signOut,
      needsName: user !== null && !named,
      updateName,
      preferences,
      updatePreferences,
      deleteAccount,
      isDemo: user !== null && user.phone.replace(/\D/g, '') === DEMO_DIGITS,
      isStaff,
      refreshProfile,
      spendPoints,
    }),
    [user, pendingPhone, requestOtp, verify, signOut, named, updateName, preferences, updatePreferences, deleteAccount, isStaff, refreshProfile, spendPoints],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
