import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { productById } from '@/data/catalog';
import { fetchProducts } from '@/data/live-catalogue';
import { ORDER_HISTORY, type OrderLine } from '@/data/orders';
import type { OrderSummary, PaymentMethodId, SubstitutionPreference } from '@/data/types';
import { parsePersisted, persisted, save, STORAGE_KEYS } from '@/lib/storage';
import { track } from '@/lib/analytics';
import { successFeedback } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { unitPrice } from '@/store/cart';
import { useSession } from '@/store/session';

/**
 * Placed orders — the record checkout writes and Order Status / Order History read.
 *
 * New orders are saved by the `place-order` Edge Function, which re-prices them
 * from the catalogue; a signed-in customer's saved orders are loaded from
 * Supabase. Only the demo account also gets the three sample baskets from
 * `@/data/orders`, so the substitution, hold and return flows can still be shown;
 * every other account sees just its own orders. Staff move saved
 * orders along in Staff tools; the change arrives here live (Supabase Realtime).
 * The sample orders still advance on the device only.
 */

export type OrderStatus = 'received' | 'shopping' | 'out-for-delivery' | 'delivered' | 'cancelled';

export const ORDER_STAGES: { status: OrderStatus; label: string }[] = [
  { status: 'received', label: 'Received' },
  { status: 'shopping', label: 'Shopping' },
  { status: 'out-for-delivery', label: 'Out for delivery' },
  { status: 'delivered', label: 'Delivered' },
];

export type PlacedOrder = {
  id: string;
  /** Display date, e.g. "20 Sep 2026". */
  placed: string;
  status: OrderStatus;
  lines: OrderLine[];
  summary: OrderSummary;
  paymentMethod: PaymentMethodId;
  paymentReference?: string;
  contact: string;
  addressLine: string;
  slotLabel: string;
  storeName: string;
  substitution: SubstitutionPreference;
  pointsEarned: number;
  /** Set when an item went out of stock and needs the customer to choose. */
  /** `held` = the shopper could not reach the customer, so the item waits for their answer (D-1). */
  substitutionNeeded?: { productId: string; shopperNote: string; held?: boolean };
  cancelledReason?: string;
  /** Saved in Supabase as a test order (payment simulated). */
  isTest?: boolean;
};

const PLATFORM_FEE = 20;
const DELIVERY_FEE = 0;
/** D-5: 1 Xana Club point per KES 120 spent. */
const POINTS_PER_SHILLING = 1 / 120;

/** Prices a set of lines against the live catalogue. */
export function summariseLines(lines: OrderLine[]): OrderSummary {
  const priced = lines.flatMap(line => {
    const product = productById(line.productId);
    if (!product) return [];
    const paid = unitPrice(product, line.quantity);
    return [{ product, quantity: line.quantity, unitPrice: paid, lineTotal: paid * line.quantity }];
  });

  const itemsSubtotal = priced.reduce((sum, i) => sum + i.lineTotal, 0);
  const wholesaleSavings = priced.reduce(
    (sum, i) => sum + (i.product.wholesalePrice ? (i.product.price - i.unitPrice) * i.quantity : 0),
    0,
  );

  return {
    itemsSubtotal,
    wholesaleSavings,
    deliveryFee: DELIVERY_FEE,
    platformFee: PLATFORM_FEE,
    total: itemsSubtotal + DELIVERY_FEE + PLATFORM_FEE,
    itemCount: priced.length,
    unitCount: priced.reduce((sum, i) => sum + i.quantity, 0),
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Seed history: the three baskets, given plausible states and fulfilment detail. */
const SEED: PlacedOrder[] = ORDER_HISTORY.map((record, index) => {
  const summary = summariseLines(record.lines);
  const status: OrderStatus = index === 0 ? 'shopping' : 'delivered';
  return {
    id: record.id,
    placed: record.placed,
    status,
    lines: record.lines,
    summary,
    paymentMethod: 'mpesa' as PaymentMethodId,
    paymentReference: index === 0 ? 'QHL99120Z' : undefined,
    contact: 'Amina Odhiambo',
    addressLine: 'Apt 4B, Karura Springs, 2nd Parklands Ave, Nairobi',
    slotLabel: index === 0 ? 'Today, 9:00 AM to 11:00 AM' : 'Standard Express',
    storeName: index === 2 ? 'Xana Plus Ruiru' : 'Xana Plus Syokimau',
    substitution: 'similar' as SubstitutionPreference,
    pointsEarned: Math.floor(summary.total * POINTS_PER_SHILLING),
    substitutionNeeded:
      index === 0 ? { productId: 'brookside-milk-500ml', shopperNote: '500ml pouch currently out of stock.' } : undefined,
  };
});

const STATUSES: readonly OrderStatus[] = ['received', 'shopping', 'out-for-delivery', 'delivered', 'cancelled'];
const SUBSTITUTIONS: readonly SubstitutionPreference[] = ['similar', 'refund', 'call'];
const PAYMENTS: readonly PaymentMethodId[] = ['mpesa', 'cod', 'card'];

const isPlacedOrder = (value: unknown): value is PlacedOrder => {
  if (typeof value !== 'object' || value === null) return false;
  const order = value as PlacedOrder;
  return (
    typeof order.id === 'string' &&
    typeof order.placed === 'string' &&
    STATUSES.includes(order.status) &&
    Array.isArray(order.lines) &&
    order.lines.every(
      line => typeof line === 'object' && line !== null && typeof (line as OrderLine).productId === 'string' && typeof (line as OrderLine).quantity === 'number',
    ) &&
    typeof order.summary === 'object' &&
    order.summary !== null &&
    typeof (order.summary as OrderSummary).total === 'number' &&
    PAYMENTS.includes(order.paymentMethod) &&
    typeof order.contact === 'string' &&
    typeof order.addressLine === 'string' &&
    typeof order.slotLabel === 'string' &&
    typeof order.storeName === 'string' &&
    SUBSTITUTIONS.includes(order.substitution) &&
    typeof order.pointsEarned === 'number'
  );
};

type CachedOrders = { userId: string; orders: PlacedOrder[] };
const isCachedOrders = (value: unknown): value is CachedOrders => {
  if (typeof value !== 'object' || value === null) return false;
  const cached = value as CachedOrders;
  return typeof cached.userId === 'string' && Array.isArray(cached.orders) && cached.orders.every(isPlacedOrder);
};

const SEED_IDS = new Set(SEED.map(order => order.id));

/** Never restore an unowned legacy cache or another customer's orders. */
const hydrateOrders = (userId: string | undefined, isDemo: boolean): PlacedOrder[] => {
  if (!userId) return [];
  const cached = parsePersisted(persisted().orders, isCachedOrders);
  return cached?.userId === userId ? cached.orders : isDemo ? SEED : [];
};

export type PlaceOrderInput = {
  lines: OrderLine[];
  paymentMethod: PaymentMethodId;
  contact: string;
  addressLine: string;
  slotLabel: string;
  storeName: string;
  substitution: SubstitutionPreference;
  pointsRedeemed: number;
  ageConfirmed: boolean;
  /** Every prescription line has been cleared at checkout. */
  rxSupplied: boolean;
  rxReference?: string;
  promoCode?: string;
};

/** Error codes `place-order` returns, plus `network` for no reply at all. */
export type PlaceOrderError =
  | 'signed_out'
  | 'invalid_order'
  | 'unavailable'
  | 'age_unconfirmed'
  | 'rx_missing'
  | 'points_unavailable'
  | PromoError
  | 'server_error'
  | 'network';

/** Why a promo code was turned down (from `check_promo` / `place-order`). */
export type PromoError = 'promo_unknown' | 'promo_expired' | 'promo_min_spend' | 'promo_used' | 'promo_limit';

/** Shopper-facing copy for a refused promo code. */
export const promoErrorMessage = (error: PromoError, minSpend?: number): string => {
  switch (error) {
    case 'promo_expired':
      return 'This code has expired or has not started yet.';
    case 'promo_min_spend':
      return minSpend ? `This code needs items worth KES ${minSpend.toLocaleString('en-KE')} or more.` : 'Add a few more items to use this code.';
    case 'promo_used':
      return 'You have already used this code.';
    case 'promo_limit':
      return 'This code has been fully used up.';
    default:
      return 'That code is not valid. Check the spelling and try again.';
  }
};

const isPromoError = (error: string): error is PromoError => error.startsWith('promo_');

export type PlaceOrderResult = { ok: true; id: string } | { ok: false; error: PlaceOrderError; items?: string[]; minSpend?: number };

/** Shopper-facing copy for a refused order. */
export const placeOrderErrorMessage = (error: PlaceOrderError): string => {
  switch (error) {
    case 'signed_out':
      return 'Please sign in again to place your order.';
    case 'unavailable':
      return 'Some items have just sold out. Remove them from your cart and try again.';
    case 'age_unconfirmed':
      return 'Confirm you are 18 or over to buy alcohol.';
    case 'rx_missing':
      return 'A prescription is needed for the medicine in your cart.';
    case 'points_unavailable':
      return 'Those Xana Club points are no longer available. Adjust the points and try again.';
    case 'network':
      return 'No connection. Check your internet and try again. You have not been charged.';
    default:
      if (isPromoError(error)) return promoErrorMessage(error);
      return 'We could not place your order. Please try again.';
  }
};

type PlaceOrderReply = {
  orderNo: string;
  createdAt: string;
  itemsSubtotal: number;
  promoDiscount: number;
  deliveryFee: number;
  platformFee: number;
  total: number;
  pointsEarned: number;
};

type OrderRow = {
  order_no: string;
  created_at: string;
  status: OrderStatus;
  is_test: boolean;
  payment_method: PaymentMethodId;
  payment_reference: string | null;
  contact: string;
  address_line: string;
  slot_label: string;
  store_name: string;
  substitution: SubstitutionPreference;
  items_subtotal: number | string;
  promo_code: string | null;
  promo_discount: number | string;
  delivery_fee: number | string;
  platform_fee: number | string;
  total: number | string;
  points_earned: number;
  order_items: { item_no: string; quantity: number }[];
};

const displayDate = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

const fromRow = (row: OrderRow): PlacedOrder => {
  const lines = row.order_items.map(item => ({ productId: item.item_no, quantity: item.quantity }));
  const itemsSubtotal = Number(row.items_subtotal);
  const deliveryFee = Number(row.delivery_fee);
  const platformFee = Number(row.platform_fee);
  return {
    id: row.order_no,
    placed: displayDate(row.created_at),
    status: row.status,
    lines,
    // The saved totals, not today's prices — what the customer was charged.
    summary: {
      itemsSubtotal,
      wholesaleSavings: 0,
      deliveryFee,
      platformFee,
      promoCode: row.promo_code ?? undefined,
      promoDiscount: Number(row.promo_discount ?? 0),
      total: Number(row.total),
      itemCount: lines.length,
      unitCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    },
    paymentMethod: row.payment_method,
    paymentReference: row.payment_reference ?? undefined,
    contact: row.contact,
    addressLine: row.address_line,
    slotLabel: row.slot_label,
    storeName: row.store_name,
    substitution: row.substitution,
    pointsEarned: row.points_earned,
    isTest: row.is_test,
  };
};

type OrdersContextValue = {
  orders: PlacedOrder[];
  orderById: (id: string) => PlacedOrder | undefined;
  /** Saves a new order in Supabase and returns its number, or why it was refused. */
  placeOrder: (input: PlaceOrderInput) => Promise<PlaceOrderResult>;
  /** Applies the customer's answer to an out-of-stock item. */
  resolveSubstitution: (orderId: string, preference: SubstitutionPreference) => void;
  advanceStatus: (orderId: string) => void;
};

const OrdersContext = createContext<OrdersContextValue | null>(null);

export function OrdersProvider({ children }: { children: ReactNode }) {
  const { user, isDemo, refreshProfile } = useSession();
  const userId = user?.id;
  const [orders, setOrders] = useState<PlacedOrder[]>(() => hydrateOrders(userId, isDemo));
  const activeUserId = useRef(userId);

  // A different account on this phone starts from a clean list, so nobody sees
  // the previous person's orders; the saved ones then load below.
  const [ordersFor, setOrdersFor] = useState<string | null>(userId ?? null);
  /** Orders placed in this app session, kept if the saved list loads before they reach it. */
  const placedHere = useRef(new Set<string>());
  useLayoutEffect(() => {
    if (activeUserId.current !== userId) placedHere.current.clear();
    activeUserId.current = userId;
  }, [userId]);
  if (ordersFor !== (userId ?? null)) {
    setOrdersFor(userId ?? null);
    setOrders(hydrateOrders(userId, isDemo));
  }

  // Staff changes to a saved order arrive live. Delivered adds points and
  // cancelled returns spent ones, so the balance is re-read then.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`orders:${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `user_id=eq.${userId}` },
        payload => {
          const row = payload.new as { order_no?: string; status?: OrderStatus };
          if (!row.order_no || !row.status || !STATUSES.includes(row.status)) return;
          setOrders(prev => prev.map(o => (o.id === row.order_no ? { ...o, status: row.status as OrderStatus } : o)));
          if (row.status === 'delivered' || row.status === 'cancelled') void refreshProfile();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, refreshProfile]);

  // Signed in: the saved orders come from Supabase; the demo baskets stay underneath.
  useEffect(() => {
    if (!userId) return;
    let current = true;
    (async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(
          'order_no, created_at, status, is_test, payment_method, payment_reference, contact, address_line, slot_label, store_name, substitution, items_subtotal, promo_code, promo_discount, delivery_fee, platform_fee, total, points_earned, order_items(item_no, quantity)',
        )
        // Staff accounts can read every order, so a customer's list must ask for its own explicitly.
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error || !current) return;
      const saved = (data as OrderRow[]).map(fromRow);
      // Order screens look lines up by id, so load any item this device hasn't seen yet.
      const missing = [...new Set(saved.flatMap(order => order.lines.map(line => line.productId)))].filter(id => !productById(id));
      await fetchProducts(missing).catch(() => []);
      if (!current) return;
      const savedIds = new Set(saved.map(order => order.id));
      setOrders(prev => [
        // Placed on this device while the load was in flight, so not in `saved` yet.
        ...prev.filter(order => placedHere.current.has(order.id) && !savedIds.has(order.id)),
        ...saved,
        ...(isDemo ? prev.filter(order => SEED_IDS.has(order.id)) : []),
      ]);
    })();
    return () => {
      current = false;
    };
  }, [userId, isDemo]);

  const placeOrder = useCallback(async (input: PlaceOrderInput): Promise<PlaceOrderResult> => {
    if (!userId) return { ok: false, error: 'signed_out' };
    const owner = userId;
    const { data, error } = await supabase.functions.invoke<PlaceOrderReply>('place-order', {
      body: {
        lines: input.lines.map(line => ({ itemNo: line.productId, quantity: line.quantity })),
        paymentMethod: input.paymentMethod,
        contact: input.contact,
        addressLine: input.addressLine,
        slotLabel: input.slotLabel,
        storeName: input.storeName,
        substitution: input.substitution,
        pointsRedeemed: input.pointsRedeemed,
        ageConfirmed: input.ageConfirmed,
        rxSupplied: input.rxSupplied,
        rxReference: input.rxReference,
        promoCode: input.promoCode,
      },
    });

    // A response for a previous account must not enter the next account's cache.
    if (activeUserId.current !== owner) return { ok: false, error: 'signed_out' };

    if (error || !data) {
      // FunctionsHttpError carries the function's JSON reply in `context`.
      const context = (error as { context?: Response } | null)?.context;
      const reply = context ? await context.json().catch(() => null) : null;
      const failed: PlaceOrderError = reply ? ((reply.error as PlaceOrderError) ?? 'server_error') : 'network';
      track('order_failed', { reason: failed });
      if (!reply) return { ok: false, error: 'network' };
      return { ok: false, error: failed, items: reply.items, minSpend: reply.minSpend };
    }

    const order: PlacedOrder = {
      id: data.orderNo,
      placed: displayDate(data.createdAt),
      status: 'received',
      lines: input.lines,
      summary: {
        itemsSubtotal: data.itemsSubtotal,
        wholesaleSavings: 0,
        deliveryFee: data.deliveryFee,
        platformFee: data.platformFee,
        promoCode: input.promoCode,
        promoDiscount: data.promoDiscount,
        total: data.total,
        itemCount: input.lines.length,
        unitCount: input.lines.reduce((sum, line) => sum + line.quantity, 0),
      },
      paymentMethod: input.paymentMethod,
      contact: input.contact,
      addressLine: input.addressLine,
      slotLabel: input.slotLabel,
      storeName: input.storeName,
      substitution: input.substitution,
      pointsEarned: data.pointsEarned,
      isTest: true,
    };
    placedHere.current.add(order.id);
    track('order_placed', { method: input.paymentMethod, lines: input.lines.length, total: data.total, promo: input.promoCode ?? null });
    successFeedback();
    setOrders(prev => [order, ...prev]);
    return { ok: true, id: order.id };
  }, [userId]);

  const resolveSubstitution = useCallback((orderId: string, preference: SubstitutionPreference) => {
    setOrders(prev =>
      prev.map(o => (o.id === orderId ? { ...o, substitution: preference, substitutionNeeded: undefined } : o)),
    );
  }, []);

  const advanceStatus = useCallback((orderId: string) => {
    setOrders(prev =>
      prev.map(o => {
        if (o.id !== orderId) return o;
        // D-1: an unanswered out-of-stock item is put on hold, never replaced or removed without the customer.
        if (o.substitutionNeeded && !o.substitutionNeeded.held) {
          return { ...o, substitutionNeeded: { ...o.substitutionNeeded, held: true } };
        }
        const index = ORDER_STAGES.findIndex(s => s.status === o.status);
        const next = ORDER_STAGES[Math.min(index + 1, ORDER_STAGES.length - 1)];
        return { ...o, status: next.status };
      }),
    );
  }, []);

  useEffect(() => {
    save(STORAGE_KEYS.orders, { userId: userId ?? '', orders });
  }, [orders, userId]);

  const orderById = useCallback((id: string) => orders.find(o => o.id === id), [orders]);

  const value = useMemo<OrdersContextValue>(
    () => ({ orders, orderById, placeOrder, resolveSubstitution, advanceStatus }),
    [orders, orderById, placeOrder, resolveSubstitution, advanceStatus],
  );

  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
}

export function useOrders(): OrdersContextValue {
  const context = useContext(OrdersContext);
  if (!context) throw new Error('useOrders must be used inside OrdersProvider');
  return context;
}
