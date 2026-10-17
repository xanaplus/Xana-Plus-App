import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/ui/icon';
import { useBump } from '@/components/ui/motion';
import { Txt } from '@/components/ui/text';
import { tapFeedback } from '@/lib/haptics';
import { useCart } from '@/store/cart';
import { elevation, layout, radius, spacing } from '@/theme';
import { useTheme } from '@/theme/provider';

type TabMeta = {
  label: string;
  icon: IconName;
  /** Solid version shown on the tab you're on. */
  activeIcon?: IconName;
  /** Raised centre action. */
  fab?: boolean;
};

/** Matches the tab order used in Expo Router's `(tabs)` group. */
const TAB_META: Record<string, TabMeta> = {
  index: { label: 'Home', icon: 'home', activeIcon: 'home-filled' },
  categories: { label: 'Categories', icon: 'categories', activeIcon: 'categories-filled' },
  pharmacy: { label: 'Pharmacy', icon: 'pharmacy', fab: true },
  profile: { label: 'Profile', icon: 'profile', activeIcon: 'profile-filled' },
  cart: { label: 'Cart', icon: 'cart', activeIcon: 'cart-filled' },
};

/** Fixed bottom navigation with the raised green Pharmacy action. */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { itemCount } = useCart();
  const bump = useBump(itemCount);

  return (
    <View accessibilityRole="tablist" style={[styles.bar, { backgroundColor: colors.surface, borderTopColor: colors.surfaceContainerHigh, paddingBottom: insets.bottom, height: layout.tabBarHeight + insets.bottom }]}>
      {state.routes.map((route, index) => {
        const meta = TAB_META[route.name];
        if (!meta) return null;
        const focused = state.index === index;
        const badge = route.name === 'cart' ? itemCount : 0;

        // Tapping the tab you're on is handled by the screen (it scrolls back to the top).
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            tapFeedback();
            navigation.navigate(route.name);
          }
        };
        const position = `tab, ${index + 1} of ${state.routes.length}`;

        if (meta.fab) {
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={`${meta.label}, ${position}`}
              accessibilityState={{ selected: focused }}
              onPress={onPress}
              style={styles.item}
            >
              <View style={[styles.fab, { backgroundColor: colors.primaryContainer }]}>
                <Icon name={meta.icon} size={24} color="onPrimary" />
              </View>
              <Txt variant="tab" tint={focused ? colors.primaryAccent : colors.outline}>
                {meta.label}
              </Txt>
            </Pressable>
          );
        }

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityLabel={`${meta.label}${badge > 0 ? `, ${badge} ${badge === 1 ? 'item' : 'items'}` : ''}, ${position}`}
            accessibilityState={{ selected: focused }}
            onPress={onPress}
            style={styles.item}
          >
            <View>
              <Icon
                name={focused ? meta.activeIcon ?? meta.icon : meta.icon}
                size={24}
                color={focused ? 'primaryAccent' : 'outline'}
              />
              {badge > 0 ? (
                <Animated.View style={[styles.badge, { backgroundColor: colors.secondaryContainer }, bump]}>
                  <Txt variant="micro" tint={colors.onSecondary}>
                    {badge}
                  </Txt>
                </Animated.View>
              ) : null}
            </View>
            <Txt variant="tab" tint={focused ? colors.primaryAccent : colors.outline}>
              {meta.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.sm,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xxs, paddingTop: spacing.sm },
  fab: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    // Lifts the 44pt button so it takes the same 24pt as the other icons and all labels share one baseline.
    marginTop: -20,
    ...elevation.floating,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
