import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { useTabScrollTop } from '@/components/nav/use-tab-scroll-top';
import {
  BottomSheet,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  Icon,
  IconButton,
  ProductCard,
  QuantityStepper,
  Screen,
  SelectableOption,
  Txt,
  TopBar,
  TopBarAction,
} from '@/components/ui';
import { useTabBack } from '@/components/nav/use-tab-back';
import { ProductPhoto } from '@/components/ui/product-photo';
import { stores } from '@/data/catalog';
import { figmaAsset } from '@/data/images';
import { fetchProducts } from '@/data/live-catalogue';
import type { Product, SubstitutionPreference } from '@/data/types';
import { useBuyAgain } from '@/features/orders/buy-again';
import { formatCartCounts, formatKes } from '@/lib/format';
import { useCart } from '@/store/cart';
import { inStockAt, useFulfilment, useStoreStock } from '@/store/fulfilment';
import { pointsEarned } from '@/store/orders';
import { useSession } from '@/store/session';
import { radius, spacing } from '@/theme';
import { useTheme, useThemeStyles } from '@/theme/provider';
import type { Palette } from '@/theme';

const SUBSTITUTION_COPY: Record<SubstitutionPreference, { title: string; description: string }> = {
  similar: { title: 'Replace with similar', description: 'We’ll swap in the closest matching brand or size' },
  refund: { title: 'Refund the item', description: 'Remove it from the order and refund to M-Pesa' },
  call: { title: 'Call me first', description: 'A shopper calls you before changing anything' },
};

/** Screen 5 — Cart (Default State) and Screen 5a — Substitution Preference Sheet. */
export default function CartRoute() {
  const scrollTop = useTabScrollTop();
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const router = useRouter();
  const goBack = useTabBack();
  const cart = useCart();
  const { slot, store, storeId, setStoreId } = useFulfilment();
  const { inStock, storeShortName } = useStoreStock();
  const { user } = useSession();
  const [sheetOpen, setSheetOpen] = useState(false);

  const isEmpty = cart.itemCount === 0;
  const inCart = new Set(cart.lines.map(l => l.productId));
  const buyAgain = useBuyAgain().filter(p => !inCart.has(p.id));
  const earnable = pointsEarned(cart.summary.total);

  // Fresh BC stock each time the cart opens, so a line that sold out at this store shows before checkout.
  const lineKey = cart.lines.map(l => l.productId).join(',');
  useFocusEffect(
    useCallback(() => {
      if (lineKey) void fetchProducts(lineKey.split(',')).catch(() => undefined);
    }, [lineKey]),
  );

  // place-order refuses these, so they are flagged here, as Instacart does, instead of failing at payment.
  const unavailable = cart.items.filter(item => !inStock(item.product));
  const otherStore = unavailable.length
    ? stores.find(entry =>
        entry.id !== storeId &&
        cart.items.every(item => (item.product.stockByStore?.[entry.id.toUpperCase()] ?? 0) >= item.quantity || (!item.product.stockByStore && inStockAt(item.product, entry.id))),
      )
    : undefined;

  return (
    <Screen
      scrollRef={scrollTop}
      padded={false}
      contentStyle={styles.content}
      footer={
        isEmpty ? undefined : (
          <Button
            label={unavailable.length ? 'Remove sold-out items to continue' : `Checkout · ${formatKes(cart.summary.total)}.00`}
            icon="cart"
            iconPosition="leading"
            size="lg"
            disabled={unavailable.length > 0}
            onPress={() => router.push('/checkout')}
          />
        )
      }
    >
      <TopBar onBack={goBack}
        title="Cart Checkout"
        actions={
          <>
            <TopBarAction name="search" accessibilityLabel="Search products" onPress={() => router.push('/search')} />
            <Pressable accessibilityRole="button" accessibilityLabel="Account" onPress={() => router.push('/profile')}>
              <View style={styles.avatar}>
                <Txt variant="label" tint={colors.onPrimary}>
                  {user ? user.name.charAt(0) : 'A'}
                </Txt>
              </View>
            </Pressable>
          </>
        }
      />

      <View style={[styles.inset, styles.masthead]}>
        <View style={styles.mastheadText}>
          <Txt variant="display">Cart</Txt>
          <Txt variant="bodySm" color="onSurfaceVariant">
            ({formatCartCounts(cart.itemCount, cart.unitCount)})
          </Txt>
        </View>
        <View style={styles.expressChip}>
          <View style={styles.expressDot} />
          <Txt variant="labelSm" color="primaryAccent">
            {store.name.replace('Xana Plus ', '')}
          </Txt>
        </View>
      </View>

      {isEmpty ? (
        <View style={[styles.inset, styles.emptyBlock]}>
          <EmptyState
            icon="cart"
            title="Your cart is empty"
            description="Add groceries, meds and household essentials to get started."
          >
            <Button label="Start Shopping" icon="arrow-right" iconPosition="trailing" onPress={() => router.push('/(tabs)')} />
          </EmptyState>
          <View style={styles.emptyChips}>
            <Chip label="Fresh Produce" onPress={() => router.push('/(tabs)/categories')} />
            <Chip label="Pharmacy" onPress={() => router.push('/(tabs)/pharmacy')} />
            <Chip label="Household" onPress={() => router.push('/(tabs)/categories')} />
          </View>
        </View>
      ) : (
        <>
        <Card variant="elevated" padding={spacing.lg} style={styles.inset}>
          <View style={styles.slotRow}>
            <View style={styles.slotIcon}>
              <Icon name="delivery" size={20} color="primaryAccent" />
            </View>
            <View style={styles.slotBody}>
              <Txt variant="title">{slot.window}</Txt>
              <Txt variant="caption" color="onSurfaceVariant">
                {slot.label} · {cart.itemCount} active {cart.itemCount === 1 ? 'item' : 'items'}
              </Txt>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Change delivery slot" hitSlop={8} onPress={() => router.push('/checkout')}>
              <Icon name="more" size={18} color="onSurfaceVariant" />
            </Pressable>
          </View>
        </Card>

        {unavailable.length ? (
          <View style={[styles.inset, styles.soldOut]}>
            <Icon name="alert" size={18} color="error" />
            <View style={styles.soldOutBody}>
              <Txt variant="label" tint={colors.error}>
                {`${unavailable.length === 1 ? '1 item is' : `${unavailable.length} items are`} out of stock at ${storeShortName}`}
              </Txt>
              <Txt variant="caption" color="onSurfaceVariant">
                Remove {unavailable.length === 1 ? 'it' : 'them'} to check out{otherStore ? `, or shop from ${otherStore.name.replace('Xana Plus ', '')}, which has everything in your cart` : ''}.
              </Txt>
              <View style={styles.soldOutActions}>
                <Button label="Remove sold-out items" size="sm" variant="outline" onPress={() => unavailable.forEach(item => cart.remove(item.product.id))} />
                {otherStore ? (
                  <Button label={`Switch to ${otherStore.name.replace('Xana Plus ', '')}`} size="sm" onPress={() => setStoreId(otherStore.id)} />
                ) : null}
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.inset}>
          {cart.items.map(item => (
            // Removing a line fades it out and the rest slide up to close the gap.
            <Animated.View key={item.product.id} entering={FadeIn.duration(200)} exiting={FadeOut.duration(180)} layout={LinearTransition.duration(220)}>
            <CartLineRow
              product={item.product}
              quantity={item.quantity}
              unitPrice={item.unitPrice}
              soldOutAt={inStock(item.product) ? undefined : storeShortName}
              onIncrement={() => cart.increment(item.product.id)}
              onDecrement={() => cart.decrement(item.product.id)}
              onRemove={() => cart.remove(item.product.id)}
              onPress={() => router.push(`/product/${item.product.id}`)}
            />
            </Animated.View>
          ))}
        </View>

        {cart.summary.wholesaleSavings > 0 ? (
          <View style={[styles.inset, styles.savingsNote]}>
            <Icon name="check-circle" size={16} color="primaryAccent" />
            <Txt variant="labelSm" color="primaryAccent">
              Wholesale pricing applied. You’re saving {formatKes(cart.summary.wholesaleSavings)}
            </Txt>
          </View>
        ) : null}

        <Pressable accessibilityRole="button" onPress={() => setSheetOpen(true)} style={[styles.inset, styles.substitutionRow]}>
          <Icon name="refresh" size={20} color="primaryAccent" />
          <View style={styles.substitutionBody}>
            <Txt variant="title">If an item is unavailable</Txt>
            <Txt variant="caption" color="onSurfaceVariant">
              {SUBSTITUTION_COPY[cart.substitution].title}
            </Txt>
          </View>
          <Icon name="chevron-right" size={18} color="onSurfaceVariant" />
        </Pressable>
        </>
      )}

      {buyAgain.length === 0 ? null : (
      <View style={styles.section}>
        <View style={[styles.inset, styles.sectionHead]}>
          <Txt variant="headlineLg">Buy Again</Txt>
          <Txt variant="caption" color="onSurfaceVariant">
            From recent orders
          </Txt>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.rail, styles.railContent]}
        >
          {buyAgain.map(product => (
            <ProductCard
              key={product.id}
              product={product}
              width={140}
              onPress={() => router.push(`/product/${product.id}`)}
              onAdd={() => cart.add(product.id)}
            />
          ))}
        </ScrollView>
      </View>
      )}

      {isEmpty ? null : (
      <Card variant="elevated" padding={spacing.lg} style={[styles.inset, styles.summary]}>
        <SummaryRow label={`Items Subtotal (${formatCartCounts(cart.itemCount, cart.unitCount)})`} value={formatKes(cart.summary.itemsSubtotal)} />
        {cart.summary.wholesaleSavings > 0 ? (
          <SummaryRow label="Wholesale savings already included" value={formatKes(cart.summary.wholesaleSavings)} tone="primary" />
        ) : null}
        <SummaryRow
          label={`Delivery Fee (${store.name.replace('Xana Plus ', '')})`}
          value={cart.summary.deliveryFee === 0 ? 'Free' : formatKes(cart.summary.deliveryFee)}
        />
        {cart.summary.platformFee > 0 ? <SummaryRow label="Packaging fee" value={formatKes(cart.summary.platformFee)} /> : null}
        <Divider />
        <View style={styles.totalRow}>
          <Txt variant="titleLg">To Pay</Txt>
          <Txt variant="display">{formatKes(cart.summary.total)}</Txt>
        </View>
        {/* Points this order earns, before checkout (McDonald's, Jumia); guests are nudged to log in. */}
        {earnable > 0 ? (
          <Pressable
            accessibilityRole={user ? 'text' : 'button'}
            disabled={!!user}
            onPress={() => router.push('/login')}
            style={styles.pointsRow}
          >
            <Icon name="star" size={14} color="secondaryAccent" />
            <Txt variant="label" color="secondaryAccent" style={styles.pointsText}>
              {user
                ? `You'll earn ${earnable} Xana Club ${earnable === 1 ? 'point' : 'points'}`
                : `Log in to earn ${earnable} Xana Club ${earnable === 1 ? 'point' : 'points'} on this order`}
            </Txt>
          </Pressable>
        ) : null}
      </Card>
      )}

      <BottomSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="If an item is unavailable"
        description="Choose how our shoppers should handle out-of-stock items in this order."
        footer={<Button label="Save preference" onPress={() => setSheetOpen(false)} />}
      >
        {(Object.keys(SUBSTITUTION_COPY) as SubstitutionPreference[]).map(preference => (
          <SelectableOption
            key={preference}
            title={SUBSTITUTION_COPY[preference].title}
            description={SUBSTITUTION_COPY[preference].description}
            selected={cart.substitution === preference}
            onPress={() => {
              cart.setSubstitution(preference);
              setSheetOpen(false);
            }}
          />
        ))}
      </BottomSheet>
    </Screen>
  );
}

/** One cart line: thumbnail, details, wholesale breakdown and quantity control. */
function CartLineRow({
  product,
  quantity,
  unitPrice: price,
  soldOutAt,
  onIncrement,
  onDecrement,
  onRemove,
  onPress,
}: {
  product: Product;
  quantity: number;
  unitPrice: number;
  /** Store short name when this line is out of stock there. */
  soldOutAt?: string;
  onIncrement: () => void;
  onDecrement: () => void;
  onRemove: () => void;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const image = figmaAsset(product.image);
  const wholesale = price < product.price;

  return (
    <View style={styles.line}>
      <Pressable accessibilityRole="button" accessibilityLabel={product.name} onPress={onPress} style={styles.lineImageWrap}>
        <ProductPhoto source={image} productId={product.id} accessibilityLabel={`${product.name} product photo`} variant="row" />
      </Pressable>

      <View style={styles.lineBody}>
        <View style={styles.lineHead}>
          <Txt variant="titleLg" numberOfLines={2} style={styles.lineTitle}>
            {product.name}
          </Txt>
          <IconButton
            name="trash"
            accessibilityLabel={`Remove ${product.name}`}
            onPress={onRemove}
            size={28}
            background={colors.transparent}
            iconSize={18}
            color="onSurfaceVariant"
          />
        </View>
        <Txt variant="caption" color="onSurfaceVariant" numberOfLines={2}>
          {product.pack}
        </Txt>
        {soldOutAt ? (
          <Txt variant="labelSm" tint={colors.error}>
            {`Out of stock at ${soldOutAt}`}
          </Txt>
        ) : null}
        <View style={styles.lineFooter}>
          <View style={styles.linePrices}>
            <Txt variant="titleLg">{formatKes(price * quantity)}</Txt>
            {wholesale ? (
              <>
                <Txt variant="caption" color="onSurfaceVariant">
                  {formatKes(price)} ea
                </Txt>
                <Txt variant="caption" color="outline" style={styles.strike}>
                  {formatKes(product.price)}
                </Txt>
              </>
            ) : null}
          </View>
          <QuantityStepper quantity={quantity} onIncrement={onIncrement} onDecrement={onDecrement} size="compact" />
        </View>
      </View>
    </View>
  );
}

function SummaryRow({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'primary' }) {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  return (
    <View style={styles.summaryRow}>
      <Txt variant="bodySm" color="onSurfaceVariant" numberOfLines={2} style={styles.summaryLabel}>
        {label}
      </Txt>
      <Txt variant="label" tint={tone === 'primary' ? colors.primaryAccent : colors.onSurface}>
        {value}
      </Txt>
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  content: { gap: spacing.lg },
  inset: { marginHorizontal: 20 },
  avatar: { width: 32, height: 32, borderRadius: radius.pill, backgroundColor: colors.primaryContainer, alignItems: 'center', justifyContent: 'center' },
  masthead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  mastheadText: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, flexShrink: 1 },
  expressChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.mintSurface,
  },
  expressDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.primaryContainer },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  slotIcon: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.mintSurface, alignItems: 'center', justifyContent: 'center' },
  slotBody: { flex: 1, gap: 2 },
  line: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md },
  lineImageWrap: { width: 68, height: 68, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceContainerLow },
  lineBody: { flex: 1, gap: spacing.xs },
  lineHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  lineTitle: { flex: 1 },
  lineFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.xxs },
  linePrices: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, flexShrink: 1 },
  strike: { textDecorationLine: 'line-through' },
  soldOut: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.errorContainer },
  soldOutBody: { flex: 1, gap: spacing.xs },
  soldOutActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  savingsNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.successContainer,
  },
  substitutionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surfaceContainerHigh,
  },
  substitutionBody: { flex: 1, gap: 2 },
  section: { gap: spacing.md },
  emptyBlock: { gap: spacing.lg, paddingVertical: spacing.xl },
  emptyChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  rail: { flexDirection: 'row', gap: spacing.md },
  // The screen is unpadded, so the rail already runs edge to edge; this insets its first card.
  railContent: { paddingHorizontal: 20 },
  summary: { gap: spacing.sm },
  summaryRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.lg },
  summaryLabel: { flexShrink: 1 },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.sm },
  pointsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingTop: spacing.xs },
  pointsText: { flex: 1 },
});
