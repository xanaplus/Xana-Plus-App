import type { BottomTabBarProps } from 'expo-router/tabs';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/ui/icon';
import { useBump } from '@/components/ui/motion';
import { Txt } from '@/components/ui/text';
import { tapFeedback } from '@/lib/haptics';
import { useCart } from '@/store/cart';
import { elevation, layout, radius, spacing } from '@/theme';
import { useTheme } from '@/theme/provider';
import { PressableScale } from '@/components/ui/pressable-scale';

type TabMeta = {
  label: string;
  icon: IconName;
  /** Solid version shown on the tab you're on. */
  activeIcon?: IconName;
  /** Raised centre action. */
  fab?: boolean;
};

/**
 * The five tabs (19 Nov 2026), in the `(tabs)` group's order. Orders and Profile are
 * routes without a tab (reached from the account button): they are skipped here.
 */
const TAB_META: Record<string, TabMeta> = {
  index: { label: 'Home', icon: 'home', activeIcon: 'home-filled' },
  categories: { label: 'Shop', icon: 'categories', activeIcon: 'categories-filled' },
  pharmacy: { label: 'Pharmacy', icon: 'pharmacy-tab', activeIcon: 'pharmacy-tab-filled' },
  wellness: { label: 'Wellness', icon: 'heart', activeIcon: 'heart-filled' },
  cart: { label: 'Cart', icon: 'cart', activeIcon: 'cart-filled' },
};
const TAB_COUNT = Object.keys(TAB_META).length;
const TAB_NAMES = Object.keys(TAB_META);
/** Material 3's active indicator: a soft pill behind the icon that glides to the tab you tap. */
const INDICATOR_WIDTH = 60;
const INDICATOR_HEIGHT = 32;
const GLIDE = { damping: 20, stiffness: 230, mass: 0.9 };
/** Where every tab's 24pt icon starts, from the bar's top edge. The pill is centred on this, so it wraps the whole icon. */
const ICON_TOP = 10;

/** The tab's icon lifts in as its tab becomes the one you're on. */
function TabIcon({ focused, children }: { focused: boolean; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const scale = useSharedValue(1);
  useEffect(() => {
    if (focused && !reduce) scale.value = withSequence(withTiming(0.86, { duration: 70 }), withSpring(1, { damping: 12, stiffness: 260 }));
  }, [focused, reduce, scale]);
  const lift = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.View style={lift}>{children}</Animated.View>;
}

/** Fixed bottom navigation with the raised green Pharmacy action. */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { itemCount } = useCart();
  const bump = useBump(itemCount);
  const reduce = useReducedMotion();

  // Slot centres come from the bar's measured width (five equal slots inside its side padding).
  const [barWidth, setBarWidth] = useState(0);
  const slot = (barWidth - spacing.sm * 2) / TAB_COUNT;
  const activeSlot = TAB_NAMES.indexOf(state.routes[state.index]?.name ?? '');
  const x = useSharedValue(0);
  const shown = useSharedValue(0);
  useEffect(() => {
    if (!barWidth) return;
    const target = spacing.sm + slot * Math.max(0, activeSlot) + slot / 2 - INDICATOR_WIDTH / 2;
    // First placement jumps; after that it glides (or jumps, with Reduce Motion on).
    x.value = shown.value === 0 || reduce ? target : withSpring(target, GLIDE);
    // Orders and Profile have no tab: the indicator fades out there.
    shown.value = withTiming(activeSlot >= 0 ? 1 : 0, { duration: 160 });
  }, [activeSlot, barWidth, slot, reduce, x, shown]);
  const indicator = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ translateX: x.value }] }));

  return (
    <View accessibilityRole="tablist" onLayout={event => setBarWidth(event.nativeEvent.layout.width)} style={[styles.bar, { backgroundColor: colors.surface, borderTopColor: colors.surfaceContainerHigh, paddingBottom: insets.bottom, height: layout.tabBarHeight + insets.bottom }]}>
      <Animated.View pointerEvents="none" style={[styles.indicator, { backgroundColor: colors.mintSurface }, indicator]} />
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
        const position = `tab, ${Object.keys(TAB_META).indexOf(route.name) + 1} of ${TAB_COUNT}`;

        if (meta.fab) {
          return (
            <PressableScale
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
            </PressableScale>
          );
        }

        return (
          <PressableScale
            key={route.key}
            accessibilityRole="tab"
            accessibilityLabel={`${meta.label}${badge > 0 ? `, ${badge} ${badge === 1 ? 'item' : 'items'}` : ''}, ${position}`}
            accessibilityState={{ selected: focused }}
            onPress={onPress}
            style={styles.item}
          >
            <View>
              <TabIcon focused={focused}>
                <Icon
                  name={focused ? meta.activeIcon ?? meta.icon : meta.icon}
                  size={24}
                  color={focused ? 'primaryAccent' : 'outline'}
                />
              </TabIcon>
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
          </PressableScale>
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
  indicator: {
    position: 'absolute',
    left: 0,
    top: ICON_TOP - (INDICATOR_HEIGHT - 24) / 2,
    width: INDICATOR_WIDTH,
    height: INDICATOR_HEIGHT,
    borderRadius: radius.pill,
  },
  // Items fill the bar's height and start at a fixed top, so the icon is always where the pill is.
  item: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'flex-start', gap: spacing.sm, paddingTop: ICON_TOP },
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
