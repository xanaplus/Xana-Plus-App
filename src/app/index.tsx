import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { colors, layout, radius, spacing } from '@/theme';

/**
 * Screen 1 — splash. Light brand background, centred Xana LIFE lockup and the
 * three-dot loader, then straight into the tab shell.
 */
export default function SplashRoute() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => router.replace('/(tabs)'), 1600);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <View style={styles.root}>
      <Image source={require('@/assets/brand/xana-logo.png')} style={styles.logo} resizeMode="contain" />
      <View style={styles.dots}>
        <View style={[styles.dot, { backgroundColor: colors.mintEdge }]} />
        <View style={[styles.dot, { backgroundColor: colors.mintEdge }]} />
        <View style={[styles.dot, { backgroundColor: colors.primaryContainer }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 224, height: 176 },
  dots: { position: 'absolute', bottom: spacing.huge + layout.tabBarHeight, flexDirection: 'row', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
});
