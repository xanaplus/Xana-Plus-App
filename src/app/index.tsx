import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { layout, radius, spacing } from '@/theme';
import { useTheme, useThemeStyles } from '@/theme/provider';
import type { Palette } from '@/theme';

/**
 * Screen 1 — splash. Light brand background, centred Xana LIFE lockup and the
 * three-dot loader, then straight into the tab shell.
 */
export default function SplashRoute() {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const router = useRouter();

  // Only while the splash is on screen: a notification tapped on a cold start
  // opens its order on top, and a running timer would replace that order with Home.
  useFocusEffect(
    useCallback(() => {
      const timer = setTimeout(() => router.replace('/(tabs)'), 1600);
      return () => clearTimeout(timer);
    }, [router]),
  );

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

const createStyles = (colors: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 224, height: 176 },
  dots: { position: 'absolute', bottom: spacing.huge + layout.tabBarHeight, flexDirection: 'row', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
});
