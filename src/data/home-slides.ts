/**
 * Home banners from the admin app's "Homepage ads" screen — the same `home_slides`
 * rows the website shows (Web2 `home-slides.cjs`), so marketing changes them once
 * for both. Row-level security lets anyone read only active slides inside their
 * dates. Each row is checked here as the website checks it; a malformed one is
 * left out, never repaired.
 */
import type { Product } from '@/data/types';
import { fetchProducts } from '@/data/live-catalogue';
import { supabase } from '@/lib/supabase';

export type SlideTone = 'green' | 'gold' | 'ink';
export type SlideLayout = 'card' | 'split' | 'full';
export type SlideDivision = 'Pharmacy' | 'Retail' | 'Deli' | 'Wholesale';

export type SlideLink =
  | { kind: 'division'; division: SlideDivision }
  | { kind: 'category'; division: SlideDivision; category: string }
  | { kind: 'product'; item: string };

export type HomeSlide = {
  id: string;
  label: string;
  title: string;
  body: string;
  cta: string;
  tone: SlideTone;
  /** card without a picture; split and full always carry one. */
  layout: SlideLayout;
  focus: 'left' | 'center' | 'right';
  alt: string;
  image: string | null;
  link: SlideLink;
  skus: string[];
};

/** A slide with the catalogue rows behind it, cheapest first. */
export type ShownSlide = HomeSlide & { products: Product[] };

const COLUMNS =
  'id,position,label,title,body,cta_label,link_kind,link_division,link_category,link_item,skus,image_path,tone,sponsored,sponsor_name,starts_at,ends_at,layout,image_focus,image_alt';
const LAYOUTS: readonly string[] = ['card', 'split', 'full'];
const FOCUSES: readonly string[] = ['left', 'center', 'right'];
const DIVISIONS: readonly string[] = ['Pharmacy', 'Retail', 'Deli', 'Wholesale'];
const TONES: readonly string[] = ['green', 'gold', 'ink'];
const IMAGE_PATH = /^slides\/[a-z0-9-]{1,80}\.(webp|jpg|png)$/;
const ITEM = /^[A-Z0-9][A-Z0-9-]{0,39}$/i;

type Row = Record<string, unknown>;

const text = (value: unknown, max: number, required = false): value is string =>
  typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0);

const storageBase = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');

/** One row as Home uses it, or null when anything about it is wrong. */
export function toSlide(row: Row, now = Date.now()): HomeSlide | null {
  if (typeof row.id !== 'string') return null;
  if (!text(row.title, 60, true) || !text(row.cta_label, 24, true) || !text(row.label ?? '', 30) || !text(row.body ?? '', 160)) return null;
  if (!TONES.includes(row.tone as string)) return null;
  const layout = (row.layout ?? 'card') as string;
  const focus = (row.image_focus ?? 'center') as string;
  const alt = (row.image_alt ?? '') as unknown;
  if (!LAYOUTS.includes(layout) || !FOCUSES.includes(focus) || !text(alt, 120)) return null;
  if (row.image_path != null && !(typeof row.image_path === 'string' && IMAGE_PATH.test(row.image_path))) return null;
  if (layout !== 'card' && row.image_path == null) return null;
  const skus = row.skus;
  if (!Array.isArray(skus) || skus.length > 20 || !skus.every(s => typeof s === 'string' && ITEM.test(s))) return null;
  if (row.sponsored === true && !text(row.sponsor_name, 60, true)) return null;
  if (row.starts_at && !(Date.parse(String(row.starts_at)) <= now)) return null;
  if (row.ends_at && !(Date.parse(String(row.ends_at)) > now)) return null;

  let link: SlideLink;
  const division = row.link_division as string;
  if (row.link_kind === 'division' && DIVISIONS.includes(division)) link = { kind: 'division', division: division as SlideDivision };
  else if (row.link_kind === 'category' && DIVISIONS.includes(division) && text(row.link_category, 60, true)) {
    link = { kind: 'category', division: division as SlideDivision, category: row.link_category.trim() };
  } else if (row.link_kind === 'product' && typeof row.link_item === 'string' && ITEM.test(row.link_item)) link = { kind: 'product', item: row.link_item };
  else return null;

  return {
    id: row.id,
    label: row.sponsored === true ? `Sponsored · ${(row.sponsor_name as string).trim()}` : String(row.label ?? '').trim(),
    title: (row.title as string).trim(),
    body: String(row.body ?? '').trim(),
    cta: (row.cta_label as string).trim(),
    tone: row.tone as SlideTone,
    layout: layout as SlideLayout,
    focus: focus as HomeSlide['focus'],
    alt: (alt as string).trim(),
    image: typeof row.image_path === 'string' ? `${storageBase}/storage/v1/object/public/home-images/${row.image_path}` : null,
    link,
    skus: skus as string[],
  };
}

/** Live slides in their admin order, each with the catalogue rows its link and items name. */
export async function fetchHomeSlides(): Promise<ShownSlide[]> {
  const { data, error } = await supabase.from('home_slides').select(COLUMNS).order('position', { ascending: true }).limit(20);
  if (error) throw new Error(error.message);
  const slides = (data as Row[]).map(row => toSlide(row)).filter((slide): slide is HomeSlide => slide !== null);
  const items = [...new Set(slides.flatMap(slide => (slide.link.kind === 'product' ? [slide.link.item, ...slide.skus] : slide.skus)))];
  const byId = new Map((await fetchProducts(items)).map(product => [product.id, product]));
  return slides.map(slide => ({
    ...slide,
    products: [...new Set(slide.link.kind === 'product' ? [slide.link.item, ...slide.skus] : slide.skus)]
      .map(id => byId.get(id))
      .filter((product): product is Product => product !== undefined),
  }));
}
