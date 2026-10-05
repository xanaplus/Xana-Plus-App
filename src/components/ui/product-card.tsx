import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { usePressScale } from '@/components/ui/pressable-scale';
import { Txt } from '@/components/ui/text';
import { figmaAsset } from '@/data/images';
import type { Product, ProductBadge } from '@/data/types';
import { discountPercent, formatKes } from '@/lib/format';
import { colors, elevation, radius, spacing } from '@/theme';

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
  const image = figmaAsset(product.image);
  const topBadge = product.badges?.[0];
  const press = usePressScale();

  return (
    <Animated.View style={[styles.card, width ? { width } : styles.flex, style, press.style]}>
      <View style={styles.imageWrap}>
        {image ? (
          <Image source={image} style={styles.image} contentFit="cover" transition={120} />
        ) : (
          // Business Central items have no photos yet; a faint glyph reads as "no photo", not "still loading".
          <View style={styles.noPhoto}>
            <Icon name="store" size={28} color="outlineVariant" />
          </View>
        )}
        {topBadge ? (
          <View style={styles.badges}>
            <Badge
              label={topBadge === 'discount' && product.wasPrice ? `SAVE ${discountPercent(product.price, product.wasPrice)}%` : badgeLabel[topBadge]}
              tone={badgeTone[topBadge]}
            />
          </View>
        ) : null}
        {product.inStock === false ? (
          <View style={styles.outOfStock}>
            <Txt variant="labelSm">Out of stock</Txt>
          </View>
        ) : null}
      </View>

      <Txt variant="caption" color="outline" numberOfLines={1}>
        {product.pack}
      </Txt>
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
          <Txt variant="titleLg">{formatKes(product.price)}</Txt>
          {product.wasPrice ? (
            <Txt variant="priceStrike" color="outline" style={styles.strike}>
              {formatKes(product.wasPrice)}
            </Txt>
          ) : null}
        </View>
        {product.inStock === false ? null : quantity > 0 ? (
          <View style={styles.qtyPill}>
            <Txt variant="label" tint={colors.onPrimary}>
              {quantity}
            </Txt>
          </View>
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
  const image = figmaAsset(product.image);

  return (
    <View style={[styles.row, style]}>
      <View style={styles.rowImageWrap}>
        {image ? (
          <Image source={image} style={styles.rowImage} contentFit="cover" transition={120} />
        ) : (
          <View style={styles.noPhoto}>
            <Icon name="store" size={20} color="outlineVariant" />
          </View>
        )}
      </View>
      <View style={styles.rowBody}>
        {eyebrow ? (
          <Txt variant="overline" color="primaryContainer" numberOfLines={1}>
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
            <View style={styles.qtyPill}>
              <Txt variant="label" tint={colors.onPrimary}>
                {quantity}
              </Txt>
            </View>
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
          ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs },
  flex: { flex: 1 },
  imageWrap: {
    height: 132,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.surfaceContainerLow,
    marginBottom: spacing.sm,
  },
  image: { width: '100%', height: '100%' },
  noPhoto: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badges: { position: 'absolute', top: spacing.sm, left: spacing.sm, flexDirection: 'row', gap: spacing.xs },
  outOfStock: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { minHeight: 38 },
  footer: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.xs },
  priceBlock: { flexShrink: 1 },
  strike: { textDecorationLine: 'line-through' },
  addButton: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.hairline,
  },
  qtyPill: {
    minWidth: 34,
    height: 34,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    ...elevation.hairline,
  },
  rowImageWrap: { width: 64, height: 64, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceContainerLow },
  rowImage: { width: '100%', height: '100%' },
  rowBody: { flex: 1, gap: 2 },
  rowFooter: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, marginTop: spacing.xxs },
  /** Card-wide tap target; rendered before the trailing control so the two are siblings. */
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  trailing: { alignItems: 'center', justifyContent: 'center' },
});
