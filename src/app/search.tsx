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
import { ProductPhoto } from '@/components/ui/product-photo';
import { popularSearches, shelfForTerm, stores, verticalForProduct } from '@/data/catalog';
import { figmaAsset } from '@/data/images';
import { fetchShelf, searchCatalogue, useLive } from '@/data/live-catalogue';
import type { PriceBand, ResultOptions, ResultSort } from '@/data/live-catalogue';
import type { CategoryVertical, Product, ProductBadge } from '@/data/types';
import { discountPercent, formatKes } from '@/lib/format';
import { useCart } from '@/store/cart';
import { useFulfilment } from '@/store/fulfilment';
import { colors, elevation, layout, radius, spacing } from '@/theme';
import { useTheme, useThemeStyles } from '@/theme/provider';
import type { Palette } from '@/theme';

type SortBy = ResultSort;

/** BC has no "new" flag, so there is no Newest. */
const SORT_BY_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
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

const PRICE_BANDS: { value: PriceBand; label: string }[] = [
  { value: 'under-500', label: 'Under KES 500' },
  { value: '500-1500', label: 'KES 500 to 1,500' },
  { value: 'over-1500', label: 'Over KES 1,500' },
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
  'skin-care': { label: 'Cosmetics & Beauty', aisle: 'Pharmacist counter', department: 'pharmacy' },
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
  const { colors, gradients } = useTheme();
  const styles = useThemeStyles(createStyles);
  const router = useRouter();
  const cart = useCart();
  const { store } = useFulfilment();
  const { width } = useWindowDimensions();
  const [feedWidth, setFeedWidth] = useState<number | null>(null);
  // Arriving from a category tile prefills the field (e.g. /search?q=Cooking Oil).
  const { q } = useLocalSearchParams<{ q?: string }>();
  const arrivedWithQuery = typeof q === "string" && q.trim() !== "";
  const [query, setQuery] = useState(arrivedWithQuery ? q : DEFAULT_QUERY);
  /** Bumped by the mic affordance to re-focus the field (voice search is mocked). */
  const [fieldKey, setFieldKey] = useState(0);

  const [filterOpen, setFilterOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>('relevance');
  const [departments, setDepartments] = useState<CategoryVertical[]>([]);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [noRx, setNoRx] = useState(false);
  const [priceBand, setPriceBand] = useState<PriceBand | null>(null);

  const trimmed = query.trim();
  const hasQuery = trimmed.length > 0;

  const [settled, setSettled] = useState(trimmed);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(trimmed), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed]);

  // A name the app links here (tile, aisle, "See All") opens that shelf; anything typed is a text search.
  // Shelves only ever hold in-stock items, so "In stock only" is offered for typed searches alone.
  const shelf = shelfForTerm(settled);
  const options: ResultOptions = { sort: sortBy, priceBand, inStockOnly: inStockOnly && !shelf, noRx };
  const live = useLive(
    `search:${settled.toLowerCase()}:${JSON.stringify(options)}`,
    () => (shelf ? fetchShelf({ ...shelf, limit: RESULT_LIMIT }, options) : searchCatalogue(settled, RESULT_LIMIT, options)),
    NO_RESULTS,
  );
  const searching = settled !== trimmed || live.status === 'loading';
  const base = live.data;

  const activeFilterCount =
    departments.length + (inStockOnly && !shelf ? 1 : 0) + (noRx ? 1 : 0) + (priceBand ? 1 : 0) + (sortBy !== 'relevance' ? 1 : 0);

  const clearFilters = () => {
    setSortBy('relevance');
    setDepartments([]);
    setInStockOnly(false);
    setNoRx(false);
    setPriceBand(null);
  };

  const toggleDepartment = (value: CategoryVertical) =>
    setDepartments(current => (current.includes(value) ? current.filter(v => v !== value) : [...current, value]));

  // Sort, price, stock and prescription are applied by the database; departments narrow what came back.
  const results = useMemo(
    () => (departments.length > 0 ? base.filter(product => departments.includes(verticalForProduct(product))) : base),
    [base, departments],
  );
  // Only worth offering when the results span departments; no counts, as they would only cover the loaded page.
  const presentDepartments = useMemo(
    () => DEPARTMENT_OPTIONS.filter(option => base.some(product => verticalForProduct(product) === option.value)),
    [base],
  );
  const sortLabel = SORT_BY_OPTIONS.find(option => option.value === sortBy)?.label ?? 'Sort';
  const priceLabel = PRICE_BANDS.find(band => band.value === priceBand)?.label;

  const groups = useMemo(() => buildGroups(results), [results]);

  // Browser display scaling can make the feed narrower than window dimensions.
  // Round down with one pixel of slack so fractional sizing cannot wrap column two.
  const contentWidth = Math.min(width, feedWidth ?? width, layout.maxContentWidth) - layout.screenMargin * 2;
  const tileWidth = Math.max(1, Math.floor((contentWidth - layout.gutter - 1) / 2));
  const storeShortName = store.name.replace('Xana Plus ', '');

  return (
    <Screen
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
              {formatKes(cart.summary.total)}
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
              // Results first when a tile or See All brought a query; the keyboard only for typing.
              autoFocus={!arrivedWithQuery || fieldKey > 0}
              style={styles.field}
              trailingIcon={hasQuery ? 'close' : 'mic'}
              onTrailingPress={hasQuery ? () => setQuery('') : () => setFieldKey(key => key + 1)}
            />
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={styles.quickRow}
          contentContainerStyle={styles.quickTrack}
        >
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
          {/* Quick filters: an active one shows a cross and clears on tap; Sort and Price open the sheet to choose. */}
          <Chip
            label={sortBy === 'relevance' ? 'Sort' : sortLabel}
            icon={sortBy === 'relevance' ? undefined : 'close'}
            selected={sortBy !== 'relevance'}
            onPress={() => (sortBy === 'relevance' ? setFilterOpen(true) : setSortBy('relevance'))}
          />
          <Chip
            label={priceLabel ?? 'Price'}
            icon={priceLabel ? 'close' : undefined}
            selected={!!priceLabel}
            onPress={() => (priceLabel ? setPriceBand(null) : setFilterOpen(true))}
          />
          {!shelf ? (
            <Chip label="In stock" icon={inStockOnly ? 'close' : undefined} selected={inStockOnly} onPress={() => setInStockOnly(v => !v)} />
          ) : null}
          <Chip label="No prescription needed" icon={noRx ? 'close' : undefined} selected={noRx} onPress={() => setNoRx(v => !v)} />
          {departments.map(value => (
            <Chip
              key={value}
              label={DEPARTMENT_OPTIONS.find(option => option.value === value)?.label ?? value}
              icon="close"
              selected
              onPress={() => toggleDepartment(value)}
            />
          ))}
        </ScrollView>

        <View style={styles.meta}>
          <Txt variant="caption" color="outline" numberOfLines={1} style={styles.metaText}>
            {!hasQuery
              ? 'Start typing to search the catalogue'
              : searching
                ? `Searching for "${trimmed}"…`
                : base.length >= RESULT_LIMIT
                  ? `Showing the first ${results.length} for "${trimmed}"`
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
        onLayout={event => {
          if (event.nativeEvent.layout.width > 0) setFeedWidth(event.nativeEvent.layout.width);
        }}
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
            {hasQuery ? <NoResults query={trimmed} filtered={activeFilterCount > 0} onClear={clearFilters} /> : null}
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
                    <Txt variant="overline" color="primaryAccent" numberOfLines={2}>
                      {group.title}
                    </Txt>
                    <Txt variant="caption" color="onSurfaceVariant">
                      {group.subLabel}
                    </Txt>
                  </View>
                  <View style={styles.ppb}>
                    <Txt variant="labelSm" color="primaryAccent" numberOfLines={1}>
                      PPB Verified
                    </Txt>
                  </View>
                </LinearGradient>
              ) : (
                <View style={styles.groupHead}>
                  <Txt variant="overline" color="primaryAccent" numberOfLines={2} style={styles.groupTitle}>
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

        {presentDepartments.length > 1 ? (
          <>
            <View style={styles.filterSection}>
              <Txt variant="overline" color="onSurfaceVariant">DEPARTMENT</Txt>
              <View style={styles.filterChips}>
                {presentDepartments.map(option => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    selected={departments.includes(option.value)}
                    onPress={() => toggleDepartment(option.value)}
                  />
                ))}
              </View>
            </View>

            <Divider />
          </>
        ) : null}

        <View style={styles.filterSection}>
          <Txt variant="overline" color="onSurfaceVariant">AVAILABILITY</Txt>
          <View style={styles.filterChips}>
            {!shelf ? <Chip label="In stock only" selected={inStockOnly} onPress={() => setInStockOnly(v => !v)} /> : null}
            <Chip label="No prescription needed" selected={noRx} onPress={() => setNoRx(v => !v)} />
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
  const styles = useThemeStyles(createStyles);
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
  const styles = useThemeStyles(createStyles);
  const badge = product.badges?.[0];
  const image = figmaAsset(product.image);

  return (
    <View style={[styles.tile, { width }]}>
      <View style={styles.tileArt}>
        <ProductPhoto source={image} productId={product.id} accessibilityLabel={`${product.name} product photo`} variant="card" />
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

      <View style={[styles.tileFoot, quantity > 0 && product.inStock !== false && styles.tileFootStacked]}>
        <Txt variant="titleLg" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68} style={styles.tilePrice}>
          {formatKes(product.price)}
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
/** Filters now run in the database, so an empty page with filters on offers to clear them. */
function NoResults({ query, filtered, onClear }: { query: string; filtered: boolean; onClear: () => void }) {
  const styles = useThemeStyles(createStyles);
  const filteredOut = filtered;

  return (
    <View style={styles.empty}>
      <View style={styles.emptyBadge}>
        <View style={styles.emptyIcon}>
          <Icon name="search" size={30} color="primaryAccent" />
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
          ? `Nothing for "${query}" fits the filters you picked. Clear them to see everything.`
          : `We couldn't find matches for "${query}". Try checking your spelling or searching for a broader term in groceries or pharmacy.`}
      </Txt>
      {filteredOut ? <Button label="Clear filters" variant="outline" onPress={onClear} /> : null}
    </View>
  );
}

/** Quick suggestions card shared by the empty state. */
function PopularSearches({ onPick }: { onPick: (label: string) => void }) {
  const styles = useThemeStyles(createStyles);
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
  const styles = useThemeStyles(createStyles);
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
        <Txt variant="caption" color="primaryAccent">
          {`(${store.phone})`}
        </Txt>
      </Pressable>
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
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
  field: { height: 44, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.primaryAccent },
  quickRow: {
    flexGrow: 0,
    marginBottom: spacing.md,
  },
  quickTrack: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: layout.screenMargin,
  },
  filterTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
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
    // Fills its row, so both cards in a row are the same height.
    flexGrow: 1,
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
  /** One line, pinned to the card's foot, so both cards in a row line up (as on the shelf cards). */
  tileFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
    marginTop: 'auto',
    paddingTop: spacing.xs,
  },
  /** The − n + control is too wide to share the line, so the price sits above it. */
  tileFootStacked: { flexDirection: 'column', alignItems: 'stretch', gap: spacing.sm },
  /** A long price ("KES 1,280.00") shrinks a little to fit beside the +. */
  tilePrice: { flexShrink: 1, minWidth: 0 },
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
