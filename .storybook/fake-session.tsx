import type { ReactNode } from 'react';

import type { User } from '@/data/types';
import { SessionContext, type SessionContextValue } from '@/store/session';

/** A signed-in customer for stories. Pass `null` to show the signed-out state. */
export const DEMO_USER: User = { id: 'story-user', name: 'Amina Odhiambo', phone: '+254 700 000 000', clubTier: 'Gold', clubPoints: 2480 };

export type FakeSessionOptions = { user?: User | null; isStaff?: boolean; preferences?: SessionContextValue['preferences'] };

export function FakeSession({ user = DEMO_USER, isStaff = false, preferences = {}, children }: FakeSessionOptions & { children: ReactNode }) {
  const value: SessionContextValue = {
    user,
    pendingPhone: null,
    isAuthenticated: user !== null,
    requestOtp: async phone => ({ ok: true, phone }),
    verify: async () => ({ ok: true }),
    signOut: () => {},
    needsName: false,
    updateName: async () => true,
    preferences,
    updatePreferences: () => {},
    preferencesSaving: false,
    preferencesError: null,
    retryPreferences: () => {},
    deleteAccount: async () => true,
    isDemo: false,
    isStaff,
    refreshProfile: async () => {},
    spendPoints: () => {},
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
