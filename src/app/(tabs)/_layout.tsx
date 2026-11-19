import { Tabs } from 'expo-router';

import { TabBar } from '@/components/nav/tab-bar';

/**
 * The owner's five tabs (18 Nov 2026): Home, Shop, Wellness, Orders, Cart. Pharmacy and
 * Profile stay routes inside the tabs (reached from Home's tiles and account button),
 * so the tab bar stays on them; `<TabBar>` draws only the five.
 */
export default function TabsLayout() {
  return (
    // "history" so a tab's back arrow returns to the tab you came from, not always Home.
    <Tabs backBehavior="history" screenOptions={{ headerShown: false, animation: 'shift' }} tabBar={props => <TabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="categories" options={{ title: 'Shop' }} />
      <Tabs.Screen name="wellness" options={{ title: 'Wellness' }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders' }} />
      <Tabs.Screen name="cart" options={{ title: 'Cart' }} />
      <Tabs.Screen name="pharmacy" options={{ title: 'Pharmacy' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
