import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { Badge, type BadgeTone } from '@/components/ui/badge';
import { ProductAddButton } from '@/components/ui/product-add-button';
import { usePressScale } from '@/components/ui/pressable-scale';
import { ProductPhoto } from '@/components/ui/product-photo';
import { QuantityStepper } from '@/components/ui/quantity-stepper';
import { Txt } from '@/components/ui/text';
import { figmaAsset } from '@/data/images';
import type { Product, ProductBadge } from '@/data/types';
import { discountPercent, formatKes, nameWithoutPack } from '@/lib/format';
import { useCart } from '@/store/cart';
import { useStoreStock } from '@/store/fulfilment';
import { elevation, radius, spacing } from '@/theme';
import { useTheme } from '@/theme/provider';

const badgeTone: Record<ProductBadge, BadgeTone> = {
  discount: 'discount',
  fresh: 'fresh',
  new: 'new',
  organic: 'info',
  bulk: 'warning',
};

const badgeLabel: Record<ProductBadge, string> = {
  discount: 'SAVE',
  fresh: 'FRESH',
  new: 'NEW',
  organic: 'ORGANIC',
  bulk: 'BULK',
};

export type ProductCardProps = {
  product: Product;
  /** Fixed width for horizontal rails; omit to flex inside a grid cell. */
  width?: number;
  quantity?: number;
  onPress?: () => void;
  onAdd?: () => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * Vertical product card used by the Home rails, category grids and search.
 *
 * Retail-app order: a big photo with the + on its corner (Instacart / Glovo), then
 * price, name and size. Out-of-stock cards fade and lose the +.
 *
 * The whole card is tappable via an overlay `Pressable` that sits *before* the
 * add control: react-native-web renders `accessibilityRole="button"` as a real
 * `<button>`, so the add control must be a sibling, never a child.
 */
export function ProductCard({ product, width, quantity = 0, onPress, onAdd, style }: ProductCardProps) {
  const { colors } = useTheme();
  const image = figmaAsset(product.image);
  const topBadge = product.badges?.[0];
  const press = usePressScale();
  const available = useStoreStock().inStock(product);

  return (
    <Animated.View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.outlineSoft30 }, width ? { width } : styles.flex, style, press.style]}>
      <View style={[styles.body, !available && styles.faded]}>
        <View style={[styles.imageWrap, { backgroundColor: colors.surface }]}>
          <ProductPhoto source={image} productId={product.id} accessibilityLabel={`${product.name} product photo`} variant="card" />
          {topBadge ? (
            <View style={styles.badges}>
              <Badge
                label={topBadge === 'discount' && product.wasPrice ? `SAVE ${discountPercent(product.price, product.wasPrice)}%` : badgeLabel[topBadge]}
                tone={badgeTone[topBadge]}
              />
            </View>
          ) : null}
        </View>

        <View style={styles.priceRow}>
          <Txt variant="titleLg" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68} style={styles.price}>
            {formatKes(product.price)}
          </Txt>
          {product.wasPrice ? (
            <Txt variant="priceStrike" color="outline" numberOfLines={1} style={styles.strike}>
              {formatKes(product.wasPrice)}
            </Txt>
          ) : null}
        </View>
        {/* Fixed height for two name lines plus the size, so cards in a row line up. */}
        <View style={styles.nameBlock}>
          <Txt variant="titleSm" numberOfLines={2}>
            {nameWithoutPack(product.name, product.pack)}
          </Txt>
          {!available ? (
            <Txt variant="labelSm" color="onSurfaceVariant" numberOfLines={1}>
              Out of stock
            </Txt>
          ) : product.pack ? (
            <Txt variant="caption" color="outline" numberOfLines={1}>
              {product.pack}
            </Txt>
          ) : null}
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={product.name}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={styles.overlay}
      />

      {/* Same box as the photo, so the + sits on the photo's bottom-right corner. */}
      {available ? (
        <View pointerEvents="box-none" style={styles.addFrame}>
          <View style={styles.addSlot}>
            {quantity > 0 ? (
              <CardStepper productId={product.id} quantity={quantity} />
            ) : (
              <ProductAddButton productName={product.name} onPress={onAdd} rxRequired={product.rxRequired} style={elevation.raised} />
            )}
          </View>
        </View>
      ) : null}
    </Animated.View>
  );
}

/**
 * Once an item is in the cart its Add button becomes − n +, as on Instacart and Glovo,
 * so shoppers change amounts without opening the product. − at 1 takes it out.
 */
function CardStepper({ productId, quantity }: { productId: string; quantity: number }) {
  const cart = useCart();
  return (
    // Pops in where "+ Add" was, so the tap visibly turned into a counter.
    <Animated.View entering={ZoomIn.duration(180)}>
      <QuantityStepper
      quantity={quantity}
      min={0}
      size="compact"
      tone="brand"
      onIncrement={() => cart.setQuantity(productId, quantity + 1)}
      onDecrement={() => cart.setQuantity(productId, quantity - 1)}
      style={styles.cardStepper}
      />
    </Animated.View>
  );
}

export type ProductRowProps = {
  product: Product;
  /** Eyebrow line above the name (brand, aisle, or category hint). */
  eyebrow?: string;
  description?: string;
  quantity?: number;
  onPress?: () => void;
  onAdd?: () => void;
  /** Replaces the add button — e.g. a quantity stepper in the cart. */
  trailing?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Horizontal row used by search results, the cart's "Buy Again" rail and Home's short Buy it again list. */
export function ProductRow({ product, eyebrow, description, quantity = 0, onPress, onAdd, trailing, style }: ProductRowProps) {
  const { colors } = useTheme();
  const image = figmaAsset(product.image);
  const available = useStoreStock().inStock(product);

  return (
    <View style={[styles.row, { backgroundColor: colors.surface }, style]}>
      <View style={[styles.rowImageWrap, { backgroundColor: colors.surface }]}>
        <ProductPhoto source={image} productId={product.id} accessibilityLabel={`${product.name} product photo`} variant="row" />
      </View>
      <View style={styles.rowBody}>
        {eyebrow ? (
          <Txt variant="overline" color="primaryAccent" numberOfLines={1}>
            {eyebrow}
          </Txt>
        ) : null}
        <Txt variant="titleSm" numberOfLines={2}>
          {product.name}
        </Txt>
        <Txt variant="caption" color="outline" numberOfLines={1}>
          {description ?? product.pack}
        </Txt>
        <View style={styles.rowFooter}>
          <Txt variant="title">{formatKes(product.price)}</Txt>
          {product.wasPrice ? (
            <Txt variant="priceStrike" color="outline">
              {formatKes(product.wasPrice)}
            </Txt>
          ) : null}
        </View>
      </View>

      <Pressable accessibilityRole="button" accessibilityLabel={product.name} onPress={onPress} style={styles.overlay} />

      <View style={styles.trailing}>
        {trailing ??
          (!available ? (
            <Txt variant="labelSm" color="outline">
              Out of stock
            </Txt>
          ) : quantity > 0 ? (
            <CardStepper productId={product.id} quantity={quantity} />
          ) : (
            <ProductAddButton productName={product.name} onPress={onAdd} rxRequired={product.rxRequired} />
          ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // A white card with a hairline edge, like the search tiles, so the white photo box has a frame.
  card: { padding: spacing.sm, borderRadius: radius.xl, borderWidth: 1, ...elevation.card },
  flex: { flex: 1 },
  body: { gap: spacing.xxs },
  faded: { opacity: 0.45 },
  imageWrap: {
    aspectRatio: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  badges: { position: 'absolute', top: spacing.xs, left: spacing.xs, flexDirection: 'row', gap: spacing.xs },
  /** Mirrors imageWrap's box (card padding, square) so the add control can pin to the photo's corner. */
  addFrame: { position: 'absolute', top: spacing.sm, left: spacing.sm, right: spacing.sm, aspectRatio: 1 },
  addSlot: { position: 'absolute', right: spacing.xs, bottom: spacing.xs },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  price: { flexShrink: 1, minWidth: 0 },
  nameBlock: { minHeight: 56, gap: spacing.xxs },
  strike: { flexShrink: 1, textDecorationLine: 'line-through' },
  /** Tighter than the cart's stepper (~88pt) so it fits on the photo corner of a 168pt card. */
  cardStepper: { gap: spacing.xs, paddingHorizontal: spacing.xxs, paddingVertical: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.card,
    ...elevation.hairline,
  },
  rowImageWrap: { width: 64, height: 64, borderRadius: radius.lg, overflow: 'hidden' },
  rowBody: { flex: 1, gap: 2 },
  rowFooter: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, marginTop: spacing.xxs },
  /** Card-wide tap target; rendered before the trailing control so the two are siblings. */
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  trailing: { alignItems: 'center', justifyContent: 'center' },
});
