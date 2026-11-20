import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Masthead } from '@/components/nav/masthead';
import { Chip, EmptyState, LoadState, Screen, Txt } from '@/components/ui';
import { ShopCard } from '@/components/ui/shop-card';
import { verticalBySlug } from '@/data/catalog';
import { fetchShelf, useLive, type ResultSort } from '@/data/live-catalogue';
import type { CategoryVertical, Product } from '@/data/types';
import { useCart } from '@/store/cart';
import { useFulfilment } from '@/store/fulfilment';
import { StoreChooser } from '@/features/store/store-chooser';
import { layout, spacing } from '@/theme';
import { useThemeStyles } from '@/theme/provider';

/** One aisle row in full: more than the Shop shows, still only what the chosen shop has. */
const AISLE_LIMIT = 60;

const SORTS: readonly { key: ResultSort; label: string }[] = [
  { key: 'relevance', label: 'Top picks' },
  { key: 'price-asc', label: 'Price: low to high' },
  { key: 'price-desc', label: 'Price: high to low' },
];

/**
 * "View all" for one Shop row (19 Nov 2026), instead of a search that found the row's
 * title as words. `/aisle?vertical=wholesale&slug=cleaning-products`.
 */
export default function AisleRoute() {
  const { vertical: verticalParam, slug } = useLocalSearchParams<{ vertical?: string; slug?: string }>();
  const router = useRouter();
  const styles = useThemeStyles(createStyles);
  const cart = useCart();
  const { store, storeId } = useFulfilment();
  const [sort, setSort] = useState<ResultSort>('relevance');
  const [storeSheetOpen, setStoreSheetOpen] = useState(false);
  // Two per row, sized like the Shop's grid.
  const { width } = useWindowDimensions();
  const cardWidth = Math.floor((Math.min(width, layout.maxContentWidth) - layout.screenMargin * 2 - layout.gutter) / 2);

  const vertical = verticalBySlug((verticalParam ?? 'retail') as CategoryVertical);
  const section = vertical.sections.find(entry => entry.categorySlug === slug) ?? vertical.sections[0];
  const shopName = store.name.replace('Xana Plus ', '');
  const products = useLive(
    `aisle:${vertical.slug}:${section.categorySlug}:${storeId}:${sort}`,
    () => fetchShelf({ ...section.query, limit: AISLE_LIMIT }, { branch: storeId, sort }),
    [] as Product[],
  );
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/categories'));

  return (
    <Screen padded={false} contentStyle={styles.page} edgeToEdgeTop>
      <Masthead
        title={section.title}
        subtitle={vertical.slug === 'wholesale' ? `Buy more, pay less each. In stock at ${shopName}.` : `In stock at ${shopName}.`}
        onBack={goBack}
        onChangeStore={() => setStoreSheetOpen(true)}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sorts}>
        {SORTS.map(entry => (
          <Chip key={entry.key} label={entry.label} selected={sort === entry.key} onPress={() => setSort(entry.key)} />
        ))}
      </ScrollView>

      {products.status !== 'ready' ? (
        <LoadState status={products.status} placeholder="grid" inset onRetry={products.retry} />
      ) : products.data.length === 0 ? (
        <EmptyState icon="store" title={`Nothing here at ${shopName} right now`} description="Try another shop, or check back after the next delivery." />
      ) : (
        <View style={styles.grid}>
          {products.data.map(product => (
            <View key={product.id} style={{ width: cardWidth }}>
              <ShopCard
                product={product}
                quantity={cart.quantityOf(product.id)}
                showQuantityPrices={vertical.slug === 'wholesale'}
                onPress={() => router.push(`/product/${product.id}`)}
                onAdd={() => cart.add(product.id)}
              />
            </View>
          ))}
        </View>
      )}

      {products.status === 'ready' && products.data.length === AISLE_LIMIT ? (
        <Txt variant="bodySm" color="onSurfaceVariant" align="center" style={styles.more}>
          {`Showing the first ${AISLE_LIMIT}. Use search to find a particular item.`}
        </Txt>
      ) : null}

      <StoreChooser visible={storeSheetOpen} onClose={() => setStoreSheetOpen(false)} />
    </Screen>
  );
}

const createStyles = () => StyleSheet.create({
  page: { gap: spacing.lg, paddingBottom: spacing.colossal },
  sorts: { gap: spacing.sm, paddingHorizontal: layout.screenMargin },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: layout.gutter,
    rowGap: spacing.xl,
    paddingHorizontal: layout.screenMargin,
  },
  more: { paddingHorizontal: layout.screenMargin },
});
