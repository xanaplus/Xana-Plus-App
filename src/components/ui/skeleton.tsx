import { useEffect, useState } from 'react';
import { Animated, Platform, StyleSheet, View, useWindowDimensions, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';

import { colors, layout, radius, spacing } from '@/theme';

/**
 * Faint stand-ins shaped like the content that is loading, so a screen keeps
 * its layout and doesn't jump when the real products arrive. They share the
 * search page's look: no shadows, a hairline edge, the palest grey, a slow pulse.
 */

export type SkeletonShape = 'rail' | 'grid' | 'detail' | 'list';

const PULSE_LOW = 0.5;
const PULSE_HIGH = 0.85;
const PULSE_MS = 750;
const CARD_IMAGE_HEIGHT = 132;

function usePulse() {
  const [pulse] = useState(() => new Animated.Value(PULSE_LOW));
  useEffect(() => {
    const native = Platform.OS !== 'web';
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: PULSE_HIGH, duration: PULSE_MS, useNativeDriver: native }),
        Animated.timing(pulse, { toValue: PULSE_LOW, duration: PULSE_MS, useNativeDriver: native }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return pulse;
}

function Bar({ width, height = 12, round }: { width: DimensionValue; height?: number; round?: boolean }) {
  return <View style={[styles.bar, { width, height }, round ? { borderRadius: radius.pill } : null]} />;
}

function Header() {
  return (
    <View style={styles.header}>
      <Bar width="42%" height={16} />
      <Bar width={56} height={12} />
    </View>
  );
}

function ProductCardSkeleton({ width }: { width: number }) {
  return (
    <View style={[styles.card, { width }]}>
      <View style={styles.cardImage} />
      <Bar width="40%" height={10} />
      <Bar width="90%" height={14} />
      <Bar width="60%" height={14} />
      <View style={styles.cardFoot}>
        <Bar width="45%" height={18} />
        <Bar width={34} height={34} round />
      </View>
    </View>
  );
}

function Rail() {
  return (
    <View>
      <Header />
      <View style={styles.rail}>
        {Array.from({ length: 3 }, (_, index) => (
          <ProductCardSkeleton key={index} width={layout.productCardWidth} />
        ))}
      </View>
    </View>
  );
}

function Grid({ contentWidth }: { contentWidth: number }) {
  const cardWidth = (contentWidth - layout.gutter) / 2;
  return (
    <View>
      <Header />
      <View style={styles.grid}>
        {Array.from({ length: 4 }, (_, index) => (
          <ProductCardSkeleton key={index} width={cardWidth} />
        ))}
      </View>
    </View>
  );
}

function Detail() {
  return (
    <View style={styles.detail}>
      <View style={styles.hero} />
      <Bar width="30%" height={10} />
      <Bar width="85%" height={22} />
      <Bar width="55%" height={22} />
      <Bar width="35%" height={26} />
      <View style={styles.detailBlock}>
        <Bar width="100%" height={12} />
        <Bar width="92%" height={12} />
        <Bar width="70%" height={12} />
      </View>
    </View>
  );
}

function List() {
  return (
    <View style={styles.list}>
      {Array.from({ length: 3 }, (_, index) => (
        <View key={index} style={[styles.card, styles.listCard]}>
          <View style={styles.header}>
            <Bar width="35%" height={16} />
            <Bar width={64} height={18} round />
          </View>
          <Bar width="55%" height={10} />
          <Bar width="80%" height={12} />
          <Bar width="65%" height={12} />
          <View style={styles.cardFoot}>
            <Bar width="40%" height={32} round />
            <Bar width="40%" height={32} round />
          </View>
        </View>
      ))}
    </View>
  );
}

export type SkeletonProps = {
  shape: SkeletonShape;
  /** Adds the 20pt side margin for screens whose body isn't already padded. */
  inset?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** The pulsing placeholder for one loading area. */
export function Skeleton({ shape, inset, style }: SkeletonProps) {
  const pulse = usePulse();
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, layout.maxContentWidth) - layout.screenMargin * 2;

  return (
    <Animated.View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      style={[styles.root, inset ? styles.inset : null, { opacity: pulse }, style]}
    >
      {shape === 'rail' ? <Rail /> : null}
      {shape === 'grid' ? <Grid contentWidth={contentWidth} /> : null}
      {shape === 'detail' ? <Detail /> : null}
      {shape === 'list' ? <List /> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { overflow: 'hidden', paddingVertical: spacing.sm },
  inset: { paddingHorizontal: layout.screenMargin },
  bar: { borderRadius: radius.sm, backgroundColor: colors.surfaceContainerLow },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.md },
  card: {
    padding: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.outlineSoft30,
    gap: spacing.xs,
  },
  cardImage: { height: CARD_IMAGE_HEIGHT, borderRadius: radius.lg, backgroundColor: colors.surfaceContainerLow, marginBottom: spacing.sm },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  rail: { flexDirection: 'row', gap: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: layout.gutter },
  detail: { gap: spacing.md, paddingHorizontal: layout.screenMargin },
  hero: { height: 280, borderRadius: radius.xl, backgroundColor: colors.surfaceContainerLow, marginBottom: spacing.sm },
  detailBlock: { gap: spacing.sm, marginTop: spacing.md },
  list: { gap: spacing.md },
  listCard: { gap: spacing.sm },
});
