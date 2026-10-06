import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import type * as NotificationsModule from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { supabase } from './supabase';

/** One Android channel is enough for now; order updates all share it. */
const ANDROID_CHANNEL_ID = 'orders';

/** The token this run saved, so sign-out can delete its row without a round trip. */
let savedToken: string | null = null;

/**
 * Expo Go dropped remote push in SDK 53 and expo-notifications throws on import
 * there, which would crash the whole app. Load it only where push can work:
 * development and store builds on a phone. Null means "no push here".
 */
const Notifications: typeof NotificationsModule | null =
  Platform.OS === 'web' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient
    ? null
    : // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('expo-notifications');

/** Foreground delivery: show the banner instead of silently dropping the message. */
if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/**
 * The EAS project id Expo's push service routes on. Undefined until the project
 * has been created with `eas init` (it lands in app.json as extra.eas.projectId).
 */
const projectId = (): string | undefined =>
  Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

export type PushResult =
  | { ok: true; token: string }
  | { ok: false; error: 'unsupported' | 'denied' | 'no-project' | 'failed' };

/** Saves (or refreshes) this device's token against the signed-in customer. */
async function saveToken(userId: string, token: string): Promise<void> {
  savedToken = token;
  await supabase.from('push_tokens').upsert(
    {
      user_id: userId,
      token,
      platform: Platform.OS,
      device: Device.modelName ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'token' },
  );
}

/**
 * Asks for permission, gets this device's Expo push token and stores it so the
 * server can reach the customer. Called on sign-in; safe to call repeatedly.
 */
export async function registerForPush(userId: string): Promise<PushResult> {
  // The web preview, Expo Go and simulators have no push service.
  if (!Notifications || !Device.isDevice) return { ok: false, error: 'unsupported' };

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Order updates',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const current = await Notifications.getPermissionsAsync();
  const status =
    current.status === 'granted' ? current.status : (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return { ok: false, error: 'denied' };

  const id = projectId();
  if (!id) return { ok: false, error: 'no-project' };

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    await saveToken(userId, token);
    return { ok: true, token };
  } catch {
    return { ok: false, error: 'failed' };
  }
}

/**
 * Forgets this device, so a signed-out phone stops receiving that account's
 * notifications. Call it *before* signing out: afterwards the session is gone
 * and RLS refuses the delete.
 */
export async function unregisterPush(): Promise<void> {
  if (!Notifications || !Device.isDevice) return;

  const id = projectId();
  let token = savedToken;
  if (id) {
    try {
      token = (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
    } catch {
      // Offline or no permission: fall back to the token this run already saved.
    }
  }
  if (!token) return;

  savedToken = null;
  // Best effort. If this fails the row is harmless: the next sign-in on this
  // device upserts the same token onto the new customer.
  await supabase.from('push_tokens').delete().eq('token', token);
}

/**
 * Wires the signed-in customer's device to push: registers the token, follows
 * Expo's token rollovers, and opens the screen a tapped notification points at.
 * Mounted once in the root layout.
 */
export function usePushNotifications(userId: string | null): void {
  useEffect(() => {
    if (!userId || !Notifications) return;
    let live = true;
    void registerForPush(userId);
    // Expo rotates the underlying device token; re-read the Expo token and refresh the row.
    const subscription = Notifications.addPushTokenListener(() => {
      if (live) void registerForPush(userId);
    });
    return () => {
      live = false;
      subscription.remove();
    };
  }, [userId]);

  useEffect(() => {
    if (!Notifications) return;
    const open = (data: unknown) => {
      const route = (data as { route?: unknown } | null)?.route;
      if (typeof route === 'string' && route.startsWith('/')) router.push(route as Href);
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(response =>
      open(response.notification.request.content.data),
    );
    // A notification tapped while the app was closed delivers here on next launch.
    void Notifications.getLastNotificationResponseAsync().then(response => {
      if (response) open(response.notification.request.content.data);
    });
    return () => subscription.remove();
  }, []);
}
