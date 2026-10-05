import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import {
  Badge,
  BottomSheet,
  Button,
  CategoryTile,
  Chip,
  Icon,
  LoadState,
  ProductCard,
  ProgressBar,
  Screen,
  SearchBar,
  SectionHeader,
  SelectableOption,
  Txt,
  TopBar,
} from '@/components/ui';
import type { IconName } from '@/components/ui';
import { heroDeal, homeCategoryTiles, stores, trendingDeals } from '@/data/catalog';
import { figmaAsset } from '@/data/images';
import { groupsForCategory, useShelves } from '@/data/live-catalogue';
import type { Deal, User } from '@/data/types';
import { useCart } from '@/store/cart';
import { useFulfilment } from '@/store/fulfilment';
import { useSession } from '@/store/session';
import { colors, elevation, gradients, layout, radius, spacing } from '@/theme';

/** Flash-drop countdown the hero opens on — 04:22:15 in the frame. */
const FLASH_DROP_SECONDS = 4 * 3600 + 22 * 60 + 15;

/** Hero card and deal card geometry (the frame's 200pt hero, 216pt deal card). */
const HERO_HEIGHT = 200;
const DEAL_CARD_WIDTH = 216;
const DEAL_CARD_HEIGHT = 150;

/** Xana Club ladder — kept in step with the Profile tab's rewards card. */
const CLUB_TIERS = [
  { tier: 'Bronze', from: 0 },
  { tier: 'Silver', from: 1_000 },
  { tier: 'Gold', from: 2_000 },
  { tier: 'Platinum', from: 5_000 },
] as const;

/** Where each promotional card sends the shopper. */
const DEAL_ROUTES: Record<Deal['tone'], '/(tabs)/categories' | '/(tabs)/pharmacy'> = {
  promo: '/(tabs)/categories',
  harvest: '/(tabs)/categories',
  wellness: '/(tabs)/pharmacy',
  breakfast: '/(tabs)/categories',
};

/** Tint per deal family, so the rail reads as three different aisles. */
const DEAL_SURFACE: Record<Deal['tone'], string> = {
  promo: colors.surface,
  harvest: colors.mintPale,
  wellness: colors.mintSurface,
  breakfast: colors.surfaceContainerLow,
};

type Alert = { id: string; icon: IconName; title: string; body: string; time: string };

/** Notification feed behind the app-bar bell. */
const ALERTS: Alert[] = [
  {
    id: 'flash-drop',
    icon: 'flame',
    title: 'Flash Drop ends soon',
    body: 'Supa Deals This Week pricing reverts the moment the hero countdown reaches zero.',
    time: 'Just now',
  },
  {
    id: 'mpesa-cashback',
    icon: 'mpesa',
    title: 'M-Pesa cashback is live',
    body: 'KES 200 comes back to your M-Pesa line on orders over KES 1,000 this week.',
    time: '2h ago',
  },
  {
    id: 'fresh-everyday',
    icon: 'delivery',
    title: 'Fresh Everyday restocked',
    body: 'Chilled dairy and produce were picked this morning at the Syokimau store.',
    time: 'Today',
  },
];

/** The Fresh Everyday rail: in-stock chilled and fresh lines from the BC catalogue. */
const FRESH_EVERYDAY = [
  {
    title: 'Fresh Everyday',
    query: { groups: ['fresh-produce', 'dairy-eggs', 'bakery', 'meat-poultry'].flatMap(groupsForCategory) },
  },
];
const FRESH_EVERYDAY_SIZE = 10;
/** Narrowest gap the category grid allows between tiles before dropping a column. */
const TILE_MIN_GAP = 8;

/** "04:22:15" — the hero pill counts down in place. */
const formatCountdown = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return [hours, minutes, totalSeconds % 60].map(unit => String(unit).padStart(2, '0')).join(':');
};

/** Progress and caption towards the member's next club tier. */
function clubStanding(points: number, tierName: User['clubTier']): { progress: number; caption: string } {
  const index = Math.max(0, CLUB_TIERS.findIndex(entry => entry.tier === tierName));
  const current = CLUB_TIERS[index];
  const next = CLUB_TIERS[index + 1];
  if (!next) return { progress: 1, caption: 'Top tier unlocked. Earn on every order' };
  const span = next.from - current.from;
  return {
    progress: span > 0 ? Math.min(1, Math.max(0, (points - current.from) / span)) : 0,
    caption: `${Math.max(0, next.from - points).toLocaleString('en-KE')} points to ${next.tier}`,
  };
}

/**
 * Screen 2a — Home: search trigger, flash-drop hero, the 17-tile category grid,
 * the Xana Club card, Trending Deals, the Fresh Everyday rail and the M-Pesa
 * micro-banner. The app bar is fixed above the scroll body.
 */
export default function HomeRoute() {
  const router = useRouter();
  const cart = useCart();
  const { user } = useSession();
  const { store, storeId, setStoreId } = useFulfilment();
  const [secondsLeft, setSecondsLeft] = useState(FLASH_DROP_SECONDS);
  const [storeSheetOpen, setStoreSheetOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alertsUnread, setAlertsUnread] = useState(true);
  const { width } = useWindowDimensions();
  // Blank cells pad the last grid row so its tiles line up under the columns above.
  const gridWidth = Math.min(width, layout.maxContentWidth) - layout.screenMargin * 2;
  const gridColumns = Math.max(1, Math.floor((gridWidth + TILE_MIN_GAP) / (layout.categoryTileSize + TILE_MIN_GAP)));
  const gridFillers = (gridColumns - (homeCategoryTiles.length % gridColumns)) % gridColumns;

  useEffect(() => {
    const timer = setInterval(() => setSecondsLeft(remaining => (remaining > 0 ? remaining - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, []);

  const storeShortName = store.name.replace('Xana Plus ', '');
  const fresh = useShelves(FRESH_EVERYDAY, FRESH_EVERYDAY_SIZE);
  const freshEveryday = fresh.data[FRESH_EVERYDAY[0].title] ?? [];
  const club = user ? clubStanding(user.clubPoints, user.clubTier) : null;
  const heroArt = figmaAsset(heroDeal.image);

  return (
    <Screen scroll={false} padded={false} contentStyle={styles.screenBody}>
      <TopBar
        title="Home"
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
                {storeShortName}
              </Txt>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={alertsUnread ? 'Notifications, unread' : 'Notifications'}
              onPress={() => setAlertsOpen(true)}
              hitSlop={6}
              style={styles.bell}
            >
              <Icon name="bell" size={20} color="onSurface" />
              {alertsUnread ? <View style={styles.unreadDot} /> : null}
            </Pressable>
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

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.page}>
        {/* 2. Search trigger */}
        <View style={[styles.inset, styles.searchSection, styles.searchRow]}>
          <SearchBar
            placeholder="Search groceries, meds & more"
            onPress={() => router.push('/search')}
            onTrailingPress={() => router.push('/search')}
            style={styles.searchField}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Scan a barcode"
            onPress={() => router.push('/scan')}
            hitSlop={8}
            style={styles.scanButton}
          >
            <Icon name="scan" size={20} color="onSurface" />
          </Pressable>
        </View>

        {/* 3. Promotional hero */}
        <View style={styles.section}>
          <LinearGradient colors={gradients.promoHero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
            <View style={styles.heroArt}>
              {heroArt ? <Image source={heroArt} style={styles.heroImage} contentFit="cover" transition={120} /> : null}
              <LinearGradient
                colors={[gradients.promoHero[2], colors.transparent]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.heroFade}
              />
            </View>

            <View style={styles.heroTop}>
              {heroDeal.eyebrow ? <Badge label={heroDeal.eyebrow} tone="discount" /> : null}
              {heroDeal.tag ? <Chip label={heroDeal.tag} tone="outline" icon="flame" /> : null}
              <View style={styles.countdown}>
                <Icon name="clock" size={12} color="secondary" />
                <Txt variant="label" color="secondary">
                  {formatCountdown(secondsLeft)}
                </Txt>
              </View>
            </View>

            <View style={styles.heroCopy}>
              <Txt variant="headlineLg" numberOfLines={2}>
                {heroDeal.title}
              </Txt>
              <Txt variant="bodySm" color="onSurfaceVariant" numberOfLines={2}>
                {heroDeal.description}
              </Txt>
            </View>

            <View style={styles.heroFoot}>
              <View style={styles.mpesaRow}>
                <View style={styles.mpesaDot}>
                  <Icon name="mpesa" size={11} color="onPrimary" />
                </View>
                <Txt variant="label" color="onSurfaceVariant" numberOfLines={1}>
                  M-Pesa: KES 200 cashback
                </Txt>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${heroDeal.cta}, browse categories`}
                onPress={() => router.push('/(tabs)/categories')}
                hitSlop={8}
                style={styles.heroCta}
              >
                <Txt variant="titleSm" color="primary">
                  {heroDeal.cta}
                </Txt>
                <Icon name="arrow-right" size={14} color="primary" />
              </Pressable>
            </View>
          </LinearGradient>
        </View>

        {/* 4. Top Categories */}
        <View style={styles.section}>
          <SectionHeader title="Top Categories" actionLabel="See All" onAction={() => router.push('/(tabs)/categories')} />
          <View style={styles.grid}>
            {homeCategoryTiles.map(category => (
              <View key={category.slug} style={styles.tileWrap}>
                <CategoryTile
                  name={category.name}
                  image={category.image}
                  onPress={() =>
                    router.push({
                      pathname: '/(tabs)/categories',
                      params: { vertical: category.vertical, focus: category.slug, t: String(Date.now()) },
                    })
                  }
                />
                {category.featured ? (
                  <View style={styles.tilePlus}>
                    <Icon name="plus" size={11} color="onPrimary" />
                  </View>
                ) : null}
              </View>
            ))}
            {Array.from({ length: gridFillers }, (_, index) => (
              <View key={`filler-${index}`} style={styles.tileWrap} />
            ))}
          </View>
        </View>

        {/* 5. Xana Club rewards */}
        <View style={styles.section}>
          <LinearGradient colors={gradients.club} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.clubCard}>
            {user && club ? (
              <>
                <View style={styles.clubHead}>
                  <View style={styles.clubHeadText}>
                    <Txt variant="overline" tint={colors.onPrimaryContainer}>
                      Xana Club
                    </Txt>
                    <Txt variant="headlineLg" tint={colors.onPrimary}>
                      {`${user.clubTier} member`}
                    </Txt>
                  </View>
                  <View style={styles.clubPoints}>
                    <Txt variant="display" tint={colors.onPrimary}>
                      {user.clubPoints.toLocaleString('en-KE')}
                    </Txt>
                    <Txt variant="caption" tint={colors.white70}>
                      points
                    </Txt>
                  </View>
                </View>
                <ProgressBar value={club.progress} height={6} trackColor={colors.white70} fillColor={colors.tertiaryFixed} />
                <View style={styles.clubFoot}>
                  <Txt variant="caption" tint={colors.white70} style={styles.clubFootText}>
                    {club.caption}
                  </Txt>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="View Xana Club rewards"
                    onPress={() => router.push('/(tabs)/profile')}
                    hitSlop={8}
                    style={styles.clubAction}
                  >
                    <Txt variant="label" tint={colors.onPrimary}>
                      View rewards
                    </Txt>
                    <Icon name="chevron-right" size={16} color={colors.onPrimary} />
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Txt variant="overline" tint={colors.onPrimaryContainer}>
                  Xana Club
                </Txt>
                <Txt variant="headlineLg" tint={colors.onPrimary}>
                  Rewards on every order
                </Txt>
                <Txt variant="bodySm" tint={colors.onPrimaryContainer}>
                  Join free and earn points on groceries, pharmacy refills and wholesale cartons.
                </Txt>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Join Xana Club"
                  onPress={() => router.push('/login')}
                  hitSlop={8}
                  style={styles.clubAction}
                >
                  <Txt variant="label" tint={colors.onPrimary}>
                    Join the club
                  </Txt>
                  <Icon name="chevron-right" size={16} color={colors.onPrimary} />
                </Pressable>
              </>
            )}
          </LinearGradient>
        </View>

        {/* 6a. Trending Deals */}
        <View style={styles.section}>
          <SectionHeader
            title="Trending Deals"
            icon="flame"
            actionLabel="View All"
            onAction={() => router.push('/(tabs)/categories')}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.railBleed} contentContainerStyle={styles.rail}>
            {trendingDeals.map(deal => (
              <DealCard key={deal.id} deal={deal} onPress={() => router.push(DEAL_ROUTES[deal.tone])} />
            ))}
          </ScrollView>
        </View>

        {/* 6b. Fresh Everyday rail */}
        <View style={styles.section}>
          <SectionHeader
            title="Fresh Everyday"
            actionLabel="See All"
            onAction={() =>
              router.push({ pathname: '/(tabs)/categories', params: { vertical: 'groceries', t: String(Date.now()) } })
            }
          />
          {fresh.status !== 'ready' ? <LoadState status={fresh.status} placeholder="rail" onRetry={fresh.retry} /> : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.railBleed} contentContainerStyle={styles.rail}>
            {freshEveryday.map(product => (
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

        {/* 7. M-Pesa micro-banner */}
        <View style={styles.section}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="1-Tap M-Pesa Checkout"
            onPress={() => router.push('/checkout')}
            style={styles.mpesaBanner}
          >
            <View style={styles.mpesaGlyph}>
              <Icon name="mpesa" size={20} color="primaryContainer" />
            </View>
            <View style={styles.mpesaCopy}>
              <Txt variant="title">1-Tap M-Pesa Checkout</Txt>
              <Txt variant="bodySm" color="onSurfaceVariant">
                No delays, prompt direct to STK push
              </Txt>
            </View>
            <Icon name="chevron-right" size={18} color="onSurfaceVariant" />
          </Pressable>
        </View>
      </ScrollView>

      <BottomSheet
        visible={storeSheetOpen}
        onClose={() => setStoreSheetOpen(false)}
        title="Choose your store"
        description="Prices, delivery fees and slots follow the store you shop from."
        scrollable
      >
        {stores.map(entry => (
          <SelectableOption
            key={entry.id}
            title={entry.name}
            description={entry.address}
            icon="store"
            selected={entry.id === storeId}
            onPress={() => {
              setStoreId(entry.id);
              setStoreSheetOpen(false);
            }}
          />
        ))}
      </BottomSheet>

      <BottomSheet
        visible={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        title="Notifications"
        description="Flash drops, M-Pesa receipts and restock alerts."
        footer={
          <Button
            label={alertsUnread ? 'Mark all as read' : 'All caught up'}
            variant="tonal"
            disabled={!alertsUnread}
            onPress={() => {
              setAlertsUnread(false);
              setAlertsOpen(false);
            }}
          />
        }
        scrollable
      >
        {ALERTS.map(alert => (
          <View key={alert.id} style={styles.alertRow}>
            <View style={styles.alertIcon}>
              <Icon name={alert.icon} size={18} color="primary" />
            </View>
            <View style={styles.alertBody}>
              <Txt variant="title">{alert.title}</Txt>
              <Txt variant="caption" color="onSurfaceVariant">
                {alert.body}
              </Txt>
              <Txt variant="labelSm" color="outline">
                {alert.time}
              </Txt>
            </View>
          </View>
        ))}
      </BottomSheet>
    </Screen>
  );
}

/** One Trending Deals card: offer badge, copy on the left, artwork on the right. */
function DealCard({ deal, onPress }: { deal: Deal; onPress: () => void }) {
  const art = figmaAsset(deal.image);
  const badge = deal.eyebrow
    ? { label: deal.eyebrow, tone: 'discount' as const }
    : deal.tag
      ? { label: deal.tag, tone: 'fresh' as const }
      : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={deal.title}
      onPress={onPress}
      style={[styles.deal, { backgroundColor: DEAL_SURFACE[deal.tone] }]}
    >
      <View style={styles.dealArt}>
        {art ? <Image source={art} style={styles.heroImage} contentFit="cover" transition={120} /> : null}
        <LinearGradient
          colors={[DEAL_SURFACE[deal.tone], colors.transparent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.dealFade}
        />
      </View>
      <View style={styles.dealBody}>
        <View style={styles.dealCopy}>
          {badge ? <Badge label={badge.label} tone={badge.tone} style={styles.dealBadge} /> : null}
          <Txt variant="titleSm" numberOfLines={2}>
            {deal.title}
          </Txt>
          <Txt variant="caption" color="onSurfaceVariant" numberOfLines={2}>
            {deal.description}
          </Txt>
        </View>
        <View style={styles.dealCta}>
          <Txt variant="label" color="primary" numberOfLines={1}>
            {deal.cta}
          </Txt>
          <Icon name="arrow-right" size={14} color="primary" />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screenBody: { paddingTop: spacing.none, paddingBottom: spacing.none },
  scroll: { flex: 1 },
  page: { paddingBottom: spacing.colossal },
  inset: { paddingHorizontal: layout.screenMargin },
  /** Every section sits 28pt under the one above it, per the frame. */
  section: { paddingHorizontal: layout.screenMargin, marginTop: spacing.xxxl },

  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 32,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainerLow,
  },
  bell: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  unreadDot: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.secondaryContainer,
    borderWidth: 1.5,
    borderColor: colors.surface,
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
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchField: { flex: 1 },
  scanButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainerLow,
  },

  hero: {
    minHeight: HERO_HEIGHT,
    justifyContent: 'space-between',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.secondaryFixed,
    overflow: 'hidden',
    ...elevation.hairline,
  },
  heroArt: { position: 'absolute', top: spacing.giant, right: 0, bottom: 0, width: '42%' },
  heroImage: { width: '100%', height: '100%' },
  heroFade: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 32 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  countdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    marginLeft: 'auto',
    height: 24,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.white95,
    borderWidth: 1,
    borderColor: colors.outlineSoft30,
  },
  /** 20pt section title and 13pt body need the wider column; the artwork's left
   *  32pt is faded out, so the copy never sits over visible pixels. */
  heroCopy: { width: '68%', gap: spacing.xs },
  heroFoot: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.lg },
  mpesaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 24,
    paddingRight: spacing.sm,
    paddingLeft: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.white95,
    borderWidth: 1,
    borderColor: colors.outlineSoft30,
  },
  mpesaDot: {
    width: 18,
    height: 18,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.lg,
    marginTop: spacing.sm,
  },
  tileWrap: { width: layout.categoryTileSize },
  tilePlus: {
    position: 'absolute',
    top: -spacing.xs,
    right: -spacing.xs,
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryContainer,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.hairline,
  },

  clubCard: { borderRadius: radius.card, padding: spacing.lg, gap: spacing.md },
  clubHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.lg },
  clubHeadText: { flex: 1, gap: spacing.xxs },
  clubPoints: { alignItems: 'flex-end' },
  clubFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  clubFootText: { flexShrink: 1 },
  clubAction: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },

  rail: { gap: spacing.md, paddingHorizontal: layout.screenMargin, paddingTop: spacing.sm },
  /** Rails sit inside a padded section but scroll edge to edge. */
  railBleed: { marginHorizontal: -layout.screenMargin },

  deal: {
    width: DEAL_CARD_WIDTH,
    minHeight: DEAL_CARD_HEIGHT,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.outlineSoft30,
    overflow: 'hidden',
    ...elevation.hairline,
  },
  dealArt: { position: 'absolute', top: 0, right: 0, bottom: 0, width: '40%' },
  dealFade: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 24 },
  // Copy stops short of the art panel (40% wide) so titles never run under the picture.
  dealBody: { flex: 1, justifyContent: 'space-between', gap: spacing.sm, paddingRight: '30%' },
  dealCopy: { gap: spacing.xs },
  dealBadge: { alignSelf: 'flex-start' },
  dealCta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },

  mpesaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.card,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.outlineSoft30,
  },
  mpesaGlyph: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mpesaCopy: { flex: 1, gap: spacing.xxs },

  alertRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  alertIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertBody: { flex: 1, gap: spacing.xxs },
});
