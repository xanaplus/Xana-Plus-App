import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import {
  Badge,
  BottomSheet,
  Button,
  CategoryTile,
  Chip,
  EmptyState,
  Icon,
  IconButton,
  LoadState,
  NoticePill,
  ProductCard,
  QuantityStepper,
  Screen,
  SearchBar,
  SectionHeader,
  Segmented,
  SelectableOption,
  Txt,
  TopBar,
  TopBarAction,
} from '@/components/ui';
import { ProductPhoto } from '@/components/ui/product-photo';
import type { BadgeTone, IconName, SegmentedOption } from '@/components/ui';
import { stores, verticalBySlug } from '@/data/catalog';
import { figmaAsset } from '@/data/images';
import { useShelves } from '@/data/live-catalogue';
import type { CategoryVertical, Product, ProductBadge } from '@/data/types';
import { discountPercent, formatKes } from '@/lib/format';
import { useCart } from '@/store/cart';
import { useFulfilment } from '@/store/fulfilment';
import { useSession } from '@/store/session';
import { colors, elevation, layout, radius, spacing } from '@/theme';

/** Sort keys behind the frame's sort row. */
type SortKey = 'savings' | 'popular' | 'new' | 'organic';
/** Pharmacy's frame swaps the sort row for prescription-status filters. */
type PharmacyScope = 'all' | 'otc' | 'rx';

type SortChip = { key: SortKey; label: string; icon?: IconName };
type CardBadge = { label: string; tone: BadgeTone };
type FilterState = { sort: SortKey; scope: PharmacyScope; inStockOnly: boolean; priceCap: number | null };

/** Frame rail cards reveal 30% of the next card. */
const RAIL_PEEK = 1.3;

/** Products loaded per section: the grid frames show two rows, the rails a swipe's worth. */
const GRID_SHELF_SIZE = 4;
const RAIL_SHELF_SIZE = 8;

const ESSENTIAL_SORT_CHIPS: SortChip[] = [
  { key: 'savings', label: 'Best savings', icon: 'percent' },
  { key: 'popular', label: 'Most popular' },
  { key: 'new', label: 'New' },
];

/** Sort row per frame — Groceries trades "New" for "Organic & Fresh". */
const SORT_CHIPS: Record<CategoryVertical, SortChip[]> = {
  retail: ESSENTIAL_SORT_CHIPS,
  wholesale: ESSENTIAL_SORT_CHIPS,
  deli: ESSENTIAL_SORT_CHIPS,
  pharmacy: ESSENTIAL_SORT_CHIPS,
  liquor: ESSENTIAL_SORT_CHIPS,
  household: ESSENTIAL_SORT_CHIPS,
  beauty: ESSENTIAL_SORT_CHIPS,
  groceries: [
    { key: 'savings', label: 'Best savings', icon: 'percent' },
    { key: 'popular', label: 'Most popular' },
    { key: 'organic', label: 'Organic & Fresh' },
  ],
};

/** Screen 3e filters the pharmacy aisle by prescription status. */
const PHARMACY_SCOPES: { key: PharmacyScope; label: string }[] = [
  { key: 'all', label: 'All Products' },
  { key: 'otc', label: 'Over the Counter' },
  { key: 'rx', label: 'Prescription Only' },
];

/** Glyphs the frames print on the Wholesale and Pharmacy chips. */
const VERTICAL_ICONS: Partial<Record<CategoryVertical, IconName>> = { wholesale: 'cart', pharmacy: 'pill' };

/** Chip order from every frame: Retail, Wholesale, Deli, Pharmacy, Liquor, Groceries, Household, Beauty. */
const VERTICAL_ORDER: CategoryVertical[] = [
  'retail',
  'wholesale',
  'deli',
  'pharmacy',
  'liquor',
  'groceries',
  'household',
  'beauty',
];

const VERTICAL_OPTIONS: SegmentedOption<CategoryVertical>[] = VERTICAL_ORDER.map(slug => {
  const icon = VERTICAL_ICONS[slug];
  const label = verticalBySlug(slug).label;
  return icon ? { value: slug, label, icon } : { value: slug, label };
});

/** Sub-category tiles run 3-up on the essentials aisles and 4-up on the specialty ones. */
const SUBCATEGORY_COLUMNS: Record<CategoryVertical, number> = {
  retail: 4,
  wholesale: 4,
  deli: 4,
  liquor: 4,
  pharmacy: 3,
  groceries: 3,
  household: 3,
  beauty: 3,
};

/** Frames that lay section products out as a two-column card grid. */
const GRID_VERTICALS: CategoryVertical[] = ['retail', 'groceries', 'household'];

/** Wholesale's frame labels the section action "View all"; every other aisle says "See All". */
const SECTION_ACTION: Partial<Record<CategoryVertical, string>> = { wholesale: 'View all' };

/** Aisles whose frame cards print the pack line under the product name. */
const PACK_LINE_VERTICALS: CategoryVertical[] = ['deli', 'wholesale', 'pharmacy', 'beauty'];

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
  subtitle: 'Pharmacy · PPB Verified Pharmacists',
  wholesaleSubtitle: 'PPB Verified Pharmacists',
} as const;

/** Screen 3d delivery band. */
const WHOLESALE_DELIVERY = {
  title: 'Free Next-Day Delivery on 10k+',
  body: 'Direct pallet delivery anywhere across Nairobi & Kiambu counties.',
} as const;

/** Screen 3g age notice that stands in front of the liquor aisle. */
const LIQUOR_NOTICE = {
  title: 'Drink responsibly · 18+ only',
  body: 'Please drink in moderation and avoid driving.',
} as const;

const SORTERS: Record<SortKey, (a: Product, b: Product) => number> = {
  savings: (a, b) =>
    (b.wasPrice ? discountPercent(b.price, b.wasPrice) : 0) - (a.wasPrice ? discountPercent(a.price, a.wasPrice) : 0),
  popular: (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.reviewCount ?? 0) - (a.reviewCount ?? 0),
  new: (a, b) => Number(b.badges?.includes('new') ?? false) - Number(a.badges?.includes('new') ?? false),
  organic: (a, b) =>
    Number(b.badges?.some(badge => badge === 'organic' || badge === 'fresh') ?? false) -
    Number(a.badges?.some(badge => badge === 'organic' || badge === 'fresh') ?? false),
};

/** Applies the sort row and the filter sheet, in the order the frames ask for. */
const applyFilters = (products: Product[], filters: FilterState, pharmacyOnly: boolean): Product[] =>
  products
    .filter(product => {
      if (filters.inStockOnly && product.inStock === false) return false;
      if (filters.priceCap !== null && product.price > filters.priceCap) return false;
      if (pharmacyOnly && filters.scope === 'rx') return product.rxRequired === true;
      if (pharmacyOnly && filters.scope === 'otc') return product.rxRequired !== true;
      return true;
    })
    .sort(SORTERS[filters.sort]);

const unitNoun = (product: Product): string => UNIT_NOUNS.find(([pattern]) => pattern.test(product.pack))?.[1] ?? 'pack';

/** Card badge: wholesale tier, bulk descriptor, then the catalogue badge. */
const cardBadge = (product: Product, vertical: CategoryVertical): CardBadge | undefined => {
  if (product.wholesalePrice && product.wholesaleMinQty) {
    return {
      label: `Buy ${product.wholesaleMinQty}+ save ${discountPercent(product.wholesalePrice, product.price)}%`,
      tone: 'warning',
    };
  }
  if (vertical === 'retail' || vertical === 'wholesale' || vertical === 'liquor') {
    const descriptor = (product.pack.split('·')[0] ?? product.pack).trim();
    return { label: descriptor, tone: vertical === 'liquor' ? 'info' : 'warning' };
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
  const router = useRouter();
  const cart = useCart();
  const { user } = useSession();
  const { store, storeId, setStoreId } = useFulfilment();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  /** Home's Top Categories open a department and, where it has one, that category's product row. */
  const { vertical: verticalParam, focus, t: openedAt } = useLocalSearchParams<{ vertical?: string; focus?: string; t?: string }>();
  const chipBarHeight = useRef(0);
  const sectionOffsets = useRef<Record<string, number>>({});
  const pendingFocus = useRef<string | null>(null);

  const [vertical, setVertical] = useState<CategoryVertical>('retail');
  const [sort, setSort] = useState<SortKey>('savings');
  const [scope, setScope] = useState<PharmacyScope>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [storeSheetOpen, setStoreSheetOpen] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [priceCap, setPriceCap] = useState<number | null>(null);

  const definition = verticalBySlug(vertical);
  const isPharmacy = vertical === 'pharmacy';
  const isLiquor = vertical === 'liquor';
  const showsGrid = GRID_VERTICALS.includes(vertical);
  const sortKey: SortKey = isPharmacy ? 'savings' : sort;
  const filters: FilterState = { sort: sortKey, scope, inStockOnly, priceCap };
  const filtersActive = inStockOnly || priceCap !== null;

  const contentWidth = Math.min(width, layout.maxContentWidth) - layout.screenMargin * 2;
  const tileColumns = SUBCATEGORY_COLUMNS[vertical];
  const tileSize = Math.max(64, Math.floor((contentWidth - layout.gutter * (tileColumns - 1)) / tileColumns));
  const gridCardWidth = Math.floor((contentWidth - layout.gutter) / 2);
  const railCardWidth = Math.floor((contentWidth - layout.gutter) / RAIL_PEEK);

  const shelves = useShelves(definition.sections, showsGrid ? GRID_SHELF_SIZE : RAIL_SHELF_SIZE);
  const sections = definition.sections
    .map(section => ({ ...section, products: applyFilters(shelves.data[section.title] ?? [], filters, isPharmacy) }))
    .filter(section => section.products.length > 0);
  const visibleCount = sections.reduce((total, section) => total + section.products.length, 0);

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
    setSort('savings');
    setScope('all');
    setInStockOnly(false);
    setPriceCap(null);
    pendingFocus.current = null;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  // A Home tap switches the department during render, so the new aisle paints straight away.
  const [appliedOpen, setAppliedOpen] = useState<string | undefined>(undefined);
  if (openedAt !== appliedOpen) {
    setAppliedOpen(openedAt);
    const next = VERTICAL_ORDER.find(slug => slug === verticalParam);
    if (next && next !== vertical) {
      setVertical(next);
      setSort('savings');
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
    // Liquor always opens at its 18+ notice rather than scrolling past it.
    const target = verticalParam === 'liquor' ? undefined : focus;
    pendingFocus.current = target ?? null;
    if (target && scrollToSection(target)) pendingFocus.current = null;
    else scrollRef.current?.scrollTo({ y: 0, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openedAt]);

  const openSearch = (query?: string) => router.push(query ? { pathname: '/search', params: { q: query } } : '/search');

  const renderControls = () => (
    <View style={styles.sortRow}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortTrack}>
        {isPharmacy
          ? PHARMACY_SCOPES.map(entry => (
              <Chip
                key={entry.key}
                label={entry.label}
                selected={scope === entry.key}
                onPress={() => setScope(entry.key)}
              />
            ))
          : SORT_CHIPS[vertical].map(chip => (
              <Chip
                key={chip.key}
                label={chip.label}
                icon={chip.icon}
                selected={sort === chip.key}
                onPress={() => setSort(chip.key)}
              />
            ))}
        <Chip
          label="Filters"
          icon="sliders"
          tone={filtersActive ? 'mint' : 'neutral'}
          onPress={() => setFiltersOpen(true)}
        />
      </ScrollView>
    </View>
  );

  return (
    <Screen scroll={false} padded={false} contentStyle={styles.screenBody}>
      <TopBar
        title="Categories"
        actions={
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Shopping at ${store.name}, change store`}
              onPress={() => setStoreSheetOpen(true)}
              hitSlop={6}
              style={styles.locationPill}
            >
              <Icon name="map-pin" size={14} color="primaryContainer" />
              <Txt variant="label" numberOfLines={1}>
                {store.name.replace('Xana Plus ', '')}
              </Txt>
            </Pressable>
            <TopBarAction name="bell" accessibilityLabel="Notifications" onPress={() => router.push('/(tabs)/profile')} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={user ? 'Your account' : 'Log in or sign up'}
              onPress={() => router.push(user ? '/(tabs)/profile' : '/login')}
              hitSlop={6}
              style={[styles.account, user ? styles.accountSignedIn : null]}
            >
              {user ? (
                <Txt variant="label" tint={colors.onPrimary}>
                  {user.name.charAt(0)}
                </Txt>
              ) : (
                <Icon name="user" size={18} color="onSurfaceVariant" />
              )}
            </Pressable>
          </>
        }
      />

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]}
        contentContainerStyle={styles.page}
      >
        <View style={[styles.inset, styles.searchSection]}>
          <SearchBar
            placeholder="Search bulk packs, groceries & drinks..."
            onPress={() => openSearch()}
            trailingIcon="scan"
            onTrailingPress={() => openSearch()}
          />
        </View>

        {/* Sticky vertical switcher: the body below always changes under it. */}
        <View style={styles.chipBar} onLayout={event => (chipBarHeight.current = event.nativeEvent.layout.height)}>
          <Segmented options={VERTICAL_OPTIONS} value={vertical} onChange={selectVertical} scrollable style={styles.chipTrack} />
        </View>

        {isLiquor ? (
          <View style={[styles.inset, styles.bannerSection]}>
            {/* Screen 3g stands the age notice in front of the aisle. */}
            <InfoBanner icon="shield" title={LIQUOR_NOTICE.title} subtitle={LIQUOR_NOTICE.body} />
          </View>
        ) : (
          <View style={[styles.inset, styles.bannerSection]}>
            <InfoBanner
              icon="pharmacy"
              title={PHARMACY_ADVICE.title}
              subtitle={PHARMACY_ADVICE.subtitle}
              subtitleTail={vertical === 'wholesale' ? PHARMACY_ADVICE.wholesaleSubtitle : undefined}
              onPress={() => (isPharmacy ? router.push('/(tabs)/pharmacy') : selectVertical('pharmacy'))}
            />
          </View>
        )}

        <View style={[styles.inset, styles.titleRow]}>
          <View style={styles.titleLeft}>
            <Txt variant="headlineLg">{definition.title}</Txt>
            {isLiquor ? <Chip label="18+" tone="amber" /> : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Browse all ${definition.label} products`}
            onPress={() => openSearch(definition.label)}
            hitSlop={8}
          >
            <Txt variant="label" color="primaryContainer">
              Browse all
            </Txt>
          </Pressable>
        </View>

        <View style={[styles.inset, styles.tiles]}>
          {definition.subcategories.map(tile => (
            <CategoryTile
              key={`${tile.slug}-${tile.name}`}
              name={tile.name}
              image={tile.image}
              size={tileSize}
              onPress={() => openSearch(tile.name)}
            />
          ))}
        </View>

        {renderControls()}

        {shelves.status !== 'ready' ? (
          <LoadState status={shelves.status} placeholder={showsGrid ? 'grid' : 'rail'} inset onRetry={shelves.retry} />
        ) : sections.length === 0 ? (
          <View style={styles.inset}>
            <EmptyState
              icon="filter"
              title="Nothing matches these filters"
              description={`No ${definition.label} product fits the filters you picked.`}
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
          sections.map(section => (
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
                  onAction={() => openSearch(section.title)}
                />
                <Txt variant="bodySm" color="onSurfaceVariant">
                  {section.subtitle}
                </Txt>
              </View>

              {showsGrid ? (
                <View style={[styles.inset, styles.grid]}>
                  {section.products.map(product => (
                    <GridCard
                      key={product.id}
                      product={product}
                      width={gridCardWidth}
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

        {vertical === 'wholesale' ? (
          <View style={[styles.inset, styles.deliveryBand]}>
            <View style={styles.deliveryGlyph}>
              <Icon name="delivery" size={20} color="warningDeep" />
            </View>
            <View style={styles.deliveryBody}>
              <Txt variant="titleLg">{WHOLESALE_DELIVERY.title}</Txt>
              <Txt variant="bodySm" color="onSurfaceVariant">
                {WHOLESALE_DELIVERY.body}
              </Txt>
            </View>
          </View>
        ) : null}
      </ScrollView>

      <BottomSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filters"
        description={`Narrow the ${definition.label} aisle before you add to cart.`}
        scrollable
        footer={
          <Button
            label={`Show ${visibleCount} ${visibleCount === 1 ? 'product' : 'products'}`}
            onPress={() => setFiltersOpen(false)}
          />
        }
      >
        <View style={styles.sheetGroup}>
          <Txt variant="titleLg">Availability</Txt>
          <SelectableOption
            title="In stock only"
            description="Hide the items the store has run out of"
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

        {filtersActive ? (
          <Button
            label="Reset filters"
            variant="ghost"
            onPress={() => {
              setInStockOnly(false);
              setPriceCap(null);
            }}
          />
        ) : null}
      </BottomSheet>

      <BottomSheet
        visible={storeSheetOpen}
        onClose={() => setStoreSheetOpen(false)}
        title="Shopping at"
        description="Pick the Xana Plus store that packs this order."
      >
        {stores.map(entry => (
          <SelectableOption
            key={entry.id}
            title={entry.name}
            description={`${entry.address} · ${entry.phone}`}
            indicator="radio"
            selected={entry.id === storeId}
            onPress={() => {
              setStoreId(entry.id);
              setStoreSheetOpen(false);
            }}
          />
        ))}
      </BottomSheet>
    </Screen>
  );
}

/** Mint advice strip: pharmacy guidance, or the liquor age notice standing in for it. */
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
      {onPress ? <Icon name="chevron-right" size={18} color="primaryContainer" /> : null}
    </>
  );

  return (
    <LinearGradient
      colors={[colors.mintPale, colors.surface]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.banner}
    >
      {onPress ? (
        <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={styles.bannerPress}>
          {body}
        </Pressable>
      ) : (
        <View style={styles.bannerPress}>{body}</View>
      )}
    </LinearGradient>
  );
}

/** Wholesale tier table: the frame prints both unit brackets under the price. */
function BulkTiers({ product }: { product: Product }) {
  const minQty = product.wholesaleMinQty ?? 1;
  const bulkPrice = product.wholesalePrice ?? product.price;

  return (
    <View style={styles.tiers}>
      <View style={[styles.tierRow, styles.tierRowBase]}>
        <Txt variant="bodySm" color="onSurfaceVariant">{`1 to ${Math.max(1, minQty - 1)} units`}</Txt>
        <Txt variant="titleSm">{`${formatKes(product.price)} each`}</Txt>
      </View>
      <View style={[styles.tierRow, styles.tierRowBulk]}>
        <Txt variant="label" color="primary">{`${minQty}+ units`}</Txt>
        <Txt variant="titleSm" color="primary">{`${formatKes(bulkPrice)} each`}</Txt>
      </View>
    </View>
  );
}

/** Deli, wholesale, pharmacy, liquor and beauty aisles scroll wide rail cards. */
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
  const image = figmaAsset(product.image);
  const badge = cardBadge(product, vertical);
  const savingNote =
    product.wasPrice && vertical !== 'wholesale' && vertical !== 'pharmacy'
      ? `Save ${formatKes(product.wasPrice - product.price)}${vertical === 'retail' || vertical === 'liquor' ? ' vs singles' : ''}`
      : undefined;
  const bulk = vertical === 'wholesale' && product.wholesalePrice && product.wholesaleMinQty ? product : undefined;
  const outOfStock = product.inStock === false;

  return (
    <View style={[styles.railCard, { width }]}>
      <View style={[styles.railImage, { height: width }]}>
        <ProductPhoto source={image} productId={product.id} accessibilityLabel={`${product.name} product photo`} variant="card" />
        <View style={styles.railBadges}>
          {badge ? <Badge label={badge.label} tone={badge.tone} /> : null}
          {product.rxRequired ? <Badge label="Rx Required" tone="brand" /> : null}
        </View>
        {vertical === 'liquor' ? (
          <View style={styles.railAge}>
            <Badge label="18+" tone="warning" />
          </View>
        ) : null}
      </View>

      {/* Card-wide tap target; a sibling of the stepper/add control, never its parent. */}
      <Pressable accessibilityRole="button" accessibilityLabel={product.name} onPress={onPress} style={styles.railOverlay} />

      <View style={styles.railBody}>
        <Txt variant="titleSm" numberOfLines={2}>
          {product.name}
        </Txt>
        {PACK_LINE_VERTICALS.includes(vertical) ? (
          <Txt variant="caption" color="outline" numberOfLines={1}>
            {product.pack}
          </Txt>
        ) : null}
        {vertical === 'pharmacy' ? (
          <Txt variant="bodySm" color="outline">
            Price
          </Txt>
        ) : null}

        <View style={styles.priceRow}>
          <Txt variant="priceLg">{formatKes(product.price)}</Txt>
          {!savingNote && product.wasPrice ? (
            <Txt variant="priceStrike" color="outline" style={styles.strike}>
              {formatKes(product.wasPrice)}
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
              <IconButton
                name="plus"
                accessibilityLabel={`Add ${product.name} to cart`}
                onPress={onAdd}
                size={34}
                iconSize={18}
                background={colors.primaryContainer}
                color="onPrimary"
              />
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
  onPress,
  onAdd,
}: {
  product: Product;
  width: number;
  quantity: number;
  savingNote?: string;
  onPress: () => void;
  onAdd: () => void;
}) {
  return (
    <View style={{ width }}>
      <ProductCard product={product} width={width} quantity={quantity} onPress={onPress} onAdd={onAdd} />
      {quantity > 0 ? (
        <Txt variant="labelSm" color="onSurfaceVariant" style={styles.gridQty}>
          {`${quantity} ${unitNoun(product)}`}
        </Txt>
      ) : null}
      {savingNote ? <NoticePill label={savingNote} tone="warning" style={styles.gridNote} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
  chipTrack: { paddingHorizontal: layout.screenMargin, gap: spacing.sm },

  /** Advice strip / age notice: 20pt margin, 12pt below the chip bar. */
  bannerSection: { paddingTop: spacing.sm },
  banner: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.mintEdge,
    ...elevation.hairline,
  },
  bannerPress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
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

  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.xxl,
  },
  titleLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },

  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: layout.gutter,
    rowGap: spacing.lg,
    marginTop: spacing.lg,
  },

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
    backgroundColor: colors.surfaceContainerLow,
  },
  railBadges: { position: 'absolute', top: spacing.sm, left: spacing.sm, right: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  railAge: { position: 'absolute', top: spacing.sm, right: spacing.sm },
  railBody: { gap: spacing.xs, padding: spacing.md },
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

  railFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.sm },
  railFooterEnd: { justifyContent: 'flex-end' },
  railStepper: { flex: 1, justifyContent: 'space-between' },

  deliveryBand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xxxl,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainerLow,
  },
  deliveryGlyph: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.amberTint15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deliveryBody: { flex: 1, gap: spacing.xxs },

  sheetGroup: { gap: spacing.md },
  sheetChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
