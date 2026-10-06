import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Device persistence for the in-memory stores and the product cache.
 *
 * The app boots with a single multi-key read (`loadSnapshot`) before the
 * providers mount, so every store hydrates synchronously from one snapshot
 * instead of racing four async reads. Writes are fire-and-forget per key —
 * a failed write never blocks the shopper and never claims success for
 * anything payment-related (NFR-A.3).
 *
 * Values are versioned in the key name: a shape change bumps `v1` to `v2`
 * and old payloads are ignored rather than partially trusted.
 */

const PREFIX = 'xanaplus.';

export const STORAGE_KEYS = {
  session: `${PREFIX}session.v1`,
  cart: `${PREFIX}cart.v1`,
  fulfilment: `${PREFIX}fulfilment.v1`,
  orders: `${PREFIX}orders.v2`,
  products: `${PREFIX}products.v1`,
} as const;

export type StorageSnapshot = {
  session: string | null;
  cart: string | null;
  fulfilment: string | null;
  orders: string | null;
  /** Business Central products the shopper has seen, so a restored cart can price them offline. */
  products: string | null;
};

const EMPTY_SNAPSHOT: StorageSnapshot = { session: null, cart: null, fulfilment: null, orders: null, products: null };

let snapshot: StorageSnapshot = EMPTY_SNAPSHOT;

/** Reads every persisted key once, at boot, before providers mount. */
export async function loadSnapshot(): Promise<StorageSnapshot> {
  try {
    const pairs = await AsyncStorage.multiGet(Object.values(STORAGE_KEYS));
    const byKey: Record<string, string | null> = {};
    for (const [key, value] of pairs) byKey[key] = value;
    snapshot = {
      session: byKey[STORAGE_KEYS.session] ?? null,
      cart: byKey[STORAGE_KEYS.cart] ?? null,
      fulfilment: byKey[STORAGE_KEYS.fulfilment] ?? null,
      orders: byKey[STORAGE_KEYS.orders] ?? null,
      products: byKey[STORAGE_KEYS.products] ?? null,
    };
  } catch {
    snapshot = EMPTY_SNAPSHOT;
  }
  return snapshot;
}

/** The boot snapshot; all-null before `loadSnapshot` has resolved. */
export function persisted(): StorageSnapshot {
  return snapshot;
}

export type PersistGuard<T> = (value: unknown) => value is T;

/** Parses a persisted payload, returning null when absent or malformed. */
export function parsePersisted<T>(raw: string | null | undefined, guard: PersistGuard<T>): T | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return guard(value) ? value : null;
  } catch {
    return null;
  }
}

/** Fire-and-forget write; storage failures are silent by design. */
export function save(key: string, value: unknown): void {
  AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {});
}
