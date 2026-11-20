import { Tabs } from 'expo-router';
import { Easing } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { TabBar } from '@/components/nav/tab-bar';

/**
 * Five tabs: Home, Shop, Pharmacy, Wellness, Cart. Pharmacy got its own tab and Orders moved
 * into the account (Roystone, 19 Nov 2026; first set of tabs 18 Nov). Orders and Profile stay
 * routes inside the tabs (reached from the account button), so the tab bar stays on them;
 * `<TabBar>` draws only the five.
 */
/**
 * Switching tabs: the new screen slides in from the side you're moving towards and fades
 * up, over 280 ms with a confident ease-out (20 Nov 2026: "too static"). The old screen
 * fades out faster than the new one arrives. Reduce Motion keeps only the fade.
 */
const glide = {
  animation: 'timing' as const,
  config: { duration: 280, easing: Easing.bezier(0.16, 1, 0.3, 1) },
};
const slideAndFade = ({ current }: { current: { progress: import('react-native').Animated.Value } }) => ({
  sceneStyle: {
    opacity: current.progress.interpolate({ inputRange: [-1, -0.5, 0, 0.5, 1], outputRange: [0, 0.2, 1, 0.2, 0] }),
    transform: [
      { translateX: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [-36, 0, 36] }) },
      { scale: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [0.985, 1, 0.985] }) },
    ],
  },
});

export default function TabsLayout() {
  const reduce = useReducedMotion();
  return (
    // "history" so a tab's back arrow returns to the tab you came from, not always Home.
    <Tabs backBehavior="history" screenOptions={reduce ? { headerShown: false, animation: 'fade' } : { headerShown: false, transitionSpec: glide, sceneStyleInterpolator: slideAndFade }} tabBar={props => <TabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="categories" options={{ title: 'Shop' }} />
      <Tabs.Screen name="pharmacy" options={{ title: 'Pharmacy' }} />
      <Tabs.Screen name="wellness" options={{ title: 'Wellness' }} />
      <Tabs.Screen name="cart" options={{ title: 'Cart' }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
