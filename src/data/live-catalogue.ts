import { useEffect, useState } from 'react';

import { parsePersisted, persisted, save, STORAGE_KEYS } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

import type { Product } from './types';

/**
 * The real catalogue: Business Central items, read from the Supabase
 * `catalogue` view (price incl. VAT, stock, Rx and 18+ flags — never costs).
 *
 * Photos come from the Xana POS as public addresses (`photo_url`, filled by the
 * product-images-sync job); items without one keep the plain card surface.
 * BC has no pack-size field, so `pack` is read off the name.
 */

/** One row of the `catalogue` view. */
type CatalogueRow = {
  item_no: string;
  name: string | null;
  price: number | string;
  stock: number | string;
  category: string | null;
  requires_rx: boolean;
  age_restricted: boolean;
  photo_url: string | null;
};

const COLUMNS = 'item_no,name,price,stock,category,requires_rx,age_restricted,photo_url';

/** App category slug for every BC inventory posting group (the `category` column). */
export const BC_GROUP_CATEGORY: Record<string, string> = {
  'FRUITS AND VEGETABLE': 'fresh-produce',
  'MILK PRODUCTSS': 'dairy-eggs',
  DAIRIES: 'dairy-eggs',
  'MEAT PRODUCTS': 'meat-poultry',
  'BREADS & BREAD SPREA': 'bakery',
  'COOKING OILS & FATS': 'cooking-oil',
  BEVERAGES: 'beverages',
  WATER: 'beverages',
  'SOFTDRINKS AND JUICE': 'beverages',
  'WINES & SPIRITS': 'liquor',
  'SNACKS & BISCUITS': 'snacks',
  CONFECTIONARIES: 'snacks',
  FOODSTUFFS: 'staples',
  'GROCERIES & CEREALS': 'staples',
  'SPICES & FLAVOURS': 'spices',
  'SOAPS & DETERGENTS': 'cleaning-products',
  'CUTLERY AND HOUSEHOL': 'household',
  PLASTICS: 'household',
  AIRFRESHNERS: 'home-care',
  INSECTICIDES: 'home-care',
  'SHOE CARE': 'home-care',
  'SANITARIES& DIAPERS': 'tissue-sanitary',
  'BABY PRODUCTS': 'baby-products',
  STATIONARY: 'books-stationery',
  CLOTHING: 'general-merchandise',
  LUGGAGE: 'general-merchandise',
  RETBEAU: 'beauty-personal-care',
  'COSMETICS & BEAUTY P': 'skin-care',
  'ORAL CARE': 'oral-care',
  GENERAL: 'medicines',
  'OVER THE COUNTER': 'otc-medicines',
  CHRONIC: 'chronic-care',
  CONTROLLED: 'controlled-medicines',
  SUPPLEMENT: 'vitamins-supplements',
};

/** Category slugs that present as pharmacy stock (pharmacist counter, leaflet layout). */
export const LIVE_PHARMACY_CATEGORIES: readonly string[] = [
  'medicines',
  'otc-medicines',
  'chronic-care',
  'controlled-medicines',
  'vitamins-supplements',
  'skin-care',
];

/** BC groups filed under an app category slug; empty when BC has none. */
export const groupsForCategory = (slug: string): string[] =>
  Object.entries(BC_GROUP_CATEGORY)
    .filter(([, category]) => category === slug)
    .map(([group]) => group);

/** "Bioluxe Body Lotion Aloe 1000Ml" → "1000Ml"; "Arbitel 40Mg Tablets 30's" → "30's". */
const PACK_SIZE =
  /\b\d+\s?'?s\b|\b\d+(?:[.,]\d+)?\s?(?:ml|ltrs?|lt|l|kg|gms?|g|mg|mcg)\b|\b\d+\s?(?:pcs|pc|pk|pack|tabs|caps)\b/gi;

const packFromName = (name: string): string => {
  const matches = name.match(PACK_SIZE);
  return matches ? matches[matches.length - 1] : '';
};

const toProduct = (row: CatalogueRow): Product => {
  const name = row.name?.trim() || row.item_no;
  return {
    id: row.item_no,
    name,
    pack: packFromName(name),
    price: Number(row.price),
    image: row.photo_url ?? '',
    category: BC_GROUP_CATEGORY[row.category ?? ''] ?? 'general-merchandise',
    rxRequired: row.requires_rx,
    ageRestricted: row.age_restricted,
    inStock: Number(row.stock) > 0,
  };
};

// ── Product cache ────────────────────────────────────────────────────────────
// Every fetched product is kept here so the synchronous lookups the cart,
// orders and product screens use (`productById`) resolve BC items too. The
// most recent ones are persisted so a restored cart still prices its lines.

const MAX_PERSISTED = 400;
const cache = new Map<string, Product>();
let hydrated = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

const isProductList = (value: unknown): value is Product[] =>
  Array.isArray(value) &&
  value.every(p => typeof p === 'object' && p !== null && typeof (p as Product).id === 'string' && typeof (p as Product).price === 'number');

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  for (const product of parsePersisted(persisted().products, isProductList) ?? []) cache.set(product.id, product);
}

function remember(products: Product[]): Product[] {
  hydrate();
  for (const product of products) {
    // Re-insert so the Map's order stays most-recent-last for the persisted slice.
    cache.delete(product.id);
    cache.set(product.id, product);
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save(STORAGE_KEYS.products, [...cache.values()].slice(-MAX_PERSISTED)), 500);
  return products;
}

export const liveProductById = (id: string): Product | undefined => {
  hydrate();
  return cache.get(id);
};

export const liveProductsByCategory = (slug: string): Product[] => {
  hydrate();
  return [...cache.values()].filter(product => product.category === slug);
};

// ── Queries ──────────────────────────────────────────────────────────────────

/** A shelf of products: BC groups, optionally narrowed to names containing any of `nameHas`. */
export type LiveQuery = { groups: string[]; nameHas?: string[]; limit?: number };

/** Keeps search terms to letters and digits, so they can't break the PostgREST filter syntax. */
const safeWords = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .slice(0, 5);

async function run(request: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Product[]> {
  const { data, error } = await request;
  if (error) throw new Error(error.message);
  return remember(((data ?? []) as CatalogueRow[]).map(toProduct));
}

/**
 * In-stock products for a shelf: ones with a photo first, then best-stocked
 * first (BC has no sales ranking to sort by).
 */
export function fetchShelf({ groups, nameHas, limit = 8 }: LiveQuery): Promise<Product[]> {
  let request = supabase.from('catalogue').select(COLUMNS).in('category', groups).gt('stock', 0);
  const words = (nameHas ?? []).flatMap(safeWords);
  if (words.length > 0) request = request.or(words.map(word => `name.ilike.*${word}*`).join(','));
  return run(request.order('has_photo', { ascending: false }).order('stock', { ascending: false }).limit(limit));
}

/** Free-text search: every word must appear in the name or the BC group. In-stock first, then ones with a photo. */
export function searchCatalogue(query: string, limit = 60): Promise<Product[]> {
  const words = safeWords(query);
  if (words.length === 0) return Promise.resolve([]);
  const clauses = words.map(word => `or(name.ilike.*${word}*,category.ilike.*${word}*)`).join(',');
  return run(
    supabase
      .from('catalogue')
      .select(COLUMNS)
      .or(`and(${clauses})`)
      .order('in_stock', { ascending: false })
      .order('has_photo', { ascending: false })
      .order('stock', { ascending: false })
      .limit(limit),
  );
}

/** Catalogue rows for a set of item numbers — e.g. the lines of past orders. */
export function fetchProducts(itemNos: string[]): Promise<Product[]> {
  if (itemNos.length === 0) return Promise.resolve([]);
  return run(supabase.from('catalogue').select(COLUMNS).in('item_no', itemNos));
}

/**
 * The product with this barcode (Business Central's GTIN), or undefined. A
 * 12-digit UPC and its 13-digit EAN form (leading 0) are the same code, so
 * both spellings are tried. A few barcodes sit on two BC items; the one with
 * more stock wins.
 */
export async function fetchProductByBarcode(scanned: string): Promise<Product | undefined> {
  const digits = scanned.replace(/\D/g, '');
  if (digits.length < 6 || digits.length > 14) return undefined;
  const codes = new Set([digits]);
  if (digits.length === 12) codes.add(`0${digits}`);
  if (digits.length === 13 && digits.startsWith('0')) codes.add(digits.slice(1));
  const [product] = await run(
    supabase.from('catalogue').select(COLUMNS).in('gtin', [...codes]).order('stock', { ascending: false }).limit(1),
  );
  return product;
}

export async function fetchProduct(itemNo: string): Promise<Product | undefined> {
  const [product] = await run(supabase.from('catalogue').select(COLUMNS).eq('item_no', itemNo).limit(1));
  return product;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export type LiveStatus = 'loading' | 'ready' | 'error';

/**
 * Runs `load` whenever `key` changes and exposes its result. Stale responses
 * (the key moved on while a request was in flight) are dropped.
 */
export function useLive<T>(key: string, load: () => Promise<T>, empty: T): { status: LiveStatus; data: T; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const request = `${attempt}:${key}`;
  // Holds the settled result of the latest request; anything older reads as loading.
  const [state, setState] = useState<{ request: string; status: LiveStatus; data: T } | null>(null);

  useEffect(() => {
    let current = true;
    load().then(
      data => current && setState({ request, status: 'ready', data }),
      () => current && setState({ request, status: 'error', data: empty }),
    );
    return () => {
      current = false;
    };
    // `load` and `empty` are recreated every render; `request` is what identifies the call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  const settled = state?.request === request ? state : null;
  return { status: settled?.status ?? 'loading', data: settled?.data ?? empty, retry: () => setAttempt(n => n + 1) };
}

/** Loads each section's shelf in parallel, keyed by section title. */
export function useShelves(sections: { title: string; query: LiveQuery }[], limit: number) {
  const key = JSON.stringify([limit, sections.map(section => [section.title, section.query])]);
  return useLive(
    key,
    async () =>
      Object.fromEntries(
        await Promise.all(sections.map(async section => [section.title, await fetchShelf({ ...section.query, limit })] as const)),
      ) as Record<string, Product[]>,
    NO_SHELVES,
  );
}

const NO_SHELVES: Record<string, Product[]> = {};
