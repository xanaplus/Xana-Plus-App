import { usePathname, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/icon';
import { Txt } from '@/components/ui/text';
import { productById } from '@/data/catalog';
import { useCart } from '@/store/cart';
import { colors, elevation, layout, radius, spacing } from '@/theme';

/** How long "Added to cart" stays up before sliding away. */
const SHOW_MS = 2200;

/**
 * "Added to cart" confirmation that slides up from the bottom after every add,
 * with a shortcut to the cart. Sits above the tab bar and the checkout footers.
 */
export function CartToast() {
  const { lastAdded, itemCount } = useCart();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [hiddenKey, setHiddenKey] = useState<number | null>(null);

  useEffect(() => {
    if (!lastAdded) return;
    const timer = setTimeout(() => setHiddenKey(lastAdded.key), SHOW_MS);
    return () => clearTimeout(timer);
  }, [lastAdded]);

  // No need to announce it on the cart itself, where the new line is already in view.
  const onCart = pathname === '/cart';
  const visible = lastAdded !== null && lastAdded.key !== hiddenKey && !onCart;
  if (!visible || !lastAdded) return null;

  const name = productById(lastAdded.productId)?.name ?? 'Item';
  const openCart = () => {
    setHiddenKey(lastAdded.key);
    router.push('/(tabs)/cart');
  };

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: layout.tabBarHeight + insets.bottom + spacing.md }]}>
      <Animated.View
        key={lastAdded.key}
        entering={FadeInDown.duration(220)}
        exiting={FadeOutDown.duration(180)}
        accessibilityLiveRegion="polite"
        style={[styles.toast, elevation.floating]}
      >
        <View style={styles.check}>
          <Icon name="check" size={16} color="onPrimary" />
        </View>
        <View style={styles.copy}>
          <Txt variant="label" tint={colors.inverseOnSurface} numberOfLines={1}>
            {lastAdded.quantity > 1 ? `${lastAdded.quantity} × ${name}` : name}
          </Txt>
          <Txt variant="caption" tint={colors.white70} numberOfLines={1}>
            {`Added to cart · ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`}
          </Txt>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="View cart" onPress={openCart} hitSlop={8} style={styles.action}>
          <Txt variant="label" tint={colors.primaryFixed}>
            View cart
          </Txt>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: layout.screenMargin },
  toast: {
    width: '100%',
    maxWidth: layout.maxContentWidth - layout.screenMargin * 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.inverseSurface,
  },
  check: { width: 28, height: 28, borderRadius: radius.pill, backgroundColor: colors.primaryContainer, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 2 },
  action: { paddingVertical: spacing.xs },
});
