import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTabScrollTop } from '@/components/nav/use-tab-scroll-top';
import {
  Badge,
  BottomSheet,
  Button,
  Chip,
  EmptyState,
  Icon,
  LoadState,
  NoticePill,
  QuantityStepper,
  Screen,
  SearchBar,
  SectionHeader,
  SelectableOption,
  Txt,
} from '@/components/ui';
import { Masthead } from '@/components/nav/masthead';
import { ProductAddButton } from '@/components/ui/product-add-button';
import { ProductPhoto } from '@/components/ui/product-photo';
import type { BadgeTone, IconName } from '@/components/ui';
import { verticalBySlug } from '@/data/catalog';
import { figmaAsset } from '@/data/images';
import { prefetchShelves, useShelves } from '@/data/live-catalogue';
import type { CategoryVertical, Product, ProductBadge } from '@/data/types';
import { discountPercent, formatKes } from '@/lib/format';
import { activePriceTiers } from '@/lib/quantity-pricing';
import { useCart } from '@/store/cart';
import { inStockAt, useFulfilment, useStoreStock } from '@/store/fulfilment';
import { elevation, layout, radius, spacing } from '@/theme';
import { useThemeStyles } from '@/theme/provider';
import type { Palette } from '@/theme';
import { PressableScale } from '@/components/ui/pressable-scale';
import { ShopCard } from '@/components/ui/shop-card';
import { AisleTile, DepartmentPanel, DepartmentSwitcher, MoreAislesTile, type DepartmentOption } from '@/features/shop/department-look';
import { StoreChooser } from '@/features/store/store-chooser';
import { useOffer } from '@/lib/use-offer';

/** Sort keys behind the sort row. BC items carry no was-price, rating or "new" badge, so the row sorts on price. */
type SortKey = 'top' | 'price-asc' | 'price-desc';
/** Pharmacy's frame swaps the sort row for prescription-status filters. */
type PharmacyScope = 'all' | 'otc' | 'rx';

type SortChip = { key: SortKey; label: string; icon?: IconName };
type CardBadge = { label: string; tone: BadgeTone };
type FilterState = { sort: SortKey; scope: PharmacyScope; inStockOnly: boolean; priceCap: number | null; storeId: string };

/** Frame rail cards reveal 30% of the next card. */
const RAIL_PEEK = 1.3;

/** Products loaded per section: the grid frames show two rows, the rails a swipe's worth. */
const GRID_SHELF_SIZE = 4;
/** A long department shows this many aisle tiles, then "More aisles". */
const AISLES_SHOWN = 8;
/** Prescription aisles: their photos stay hidden, so the tile carries the pharmacist's Rx. */
const RX_AISLES = ['medicines', 'chronic-care', 'controlled-medicines'];
const RAIL_SHELF_SIZE = 8;
/**
 * A department switch paints its top rows at once and adds the rest a few rows per frame
 * (20 Nov 2026: Retail's 144 cards took ~2 s to build, so the pill switch felt stuck).
 */
const FIRST_SECTIONS = 2;
const SECTIONS_PER_FRAME = 3;

/** Same sorts as Search. "Top picks" keeps the server's photo-first, in-stock order. */
const SORT_CHIPS: SortChip[] = [
  { key: 'top', label: 'Top picks' },
  { key: 'price-asc', label: 'Price: low to high' },
  { key: 'price-desc', label: 'Price: high to low' },
];

/** Screen 3e filters the pharmacy aisle by prescription status. */
const PHARMACY_SCOPES: { key: PharmacyScope; label: string }[] = [
  { key: 'all', label: 'All Products' },
  { key: 'otc', label: 'Over the Counter' },
  { key: 'rx', label: 'Prescription Only' },
];


/** Pharmacy first, then the Retail · Wholesale · Deli capsule (20 Nov 2026); Groceries and Household live in Retail. */
const VERTICAL_ORDER: CategoryVertical[] = ['pharmacy', 'retail', 'wholesale', 'deli'];
/** Old links (or a saved deep link) to a folded department open Retail. */
const FOLDED_INTO_RETAIL: string[] = ['groceries', 'household'];

// Words only, no clip-art glyphs on the pills (20 Nov 2026).
const VERTICAL_OPTIONS: DepartmentOption[] = VERTICAL_ORDER.map(slug => ({ value: slug, label: verticalBySlug(slug).label }));
/** Pharmacy stands alone, then Retail, Wholesale and Deli share one capsule (20 Nov 2026). */
const GROUPED: CategoryVertical[] = ['retail', 'wholesale', 'deli'];
const GROUPED_OPTIONS = VERTICAL_OPTIONS.filter(option => GROUPED.includes(option.value));
const SEPARATE_OPTIONS = VERTICAL_OPTIONS.filter(option => !GROUPED.includes(option.value));


/** Frames that lay section products out as a two-column card grid. */
// Wholesale (plus its quantity prices) and Deli joined the grid in Nov 2026: one card for the Shop.
const GRID_VERTICALS: CategoryVertical[] = ['retail', 'wholesale', 'deli'];

/** Wholesale's frame labels the section action "View all"; every other aisle says "See All". */
const SECTION_ACTION: Partial<Record<CategoryVertical, string>> = { wholesale: 'View all' };

/** Aisles whose frame cards print the pack line under the product name. */
const PACK_LINE_VERTICALS: CategoryVertical[] = ['deli', 'wholesale', 'pharmacy'];

/** Mirrors the kit's badge vocabulary for the aisle cards. */
const BADGE_COPY: Record<ProductBadge, CardBadge> = {
  discount: { label: 'SAVE', tone: 'discount' },
  fresh: { label: 'FRESH', tone: 'fresh' },
  new: { label: 'NEW', tone: 'new' },
  organic: { label: 'ORGANIC', tone: 'info' },
  bulk: { label: 'BULK', tone: 'warning' },
};

/** Cart unit noun printed on the stepper's "N pack" line, read off the pack size. */
const UNIT_NOUNS: readonly [RegExp, string][] = [
  [/crate/i, 'crate'],
  [/carton/i, 'carton'],
  [/box/i, 'box'],
  [/bunch/i, 'bunch'],
  [/loaf/i, 'loaf'],
  [/pouch/i, 'pouch'],
  [/bottle|btl/i, 'btl'],
  [/jar/i, 'jar'],
  [/pack/i, 'pack'],
];

const PHARMACY_ADVICE = {
  title: 'Need medicine or health advice?',
  /** Frames 3b/3c/3e/3f print one line; Screen 3d splits it into two runs. */
  // No "PPB Verified" claim until it's confirmed (7 Nov 2026).
  subtitle: 'Pharmacy · Ask our pharmacists',
} as const;

const SORTERS: Record<SortKey, (a: Product, b: Product) => number> = {
  top: () => 0,
  'price-asc': (a, b) => a.price - b.price,
  'price-desc': (a, b) => b.price - a.price,
};

/** Applies the sort row and the filter sheet, in the order the frames ask for. */
const applyFilters = (products: Product[], filters: FilterState, pharmacyOnly: boolean): Product[] =>
  products
    .filter(product => {
      if (filters.inStockOnly && !inStockAt(product, filters.storeId)) return false;
      if (filters.priceCap !== null && product.price > filters.priceCap) return false;
      if (pharmacyOnly && filters.scope === 'rx') return product.rxRequired === true;
      if (pharmacyOnly && filters.scope === 'otc') return product.rxRequired !== true;
      return true;
    })
    // Stable sort: in stock at the chosen shop first, then the sort row's order (19 Nov 2026).
    .sort((a, b) => Number(inStockAt(b, filters.storeId)) - Number(inStockAt(a, filters.storeId)) || SORTERS[filters.sort](a, b));

const unitNoun = (product: Product): string => UNIT_NOUNS.find(([pattern]) => pattern.test(product.pack))?.[1] ?? 'pack';

/** Card badge: wholesale tier, bulk descriptor, then the catalogue badge. */
const cardBadge = (product: Product, vertical: CategoryVertical): CardBadge | undefined => {
  if (product.wholesalePrice && product.wholesaleMinQty) {
    return {
      label: `Buy ${product.wholesaleMinQty}+ save ${discountPercent(product.wholesalePrice, product.price)}%`,
      tone: 'warning',
    };
  }
  // Wholesale is the quantity price itself (19 Nov 2026): say what buying more costs each.
  const tier = vertical === 'wholesale' ? activePriceTiers(product.priceTiers).find(step => step.unitPrice < product.price) : undefined;
  // Whole shillings on the label, rounded up so it never shows less than the till charges.
  if (tier) return { label: `${tier.minQty}+ at ${formatKes(Math.ceil(tier.unitPrice))} each`, tone: 'warning' };
  if (vertical === 'retail' || vertical === 'wholesale') {
    const descriptor = (product.pack.split('·')[0] ?? product.pack).trim();
    return { label: descriptor, tone: 'warning' };
  }
  const badge = product.badges?.[0];
  if (!badge) return undefined;
  return badge === 'discount' && product.wasPrice
    ? { label: `SAVE ${discountPercent(product.price, product.wasPrice)}%`, tone: 'discount' }
    : BADGE_COPY[badge];
};

/**
 * Screens 3b–3g — Categories. One screen behind the eight vertical chips: the
 * chip row swaps the whole body, each aisle renders the title, its
 * sub-category grid, the sort/filter row and its product sections.
 */
export default function CategoriesRoute() {
  const styles = useThemeStyles(createStyles);
  const router = useRouter();
  const cart = useCart();
  const { storeId } = useFulfilment();
  const { width } = useWindowDimensions();
  // Also scrolls back to the top when the Categories tab is tapped again.
  const scrollRef = useTabScrollTop();
  /** Home's Top Categories open a department and, where it has one, that category's product row. */
  const { vertical: verticalParam, focus, t: openedAt } = useLocalSearchParams<{ vertical?: string; focus?: string; t?: string }>();
  const chipBarHeight = useRef(0);
  // The chip bar sticks just below the phone's status bar (clock, battery), not under it
  // (Roystone's phone, 19 Nov 2026). The sticky block starts a status bar's height above the
  // chips with a see-through top, so when it pins to the top the chips sit below the clock;
  // a plain strip then covers the status bar so products don't scroll behind the clock.
  const statusBar = useSafeAreaInsets().top;
  const scrollY = useSharedValue(0);
  const stickyY = useSharedValue(Number.MAX_SAFE_INTEGER);
  const onScroll = useAnimatedScrollHandler(event => {
    scrollY.value = event.contentOffset.y;
  });
  const scrim = useAnimatedStyle(() => ({ opacity: scrollY.value >= stickyY.value ? 1 : 0 }));
  const sectionOffsets = useRef<Record<string, number>>({});
  const pendingFocus = useRef<string | null>(null);

  const [vertical, setVertical] = useState<CategoryVertical>('retail');
  const [sort, setSort] = useState<SortKey>('top');
  const [scope, setScope] = useState<PharmacyScope>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [storeSheetOpen, setStoreSheetOpen] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [priceCap, setPriceCap] = useState<number | null>(null);
  /** Retail has 18 aisles: show 8 and a "More aisles" tile until it's tapped. */
  const [allAisles, setAllAisles] = useState(false);

  const definition = verticalBySlug(vertical);
  const isPharmacy = vertical === 'pharmacy';
  const showsGrid = GRID_VERTICALS.includes(vertical);
  const sortKey: SortKey = isPharmacy ? 'top' : sort;
  const filters: FilterState = { sort: sortKey, scope, inStockOnly, priceCap, storeId };
  const filtersActive = inStockOnly || priceCap !== null;

  const contentWidth = Math.min(width, layout.maxContentWidth) - layout.screenMargin * 2;
  const gridCardWidth = Math.floor((contentWidth - layout.gutter) / 2);
  const railCardWidth = Math.floor((contentWidth - layout.gutter) / RAIL_PEEK);

  // Only what the chosen shop has on hand (19 Nov 2026): BC's total stock includes other locations.
  const shelves = useShelves(definition.sections, showsGrid ? GRID_SHELF_SIZE : RAIL_SHELF_SIZE, { branch: storeId });
  // Once this department is on screen, load the other pills' shelves behind it so they open full.
  const shelvesReady = shelves.status === 'ready';
  useEffect(() => {
    if (!shelvesReady) return;
    for (const option of VERTICAL_OPTIONS) {
      if (option.value === vertical) continue;
      const other = verticalBySlug(option.value);
      prefetchShelves(other.sections, GRID_VERTICALS.includes(option.value) ? GRID_SHELF_SIZE : RAIL_SHELF_SIZE, { branch: storeId });
    }
  }, [shelvesReady, vertical, storeId]);
  const sections = definition.sections
    .map(section => ({ ...section, products: applyFilters(shelves.data[section.title] ?? [], filters, isPharmacy) }))
    .filter(section => section.products.length > 0);
  // Rows below the first few are added after the switch has painted.
  const [revealed, setRevealed] = useState(FIRST_SECTIONS);
  const [revealedFor, setRevealedFor] = useState(vertical);
  if (revealedFor !== vertical) {
    setRevealedFor(vertical);
    setRevealed(FIRST_SECTIONS);
  }
  const sectionCount = sections.length;
  useEffect(() => {
    if (revealed >= sectionCount) return;
    const frame = requestAnimationFrame(() => setRevealed(count => count + SECTIONS_PER_FRAME));
    return () => cancelAnimationFrame(frame);
  }, [revealed, sectionCount]);
  const shownSections = sections.slice(0, revealed);
  const visibleCount = sections.reduce((total, section) => total + section.products.length, 0);
  // Every department's shortcuts are its own rows, each shown by a real photo from that row,
  // and a tap jumps to the row (Wholesale and Deli first, every department since 20 Nov 2026:
  // no staged artwork, and the tiles name exactly the rows below). Until the shelves load,
  // the tiles show the department's glyph.
  const tiles = definition.sections
    .filter(section => shelves.status !== 'ready' || (shelves.data[section.title]?.length ?? 0) > 0)
    .map(section => ({
      slug: section.categorySlug,
      name: section.title,
      photo: shelves.data[section.title]?.find(product => product.image)?.image,
      mark: RX_AISLES.includes(section.categorySlug) ? 'Rx' : undefined,
    }));
  // The panel's fan: one photographed item from each of the first rows, then any others.
  const panelPhotos = (() => {
    const firsts = tiles.flatMap(tile => (tile.photo ? [tile.photo] : []));
    const rest = Object.values(shelves.data).flat().flatMap(product => (product.image ? [product.image] : []));
    return [...new Set([...firsts, ...rest])].slice(0, 3);
  })();
  const collapsed = tiles.length > AISLES_SHOWN + 1 && !allAisles;
  const shownTiles = collapsed ? tiles.slice(0, AISLES_SHOWN) : tiles;
  // Even grids only: 3-up for 3, 6 or 9 rows, 4-up for 4 or 8; any other count scrolls sideways.
  const tileCount = shownTiles.length + (collapsed ? 1 : 0);
  const tileColumns = tileCount % 3 === 0 ? 3 : tileCount % 4 === 0 ? 4 : 0;
  const tileSize = tileColumns
    ? Math.floor((contentWidth - layout.gutter * (tileColumns - 1)) / tileColumns)
    : Math.floor((contentWidth - layout.gutter * 2.5) / 3.5);
  const openTile = (tile: { slug: string; name: string }) => {
    if (scrollToSection(tile.slug)) return;
    // Its row isn't drawn yet: draw every row and scroll once it has laid out.
    if (sections.some(section => section.categorySlug === tile.slug)) {
      pendingFocus.current = tile.slug;
      setRevealed(Number.MAX_SAFE_INTEGER);
      return;
    }
    openSearch(tile.name);
  };
  /** "View all": the whole row on its own page, never a search for the row's title. */
  const openAisle = (slug: string) => router.push({ pathname: '/aisle', params: { vertical, slug } });

  const priceCaps = (() => {
    const top = Object.values(shelves.data)
      .flat()
      .reduce((highest, product) => Math.max(highest, product.price), 0);
    const steps = [0.25, 0.5, 0.75].map(share => Math.ceil((top * share) / 50) * 50);
    return [...new Set(steps)].filter(cap => cap > 0 && cap < top);
  })();

  /** Chip taps swap the body, reset that aisle's controls and keep the chip row in view. */
  const selectVertical = (next: CategoryVertical) => {
    if (next === vertical) return;
    setVertical(next);
    setSort('top');
    setScope('all');
    setInStockOnly(false);
    setPriceCap(null);
    setAllAisles(false);
    pendingFocus.current = null;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  // A Home tap switches the department during render, so the new aisle paints straight away.
  const [appliedOpen, setAppliedOpen] = useState<string | undefined>(undefined);
  if (openedAt !== appliedOpen) {
    setAppliedOpen(openedAt);
    const next = FOLDED_INTO_RETAIL.includes(verticalParam ?? '') ? 'retail' : VERTICAL_ORDER.find(slug => slug === verticalParam);
    if (next && next !== vertical) {
      setVertical(next);
      setSort('top');
      setScope('all');
      setInStockOnly(false);
      setPriceCap(null);
    }
  }

  const offsetKey = (slug: string) => `${vertical}:${slug}`;
  const scrollToSection = (slug: string) => {
    const y = sectionOffsets.current[offsetKey(slug)];
    if (y === undefined) return false;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - chipBarHeight.current), animated: true });
    return true;
  };

  // Then scroll to the tapped category's row, or to the top when the aisle has none.
  useEffect(() => {
    if (!openedAt) return;
    pendingFocus.current = focus ?? null;
    if (focus && scrollToSection(focus)) pendingFocus.current = null;
    else {
      // A row further down may not be drawn yet: draw them all so it can be scrolled to.
      if (focus) setRevealed(Number.MAX_SAFE_INTEGER);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openedAt]);

  const openSearch = (query?: string) => router.push(query ? { pathname: '/search', params: { q: query } } : '/search');

  const sortLabel = SORT_CHIPS.find(chip => chip.key === sort)?.label ?? 'Top picks';
  /** Pharmacy keeps its All / OTC / Rx chips; other departments get one "Sort & filter" button. */
  const renderControls = () =>
    isPharmacy ? (
      <View style={styles.sortRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortTrack}>
          {PHARMACY_SCOPES.map(entry => (
            <Chip key={entry.key} label={entry.label} selected={scope === entry.key} onPress={() => setScope(entry.key)} />
          ))}
          <Chip label="Filters" icon="sliders" tone={filtersActive ? 'mint' : 'neutral'} onPress={() => setFiltersOpen(true)} />
        </ScrollView>
      </View>
    ) : (
      <View style={[styles.inset, styles.sortBar]}>
        <Txt variant="bodySm" color="onSurfaceVariant" style={styles.flex} numberOfLines={1}>
          {`Sorted by ${sortLabel.toLowerCase()}${filtersActive ? ' · filtered' : ''}`}
        </Txt>
        <Chip
          label="Sort & filter"
          icon="sliders"
          tone={filtersActive || sort !== 'top' ? 'mint' : 'neutral'}
          onPress={() => setFiltersOpen(true)}
        />
      </View>
    );

  return (
    <Screen scroll={false} padded={false} contentStyle={styles.screenBody} edgeToEdgeTop>
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[2]}
        contentContainerStyle={styles.page}
      >
        <Masthead title="Shop" subtitle="Pharmacy, food and everyday essentials." onChangeStore={() => setStoreSheetOpen(true)} />

        <View style={[styles.inset, styles.searchSection]}>
          <SearchBar
            placeholder="Search medicines, food and more"
            onPress={() => openSearch()}
            trailingIcon="scan"
            onTrailingPress={() => router.push('/scan')}
          />
        </View>

        {/* Sticky vertical switcher: the body below always changes under it. */}
        {/* Plain Views only: React Native's sticky header moves this View's style onto its own
            wrapper, which can't take an animated style (that crashed on the phone, 19 Nov).
            */}
        <View
          // As a style, not a prop: the sticky wrapper takes this View's style, so taps on the
          // see-through top still reach the search bar underneath.
          style={{ marginTop: -statusBar, paddingTop: statusBar, pointerEvents: 'box-none' }}
          onLayout={event => {
            chipBarHeight.current = event.nativeEvent.layout.height;
            stickyY.value = event.nativeEvent.layout.y;
          }}
        >
          <View style={styles.chipBar}>
            <DepartmentSwitcher grouped={GROUPED_OPTIONS} separate={SEPARATE_OPTIONS} value={vertical} onChange={selectVertical} style={styles.chipTrack} />
          </View>
        </View>

        <View style={[styles.inset, styles.bannerSection]}>
          <DepartmentPanel
            vertical={vertical}
            title={definition.label}
            photos={panelPhotos}
            loading={shelves.status === 'loading'}
            onBrowseAll={() => openSearch(definition.label)}
          />
        </View>

        {isPharmacy ? (
          <View style={[styles.inset, styles.adviceSection]}>
            <InfoBanner
              icon="pharmacy"
              title={PHARMACY_ADVICE.title}
              subtitle={PHARMACY_ADVICE.subtitle}
              onPress={() => router.push('/(tabs)/pharmacy')}
            />
          </View>
        ) : null}

        {tileColumns ? (
          <View style={[styles.inset, styles.tiles]}>
            {shownTiles.map(tile => (
              <AisleTile key={tile.slug + tile.name} vertical={vertical} name={tile.name} photo={tile.photo} mark={tile.mark} loading={shelves.status === 'loading'} size={tileSize} onPress={() => openTile(tile)} />
            ))}
            {collapsed ? (
              <MoreAislesTile vertical={vertical} count={tiles.length - AISLES_SHOWN} size={tileSize} onPress={() => setAllAisles(true)} />
            ) : null}
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tileTrack}>
            {shownTiles.map(tile => (
              <AisleTile key={tile.slug + tile.name} vertical={vertical} name={tile.name} photo={tile.photo} mark={tile.mark} loading={shelves.status === 'loading'} size={tileSize} onPress={() => openTile(tile)} />
            ))}
            {collapsed ? (
              <MoreAislesTile vertical={vertical} count={tiles.length - AISLES_SHOWN} size={tileSize} onPress={() => setAllAisles(true)} />
            ) : null}
          </ScrollView>
        )}
        {allAisles && tiles.length > AISLES_SHOWN + 1 ? (
          <View style={[styles.inset, styles.fewer]}>
            <Button label="Show fewer aisles" variant="ghost" size="sm" onPress={() => setAllAisles(false)} />
          </View>
        ) : null}

        {renderControls()}

        {shelves.status !== 'ready' ? (
          <LoadState status={shelves.status} placeholder={showsGrid ? 'grid' : 'rail'} inset onRetry={shelves.retry} />
        ) : sections.length === 0 ? (
          <View style={styles.inset}>
            <EmptyState
              icon="filter"
              title="Nothing matches these filters"
            >
              <Button
                label="Clear filters"
                variant="outline"
                onPress={() => {
                  setInStockOnly(false);
                  setPriceCap(null);
                  setScope('all');
                }}
              />
            </EmptyState>
          </View>
        ) : (
          shownSections.map(section => (
            <View
              key={section.title}
              style={styles.section}
              onLayout={event => {
                sectionOffsets.current[offsetKey(section.categorySlug)] = event.nativeEvent.layout.y;
                if (pendingFocus.current === section.categorySlug && scrollToSection(section.categorySlug)) {
                  pendingFocus.current = null;
                }
              }}
            >
              <View style={[styles.inset, styles.sectionHead]}>
                <SectionHeader
                  title={section.title}
                  actionLabel={SECTION_ACTION[vertical] ?? 'See All'}
                  onAction={() => openAisle(section.categorySlug)}
                />
              </View>

              {showsGrid ? (
                <View style={[styles.inset, styles.grid]}>
                  {section.products.map(product => (
                    <GridCard
                      key={product.id}
                      product={product}
                      width={gridCardWidth}
                      showQuantityPrices={vertical === 'wholesale'}
                      quantity={cart.quantityOf(product.id)}
                      savingNote={
                        /carton|crate|box/i.test(section.title) && product.wasPrice
                          ? `Save ${formatKes(product.wasPrice - product.price)} vs singles`
                          : undefined
                      }
                      onPress={() => router.push(`/product/${product.id}`)}
                      onAdd={() => cart.add(product.id)}
                    />
                  ))}
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.railTrack}>
                  {section.products.map(product => (
                    <RailCard
                      key={product.id}
                      product={product}
                      vertical={vertical}
                      width={railCardWidth}
                      quantity={cart.quantityOf(product.id)}
                      onPress={() => router.push(`/product/${product.id}`)}
                      onAdd={() => cart.add(product.id)}
                      onStep={next => cart.setQuantity(product.id, Math.max(1, next))}
                    />
                  ))}
                </ScrollView>
              )}
            </View>
          ))
        )}

      </Animated.ScrollView>
      <Animated.View pointerEvents="none" style={[styles.statusScrim, { height: statusBar }, scrim]} />

      <BottomSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title={isPharmacy ? "Filters" : "Sort & filter"}
        scrollable
        footer={
          <Button
            label={`Show ${visibleCount} ${visibleCount === 1 ? 'product' : 'products'}`}
            onPress={() => setFiltersOpen(false)}
          />
        }
      >
        {isPharmacy ? null : (
          <View style={styles.sheetGroup}>
            <Txt variant="titleLg">Sort by</Txt>
            <View style={styles.sheetChips}>
              {SORT_CHIPS.map(chip => (
                <Chip key={chip.key} label={chip.label} icon={chip.icon} selected={sort === chip.key} onPress={() => setSort(chip.key)} />
              ))}
            </View>
          </View>
        )}

        <View style={styles.sheetGroup}>
          <Txt variant="titleLg">Availability</Txt>
          <SelectableOption
            title="In stock only"
            icon="check-circle"
            indicator="check"
            selected={inStockOnly}
            onPress={() => setInStockOnly(current => !current)}
          />
        </View>

        <View style={styles.sheetGroup}>
          <Txt variant="titleLg">Price range</Txt>
          <View style={styles.sheetChips}>
            <Chip label="Any price" selected={priceCap === null} onPress={() => setPriceCap(null)} />
            {priceCaps.map(cap => (
              <Chip
                key={cap}
                label={`Under ${formatKes(cap)}`}
                selected={priceCap === cap}
                onPress={() => setPriceCap(cap)}
              />
            ))}
          </View>
        </View>

        {filtersActive || sort !== 'top' ? (
          <Button
            label="Reset"
            variant="ghost"
            onPress={() => {
              setInStockOnly(false);
              setPriceCap(null);
              setSort('top');
            }}
          />
        ) : null}
      </BottomSheet>

      <StoreChooser visible={storeSheetOpen} onClose={() => setStoreSheetOpen(false)} />
    </Screen>
  );
}

/** Mint advice strip with pharmacy guidance. */
function InfoBanner({
  icon,
  title,
  subtitle,
  subtitleTail,
  onPress,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  /** Screen 3d prints the pharmacy line as two runs with a separator dot. */
  subtitleTail?: string;
  onPress?: () => void;
}) {
  const styles = useThemeStyles(createStyles);
  const body = (
    <>
      <View style={styles.bannerGlyph}>
        <Icon name={icon} size={18} color="onPrimary" />
      </View>
      <View style={styles.bannerCopy}>
        <Txt variant="titleSm">{title}</Txt>
        <View style={styles.bannerSubtitle}>
          <Icon name="shield" size={12} color="onSurfaceVariant" />
          <Txt variant="caption" color="onSurfaceVariant" numberOfLines={2}>
            {subtitle}
          </Txt>
          {subtitleTail ? (
            <>
              <View style={styles.bannerDot} />
              <Txt variant="caption" color="onSurfaceVariant" numberOfLines={2}>
                {subtitleTail}
              </Txt>
            </>
          ) : null}
        </View>
      </View>
      {onPress ? <Icon name="chevron-right" size={18} color="primaryAccent" /> : null}
    </>
  );

  return (
    <View style={styles.banner}>
      {onPress ? (
        <PressableScale accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={styles.bannerPress}>
          {body}
        </PressableScale>
      ) : (
        <View style={styles.bannerPress}>{body}</View>
      )}
    </View>
  );
}

/** Wholesale tier table: the frame prints both unit brackets under the price. */
function BulkTiers({ product }: { product: Product }) {
  const styles = useThemeStyles(createStyles);
  const minQty = product.wholesaleMinQty ?? 1;
  const bulkPrice = product.wholesalePrice ?? product.price;

  return (
    <View style={styles.tiers}>
      <View style={[styles.tierRow, styles.tierRowBase]}>
        <Txt variant="bodySm" color="onSurfaceVariant">{minQty <= 2 ? '1 unit' : `1 to ${minQty - 1} units`}</Txt>
        <Txt variant="titleSm">{`${formatKes(product.price)} each`}</Txt>
      </View>
      <View style={[styles.tierRow, styles.tierRowBulk]}>
        <Txt variant="label" color="primaryAccent">{`${minQty}+ units`}</Txt>
        <Txt variant="titleSm" color="primaryAccent">{`${formatKes(bulkPrice)} each`}</Txt>
      </View>
    </View>
  );
}

/** Deli, wholesale, pharmacy and beauty aisles scroll wide rail cards. */
function RailCard({
  product,
  vertical,
  width,
  quantity,
  onPress,
  onAdd,
  onStep,
}: {
  product: Product;
  vertical: CategoryVertical;
  width: number;
  quantity: number;
  onPress: () => void;
  onAdd: () => void;
  onStep: (quantity: number) => void;
}) {
  const styles = useThemeStyles(createStyles);
  const image = figmaAsset(product.image);
  const badge = cardBadge(product, vertical);
  const savingNote =
    product.wasPrice && vertical !== 'wholesale' && vertical !== 'pharmacy'
      ? `Save ${formatKes(product.wasPrice - product.price)}${vertical === 'retail' ? ' vs singles' : ''}`
      : undefined;
  const offer = useOffer(product);
  const bulk = vertical === 'wholesale' && !offer && product.wholesalePrice && product.wholesaleMinQty ? product : undefined;
  const outOfStock = !useStoreStock().inStock(product);
  // The chosen store's POS offer: its price, the BC price struck, and its saving as the badge.
  const shownBadge = offer ? { label: `SAVE ${discountPercent(offer.price, product.price)}%`, tone: 'discount' as BadgeTone } : badge;
  const struck = offer ? product.price : !savingNote ? product.wasPrice : undefined;

  return (
    <View style={[styles.railCard, { width }]}>
      <View style={[styles.railImage, { height: width }]}>
        <ProductPhoto source={image} productId={product.id} accessibilityLabel={`${product.name} product photo`} variant="card" />
        <View style={styles.railBadges}>
          {shownBadge ? <Badge label={shownBadge.label} tone={shownBadge.tone} /> : null}
          {product.rxRequired ? <Badge label="Rx Required" tone="brand" /> : null}
        </View>
      </View>

      {/* Card-wide tap target; a sibling of the stepper/add control, never its parent. */}
      <Pressable accessibilityRole="button" accessibilityLabel={product.name} onPress={onPress} style={styles.railOverlay} />

      <View style={styles.railBody}>
        <Txt variant="titleSm" numberOfLines={2} style={styles.railTitle}>
          {product.name}
        </Txt>
        {PACK_LINE_VERTICALS.includes(vertical) ? (
          <Txt variant="caption" color="outline" numberOfLines={1} style={styles.railPack}>
            {product.pack}
          </Txt>
        ) : null}
        {vertical === 'pharmacy' ? (
          <Txt variant="bodySm" color="outline">
            Price
          </Txt>
        ) : null}

        <View style={styles.priceRow}>
          <Txt variant="priceLg">{formatKes(offer?.price ?? product.price)}</Txt>
          {struck ? (
            <Txt variant="priceStrike" color="outline" style={styles.strike}>
              {formatKes(struck)}
            </Txt>
          ) : null}
        </View>

        {bulk ? <BulkTiers product={bulk} /> : null}
        {savingNote ? <NoticePill label={savingNote} tone="warning" /> : null}
        {/* Pharmacy's frame prints a status pill under the price; other aisles only warn when sold out. */}
        {vertical === 'pharmacy' || outOfStock ? (
          <NoticePill label={outOfStock ? 'Out of stock' : 'In Stock'} tone={outOfStock ? 'danger' : 'info'} />
        ) : null}

        {outOfStock ? null : (
          <View style={[styles.railFooter, bulk ? null : styles.railFooterEnd]}>
            {bulk ? (
              <Txt variant="labelSm" color="onSurfaceVariant">
                Qty (units)
              </Txt>
            ) : null}
            {quantity > 0 ? (
              <QuantityStepper
                quantity={quantity}
                min={1}
                size="compact"
                tone="brand"
                suffix={bulk ? undefined : unitNoun(product)}
                onIncrement={() => onStep(quantity + 1)}
                onDecrement={() => onStep(quantity - 1)}
                style={styles.railStepper}
              />
            ) : (
              <ProductAddButton productName={product.name} onPress={onAdd} rxRequired={product.rxRequired} />
            )}
          </View>
        )}
      </View>

      {/* Card-wide tap target; a sibling of the stepper/add control, never its parent. */}
    </View>
  );
}

/** Retail, groceries and household aisles use the kit card in a two-column grid. */
function GridCard({
  product,
  width,
  quantity,
  savingNote,
  showQuantityPrices,
  onPress,
  onAdd,
}: {
  product: Product;
  width: number;
  quantity: number;
  savingNote?: string;
  showQuantityPrices?: boolean;
  onPress: () => void;
  onAdd: () => void;
}) {
  const styles = useThemeStyles(createStyles);
  return (
    <View style={{ width }}>
      <ShopCard product={product} quantity={quantity} showQuantityPrices={showQuantityPrices} onPress={onPress} onAdd={onAdd} />
      {quantity > 0 ? (
        <Txt variant="labelSm" color="onSurfaceVariant" style={styles.gridQty}>
          {`${quantity} ${unitNoun(product)}`}
        </Txt>
      ) : null}
      {savingNote ? <NoticePill label={savingNote} tone="warning" style={styles.gridNote} /> : null}
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  screenBody: { paddingTop: spacing.none, paddingBottom: spacing.none },
  scroll: { flex: 1 },
  page: { paddingBottom: spacing.colossal },
  inset: { paddingHorizontal: layout.screenMargin },
  pressed: { opacity: 0.92 },

  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 32,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainerLow,
  },
  account: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors.outlineSoft30,
  },
  accountSignedIn: { backgroundColor: colors.primaryContainer, borderColor: colors.primaryContainer },

  searchSection: { paddingTop: spacing.lg },
  chipBar: { backgroundColor: colors.background, paddingVertical: spacing.md },
  statusScrim: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: colors.background },
  chipTrack: { paddingHorizontal: layout.screenMargin, gap: spacing.sm },

  /** Advice strip / age notice: 20pt margin, 12pt below the chip bar. */
  bannerSection: { paddingTop: spacing.sm },
  banner: { borderRadius: radius.card, backgroundColor: colors.mintSurface },
  bannerPress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  bannerGlyph: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerCopy: { flex: 1, gap: spacing.xs },
  bannerSubtitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  bannerDot: { width: 3, height: 3, borderRadius: radius.pill, backgroundColor: colors.outline },

  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: layout.gutter,
    rowGap: spacing.lg,
    marginTop: spacing.xl,
  },
  tileTrack: { paddingHorizontal: layout.screenMargin, gap: layout.gutter, marginTop: spacing.xl },
  adviceSection: { marginTop: spacing.md },
  fewer: { alignItems: 'center', marginTop: spacing.sm },
  sortBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xl },
  flex: { flex: 1 },

  sortRow: { marginTop: spacing.xl },
  sortTrack: { paddingHorizontal: layout.screenMargin, gap: spacing.sm, alignItems: 'center' },

  section: { marginTop: spacing.xxxl },
  sectionHead: { gap: spacing.xs, marginBottom: spacing.md },

  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: layout.gutter, rowGap: spacing.xl },
  gridQty: { marginTop: spacing.xs },
  gridNote: { marginTop: spacing.xs },

  railTrack: { paddingHorizontal: layout.screenMargin, gap: layout.gutter },
  railCard: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    ...elevation.hairline,
  },
  railImage: {
    width: '100%',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  railBadges: { position: 'absolute', top: spacing.sm, left: spacing.sm, right: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  railBody: { gap: spacing.xs, padding: spacing.md, flex: 1 },
  railTitle: { minHeight: 38 },
  railPack: { minHeight: 15 },
  /** Card-wide tap target; rendered after the body so the stepper stays clickable. */
  railOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, marginTop: spacing.xxs },
  strike: { textDecorationLine: 'line-through' },

  tiers: { gap: spacing.xs, marginTop: spacing.xs },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  tierRowBase: { backgroundColor: colors.surfaceContainerLow },
  tierRowBulk: { backgroundColor: colors.mintSurface },

  railFooter: { minHeight: 44 + spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginTop: 'auto', paddingTop: spacing.sm },
  railFooterEnd: { justifyContent: 'flex-end' },
  railStepper: { flex: 1, justifyContent: 'space-between' },

  sheetGroup: { gap: spacing.md },
  sheetChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
