import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Masthead } from '@/components/nav/masthead';
import { Badge, Button, LoadState, Screen, Txt } from '@/components/ui';
import { ShopCard } from '@/components/ui/shop-card';
import { fetchProducts, useLive } from '@/data/live-catalogue';
import type { Product } from '@/data/types';
import { PharmacistWhatsAppSheet } from '@/features/pharmacy/whatsapp-sheet';
import { THEMES_ARE_SAMPLE, themeOfTheWeek } from '@/features/wellness/weekly-themes';
import { useCart } from '@/store/cart';
import { inStockAt, useFulfilment } from '@/store/fulfilment';
import { layout, radius, spacing } from '@/theme';
import { useThemeStyles } from '@/theme/provider';
import type { Palette } from '@/theme';

/**
 * This month's health theme (Wellness → Today → "Shop ... picks"): the month's four weekly
 * tips, and the shop items that go with it, in stock at the chosen shop. Never medicines.
 */
export default function HealthThemeRoute() {
  const styles = useThemeStyles(createStyles);
  const router = useRouter();
  const cart = useCart();
  const { storeId, store } = useFulfilment();
  const { width } = useWindowDimensions();
  const [askOpen, setAskOpen] = useState(false);
  const theme = themeOfTheWeek();
  const contentWidth = Math.min(width, layout.maxContentWidth) - layout.screenMargin * 2;
  const shopName = store.name.replace('Xana Plus ', '');

  const items = useLive(`theme:${theme.name}`, () => fetchProducts(theme.items), [] as Product[]);
  const order = new Map(theme.items.map((itemNo, index) => [itemNo, index]));
  const products = items.data
    .filter(product => inStockAt(product, storeId) && !product.rxRequired && !product.ageRestricted)
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/wellness'));

  return (
    <Screen scroll={false} padded={false} contentStyle={styles.screenBody} edgeToEdgeTop>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.page}>
        <Masthead title={theme.name} subtitle={theme.intro} onBack={goBack} />

        <View style={styles.section}>
          {THEMES_ARE_SAMPLE ? <Badge label="Sample" tone="neutral" /> : null}
          {/* The month as one printed list, week by week, not four look-alike boxes (20 Nov 2026). */}
          <View style={styles.weeks}>
            {theme.weeks.map((week, index) => {
              const current = index === theme.week;
              return (
                <View key={week.question} style={[styles.week, index > 0 ? styles.weekRule : null, current ? styles.weekNow : null]}>
                  <View style={styles.weekSide}>
                    <Txt variant="label" color={current ? 'primaryAccent' : 'outline'}>{`Week ${index + 1}`}</Txt>
                    {current ? <Txt variant="labelSm" color="primaryAccent">This week</Txt> : null}
                  </View>
                  <View style={styles.weekBody}>
                    <Txt variant="title" color={current ? 'onSurface' : 'onSurfaceVariant'}>{week.question}</Txt>
                    <Txt variant="bodySm" color="onSurfaceVariant">{week.tip}</Txt>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Txt variant="headline">{`For ${theme.name.toLowerCase()} at ${shopName}`}</Txt>
          {products.length === 0 && items.status !== 'ready' ? (
            <LoadState status={items.status} placeholder="rail" onRetry={items.retry} />
          ) : null}
          {products.length === 0 && items.status === 'ready' ? (
            <Txt variant="bodySm" color="onSurfaceVariant">{`None of this month's items are in stock at ${shopName} right now.`}</Txt>
          ) : null}
          <View style={styles.grid}>
            {products.map(product => (
              <View key={product.id} style={{ width: Math.floor((contentWidth - layout.gutter) / 2) }}>
                <ShopCard
                  product={product}
                  quantity={cart.quantityOf(product.id)}
                  onPress={() => router.push(`/product/${product.id}`)}
                  onAdd={() => cart.add(product.id)}
                />
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.askCard}>
            <Txt variant="title">Questions about your health?</Txt>
            <Txt variant="bodySm" color="onSurfaceVariant">Our pharmacists are a message away.</Txt>
            <Button label="Ask a pharmacist" icon="whatsapp" iconPosition="leading" variant="tonal" onPress={() => setAskOpen(true)} />
          </View>
          <Txt variant="caption" color="onSurfaceVariant" style={styles.disclaimer}>
            These are general wellness tips, not medical advice or a substitute for care from a qualified health professional.
          </Txt>
        </View>
      </ScrollView>
      <PharmacistWhatsAppSheet visible={askOpen} onClose={() => setAskOpen(false)} />
    </Screen>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  screenBody: { paddingTop: spacing.none, paddingBottom: spacing.none },
  page: { paddingBottom: spacing.colossal },
  flex: { flex: 1 },
  section: { paddingHorizontal: layout.screenMargin, marginTop: spacing.xxxl, gap: spacing.sm },
  weeks: {
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineSoft30,
    overflow: 'hidden',
  },
  week: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.lg, paddingHorizontal: spacing.lg },
  weekRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.outlineSoft30 },
  weekNow: { backgroundColor: colors.mintSurface },
  /** Fixed width so every question starts on the same line. */
  weekSide: { width: 64, gap: 2, paddingTop: 2 },
  weekBody: { flex: 1, gap: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: layout.gutter, rowGap: spacing.xl, marginTop: spacing.xs },
  askCard: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.card, backgroundColor: colors.surfaceContainerLow },
  disclaimer: { marginTop: spacing.sm, textAlign: 'center' },
});
