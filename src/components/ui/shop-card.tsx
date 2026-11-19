import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { Badge } from '@/components/ui/badge';
import { ProductAddButton } from '@/components/ui/product-add-button';
import { usePressScale } from '@/components/ui/pressable-scale';
import { ProductPhoto } from '@/components/ui/product-photo';
import { QuantityStepper } from '@/components/ui/quantity-stepper';
import { Txt } from '@/components/ui/text';
import { figmaAsset } from '@/data/images';
import type { Product } from '@/data/types';
import { discountPercent, formatKes, nameWithoutPack } from '@/lib/format';
import { activePriceTiers } from '@/lib/quantity-pricing';
import { useOffer } from '@/lib/use-offer';
import { useCart } from '@/store/cart';
import { useStoreStock } from '@/store/fulfilment';
import { elevation, radius, spacing } from '@/theme';
import { useThemeStyles } from '@/theme/provider';
import type { Palette } from '@/theme';

export type ShopCardProps = {
  product: Product;
  quantity: number;
  /** Wholesale: show the BC quantity prices as a small price list under the name. */
  showQuantityPrices?: boolean;
  onPress: () => void;
  onAdd: () => void;
};

/** "KES 1,550" → "1,550", so the currency can be set smaller than the amount. */
const amountOf = (value: number) => formatKes(value).replace(/^KES\s/, '');

/**
 * The Shop's product card (19 Nov 2026): no box around it, just the photo on a white
 * tile and the price tag, name and size beneath, so a grid reads as one tidy shelf.
 * Every photo sits on the same white tile with the same inset, whatever its own
 * background, and the + rides the tile's corner (Instacart / Glovo).
 */
export function ShopCard({ product, quantity, showQuantityPrices = false, onPress, onAdd }: ShopCardProps) {
  const styles = useThemeStyles(createStyles);
  const press = usePressScale();
  const available = useStoreStock().inStock(product);
  const offer = useOffer(product);
  const price = offer?.price ?? product.price;
  const struck = offer ? product.price : product.wasPrice;
  // The quantity price never shows beside a branch offer: the two would disagree.
  const steps = showQuantityPrices && !offer
    ? activePriceTiers(product.priceTiers).filter(tier => tier.unitPrice < product.price).slice(0, 2)
    : [];

  return (
    <Animated.View style={[styles.card, press.style]}>
      <View style={[styles.tile, !available && styles.faded]}>
        <View style={styles.photo}>
          <ProductPhoto source={figmaAsset(product.image)} productId={product.id} accessibilityLabel={`${product.name} product photo`} variant="card" />
        </View>
        {offer ? (
          <View style={styles.badge}>
            <Badge label={`SAVE ${discountPercent(offer.price, product.price)}%`} tone="discount" />
          </View>
        ) : null}
      </View>

      <View style={[styles.text, !available && styles.faded]}>
        <View style={styles.priceRow}>
          <Txt variant="labelSm" color="onSurfaceVariant" style={styles.currency}>KES</Txt>
          <Txt variant="priceLg" numberOfLines={1} style={styles.amount}>{amountOf(price)}</Txt>
          {struck ? (
            <Txt variant="caption" color="outline" numberOfLines={1} style={styles.strike}>{amountOf(struck)}</Txt>
          ) : null}
        </View>
        <Txt variant="titleSm" numberOfLines={2}>{nameWithoutPack(product.name, product.pack)}</Txt>
        <Txt variant="caption" color="outline" numberOfLines={1}>
          {available ? product.pack : 'Out of stock'}
        </Txt>

        {steps.length > 0 ? (
          <>
          {/* Pushes the price list to the card's foot, so lists line up across a row. */}
          <View style={styles.push} />
          <View style={styles.ladder} accessibilityLabel={`Quantity prices: ${steps.map(step => `${step.minQty} or more, ${formatKes(Math.ceil(step.unitPrice))} each`).join('; ')}`}>
            <View style={styles.step}>
              <Txt variant="labelSm" color="onSurfaceVariant">{steps[0].minQty <= 2 ? '1' : `1–${steps[0].minQty - 1}`}</Txt>
              <Txt variant="labelSm" color="onSurfaceVariant">{formatKes(product.price)}</Txt>
            </View>
            {steps.map(step => (
              <View key={step.minQty} style={styles.step}>
                <Txt variant="label" color="primaryAccent">{`${step.minQty}+`}</Txt>
                {/* Whole shillings, rounded up so the label never undercuts the till. */}
                <Txt variant="label" color="primaryAccent">{`${formatKes(Math.ceil(step.unitPrice))} each`}</Txt>
              </View>
            ))}
          </View>
          </>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={product.name}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={styles.overlay}
      />

      {/* Same box as the tile, so the + pins to the photo's bottom-right corner. */}
      {available ? (
        <View pointerEvents="box-none" style={styles.addFrame}>
          <View style={styles.addSlot}>
            {quantity > 0 ? (
              <ShopCardStepper productId={product.id} quantity={quantity} />
            ) : (
              <ProductAddButton productName={product.name} onPress={onAdd} rxRequired={product.rxRequired} style={elevation.raised} />
            )}
          </View>
        </View>
      ) : null}
    </Animated.View>
  );
}

/** − n + in place of the +, once the item is in the cart; − at 1 takes it out. */
function ShopCardStepper({ productId, quantity }: { productId: string; quantity: number }) {
  const cart = useCart();
  const styles = useThemeStyles(createStyles);
  return (
    <Animated.View entering={ZoomIn.duration(180)}>
      <QuantityStepper
        quantity={quantity}
        min={0}
        size="compact"
        tone="brand"
        onIncrement={() => cart.setQuantity(productId, quantity + 1)}
        onDecrement={() => cart.setQuantity(productId, quantity - 1)}
        style={styles.stepper}
      />
    </Animated.View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  /** Fills its grid cell, so both cards in a row share a height. */
  card: { flex: 1, gap: spacing.sm },
  /** White in both themes: most POS photos are on white, so the tile and photo become one. */
  tile: {
    aspectRatio: 1,
    borderRadius: radius.xl,
    backgroundColor: '#ffffff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineSoft30,
    overflow: 'hidden',
  },
  /** One inset for every photo, so packs of any background sit alike. */
  photo: { flex: 1, padding: spacing.md },
  badge: { position: 'absolute', top: spacing.sm, left: spacing.sm },
  faded: { opacity: 0.45 },
  text: { flex: 1, gap: 2, paddingHorizontal: spacing.xxs },
  push: { flexGrow: 1 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  currency: { letterSpacing: 0.4 },
  amount: { flexShrink: 1 },
  strike: { marginLeft: spacing.xs, textDecorationLine: 'line-through' },
  ladder: {
    marginTop: spacing.sm - 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: 2,
    borderRadius: radius.md,
    backgroundColor: colors.mintSurface,
  },
  step: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  addFrame: { position: 'absolute', top: 0, left: 0, right: 0, aspectRatio: 1 },
  addSlot: { position: 'absolute', right: spacing.sm, bottom: spacing.sm },
  stepper: { gap: spacing.xs, paddingHorizontal: spacing.xxs, paddingVertical: spacing.xs },
});
