import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/ui/icon';
import { Txt } from '@/components/ui/text';
import { useCart } from '@/store/cart';
import { colors, elevation, layout, radius, spacing } from '@/theme';

type TabMeta = { label: string; icon: IconName; /** Raised centre action. */ fab?: boolean };

/** Matches the tab order used in Expo Router's `(tabs)` group. */
const TAB_META: Record<string, TabMeta> = {
  index: { label: 'Home', icon: 'home' },
  categories: { label: 'Categories', icon: 'categories' },
  pharmacy: { label: 'Pharmacy', icon: 'pharmacy', fab: true },
  profile: { label: 'Profile', icon: 'profile' },
  cart: { label: 'Cart', icon: 'cart' },
};

/** Fixed bottom navigation with the raised green Pharmacy action. */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { itemCount } = useCart();

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom, height: layout.tabBarHeight + insets.bottom }]}>
      {state.routes.map((route, index) => {
        const meta = TAB_META[route.name];
        if (!meta) return null;
        const focused = state.index === index;
        const badge = route.name === 'cart' ? itemCount : 0;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        if (meta.fab) {
          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityLabel={meta.label}
              accessibilityState={{ selected: focused }}
              onPress={onPress}
              style={styles.item}
            >
              <View style={styles.fab}>
                <Icon name={meta.icon} size={22} color="onPrimary" />
              </View>
              <Txt variant="tab" tint={focused ? colors.primaryContainer : colors.onSurface}>
                {meta.label}
              </Txt>
            </Pressable>
          );
        }

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityLabel={meta.label}
            accessibilityState={{ selected: focused }}
            onPress={onPress}
            style={styles.item}
          >
            <View>
              <Icon name={meta.icon} size={20} color={focused ? 'primaryContainer' : 'onSurfaceVariant'} />
              {badge > 0 ? (
                <View style={styles.badge}>
                  <Txt variant="micro" tint={colors.onSecondary}>
                    {badge}
                  </Txt>
                </View>
              ) : null}
            </View>
            <Txt variant="tab" tint={focused ? colors.primaryContainer : colors.onSurface}>
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.surfaceContainerHigh,
    paddingHorizontal: spacing.sm,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xxs, paddingTop: spacing.sm },
  fab: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    // Lifts the 44pt button so it takes the same 20pt as the other icons and all labels share one baseline.
    marginTop: -24,
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
    backgroundColor: colors.secondaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
