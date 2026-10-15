import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, StyleSheet, View } from 'react-native-web';

import { Ionicons } from './_icon-fonts';
import { Icon, type IconName } from './_Icon';
import { Txt } from './_Txt';
import { useCart, useSafeAreaInsets, useTheme } from './_context';
import { layout, radius, spacing } from './_theme';

type TabMeta = { label: string; icon: IconName };

const TAB_ORDER = ['index', 'categories', 'pharmacy', 'cart', 'profile'];
const TAB_META: Record<string, TabMeta> = {
  index: { label: 'Home', icon: 'home' },
  categories: { label: 'Categories', icon: 'categories' },
  pharmacy: { label: 'Pharmacy', icon: 'pharmacy' },
  cart: { label: 'Cart', icon: 'cart' },
  profile: { label: 'Profile', icon: 'profile' },
};

/** Equal-weight bottom navigation: Pharmacy sits on the same baseline as every destination. */
export function EqualTabBar({ state, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { itemCount } = useCart();
  const activeKey = state.routes[state.index]?.key;
  const orderedRoutes = TAB_ORDER
    .map(name => state.routes.find(route => route.name === name))
    .filter((route): route is (typeof state.routes)[number] => Boolean(route));

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.surfaceContainerHigh,
          paddingBottom: insets.bottom,
          height: layout.tabBarHeight + insets.bottom,
        },
      ]}
    >
      {orderedRoutes.map(route => {
        const meta = TAB_META[route.name];
        if (!meta) return null;
        const focused = activeKey === route.key;
        const badge = route.name === 'cart' ? itemCount : 0;
        const iconColor = focused ? colors.primaryAccent : colors.onSurfaceVariant;
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityLabel={meta.label}
            accessibilityState={{ selected: focused }}
            onPress={onPress}
            style={styles.item}
          >
            <View style={styles.iconSlot}>
              {route.name === 'pharmacy' ? (
                <Ionicons name="medkit-outline" size={20} color={iconColor} />
              ) : (
                <Icon name={meta.icon} size={20} color={focused ? 'primaryAccent' : 'onSurfaceVariant'} />
              )}
              {badge > 0 ? (
                <View style={[styles.badge, { backgroundColor: colors.secondaryContainer }]}>
                  <Txt variant="micro" tint={colors.onSecondary}>{badge}</Txt>
                </View>
              ) : null}
            </View>
            <Txt variant="tab" tint={focused ? colors.primaryAccent : colors.onSurface}>
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
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    paddingTop: spacing.sm,
  },
  iconSlot: { position: 'relative' },
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
