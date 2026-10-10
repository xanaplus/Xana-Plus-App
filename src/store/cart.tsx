import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, useSyncExternalStore, type ReactNode } from 'react';

import { productById } from '@/data/catalog';
import { quantityUnitPrice } from '@/lib/quantity-pricing';
import { catalogueVersion, subscribeCatalogue } from '@/data/live-catalogue';
import type { CartLine, OrderSummary, Product, SubstitutionPreference } from '@/data/types';
import { parsePersisted, persisted, save, STORAGE_KEYS } from '@/lib/storage';
import { track } from '@/lib/analytics';
import { tapFeedback } from '@/lib/haptics';

const DELIVERY_FEE = 0;
const PLATFORM_FEE = 20;
/** Pickup and orders above this value ship free. */
const FREE_DELIVERY_THRESHOLD = 1000;

type CartState = {
  lines: CartLine[];
  substitution: SubstitutionPreference;
};

type CartAction =
  | { type: 'add'; productId: string; quantity?: number }
  | { type: 'remove'; productId: string }
  | { type: 'setQuantity'; productId: string; quantity: number }
  | { type: 'increment'; productId: string }
  | { type: 'decrement'; productId: string }
  | { type: 'setSubstitution'; preference: SubstitutionPreference }
  | { type: 'clear' };

/**
 * A first launch starts with an empty basket; the catalogue is Business Central's
 * now, so the Figma sample cart would price made-up products. Later launches
 * restore the shopper's own basket from device storage.
 */
const initialState: CartState = {
  lines: [],
  substitution: 'similar',
};

const SUBSTITUTION_VALUES: readonly SubstitutionPreference[] = ['similar', 'refund', 'call'];

const isCartState = (value: unknown): value is CartState =>
  typeof value === 'object' &&
  value !== null &&
  Array.isArray((value as CartState).lines) &&
  (value as CartState).lines.every(
    line =>
      typeof line === 'object' &&
      line !== null &&
      typeof (line as CartLine).productId === 'string' &&
      typeof (line as CartLine).quantity === 'number' &&
      (line as CartLine).quantity >= 1,
  ) &&
  SUBSTITUTION_VALUES.includes((value as CartState).substitution);

/** Restores the persisted basket, dropping lines for products no longer stocked. */
const hydrateCart = (): CartState => {
  const stored = parsePersisted(persisted().cart, isCartState);
  if (!stored) return initialState;
  return {
    ...stored,
    lines: stored.lines.filter(line => productById(line.productId) !== undefined),
  };
};

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'add': {
      const existing = state.lines.find(l => l.productId === action.productId);
      if (existing) {
        return {
          ...state,
          lines: state.lines.map(l => (l.productId === action.productId ? { ...l, quantity: l.quantity + (action.quantity ?? 1) } : l)),
        };
      }
      return { ...state, lines: [...state.lines, { productId: action.productId, quantity: action.quantity ?? 1 }] };
    }
    case 'remove':
      return { ...state, lines: state.lines.filter(l => l.productId !== action.productId) };
    case 'setQuantity':
      if (action.quantity < 1) return { ...state, lines: state.lines.filter(l => l.productId !== action.productId) };
      return { ...state, lines: state.lines.map(l => (l.productId === action.productId ? { ...l, quantity: action.quantity } : l)) };
    case 'increment':
      return { ...state, lines: state.lines.map(l => (l.productId === action.productId ? { ...l, quantity: l.quantity + 1 } : l)) };
    case 'decrement':
      return {
        ...state,
        lines: state.lines.flatMap(l => {
          if (l.productId !== action.productId) return [l];
          return l.quantity <= 1 ? [] : [{ ...l, quantity: l.quantity - 1 }];
        }),
      };
    case 'setSubstitution':
      return { ...state, substitution: action.preference };
    case 'clear':
      return { lines: [], substitution: state.substitution };
  }
}

/** Price for one unit, applying the wholesale tier when the quantity qualifies. */
export const unitPrice = (product: Product, quantity: number): number =>
  quantityUnitPrice(product.price, quantity, product.priceTiers ?? (
    product.wholesalePrice && product.wholesaleMinQty
      ? [{ minQty: product.wholesaleMinQty, unitPrice: product.wholesalePrice }] : []
  ));

type CartContextValue = {
  lines: CartLine[];
  /** Lines joined with their product records, skipping unknown ids. */
  items: { product: Product; quantity: number; unitPrice: number; lineTotal: number }[];
  itemCount: number;
  unitCount: number;
  summary: OrderSummary;
  substitution: SubstitutionPreference;
  add: (productId: string, quantity?: number) => void;
  remove: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  increment: (productId: string) => void;
  decrement: (productId: string) => void;
  setSubstitution: (preference: SubstitutionPreference) => void;
  clear: () => void;
  quantityOf: (productId: string) => number;
  /** The most recent add, for the "Added to cart" message; `key` changes on every add. */
  lastAdded: { productId: string; quantity: number; key: number } | null;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, undefined, hydrateCart);
  const liveProducts = useSyncExternalStore(subscribeCatalogue, catalogueVersion, catalogueVersion);

  const items = useMemo(
    () =>
      state.lines.flatMap(line => {
        const product = liveProducts.get(line.productId) ?? productById(line.productId);
        if (!product) return [];
        const price = unitPrice(product, line.quantity);
        return [{ product, quantity: line.quantity, unitPrice: price, lineTotal: price * line.quantity }];
      }),
    [state.lines, liveProducts],
  );

  const summary = useMemo<OrderSummary>(() => {
    const itemsSubtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
    const wholesaleSavings = items.reduce(
      (sum, i) => sum + Math.max(0, (i.product.price - i.unitPrice) * i.quantity),
      0,
    );
    const deliveryFee = itemsSubtotal >= FREE_DELIVERY_THRESHOLD ? DELIVERY_FEE : DELIVERY_FEE;
    // An empty basket carries no fees: charging the packaging fee for nothing
    // would show "Checkout — KES 20.00" with no items in the order.
    const empty = items.length === 0;
    const platformFee = empty ? 0 : PLATFORM_FEE;
    return {
      itemsSubtotal,
      wholesaleSavings,
      deliveryFee: empty ? 0 : deliveryFee,
      platformFee,
      total: empty ? 0 : itemsSubtotal + deliveryFee + platformFee,
      itemCount: items.length,
      unitCount: items.reduce((sum, i) => sum + i.quantity, 0),
    };
  }, [items]);

  const [lastAdded, setLastAdded] = useState<CartContextValue['lastAdded']>(null);
  const add = useCallback((productId: string, quantity?: number) => {
    tapFeedback();
    track('add_to_cart', { item: productId, quantity: quantity ?? 1 });
    dispatch({ type: 'add', productId, quantity });
    setLastAdded(previous => ({ productId, quantity: quantity ?? 1, key: (previous?.key ?? 0) + 1 }));
  }, []);
  const remove = useCallback((productId: string) => dispatch({ type: 'remove', productId }), []);
  const setQuantity = useCallback((productId: string, quantity: number) => dispatch({ type: 'setQuantity', productId, quantity }), []);
  const increment = useCallback((productId: string) => dispatch({ type: 'increment', productId }), []);
  const decrement = useCallback((productId: string) => dispatch({ type: 'decrement', productId }), []);
  const setSubstitution = useCallback((preference: SubstitutionPreference) => dispatch({ type: 'setSubstitution', preference }), []);
  const clear = useCallback(() => dispatch({ type: 'clear' }), []);

  useEffect(() => {
    save(STORAGE_KEYS.cart, state);
  }, [state]);

  const value = useMemo<CartContextValue>(
    () => ({
      lines: state.lines,
      items,
      itemCount: items.length,
      unitCount: summary.unitCount,
      summary,
      substitution: state.substitution,
      add,
      remove,
      setQuantity,
      increment,
      decrement,
      setSubstitution,
      clear,
      quantityOf: (productId: string) => state.lines.find(l => l.productId === productId)?.quantity ?? 0,
      lastAdded,
    }),
    [state.lines, state.substitution, items, summary, add, remove, setQuantity, increment, decrement, setSubstitution, clear, lastAdded],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
