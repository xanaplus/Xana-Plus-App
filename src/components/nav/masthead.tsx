import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Txt } from '@/components/ui';
import { useBump } from '@/components/ui/motion';
import { PressableScale } from '@/components/ui/pressable-scale';
import { useCart } from '@/store/cart';
import { useFulfilment } from '@/store/fulfilment';
import { useSession } from '@/store/session';
import { elevation, layout, radius, spacing } from '@/theme';
import { useTheme, useThemeStyles } from '@/theme/provider';
import type { Palette } from '@/theme';

type MastheadProps = {
  /** Big heading; Home's is two lines. */
  title: string;
  subtitle?: string;
  /** Makes the subtitle a link with a chevron (Home's line about today: an order, offers, Wellness). */
  onSubtitlePress?: () => void;
  /** Home leads with the xana wordmark; other tabs with their own name. */
  wordmark?: boolean;
  /** Opens the store chooser; without it the "Collect from" row is left out. */
  onChangeStore?: () => void;
  /** Screens reached from Home rather than the tab bar (Pharmacy, Profile) get a back button. */
  onBack?: () => void;
  /** Replaces the account and cart buttons (Profile's settings); `null` shows none. */
  actions?: ReactNode;
  /** The Cart tab leaves out its own cart button. */
  hideCart?: boolean;
  children?: ReactNode;
};

/**
 * The soft green header Home introduced (19 Nov 2026), shared by the tabs that browse:
 * wordmark or tab name, account and cart buttons, a big heading, and where the
 * customer's order comes from ("Collect from Syokimau").
 */
export function Masthead({ title, subtitle, onSubtitlePress, wordmark = false, onChangeStore, onBack, actions, hideCart = false, children }: MastheadProps) {
  const styles = useThemeStyles(createStyles);
  const { colors, resolved } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cart = useCart();
  const bump = useBump(cart.itemCount);
  const { user } = useSession();
  const { store, mode, address, hasAddress } = useFulfilment();
  const shopName = store.name.replace('Xana Plus ', '');

  // Tell the truth about how orders reach the customer (owner, 18 Nov 2026).
  const where =
    mode === 'pickup'
      ? { lead: 'Collect from', place: shopName }
      : hasAddress
        ? { lead: 'Delivering to', place: address.area || address.line.split(',')[0] }
        : { lead: 'Delivery from', place: shopName };

  return (
    <View style={[styles.masthead, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.topRow}>
        {onBack ? (
          <PressableScale accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={4} style={styles.roundButton}>
            <Icon name="arrow-left" size={20} color="onSurface" />
          </PressableScale>
        ) : null}
        {wordmark ? (
          <Image
            source={resolved === 'dark' ? require('@/assets/brand/wordmark-light.png') : require('@/assets/brand/wordmark.png')}
            style={styles.wordmark}
            contentFit="contain"
            accessibilityLabel="Xana Plus"
          />
        ) : (
          <Txt variant="display" accessibilityRole="header" style={[styles.heading, styles.flex]}>{title}</Txt>
        )}
        {actions !== undefined ? <View style={styles.actions}>{actions}</View> : <View style={styles.actions}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={user ? 'Your account' : 'Log in or sign up'}
            onPress={() => router.push(user ? '/(tabs)/profile' : '/login')}
            hitSlop={4}
            style={[styles.roundButton, user ? styles.roundButtonSignedIn : null]}
          >
            {user ? <Txt variant="titleSm" tint={colors.onPrimary}>{user.name.charAt(0)}</Txt> : <Icon name="user" size={20} color="onSurface" />}
          </PressableScale>
          {hideCart ? null : <PressableScale
            accessibilityRole="button"
            accessibilityLabel={cart.itemCount > 0 ? `Cart, ${cart.itemCount} ${cart.itemCount === 1 ? 'item' : 'items'}` : 'Cart'}
            onPress={() => router.push('/(tabs)/cart')}
            hitSlop={4}
            style={styles.roundButton}
          >
            <Icon name="cart" size={20} color="onSurface" />
            {cart.itemCount > 0 ? (
              <Animated.View style={[styles.cartBadge, bump]}>
                <Txt variant="micro" tint={colors.onSecondary}>{cart.itemCount}</Txt>
              </Animated.View>
            ) : null}
          </PressableScale>}
        </View>}
      </View>

      {wordmark || subtitle ? (
        <View style={styles.greeting}>
          {wordmark ? (
            <Txt variant="display" accessibilityRole="header" accessibilityLabel={title.replace(/\n/g, ' ')} style={styles.heading}>{title}</Txt>
          ) : null}
          {subtitle && onSubtitlePress ? (
            <PressableScale accessibilityRole="link" accessibilityLabel={subtitle} onPress={onSubtitlePress} hitSlop={6} style={styles.subtitleLink}>
              <Txt variant="body" color="onSurface" style={styles.flexShrink}>{subtitle}</Txt>
              <Icon name="chevron-right" size={16} color="primaryAccent" />
            </PressableScale>
          ) : subtitle ? <Txt variant="body" color="onSurfaceVariant">{subtitle}</Txt> : null}
        </View>
      ) : null}

      {onChangeStore ? <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${where.lead} ${where.place}. Change store`}
        onPress={onChangeStore}
        style={styles.where}
      >
        <Icon name={mode === 'pickup' ? 'store' : 'map-pin'} size={16} color="primaryAccent" />
        <Txt variant="label" color="onSurfaceVariant">{where.lead}</Txt>
        <Txt variant="label" color="primaryAccent" numberOfLines={1} style={styles.wherePlace}>{where.place}</Txt>
        <Icon name="chevron-down" size={16} color="primaryAccent" />
      </PressableScale> : null}
      {children}
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  masthead: {
    paddingHorizontal: layout.screenMargin,
    paddingBottom: spacing.lg,
    gap: spacing.lg,
    backgroundColor: colors.mintSurface,
    borderBottomLeftRadius: radius.xxl,
    borderBottomRightRadius: radius.xxl,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  subtitleLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, alignSelf: 'flex-start' },
  wordmark: { width: 86, height: 32, marginRight: 'auto' },
  heading: { fontSize: 26, lineHeight: 32, flexShrink: 1 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    ...elevation.hairline,
  },
  roundButtonSignedIn: { backgroundColor: colors.primaryContainer },
  cartBadge: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondaryContainer,
  },
  greeting: { gap: spacing.xs },
  where: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  wherePlace: { flexShrink: 1 },
});
