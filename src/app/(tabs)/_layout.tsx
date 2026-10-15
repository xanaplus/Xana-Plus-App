import { Tabs } from 'expo-router';

import { TabBar } from '@/components/nav/tab-bar';

/**
 * Tabs are rendered by `<TabBar>` so the raised Pharmacy action matches the
 * Figma navigation bar; the screens themselves own their app bars.
 */
export default function TabsLayout() {
  return (
    // "history" so a tab's back arrow returns to the tab you came from, not always Home.
    <Tabs backBehavior="history" screenOptions={{ headerShown: false, animation: 'shift' }} tabBar={props => <TabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="categories" options={{ title: 'Categories' }} />
      <Tabs.Screen name="pharmacy" options={{ title: 'Pharmacy' }} />
      <Tabs.Screen name="cart" options={{ title: 'Cart' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
