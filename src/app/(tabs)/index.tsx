import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Masthead } from '@/components/nav/masthead';
import { useTabScrollTop } from '@/components/nav/use-tab-scroll-top';
import { Icon, LoadState, ProductCard, Screen, SearchBar, SectionHeader, Txt } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { BULK_WORDS, verticalBySlug } from '@/data/catalog';
import { figmaAsset } from '@/data/images';
import { formatKes } from '@/lib/format';
import { activePriceTiers } from '@/lib/quantity-pricing';
import { fetchBestSellers, fetchBranchOffers, useLive, useShelves } from '@/data/live-catalogue';
import type { Product } from '@/data/types';
import { HomeBanner } from '@/features/home/home-banner';
import { useBuyAgain } from '@/features/orders/buy-again';
import { StoreChooser } from '@/features/store/store-chooser';
import { WaterCheckIn } from '@/features/wellness/water-check-in';
import { weekIndex } from '@/features/wellness/weekly-themes';
import { useCart } from '@/store/cart';
import { inStockAt, useFulfilment } from '@/store/fulfilment';
import { useSession } from '@/store/session';
import { elevation, layout, radius, spacing } from '@/theme';
import { useTheme, useThemeStyles } from '@/theme/provider';
import type { Palette } from '@/theme';

/** "What do you need?" (owner, 18 Nov 2026): three doors into the shop. */
const NEEDS = [
  { key: 'pharmacy', label: 'Pharmacy', image: 'omron-m2-bp-monitor' },
  { key: 'fresh', label: 'Fresh food', image: 'fresh-produce' },
  { key: 'wellness', label: 'Wellness', image: 'vitamins-supplements' },
] as const;

/**
 * "Picked for your week" always mixes the three ways people shop at Xana (Roystone,
 * 19 Nov 2026): Retail, Wholesale and Deli, two retail picks and one of each other.
 * Each slot takes the customer's own past buys first, then this shop's best sellers,
 * then the first shelf of that Shop department, so a slot is never left empty. Every
 * pick says honestly why it is there, and the choice rotates among the top few each
 * Monday: different every week, the same all week.
 */
type PickKind = 'retail' | 'wholesale' | 'deli';
const PICK_SLOTS: PickKind[] = ['retail', 'wholesale', 'deli', 'retail'];
const PICK_LABEL: Record<PickKind, string> = { retail: 'Retail', wholesale: 'Wholesale', deli: 'Deli' };
/**
 * Till add-ons (a KSh 5 matchbox, sweets, a mandazi) sell often but make poor picks
 * (Roystone, 19 Nov 2026): picks start at this price, at the price the shop charges.
 */
const MIN_PICK_PRICE = 50;
/** How many of the top candidates in each group take turns, week by week. */
const ROTATE_AMONG = 6;
type PickSource = 'yours' | 'popular' | 'shelf';
/** Why this pick is here, always from real data. Wholesale says what buying more saves. */
const pickReason = (product: Product, source: PickSource, kind: PickKind, shop: string, branch: string): string => {
  const tier = kind === 'wholesale' ? bulkTier(product, branch) : undefined;
  if (tier) {
    const saving = Math.round((1 - tier.unitPrice / product.price) * 100);
    return saving >= 1 ? `Buy ${tier.minQty}+ and save ${saving}%` : `Buy ${tier.minQty}+ for ${formatKes(tier.unitPrice)} each`;
  }
  if (source === 'yours') return 'You bought this before';
  if (source === 'popular') return `Popular at ${shop}`;
  return kind === 'deli' ? 'Fresh from our kitchen' : kind === 'wholesale' ? 'Bulk pack for shops and kitchens' : `In stock at ${shop}`;
};
const BULK_NAME = new RegExp(String.raw`\b(${BULK_WORDS.join('|')})\b`, 'i');
/**
 * BC's quantity price: the first step that is cheaper than buying one. Not claimed when
 * the shop has an offer on the item, so the line never contradicts the price on the card.
 */
const bulkTier = (product: Product, branch?: string) =>
  branch && product.offers?.[branch]
    ? undefined
    : activePriceTiers(product.priceTiers).find(tier => tier.unitPrice < product.price);
/** Share saved per unit at the first bulk step, 0 when there is none. */
const bulkSaving = (product: Product, branch: string) => {
  const tier = bulkTier(product, branch);
  return tier ? 1 - tier.unitPrice / product.price : 0;
};
/** DEL items are Deli; a quantity price or a bulk pack (as the Shop's Wholesale aisle) is Wholesale. */
const pickKind = (product: Product): PickKind =>
  product.category === 'deli-cold-cuts' ? 'deli' : bulkTier(product) || BULK_NAME.test(product.name) ? 'wholesale' : 'retail';
const FALLBACK_SHELVES = (['retail', 'wholesale', 'deli'] as const).map(kind => {
  const section = verticalBySlug(kind).sections.find(entry => kind !== 'deli' || entry.query.deli === 'only') ?? verticalBySlug(kind).sections[0];
  return { title: kind, query: section.query };
});
/** `t` makes the Shop tab re-apply its filter even when it is already open. */
const shopParams = (params?: Record<string, string>) => ({ ...params, t: String(Date.now()) });

/**
 * Home (owner's design, 18 Nov 2026): who we are and where you shop, three ways in
 * (Shop, Member Plans, Member Benefits), search, the pharmacy / fresh / wellness doors,
 * this shop's real POS offers, picks from your past orders and this shop's best sellers,
 * and today's water check-in.
 * Nothing here is invented: no member prices until BC has them.
 */
export default function HomeRoute() {
  const scrollTop = useTabScrollTop();
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const router = useRouter();
  const cart = useCart();
  const { user } = useSession();
  const buyAgain = useBuyAgain();
  const { store, storeId, storeChosen } = useFulfilment();
  // First open: ask which store they shop from (orders are packed and stock-checked there).
  const [storeSheetOpen, setStoreSheetOpen] = useState(!storeChosen);
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, layout.maxContentWidth) - layout.screenMargin * 2;
  const shopName = store.name.replace('Xana Plus ', '');
  const branch = storeId.toUpperCase();

  const offers = useLive(`offers:${branch}`, () => fetchBranchOffers(branch), [] as Product[]);
  const bestSellers = useLive(`best:${branch}`, () => fetchBestSellers(branch, 200), [] as Product[]);
  const fallback = useShelves(FALLBACK_SHELVES, 12);
  const picks = useMemo(() => {
    const suitable = (product: Product) =>
      inStockAt(product, storeId) && !product.rxRequired && !product.ageRestricted &&
      (product.offers?.[branch]?.price ?? product.price) >= MIN_PICK_PRICE;
    // Best sellers with a photo first, their order kept.
    const best = bestSellers.data.filter(suitable);
    const ranked = [...best.filter(product => product.image), ...best.filter(product => !product.image)];
    const week = weekIndex();
    const used = new Set<string>();
    const chosen: { product: Product; kind: PickKind; reason: string }[] = [];
    PICK_SLOTS.forEach((kind, slot) => {
      const groups: [PickSource, Product[]][] = [
        ['yours', buyAgain.filter(suitable)],
        ['popular', ranked],
        ['shelf', (fallback.data[kind] ?? []).filter(suitable)],
      ];
      for (const [source, list] of groups) {
        let options = list.filter(product => pickKind(product) === kind && !used.has(product.id));
        // Wholesale: of the 30 most popular, the ones where buying more saves the most.
        if (kind === 'wholesale' && source === 'popular') {
          options = options.slice(0, 30).sort((a, b) => bulkSaving(b, branch) - bulkSaving(a, branch));
        }
        options = options.slice(0, ROTATE_AMONG);
        if (options.length === 0) continue;
        // A different turn each week; items already picked above are skipped.
        const product = options[(week + slot) % options.length];
        used.add(product.id);
        chosen.push({ product, kind, reason: pickReason(product, source, kind, shopName, branch) });
        return;
      }
    });
    return chosen;
  }, [buyAgain, bestSellers.data, fallback.data, storeId, shopName, branch]);


  const openShop = (params?: Record<string, string>) => router.push({ pathname: '/(tabs)/categories', params: shopParams(params) });
  const openNeed = (key: (typeof NEEDS)[number]['key']) =>
    key === 'pharmacy' ? router.push('/(tabs)/pharmacy') : key === 'wellness' ? router.push('/(tabs)/wellness') : openShop({ vertical: 'groceries', focus: 'fresh-produce' });
  const needWidth = (contentWidth - spacing.md * 2) / 3;

  return (
    <Screen scroll={false} padded={false} contentStyle={styles.screenBody} edgeToEdgeTop>
      <ScrollView ref={scrollTop} style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.page}>
        {/* Who we are, and where you shop. */}
        <Masthead
          wordmark
          title={'Good for you,\ngood for home.'}
          subtitle="Everyday health and fresh groceries, together."
          onChangeStore={() => setStoreSheetOpen(true)}
        />

        <View style={[styles.inset, styles.searchRow]}>
          <SearchBar placeholder="Search medicines, food and more" onPress={() => router.push('/search')} style={styles.flex} />
          <PressableScale accessibilityRole="button" accessibilityLabel="Scan a barcode" onPress={() => router.push('/scan')} hitSlop={4} style={styles.scanButton}>
            <Icon name="scan" size={20} color="onSurface" />
          </PressableScale>
        </View>

        {/* Three ways in: Shop leads; the two membership doors sit under it. */}
        <View style={styles.section}>
          <PressableScale accessibilityRole="button" accessibilityLabel="Shop now: pharmacy, food and everyday essentials" onPress={() => openShop()} style={styles.shopCard}>
            <View style={styles.shopCopy}>
              <Txt variant="headlineLg" tint={colors.onPrimary}>Shop now</Txt>
              <Txt variant="bodySm" tint={colors.onPrimaryContainer}>Browse pharmacy, food and everyday essentials.</Txt>
              <View style={styles.shopGo}>
                <Txt variant="label" tint={colors.onPrimary}>{`From ${shopName}`}</Txt>
                <Icon name="arrow-right" size={16} color={colors.onPrimary} />
              </View>
            </View>
            <Image source={figmaAsset('cheese-counter')} style={styles.shopArt} contentFit="cover" accessible={false} />
          </PressableScale>
          <View style={styles.memberRow}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Sign up for Member Plans"
              onPress={() => router.push({ pathname: '/membership', params: { section: 'plans' } })}
              style={[styles.memberCard, styles.memberCardPlans]}
            >
              <Icon name="star" size={20} color="secondaryAccent" />
              <Txt variant="titleSm">{user ? 'Become a Member' : 'Sign up for Member Plans'}</Txt>
              <Txt variant="caption" color="onSurfaceVariant">
                {user ? `Plans from ${formatKes(200)} a month.` : 'Start with your name and mobile number.'}
              </Txt>
            </PressableScale>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Member Services and Benefits"
              onPress={() => router.push('/membership')}
              style={[styles.memberCard, styles.memberCardBenefits]}
            >
              <Icon name="gift" size={20} color="primaryAccent" />
              <Txt variant="titleSm">Member Services and Benefits</Txt>
              <Txt variant="caption" color="onSurfaceVariant">What comes with membership.</Txt>
            </PressableScale>
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader title="What do you need?" actionLabel="See all" onAction={() => openShop()} />
          <View style={styles.needs}>
            {NEEDS.map(need => (
              <PressableScale key={need.key} accessibilityRole="button" accessibilityLabel={need.label} onPress={() => openNeed(need.key)} style={[styles.need, { width: needWidth }]}>
                <Image source={figmaAsset(need.image)} style={[styles.needImage, { height: needWidth }]} contentFit="cover" accessible={false} />
                <Txt variant="titleSm" style={styles.needLabel}>{need.label}</Txt>
              </PressableScale>
            ))}
          </View>
        </View>

        {/* This shop's offers, straight from the till: real prices, real end dates. */}
        {offers.status !== 'ready' || offers.data.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader title={`Offers at ${shopName}`} />
            <Txt variant="caption" color="onSurfaceVariant">The same offer prices as the till in the shop.</Txt>
            {offers.status !== 'ready' ? <LoadState status={offers.status} placeholder="rail" onRetry={offers.retry} /> : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.railBleed} contentContainerStyle={styles.rail}>
              {offers.data.map(product => (
                <ProductCard
                  key={product.id}
                  product={product}
                  width={layout.productCardWidth}
                  quantity={cart.quantityOf(product.id)}
                  onPress={() => router.push(`/product/${product.id}`)}
                  onAdd={() => cart.add(product.id)}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.section}>
          <WaterCheckIn compact onOpen={() => router.push('/(tabs)/wellness')} />
        </View>

        {/* Retail, Wholesale and Deli: past orders first, then this shop's best sellers. */}
        <View style={styles.section}>
          <SectionHeader title="Picked for your week" />
          <Txt variant="bodySm" color="onSurfaceVariant">{`Retail, wholesale and deli at ${shopName}. New picks every Monday.`}</Txt>
          {picks.length === 0 && bestSellers.status !== 'ready' && fallback.status !== 'ready' ? <LoadState status={fallback.status} placeholder="rail" onRetry={fallback.retry} /> : null}
          <View style={styles.grid}>
            {picks.map(({ product, kind, reason }) => (
              <View key={product.id} style={styles.pick}>
                <PressableScale
                  accessibilityRole="link"
                  accessibilityLabel={`Shop ${PICK_LABEL[kind]}`}
                  onPress={() => openShop({ vertical: kind })}
                  hitSlop={6}
                  style={styles.pickKind}
                >
                  <Txt variant="label" color="primaryAccent">{PICK_LABEL[kind]}</Txt>
                  <Icon name="chevron-right" size={12} color="primaryAccent" />
                </PressableScale>
                <Txt variant="caption" color="onSurfaceVariant" numberOfLines={1} style={styles.pickReason}>{reason}</Txt>
                <ProductCard
                  product={product}
                  width={(contentWidth - layout.gutter) / 2}
                  quantity={cart.quantityOf(product.id)}
                  onPress={() => router.push(`/product/${product.id}`)}
                  onAdd={() => cart.add(product.id)}
                />
              </View>
            ))}
          </View>
          {/* Browse goes to the right department, never to search. */}
          <View style={styles.browseRow}>
            {(['retail', 'wholesale', 'deli'] as const).map(kind => (
              <PressableScale
                key={kind}
                accessibilityRole="link"
                accessibilityLabel={`Browse ${PICK_LABEL[kind]}`}
                onPress={() => openShop({ vertical: kind })}
                style={styles.browseChip}
              >
                <Txt variant="label" color="primaryAccent">{`Browse ${PICK_LABEL[kind]}`}</Txt>
              </PressableScale>
            ))}
          </View>
        </View>

        {/* Homepage ads from the admin app, the same ones the website shows. */}
        <View style={styles.section}>
          <HomeBanner width={contentWidth} />
        </View>

        <View style={[styles.section, styles.notice]}>
          <Icon name="prescription" size={16} color="onSurfaceVariant" />
          <Txt variant="caption" color="onSurfaceVariant" style={styles.flex}>
            Medicine orders are subject to pharmacist review.
          </Txt>
        </View>
      </ScrollView>

      <StoreChooser visible={storeSheetOpen} onClose={() => setStoreSheetOpen(false)} />
    </Screen>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  screenBody: { paddingTop: spacing.none, paddingBottom: spacing.none },
  scroll: { flex: 1 },
  page: { paddingBottom: spacing.colossal },
  flex: { flex: 1 },
  inset: { paddingHorizontal: layout.screenMargin },
  section: { paddingHorizontal: layout.screenMargin, marginTop: spacing.xxxl },

  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  scanButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainerLow,
  },

  shopCard: {
    flexDirection: 'row',
    minHeight: 132,
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: colors.primaryContainer,
    ...elevation.card,
  },
  shopCopy: { flex: 1, padding: spacing.lg, gap: spacing.xs, justifyContent: 'center' },
  shopGo: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  shopArt: { width: '38%' },
  memberRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  memberCard: { flex: 1, gap: spacing.xs, padding: spacing.lg, borderRadius: radius.card },
  memberCardPlans: { backgroundColor: colors.amberTint15 },
  memberCardBenefits: { backgroundColor: colors.mintSurface },

  needs: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  need: { gap: spacing.sm },
  needImage: { width: '100%', borderRadius: radius.card, backgroundColor: colors.surfaceContainerLow },
  needLabel: { textAlign: 'center' },

  rail: { gap: spacing.md, paddingHorizontal: layout.screenMargin, paddingTop: spacing.sm },
  railBleed: { marginHorizontal: -layout.screenMargin },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: layout.gutter, marginTop: spacing.sm },
  pick: { gap: spacing.xxs },
  pickReason: { marginBottom: spacing.xxs },
  pickKind: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, alignSelf: 'flex-start', minHeight: 24 },
  browseRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  browseChip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.mintSurface,
  },

  notice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
