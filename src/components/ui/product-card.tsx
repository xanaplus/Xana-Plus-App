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
import { discountPercent, formatKes } from '@/lib/format';
import { useCart } from '@/store/cart';
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
 * The whole card is tappable via an overlay `Pressable` that sits *before* the
 * footer: react-native-web renders `accessibilityRole="button"` as a real
 * `<button>`, so the add control must be a sibling, never a child.
 */
export function ProductCard({ product, width, quantity = 0, onPress, onAdd, style }: ProductCardProps) {
  const { colors } = useTheme();
  const image = figmaAsset(product.image);
  const topBadge = product.badges?.[0];
  const press = usePressScale();

  return (
    <Animated.View style={[styles.card, width ? { width } : styles.flex, style, press.style]}>
      <View style={[styles.imageWrap, { backgroundColor: colors.surfaceContainerLow }]}>
        <ProductPhoto source={image} productId={product.id} accessibilityLabel={`${product.name} product photo`} variant="card" />
        {topBadge ? (
          <View style={styles.badges}>
            <Badge
              label={topBadge === 'discount' && product.wasPrice ? `SAVE ${discountPercent(product.price, product.wasPrice)}%` : badgeLabel[topBadge]}
              tone={badgeTone[topBadge]}
            />
          </View>
        ) : null}
        {product.inStock === false ? (
          <View style={[styles.outOfStock, { backgroundColor: colors.white70 }]}>
            <Txt variant="labelSm">Out of stock</Txt>
          </View>
        ) : null}
      </View>

      <View style={styles.packSlot}>
        {product.pack ? (
          <Txt variant="caption" color="outline" numberOfLines={1}>
            {product.pack}
          </Txt>
        ) : null}
      </View>
      <Txt variant="titleSm" numberOfLines={2} style={styles.title}>
        {product.name}
      </Txt>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={product.name}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={styles.overlay}
      />

      <View style={styles.footer}>
        <View style={styles.priceBlock}>
          <Txt variant="titleLg" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>
            {formatKes(product.price)}
          </Txt>
          {/* Only takes space when there is a was-price, so a lone price centres beside the + button. */}
          {product.wasPrice ? (
            <Txt variant="priceStrike" color="outline" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={styles.strike}>
              {formatKes(product.wasPrice)}
            </Txt>
          ) : null}
        </View>
        {product.inStock === false ? null : quantity > 0 ? (
          <CardStepper productId={product.id} quantity={quantity} />
        ) : (
          <ProductAddButton productName={product.name} onPress={onAdd} />
        )}
      </View>
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

/** Horizontal row used by search results and the cart's "Buy Again" rail. */
export function ProductRow({ product, eyebrow, description, quantity = 0, onPress, onAdd, trailing, style }: ProductRowProps) {
  const { colors } = useTheme();
  const image = figmaAsset(product.image);

  return (
    <View style={[styles.row, { backgroundColor: colors.surface }, style]}>
      <View style={[styles.rowImageWrap, { backgroundColor: colors.surfaceContainerLow }]}>
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
          (quantity > 0 ? (
            <CardStepper productId={product.id} quantity={quantity} />
          ) : (
            <ProductAddButton productName={product.name} onPress={onAdd} />
          ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs },
  flex: { flex: 1 },
  imageWrap: {
    aspectRatio: 1,
    borderRadius: radius.xl,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  badges: { position: 'absolute', top: spacing.sm, left: spacing.sm, flexDirection: 'row', gap: spacing.xs },
  outOfStock: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  packSlot: { height: 15 },
  title: { minHeight: 38 },
  footer: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs, marginTop: spacing.xs },
  priceBlock: { minWidth: 0, flex: 1, minHeight: 44, justifyContent: 'center' },
  strike: { textDecorationLine: 'line-through' },
  /** Tighter than the cart's stepper (~88pt) so the price keeps its room on a 168pt card; 36pt tall like the + button. */
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
