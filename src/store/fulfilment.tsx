import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { deliverySlots, stores } from '@/data/catalog';
import type { FulfilmentMode, PaymentMethodId, Product } from '@/data/types';
import { parsePersisted, persisted, save, STORAGE_KEYS } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/store/session';

export type Address = {
  id: string;
  label: string;
  contact: string;
  line: string;
  phone: string;
  isDefault: boolean;
};

const defaultAddress: Address = {
  id: 'addr_home',
  label: 'DEFAULT · HOME',
  contact: 'Amina Odhiambo',
  line: 'Apt 4B, Karura Springs, 2nd Parklands Ave, Nairobi',
  phone: '+254 712 345 678',
  isDefault: true,
};

type PersistedFulfilment = {
  mode: FulfilmentMode;
  storeId: string;
  /** The customer picked the store themselves (absent in data saved before 15 Oct 2026). */
  storeChosen?: boolean;
  addressId: string;
  addresses: Address[];
  slotId: string;
  paymentMethod: PaymentMethodId;
  mpesaNumber: string;
};

const isAddress = (value: unknown): value is Address =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Address).id === 'string' &&
  typeof (value as Address).label === 'string' &&
  typeof (value as Address).contact === 'string' &&
  typeof (value as Address).line === 'string' &&
  typeof (value as Address).phone === 'string' &&
  typeof (value as Address).isDefault === 'boolean';

const isPersistedFulfilment = (value: unknown): value is PersistedFulfilment => {
  if (typeof value !== 'object' || value === null) return false;
  const stored = value as PersistedFulfilment;
  return (
    (stored.mode === 'delivery' || stored.mode === 'pickup') &&
    typeof stored.storeId === 'string' &&
    typeof stored.addressId === 'string' &&
    Array.isArray(stored.addresses) &&
    stored.addresses.every(isAddress) &&
    typeof stored.slotId === 'string' &&
    (stored.paymentMethod === 'mpesa' || stored.paymentMethod === 'cod' || stored.paymentMethod === 'card') &&
    typeof stored.mpesaNumber === 'string'
  );
};

type AddressRow = { id: string; label: string; contact: string; line: string; phone: string; is_default: boolean };

const fromRow = (row: AddressRow): Address => ({
  id: row.id,
  label: row.label,
  contact: row.contact,
  line: row.line,
  phone: row.phone,
  isDefault: row.is_default,
});

const hydrateFulfilment = (): PersistedFulfilment | null => parsePersisted(persisted().fulfilment, isPersistedFulfilment);

/**
 * Read inside the provider, never at import: the module loads before RootLayout's
 * `loadSnapshot` resolves, and an import-time read saw an empty snapshot, so every
 * cold start forgot the chosen store and then saved the defaults over it.
 */
const storedFulfilment = (): PersistedFulfilment => hydrateFulfilment() ?? {
  mode: 'delivery' as FulfilmentMode,
  storeId: stores[0].id,
  addressId: defaultAddress.id,
  addresses: [defaultAddress],
  slotId: deliverySlots[0].id,
  paymentMethod: 'mpesa' as PaymentMethodId,
  mpesaNumber: defaultAddress.phone,
};

type FulfilmentContextValue = {
  mode: FulfilmentMode;
  setMode: (mode: FulfilmentMode) => void;
  /** The store the order is packed at (delivery) or collected from (pickup). */
  storeId: string;
  /** Picks the store; this also counts as the customer having chosen it. */
  setStoreId: (id: string) => void;
  /** False until the customer has picked a store; the app asks on first open and before ordering. */
  storeChosen: boolean;
  store: (typeof stores)[number];
  address: Address;
  setAddress: (address: Address) => void;
  /** Every address the customer has saved, most recently added last. */
  addresses: Address[];
  /**
   * Saves a new address and makes it the active one. Signed in, it is saved to
   * the account first and resolves false if that fails.
   */
  addAddress: (address: Address) => Promise<boolean>;
  /** Deletes a saved address (from the account too when signed in); resolves false if that fails. */
  removeAddress: (id: string) => Promise<boolean>;
  /** False until the customer has saved a delivery address; checkout asks for one first. */
  hasAddress: boolean;
  slotId: string;
  setSlotId: (id: string) => void;
  slot: (typeof deliverySlots)[number];
  paymentMethod: PaymentMethodId;
  setPaymentMethod: (method: PaymentMethodId) => void;
  /** M-Pesa line the STK push is sent to. */
  mpesaNumber: string;
  setMpesaNumber: (phone: string) => void;
  /** Xana Club points applied at checkout — cleared once an order is placed. */
  pointsRedeemed: number;
  setPointsRedeemed: (points: number) => void;
  /** The shopper ticked the 18+ confirmation for alcohol in this basket. */
  ageConfirmed: boolean;
  setAgeConfirmed: (confirmed: boolean) => void;
  /** Prescription reference given at checkout; empty until one is supplied. */
  rxReference: string;
  setRxReference: (reference: string) => void;
  /** Promo code accepted at checkout (the server checks it again when the order is placed). */
  promo: AppliedPromo | null;
  setPromo: (promo: AppliedPromo | null) => void;
  /** KRA PIN typed at checkout; null until edited, so the field shows the account's saved PIN. */
  kraPinDraft: string | null;
  setKraPinDraft: (pin: string | null) => void;
};

export type AppliedPromo = { code: string; description: string; discount: number };

const FulfilmentContext = createContext<FulfilmentContextValue | null>(null);

export function FulfilmentProvider({ children }: { children: ReactNode }) {
  const { user, isDemo } = useSession();
  const userId = user?.id ?? null;
  const [stored] = useState(storedFulfilment);
  const [mode, setMode] = useState<FulfilmentMode>(stored.mode);
  const [storeId, setStoreIdState] = useState<string>(stored.storeId);
  const [storeChosen, setStoreChosen] = useState(stored.storeChosen === true);
  const setStoreId = useCallback((id: string) => {
    setStoreIdState(id);
    setStoreChosen(true);
  }, []);
  const [savedAddresses, setAddresses] = useState<Address[]>(stored.addresses);
  // The "Amina" sample address belongs to the demo account only; everyone else starts with none.
  const addresses = useMemo(
    () => (isDemo ? savedAddresses : savedAddresses.filter(a => a.id !== defaultAddress.id)),
    [isDemo, savedAddresses],
  );
  const [addressId, setAddressId] = useState<string>(stored.addressId);

  // A different account on this phone never inherits the previous person's
  // addresses; its own saved ones then load from Supabase below.
  const [loadedFor, setLoadedFor] = useState<string | null>(userId);
  if (loadedFor !== userId) {
    setLoadedFor(userId);
    setAddresses([defaultAddress]);
    setAddressId(defaultAddress.id);
  }
  useEffect(() => {
    if (!userId) return;
    let live = true;
    supabase
      .from('addresses')
      .select('id, label, contact, line, phone, is_default')
      .order('created_at')
      .then(({ data, error }) => {
        if (!live || error || !data || data.length === 0) return;
        const saved = (data as AddressRow[]).map(fromRow);
        setAddresses(saved);
        setAddressId(current => (saved.some(a => a.id === current) ? current : (saved.find(a => a.isDefault) ?? saved[0]).id));
      });
    return () => {
      live = false;
    };
  }, [userId]);

  const addAddress = useCallback(async (next: Address): Promise<boolean> => {
    let entry = next;
    if (userId) {
      const { data, error } = await supabase
        .from('addresses')
        .insert({ label: next.label, contact: next.contact, line: next.line, phone: next.phone, is_default: next.isDefault })
        .select('id, label, contact, line, phone, is_default')
        .single();
      if (error || !data) return false;
      entry = fromRow(data as AddressRow);
      if (entry.isDefault) {
        await supabase.from('addresses').update({ is_default: false }).neq('id', entry.id);
      }
    }
    setAddresses(current => [
      // The sample address is only a placeholder; the first real one replaces it.
      ...current.filter(a => a.id !== defaultAddress.id).map(a => (entry.isDefault ? { ...a, isDefault: false } : a)),
      entry,
    ]);
    setAddressId(entry.id);
    return true;
  }, [userId]);
  const removeAddress = useCallback(
    async (id: string): Promise<boolean> => {
      if (userId && id !== defaultAddress.id) {
        const { error } = await supabase.from('addresses').delete().eq('id', id);
        if (error) return false;
      }
      setAddresses(current => current.filter(a => a.id !== id));
      return true;
    },
    [userId],
  );
  const setAddress = (next: Address) => setAddressId(next.id);
  const [slotId, setSlotId] = useState(stored.slotId);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId>(
    // Card is hidden until DPO Pay is live: a saved card choice falls back to M-Pesa.
    stored.paymentMethod === 'card' ? 'mpesa' : stored.paymentMethod,
  );
  const [storedMpesaNumber, setMpesaNumber] = useState(stored.mpesaNumber);
  // The sample M-Pesa line is Amina's; a real account defaults to its own number.
  const mpesaNumber = !isDemo && user && storedMpesaNumber === defaultAddress.phone ? user.phone : storedMpesaNumber;
  const [pointsRedeemed, setPointsRedeemed] = useState(0);
  // Checkout answers, kept here so they survive the hop to the M-Pesa screen and back. Not persisted.
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [rxReference, setRxReference] = useState('');
  const [promo, setPromo] = useState<AppliedPromo | null>(null);
  const [kraPinDraft, setKraPinDraft] = useState<string | null>(null);

  const store = useMemo(() => stores.find(s => s.id === storeId) ?? stores[0], [storeId]);
  const slot = useMemo(() => deliverySlots.find(s => s.id === slotId) ?? deliverySlots[0], [slotId]);

  const address = useMemo<Address>(
    () =>
      addresses.find(a => a.id === addressId) ??
      addresses[0] ??
      // Nothing saved yet: an empty entry with the customer's own name, so no screen shows someone else's.
      (isDemo ? defaultAddress : { id: '', label: '', contact: user?.name ?? '', line: '', phone: user?.phone ?? '', isDefault: false }),
    [addresses, addressId, isDemo, user],
  );
  const hasAddress = address.line.trim() !== '';

  useEffect(() => {
    save(STORAGE_KEYS.fulfilment, {
      mode,
      storeId,
      storeChosen,
      addressId,
      addresses: savedAddresses,
      slotId,
      paymentMethod,
      mpesaNumber: storedMpesaNumber,
    } satisfies PersistedFulfilment);
  }, [mode, storeId, storeChosen, addressId, savedAddresses, slotId, paymentMethod, storedMpesaNumber]);

  const value = useMemo<FulfilmentContextValue>(
    () => ({
      mode,
      setMode,
      storeId,
      setStoreId,
      storeChosen,
      store,
      address,
      setAddress,
      addresses,
      addAddress,
      removeAddress,
      hasAddress,
      slotId,
      setSlotId,
      slot,
      paymentMethod,
      setPaymentMethod,
      mpesaNumber,
      setMpesaNumber,
      pointsRedeemed,
      setPointsRedeemed,
      ageConfirmed,
      setAgeConfirmed,
      rxReference,
      setRxReference,
      promo,
      setPromo,
      kraPinDraft,
      setKraPinDraft,
    }),
    [mode, storeId, setStoreId, storeChosen, store, address, addresses, addAddress, removeAddress, hasAddress, slotId, slot, paymentMethod, mpesaNumber, pointsRedeemed, ageConfirmed, rxReference, promo, kraPinDraft],
  );

  return <FulfilmentContext.Provider value={value}>{children}</FulfilmentContext.Provider>;
}

export function useFulfilment(): FulfilmentContextValue {
  const ctx = useContext(FulfilmentContext);
  if (!ctx) throw new Error('useFulfilment must be used inside <FulfilmentProvider>');
  return ctx;
}

/**
 * In stock at one store. place-order checks the chosen store, so a product that
 * only another branch holds must not look available. Products cached before
 * per-store stock existed fall back to the all-branch flag.
 */
export const inStockAt = (product: Product, storeId: string): boolean =>
  product.stockByStore ? (product.stockByStore[storeId.toUpperCase()] ?? 0) > 0 : product.inStock !== false;

/** `inStockAt` for the shopper's chosen store, plus that store's short name for "Out of stock at …". */
export function useStoreStock() {
  const { storeId, store } = useFulfilment();
  const inStock = useCallback((product: Product) => inStockAt(product, storeId), [storeId]);
  return { inStock, storeShortName: store.name.replace('Xana Plus ', '') };
}

export { defaultAddress };
