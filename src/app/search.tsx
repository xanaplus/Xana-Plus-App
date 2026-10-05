import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Animated, Linking, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Reanimated, { FadeInDown } from 'react-native-reanimated';

import {
  Badge,
  BottomSheet,
  Button,
  Chip,
  Divider,
  Icon,
  LoadState,
  QuantityStepper,
  Screen,
  SearchBar,
  Txt,
} from '@/components/ui';
import type { BadgeTone } from '@/components/ui';
import { popularSearches, shelfForTerm, stores, verticalForProduct } from '@/data/catalog';
import { figmaAsset } from '@/data/images';
import { fetchShelf, searchCatalogue, useLive } from '@/data/live-catalogue';
import type { CategoryVertical, Product, ProductBadge } from '@/data/types';
import { discountPercent, formatKesDecimal } from '@/lib/format';
import { useCart } from '@/store/cart';
import { useFulfilment } from '@/store/fulfilment';
import { colors, elevation, gradients, layout, radius, spacing } from '@/theme';

type SortBy = 'relevance' | 'price-asc' | 'price-desc' | 'newest';

const SORT_BY_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'newest', label: 'Newest' },
];

/** The six departments FR-B.1 defines — matches the Filter & Sort frame's chips. */
const DEPARTMENT_OPTIONS: { value: CategoryVertical; label: string }[] = [
  { value: 'groceries', label: 'Groceries' },
  { value: 'pharmacy', label: 'Pharmacy' },
  { value: 'deli', label: 'Deli' },
  { value: 'retail', label: 'Retail' },
  { value: 'wholesale', label: 'Wholesale' },
  { value: 'liquor', label: 'Liquor' },
];

type PriceBand = 'under-500' | '500-1500' | 'over-1500';

const PRICE_BANDS: { value: PriceBand; label: string; test: (price: number) => boolean }[] = [
  { value: 'under-500', label: 'Under KES 500', test: p => p < 500 },
  { value: '500-1500', label: 'KES 500 to 1,500', test: p => p >= 500 && p <= 1500 },
  { value: 'over-1500', label: 'Over KES 1,500', test: p => p > 1500 },
];

/** Opens blank; the Figma frame showed a sample "milk" query. */
const DEFAULT_QUERY = '';

/** Typing pauses this long before the catalogue is queried. */
const SEARCH_DEBOUNCE_MS = 250;
/** Most results one search returns; the catalogue has ~10,700 lines. */
const RESULT_LIMIT = 60;

const NO_RESULTS: Product[] = [];

type Department = 'grocery' | 'pharmacy';
type CategoryMeta = { label: string; aisle: string; department: Department };

/** Aisle and department behind every product category in the catalogue. */
const CATEGORY_META: Record<string, CategoryMeta> = {
  'fresh-produce': { label: 'Fresh Produce', aisle: 'Aisle 1 · Fresh', department: 'grocery' },
  'dairy-eggs': { label: 'Dairy & Eggs', aisle: 'Aisle 2 · Chilled', department: 'grocery' },
  'meat-poultry': { label: 'Meat & Poultry', aisle: 'Butchery counter', department: 'grocery' },
  'cooking-oil': { label: 'Cooking Oil', aisle: 'Aisle 3 · Pantry', department: 'grocery' },
  'rice-grains': { label: 'Rice & Grains', aisle: 'Aisle 3 · Pantry', department: 'grocery' },
  'sugar-baking': { label: 'Sugar & Baking', aisle: 'Aisle 3 · Pantry', department: 'grocery' },
  snacks: { label: 'Snacks', aisle: 'Aisle 4 · Pantry', department: 'grocery' },
  beverages: { label: 'Beverages', aisle: 'Aisle 5 · Drinks', department: 'grocery' },
  'frozen-foods': { label: 'Frozen Foods', aisle: 'Aisle 6 · Frozen', department: 'grocery' },
  household: { label: 'Household', aisle: 'Aisle 7 · Household', department: 'grocery' },
  'cleaning-products': { label: 'Cleaning Products', aisle: 'Aisle 7 · Household', department: 'grocery' },
  liquor: { label: 'Liquor', aisle: 'Aisle 8 · Liquor store', department: 'grocery' },
  rotisserie: { label: 'Rotisserie & Hot Foods', aisle: 'Deli hot counter', department: 'grocery' },
  'cheese-counter': { label: 'Cheese Counter', aisle: 'Deli cheese counter', department: 'grocery' },
  'cold-cuts': { label: 'Cold Cuts & Cured Meats', aisle: 'Deli cold cuts', department: 'grocery' },
  'olives-antipasti': { label: 'Olives & Antipasti', aisle: 'Deli antipasti', department: 'grocery' },
  'pain-relief': { label: 'Pain Relief', aisle: 'Pharmacist counter', department: 'pharmacy' },
  'vitamins-supplements': { label: 'Vitamins & Supplements', aisle: 'Pharmacist counter', department: 'pharmacy' },
  'digestive-health': { label: 'Digestive Health', aisle: 'Pharmacist counter', department: 'pharmacy' },
  'first-aid': { label: 'First Aid', aisle: 'Pharmacist counter', department: 'pharmacy' },
  'baby-health': { label: 'Baby Health', aisle: 'Pharmacist counter', department: 'pharmacy' },
  'personal-care': { label: 'Personal Care', aisle: 'Pharmacist counter', department: 'pharmacy' },
  'wellness-devices': { label: 'Wellness Devices', aisle: 'Pharmacist counter', department: 'pharmacy' },
  // Categories the Business Central catalogue files items under.
  bakery: { label: 'Bakery', aisle: 'Aisle 1 · Bakery', department: 'grocery' },
  staples: { label: 'Staples & Cereals', aisle: 'Aisle 3 · Pantry', department: 'grocery' },
  spices: { label: 'Spices & Flavours', aisle: 'Aisle 3 · Pantry', department: 'grocery' },
  'home-care': { label: 'Home Care', aisle: 'Aisle 7 · Household', department: 'grocery' },
  'tissue-sanitary': { label: 'Tissue & Sanitary', aisle: 'Aisle 7 · Household', department: 'grocery' },
  'baby-products': { label: 'Baby Products', aisle: 'Aisle 9 · Baby', department: 'grocery' },
  'books-stationery': { label: 'Books & Stationery', aisle: 'Aisle 10 · Stationery', department: 'grocery' },
  'general-merchandise': { label: 'General Merchandise', aisle: 'Aisle 10 · General', department: 'grocery' },
  'beauty-personal-care': { label: 'Beauty & Hair', aisle: 'Aisle 11 · Beauty', department: 'grocery' },
  'oral-care': { label: 'Oral Care', aisle: 'Aisle 11 · Beauty', department: 'grocery' },
  'skin-care': { label: 'Skin & Dermatology', aisle: 'Pharmacist counter', department: 'pharmacy' },
  medicines: { label: 'Medicines', aisle: 'Pharmacist counter', department: 'pharmacy' },
  'otc-medicines': { label: 'Over the Counter', aisle: 'Pharmacist counter', department: 'pharmacy' },
  'chronic-care': { label: 'Chronic Care', aisle: 'Pharmacist counter', department: 'pharmacy' },
  'controlled-medicines': { label: 'Controlled Medicines', aisle: 'Pharmacist counter', department: 'pharmacy' },
};

/** The two search departments, in the order the frame stacks them. */
const DEPARTMENTS: { id: Department; title: string; subLabel?: string }[] = [
  { id: 'grocery', title: 'GROCERIES & DAIRY' },
  { id: 'pharmacy', title: 'PHARMACY & WELLNESS', subLabel: 'Dispatched from Licensed Pharmacist counter' },
];

/**
 * Aisles that ride the 30-minute express run. Pharmacy lines are dispensed at
 * the licensed pharmacist counter and depot-picked bulk cartons are excluded.
 */
const EXPRESS_AISLES: Record<string, true> = {
  'fresh-produce': true,
  'dairy-eggs': true,
  'meat-poultry': true,
  'cooking-oil': true,
  'rice-grains': true,
  'sugar-baking': true,
  snacks: true,
  beverages: true,
  'frozen-foods': true,
  household: true,
  'cleaning-products': true,
  liquor: true,
  rotisserie: true,
  'cheese-counter': true,
  'cold-cuts': true,
  'olives-antipasti': true,
  bakery: true,
  staples: true,
  spices: true,
  'home-care': true,
  'tissue-sanitary': true,
};

/** Each suggestion chip searches the catalogue term behind its design label. */
const SUGGESTION_TERMS: Record<string, string> = {
  'Fresh Milk': 'Milk',
  'Farm Bread': 'Bakery',
  'Basmati Rice': 'Rice',
  'Paracetamol 500mg': 'Panadol',
  'Hass Avocado': 'Avocado',
  'Hand Wash': 'Wash',
};

const BADGE_TONE: Record<ProductBadge, BadgeTone> = {
  discount: 'discount',
  fresh: 'fresh',
  new: 'new',
  organic: 'info',
  bulk: 'warning',
};

const BADGE_LABEL: Record<ProductBadge, string> = {
  discount: 'SAVE',
  fresh: 'FRESH',
  new: 'NEW',
  organic: 'ORGANIC',
  bulk: 'BULK',
};

type ResultGroup = { id: string; title: string; subLabel: string; pharmacy: boolean; items: Product[] };

const humanise = (slug: string): string =>
  slug
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

/** Aisle metadata for a category, falling back to its slug. */
const categoryMeta = (slug: string): CategoryMeta =>
  CATEGORY_META[slug] ?? { label: humanise(slug), aisle: 'In-store aisles', department: 'grocery' };

/** Unique values, keeping first-seen order. */
const distinct = (values: string[]): string[] => values.filter((value, index) => values.indexOf(value) === index);

/** Groups hits by department, matching the frame. */
const buildGroups = (items: Product[]): ResultGroup[] => {
  return DEPARTMENTS.flatMap(department => {
    const group = items.filter(product => categoryMeta(product.category).department === department.id);
    if (group.length === 0) return [];
    return [
      {
        id: department.id,
        title: `${department.title} (${group.length})`,
        subLabel: department.subLabel ?? distinct(group.map(product => categoryMeta(product.category).aisle)).join(', '),
        pharmacy: department.id === 'pharmacy',
        items: group,
      },
    ];
  });
};

/**
 * Screen 12 — Search Results, plus Screen 12b — the empty state it falls back
 * to when a query matches nothing in the catalogue.
 */
export default function SearchRoute() {
  const router = useRouter();
  const cart = useCart();
  const { store } = useFulfilment();
  const { width } = useWindowDimensions();
  // Arriving from a category tile prefills the field (e.g. /search?q=Cooking Oil).
  const { q } = useLocalSearchParams<{ q?: string }>();
  const [query, setQuery] = useState(typeof q === "string" && q.trim() ? q : DEFAULT_QUERY);
  /** Bumped by the mic affordance to re-focus the field (voice search is mocked). */
  const [fieldKey, setFieldKey] = useState(0);

  const [filterOpen, setFilterOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>('relevance');
  const [departments, setDepartments] = useState<CategoryVertical[]>([]);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [expressOnly, setExpressOnly] = useState(false);
  const [priceBand, setPriceBand] = useState<PriceBand | null>(null);

  const trimmed = query.trim();
  const hasQuery = trimmed.length > 0;

  const [settled, setSettled] = useState(trimmed);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(trimmed), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed]);

  // A name the app links here (tile, aisle, "See All") opens that shelf; anything typed is a text search.
  const live = useLive(
    `search:${settled.toLowerCase()}`,
    () => {
      const shelf = shelfForTerm(settled);
      return shelf ? fetchShelf({ ...shelf, limit: RESULT_LIMIT }) : searchCatalogue(settled, RESULT_LIMIT);
    },
    NO_RESULTS,
  );
  const searching = settled !== trimmed || live.status === 'loading';
  const base = live.data;

  const activeFilterCount =
    departments.length + (inStockOnly ? 1 : 0) + (expressOnly ? 1 : 0) + (priceBand ? 1 : 0) + (sortBy !== 'relevance' ? 1 : 0);

  const clearFilters = () => {
    setSortBy('relevance');
    setDepartments([]);
    setInStockOnly(false);
    setExpressOnly(false);
    setPriceBand(null);
  };

  const toggleDepartment = (value: CategoryVertical) =>
    setDepartments(current => (current.includes(value) ? current.filter(v => v !== value) : [...current, value]));

  const results = useMemo(() => {
    const band = priceBand ? PRICE_BANDS.find(b => b.value === priceBand) : null;
    const filtered = base.filter(product => {
      if (departments.length > 0 && !departments.includes(verticalForProduct(product))) return false;
      if (inStockOnly && product.inStock === false) return false;
      if (expressOnly && (product.inStock === false || EXPRESS_AISLES[product.category] !== true)) return false;
      if (band && !band.test(product.price)) return false;
      return true;
    });

    if (sortBy === 'price-asc') return [...filtered].sort((a, b) => a.price - b.price);
    if (sortBy === 'price-desc') return [...filtered].sort((a, b) => b.price - a.price);
    if (sortBy === 'newest') return [...filtered].sort((a, b) => (b.badges?.includes('new') ? 1 : 0) - (a.badges?.includes('new') ? 1 : 0));
    return filtered;
  }, [base, sortBy, departments, inStockOnly, expressOnly, priceBand]);

  const groups = useMemo(() => buildGroups(results), [results]);

  const contentWidth = Math.min(width, layout.maxContentWidth) - layout.screenMargin * 2;
  const tileWidth = (contentWidth - layout.gutter) / 2;
  const storeShortName = store.name.replace('Xana Plus ', '');

  return (
    <Screen
      topInsetColor={colors.background}
      scroll={false}
      padded={false}
      contentStyle={styles.screenBody}
      footer={
        <View style={styles.cartBar}>
          <View style={styles.cartCount}>
            <Txt variant="label" tint={colors.onSecondary}>
              {cart.itemCount}
            </Txt>
          </View>
          <View style={styles.cartCopy}>
            <Txt variant="titleSm" tint={colors.inverseOnSurface} numberOfLines={1}>
              {formatKesDecimal(cart.summary.total)}
            </Txt>
            <Txt variant="caption" tint={colors.white70} numberOfLines={1}>
              {`${cart.itemCount} ${cart.itemCount === 1 ? 'item' : 'items'} in cart · ${storeShortName}`}
            </Txt>
          </View>
          <Button
            label="View Cart"
            icon="arrow-right"
            size="sm"
            fullWidth={false}
            onPress={() => router.push('/(tabs)/cart')}
          />
        </View>
      }
    >
      <View style={styles.header}>
        <View style={styles.inputRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            hitSlop={8}
            style={styles.back}
          >
            <Icon name="chevron-left" size={20} color="onSurface" />
          </Pressable>
          <View style={styles.inputWrap}>
            <SearchBar
              key={fieldKey}
              value={query}
              onChangeText={setQuery}
              placeholder="Search groceries, meds & more"
              autoFocus
              style={styles.field}
              trailingIcon={hasQuery ? 'close' : 'mic'}
              onTrailingPress={hasQuery ? () => setQuery('') : () => setFieldKey(key => key + 1)}
            />
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Filter and sort"
          onPress={() => setFilterOpen(true)}
          style={styles.filterTrigger}
        >
          <Icon name="sort" size={16} color="onSurfaceVariant" />
          <Txt variant="label">Filter & Sort</Txt>
          {activeFilterCount > 0 ? (
            <View style={styles.filterCount}>
              <Txt variant="micro" tint={colors.onPrimary}>
                {activeFilterCount}
              </Txt>
            </View>
          ) : null}
        </Pressable>

        <View style={styles.meta}>
          <Txt variant="caption" color="outline" numberOfLines={1} style={styles.metaText}>
            {!hasQuery
              ? 'Start typing to search the catalogue'
              : searching
                ? `Searching for "${trimmed}"…`
                : `Showing ${results.length} results for "${trimmed}"`}
          </Txt>
          <View style={styles.storeChip}>
            <View style={styles.storeDot} />
            <Txt variant="labelSm" color="onSurfaceVariant" numberOfLines={1}>
              {store.name}
            </Txt>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.feed}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.feedBody}
      >
        {hasQuery && searching ? (
          <ResultsSkeleton tileWidth={tileWidth} />
        ) : hasQuery && live.status === 'error' ? (
          <LoadState status="error" onRetry={live.retry} />
        ) : results.length === 0 ? (
          <>
            {hasQuery ? <NoResults query={trimmed} matched={base.length} /> : null}
            <PopularSearches onPick={label => setQuery(SUGGESTION_TERMS[label] ?? label)} />
            <ContactBranch store={store} />
          </>
        ) : (
          groups.map(group => (
            <View key={group.id} style={styles.group}>
              {group.pharmacy ? (
                <LinearGradient
                  colors={gradients.mpesa}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.rxPanel}
                >
                  <View style={styles.rxGlyph}>
                    <Icon name="prescription" size={18} color="onPrimary" />
                  </View>
                  <View style={styles.rxCopy}>
                    <Txt variant="overline" color="primary" numberOfLines={2}>
                      {group.title}
                    </Txt>
                    <Txt variant="caption" color="onSurfaceVariant">
                      {group.subLabel}
                    </Txt>
                  </View>
                  <View style={styles.ppb}>
                    <Txt variant="labelSm" color="primaryContainer" numberOfLines={1}>
                      PPB Verified
                    </Txt>
                  </View>
                </LinearGradient>
              ) : (
                <View style={styles.groupHead}>
                  <Txt variant="overline" color="primary" numberOfLines={2} style={styles.groupTitle}>
                    {group.title}
                  </Txt>
                  <View style={styles.aislePill}>
                    <Txt variant="labelSm" color="onSuccessContainer" numberOfLines={1}>
                      {group.subLabel}
                    </Txt>
                  </View>
                </View>
              )}

              <View style={styles.grid}>
                {group.items.map((product, index) => (
                  // Results rise into place one after another; capped so long lists don't lag.
                  <Reanimated.View key={product.id} entering={FadeInDown.duration(260).delay(Math.min(index, 8) * 40)}>
                  <ResultTile
                    product={product}
                    width={tileWidth}
                    quantity={cart.quantityOf(product.id)}
                    onPress={() => router.push(`/product/${product.id}`)}
                    onAdd={() => cart.add(product.id)}
                    onIncrement={() => cart.increment(product.id)}
                    onDecrement={() => cart.decrement(product.id)}
                  />
                  </Reanimated.View>
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <BottomSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filter & Sort"
        description={activeFilterCount > 0 ? `${activeFilterCount} active` : undefined}
        scrollable
        footer={
          <View style={styles.filterFooter}>
            <Button label="Clear all" variant="outline" style={styles.flex} onPress={clearFilters} />
            <Button label={`Show ${results.length} results`} style={styles.flex} onPress={() => setFilterOpen(false)} />
          </View>
        }
      >
        <View style={styles.filterSection}>
          <Txt variant="overline" color="onSurfaceVariant">SORT BY</Txt>
          <View style={styles.filterChips}>
            {SORT_BY_OPTIONS.map(option => (
              <Chip key={option.value} label={option.label} selected={sortBy === option.value} onPress={() => setSortBy(option.value)} />
            ))}
          </View>
        </View>

        <Divider />

        <View style={styles.filterSection}>
          <Txt variant="overline" color="onSurfaceVariant">DEPARTMENT</Txt>
          <View style={styles.filterChips}>
            {DEPARTMENT_OPTIONS.map(option => {
              const count = base.filter(product => verticalForProduct(product) === option.value).length;
              if (count === 0) return null;
              return (
                <Chip
                  key={option.value}
                  label={`${option.label} (${count})`}
                  selected={departments.includes(option.value)}
                  onPress={() => toggleDepartment(option.value)}
                />
              );
            })}
          </View>
        </View>

        <Divider />

        <View style={styles.filterSection}>
          <Txt variant="overline" color="onSurfaceVariant">AVAILABILITY & SPEED</Txt>
          <View style={styles.filterChips}>
            <Chip label="In stock only" selected={inStockOnly} onPress={() => setInStockOnly(v => !v)} />
            <Chip label="Express delivery only" selected={expressOnly} onPress={() => setExpressOnly(v => !v)} />
          </View>
        </View>

        <Divider />

        <View style={styles.filterSection}>
          <Txt variant="overline" color="onSurfaceVariant">PRICE RANGE</Txt>
          <View style={styles.filterChips}>
            {PRICE_BANDS.map(band => (
              <Chip
                key={band.value}
                label={band.label}
                selected={priceBand === band.value}
                onPress={() => setPriceBand(current => (current === band.value ? null : band.value))}
              />
            ))}
          </View>
        </View>
      </BottomSheet>
    </Screen>
  );
}

/** Two-column result tile: artwork, aisle eyebrow, name, pack, price and add. */
const SKELETON_TILES = 4;

/**
 * Grey stand-ins shaped like one group of results (header, then product tiles),
 * gently pulsing while a search runs, so the page doesn't jump when results land.
 */
function ResultsSkeleton({ tileWidth }: { tileWidth: number }) {
  const [pulse] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.85, duration: 750, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulse, { toValue: 0.5, duration: 750, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      accessible
      accessibilityLabel="Loading results"
      accessibilityRole="progressbar"
      style={[styles.group, { opacity: pulse }]}
    >
      <View style={styles.groupHead}>
        <View style={[styles.skeletonBar, { width: '45%', height: 14 }]} />
        <View style={[styles.skeletonBar, { width: 72, height: 20, borderRadius: radius.pill }]} />
      </View>
      <View style={styles.grid}>
        {Array.from({ length: SKELETON_TILES }, (_, index) => (
          <View key={index} style={[styles.skeletonTile, { width: tileWidth }]}>
            <View style={[styles.tileArt, styles.skeletonArt]} />
            <View style={[styles.skeletonBar, { width: '40%', height: 10 }]} />
            <View style={[styles.skeletonBar, { width: '90%', height: 14 }]} />
            <View style={[styles.skeletonBar, { width: '60%', height: 14 }]} />
            <View style={styles.skeletonFoot}>
              <View style={[styles.skeletonBar, { width: '45%', height: 18 }]} />
              <View style={[styles.skeletonBar, { width: 34, height: 34, borderRadius: radius.pill }]} />
            </View>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

function ResultTile({
  product,
  width,
  quantity,
  onPress,
  onAdd,
  onIncrement,
  onDecrement,
}: {
  product: Product;
  width: number;
  quantity: number;
  onPress: () => void;
  onAdd: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  const badge = product.badges?.[0];
  const image = figmaAsset(product.image);

  return (
    <View style={[styles.tile, { width }]}>
      <View style={styles.tileArt}>
        {image ? (
          <Image source={image} style={styles.tileImage} contentFit="cover" transition={120} />
        ) : (
          <View style={styles.noPhoto}>
            <Icon name="store" size={28} color="outlineVariant" />
          </View>
        )}
        {badge ? (
          <View style={styles.tileBadge}>
            <Badge
              label={
                badge === 'discount' && product.wasPrice
                  ? `SAVE ${discountPercent(product.price, product.wasPrice)}%`
                  : BADGE_LABEL[badge]
              }
              tone={BADGE_TONE[badge]}
            />
          </View>
        ) : null}
      </View>

      <Txt variant="labelSm" color="outline" numberOfLines={1}>
        {categoryMeta(product.category).label}
      </Txt>
      <Txt variant="titleSm" numberOfLines={2} style={styles.tileName}>
        {product.name}
      </Txt>
      <Txt variant="caption" color="outline" numberOfLines={1}>
        {product.pack}
      </Txt>

      {/* Card-wide tap target; a sibling of the add control, never its parent. */}
      <Pressable accessibilityRole="button" accessibilityLabel={product.name} onPress={onPress} style={styles.tileOverlay} />

      <View style={styles.tileFoot}>
        <Txt variant="titleLg" numberOfLines={1} style={styles.tilePrice}>
          {formatKesDecimal(product.price)}
        </Txt>
        {product.inStock === false ? (
          <Txt variant="labelSm" color="outline">
            Out of stock
          </Txt>
        ) : quantity > 0 ? (
          <QuantityStepper
            quantity={quantity}
            onIncrement={onIncrement}
            onDecrement={onDecrement}
            size="compact"
            tone="brand"
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Add ${product.name} to cart`}
            onPress={onAdd}
            hitSlop={6}
            style={styles.addButton}
          >
            <Icon name="plus" size={18} color="onPrimary" />
          </Pressable>
        )}
      </View>
    </View>
  );
}

/**
 * Screen 12b — the no-match block: badge with a zero counter, heading and help.
 * `matched` is how many hits the query had before the active chip filtered them
 * out, which switches the copy from "nothing matched" to "nothing fits the filter".
 */
function NoResults({ query, matched }: { query: string; matched: number }) {
  const filteredOut = matched > 0;

  return (
    <View style={styles.empty}>
      <View style={styles.emptyBadge}>
        <View style={styles.emptyIcon}>
          <Icon name="search" size={30} color="primaryContainer" />
        </View>
        <View style={styles.emptyCount}>
          <Txt variant="micro" tint={colors.onPrimary}>
            0
          </Txt>
        </View>
      </View>
      <Txt variant="headline" align="center">
        {filteredOut ? 'No matches with these filters' : `No results for '${query}'`}
      </Txt>
      <Txt variant="bodySm" color="onSurfaceVariant" align="center" style={styles.emptyBody}>
        {filteredOut
          ? `We found ${matched} ${matched === 1 ? 'result' : 'results'} for "${query}", but none fit the chip you picked. Choose another filter to see them.`
          : `We couldn't find matches for "${query}". Try checking your spelling or searching for a broader term in groceries or pharmacy.`}
      </Txt>
    </View>
  );
}

/** Quick suggestions card shared by the empty state. */
function PopularSearches({ onPick }: { onPick: (label: string) => void }) {
  return (
    <View style={styles.popular}>
      <View style={styles.popularHead}>
        <Txt variant="overline">POPULAR SEARCHES</Txt>
        <Txt variant="labelSm" color="outline">
          Quick suggestions
        </Txt>
      </View>
      <View style={styles.popularChips}>
        {popularSearches.map(entry => (
          <Chip
            key={entry.label}
            label={`${entry.emoji} ${entry.label}`}
            tone="outline"
            onPress={() => onPick(entry.label)}
          />
        ))}
      </View>
    </View>
  );
}

/** "Can't find your item?" — dials the branch the shopper is shopping from. */
function ContactBranch({ store }: { store: (typeof stores)[number] }) {
  const branch = store.name.replace('Xana Plus ', '');

  return (
    <View style={styles.help}>
      <Txt variant="caption" color="onSurfaceVariant">
        {"Can't find your item?"}
      </Txt>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Call ${store.name} on ${store.phone}`}
        onPress={() => {
          void Linking.openURL(`tel:${store.phone.replace(/\s/g, '')}`);
        }}
        hitSlop={8}
        style={styles.helpLink}
      >
        <Txt variant="labelSm">{`Contact ${branch} Branch`}</Txt>
        <Txt variant="caption" color="primaryContainer">
          {`(${store.phone})`}
        </Txt>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screenBody: { paddingTop: spacing.none, paddingBottom: spacing.none },

  header: {
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surfaceContainerHigh,
    ...elevation.stickyTop,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHigh,
  },
  inputWrap: { flex: 1 },
  field: { height: 44, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.primaryContainer },
  filterTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    marginHorizontal: layout.screenMargin,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHigh,
    backgroundColor: colors.surface,
  },
  filterCount: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterFooter: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  filterSection: { gap: spacing.sm, paddingVertical: spacing.md },
  filterChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: layout.screenMargin,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceContainerLow,
  },
  metaText: { flexShrink: 1 },
  storeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 22,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.xs,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHigh,
  },
  storeDot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: colors.success },

  feed: { flex: 1 },
  feedBody: { paddingHorizontal: layout.screenMargin, paddingTop: spacing.lg, paddingBottom: spacing.xl, gap: spacing.xxl },

  group: { gap: spacing.md },
  groupHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  groupTitle: { flexShrink: 1 },
  // A group spanning several aisles makes a long label; cap it so it truncates instead of running off screen.
  aislePill: {
    flexShrink: 1,
    maxWidth: '55%',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.mintSubtle,
    borderWidth: 1,
    borderColor: colors.mintEdge,
  },
  rxPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.mintEdge,
  },
  rxGlyph: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rxCopy: { flex: 1, gap: spacing.xxs },
  ppb: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.white95,
    borderWidth: 1,
    borderColor: colors.mintEdge,
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: layout.gutter },
  tile: {
    padding: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.outlineSoft30,
    gap: spacing.xs,
    ...elevation.card,
  },
  tileArt: {
    height: 132,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceContainerLow,
    marginBottom: spacing.sm,
  },
  tileImage: { width: '100%', height: '100%' },
  noPhoto: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Placeholders stay faint: no shadow, a hairline edge and the palest grey.
  skeletonTile: {
    padding: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.outlineSoft30,
    gap: spacing.xs,
  },
  skeletonArt: { backgroundColor: colors.surfaceContainerLow },
  skeletonBar: { borderRadius: radius.sm, backgroundColor: colors.surfaceContainerLow },
  skeletonFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  tileBadge: { position: 'absolute', top: spacing.sm, left: spacing.sm },
  tileName: { minHeight: 38 },
  tileOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  tileFoot: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: spacing.sm,
    rowGap: spacing.sm,
    marginTop: spacing.xs,
  },
  /** Keeps "KES 1,280.00" intact; the stepper wraps under it rather than squeezing. */
  tilePrice: { flexShrink: 0 },
  addButton: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.hairline,
  },

  empty: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.xxl, paddingBottom: spacing.lg },
  emptyBadge: { width: 92, height: 92, alignItems: 'flex-end', justifyContent: 'flex-start' },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: radius.pill,
    backgroundColor: colors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCount: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 22,
    height: 22,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBody: { maxWidth: 290 },

  popular: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.surfaceContainer,
  },
  popularHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  popularChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

  help: { alignItems: 'center', gap: spacing.xs, paddingTop: spacing.md },
  helpLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap', justifyContent: 'center' },

  cartBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.onSurface,
  },
  cartCount: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.secondaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartCopy: { flex: 1, gap: spacing.xxs },
});
