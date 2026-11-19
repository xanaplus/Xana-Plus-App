import { useEffect, useId } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedProps, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { ClipPath, Defs, Path, Rect } from 'react-native-svg';

import { useTheme } from '@/theme/provider';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

/** A tumbler, narrower at the base, in a 64 × 80 box. */
const GLASS = 'M10 6 H54 L48.5 72 Q48 76 44 76 H20 Q16 76 15.5 72 Z';
const TOP = 8;
const BOTTOM = 76;

type WaterGlassProps = {
  /** Glasses logged today. */
  value: number;
  /** Daily goal; the glass is full when `value` reaches it. */
  goal: number;
  size?: number;
};

/**
 * Today's water as a glass that fills when a glass is logged (the Wellness signature).
 * Springs up from the level before; still with reduced motion.
 */
export function WaterGlass({ value, goal, size = 72 }: WaterGlassProps) {
  const { colors } = useTheme();
  const clipId = useId().replace(/:/g, '');
  const reduced = useReducedMotion();
  const fill = Math.min(1, goal > 0 ? value / goal : 0);
  const level = useSharedValue(fill);

  useEffect(() => {
    level.value = reduced ? withTiming(fill, { duration: 0 }) : withSpring(fill, { damping: 14, stiffness: 120 });
  }, [fill, reduced, level]);

  const water = useAnimatedProps(() => {
    const top = BOTTOM - (BOTTOM - TOP) * level.value;
    return { y: top, height: BOTTOM - top + 2 };
  });

  return (
    // The count is read out by the card; the drawing is decoration for screen readers.
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width={size} height={size * 1.25} viewBox="0 0 64 80">
      <Defs>
        <ClipPath id={clipId}>
          <Path d={GLASS} />
        </ClipPath>
      </Defs>
      {/* The glass always sits on the green check-in card, so it is drawn in white. */}
      <Path d={GLASS} fill="#ffffff" fillOpacity={0.14} />
      <AnimatedRect x={0} width={64} fill={colors.water} opacity={0.9} clipPath={`url(#${clipId})`} animatedProps={water} />
      <Path d={GLASS} fill="none" stroke="#ffffff" strokeOpacity={0.85} strokeWidth={2.5} strokeLinejoin="round" />
      {/* A highlight down the left wall, so it reads as glass. */}
      <Path d="M16 14 L19.5 64" stroke="#ffffff" strokeOpacity={0.5} strokeWidth={2.5} strokeLinecap="round" />
    </Svg>
    </View>
  );
}
