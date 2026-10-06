import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

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
import { ProductPhoto } from '@/components/ui/product-photo';
import { productsByIds } from '@/data/catalog';
import { figmaAsset } from '@/data/images';
import type { Product, SubstitutionPreference } from '@/data/types';
import { formatCartCounts, formatKes } from '@/lib/format';
import { useCart } from '@/store/cart';
import { useFulfilment } from '@/store/fulfilment';
import { useOrders } from '@/store/orders';
import { useSession } from '@/store/session';
import { colors, radius, spacing } from '@/theme';

/** "Buy Again" rail — recent-order items from Screen 5. */
const BUY_AGAIN_IDS = ['sukuma-wiki', 'vitamin-c-1000mg', 'acacia-honey-500g'];

const SUBSTITUTION_COPY: Record<SubstitutionPreference, { title: string; description: string }> = {
  similar: { title: 'Replace with similar', description: 'We’ll swap in the closest matching brand or size' },
  refund: { title: 'Refund the item', description: 'Remove it from the order and refund to M-Pesa' },
  call: { title: 'Call me first', description: 'A shopper calls you before changing anything' },
};

/** Screen 5 — Cart (Default State) and Screen 5a — Substitution Preference Sheet. */
export default function CartRoute() {
  const router = useRouter();
  const cart = useCart();
  const { slot, store } = useFulfilment();
  const { user, isDemo } = useSession();
  const { orders } = useOrders();
  const [sheetOpen, setSheetOpen] = useState(false);

  const isEmpty = cart.itemCount === 0;
  const inCart = new Set(cart.lines.map(l => l.productId));
  // The demo account keeps the sample picks; everyone else sees what they actually ordered before.
  const pastIds = [...new Set(orders.filter(o => o.status !== 'cancelled').flatMap(o => o.lines.map(l => l.productId)))];
  const buyAgain = productsByIds(isDemo ? BUY_AGAIN_IDS : pastIds.slice(0, 8)).filter(p => !inCart.has(p.id));

  return (
    <Screen
      padded={false}
      contentStyle={styles.content}
      footer={
        isEmpty ? undefined : (
          <Button
            label={`Checkout · ${formatKes(cart.summary.total)}.00`}
            icon="cart"
            iconPosition="leading"
            size="lg"
            onPress={() => router.push('/checkout')}
          />
        )
      }
    >
      <TopBar
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
          <Txt variant="labelSm" color="primary">
            Nairobi Express
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
              <Icon name="delivery" size={20} color="primary" />
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

        <View style={styles.inset}>
          {cart.items.map(item => (
            // Removing a line fades it out and the rest slide up to close the gap.
            <Animated.View key={item.product.id} entering={FadeIn.duration(200)} exiting={FadeOut.duration(180)} layout={LinearTransition.duration(220)}>
            <CartLineRow
              product={item.product}
              quantity={item.quantity}
              unitPrice={item.unitPrice}
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
            <Icon name="check-circle" size={16} color="primary" />
            <Txt variant="labelSm" color="primary">
              Wholesale pricing applied. You’re saving {formatKes(cart.summary.wholesaleSavings)}
            </Txt>
          </View>
        ) : null}

        <Pressable accessibilityRole="button" onPress={() => setSheetOpen(true)} style={[styles.inset, styles.substitutionRow]}>
          <Icon name="refresh" size={20} color="primaryContainer" />
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
          <SummaryRow label="Quantity Wholesale Savings" value={`-${formatKes(cart.summary.wholesaleSavings)}`} tone="primary" />
        ) : null}
        <SummaryRow
          label={`Delivery Fee (${store.name.replace('Xana Plus ', '')} / Ruiru)`}
          value={cart.summary.deliveryFee === 0 ? 'Free' : formatKes(cart.summary.deliveryFee)}
        />
        <Divider />
        <View style={styles.totalRow}>
          <Txt variant="titleLg">To Pay</Txt>
          <Txt variant="display">{formatKes(cart.summary.total)}</Txt>
        </View>
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
  onIncrement,
  onDecrement,
  onRemove,
  onPress,
}: {
  product: Product;
  quantity: number;
  unitPrice: number;
  onIncrement: () => void;
  onDecrement: () => void;
  onRemove: () => void;
  onPress: () => void;
}) {
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
  return (
    <View style={styles.summaryRow}>
      <Txt variant="bodySm" color="onSurfaceVariant" numberOfLines={2} style={styles.summaryLabel}>
        {label}
      </Txt>
      <Txt variant="label" tint={tone === 'primary' ? colors.primary : colors.onSurface}>
        {value}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
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
});
