import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import { elevation, radius, spacing } from '@/theme';
import { useTheme } from '@/theme/provider';

export type CardProps = {
  children: ReactNode;
  /** `flat` drops the shadow (used inside sheets and on tinted backgrounds). */
  variant?: 'elevated' | 'flat' | 'outline' | 'tinted';
  padding?: number;
  radiusSize?: number;
  onPress?: () => void;
  /** Where the card sits on the page (scroll-triggered effects). */
  onLayout?: (event: LayoutChangeEvent) => void;
  style?: StyleProp<ViewStyle>;
};

/** Generic content container: white surface, 18pt radius, soft shadow. */
export function Card({ children, variant = 'elevated', padding = spacing.lg, radiusSize = radius.card, onPress, onLayout, style }: CardProps) {
  const { colors } = useTheme();
  const surfaces = {
    elevated: { backgroundColor: colors.surface, borderWidth: 0 },
    flat: { backgroundColor: colors.surfaceContainerLow, borderWidth: 0 },
    outline: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outlineSoft30 },
    tinted: { backgroundColor: colors.mintSurface, borderWidth: 0 },
  };
  const s = surfaces[variant];
  const body = [styles.card, { borderRadius: radiusSize, padding }, s, variant === 'elevated' ? elevation.card : null, style];

  if (!onPress) return <View style={body} onLayout={onLayout}>{children}</View>;

  return (
    <Pressable accessibilityRole="button" onPress={onPress} onLayout={onLayout} style={({ pressed }) => [body, pressed ? { opacity: 0.9 } : null]}>
      {children}
    </Pressable>
  );
}

export function Divider({ inset = 0, color }: { inset?: number; color?: string }) {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: color ?? colors.surfaceContainerHigh, marginHorizontal: inset }} />;
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
});
