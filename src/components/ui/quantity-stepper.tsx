import { useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

import { Icon } from '@/components/ui/icon';
import { Txt } from '@/components/ui/text';
import { radius, spacing } from '@/theme';
import { useThemeStyles } from '@/theme/provider';
import type { Palette } from '@/theme';

export type QuantityStepperProps = {
  quantity: number;
  onIncrement: () => void;
  onDecrement: () => void;
  /** `compact` is the 28pt control used inside dense rows. */
  size?: 'compact' | 'regular';
  /** `plain` is the grey pill used on cart lines; `brand` is the green control. */
  tone?: 'brand' | 'plain';
  min?: number;
  /** Optional unit label rendered after the count ("units"). */
  suffix?: string;
  style?: StyleProp<ViewStyle>;
};

/** Quantity control used on the cart, checkout summary and product detail. */
export function QuantityStepper({ quantity, onIncrement, onDecrement, size = 'regular', tone = 'plain', min = 1, suffix, style }: QuantityStepperProps) {
  const styles = useThemeStyles(createStyles);
  const compact = size === 'compact';
  const button = compact ? 28 : 34;
  const iconSize = compact ? 14 : 16;
  // The new number rises in on +, drops in on −; nothing moves on first show.
  const [last, setLast] = useState({ quantity, rising: null as boolean | null });
  if (last.quantity !== quantity) setLast({ quantity, rising: quantity > last.quantity });
  const entering = last.rising === null ? undefined : (last.rising ? FadeInUp : FadeInDown).duration(140);

  return (
    <View style={[styles.stepper, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Decrease quantity"
        disabled={quantity <= min}
        onPress={onDecrement}
        style={[styles.button, { width: button, height: button, opacity: quantity <= min ? 0.4 : 1 }]}
      >
        <Icon name="minus" size={iconSize} color={tone === 'brand' ? 'primaryAccent' : 'onSurface'} />
      </Pressable>
      <Animated.View key={quantity} entering={entering}>
        <Txt variant={compact ? 'label' : 'title'} style={styles.count}>
          {quantity}
          {suffix ? ` ${suffix}` : ''}
        </Txt>
      </Animated.View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Increase quantity"
        onPress={onIncrement}
        style={[styles.button, tone === 'brand' ? styles.brandButton : null, { width: button, height: button }]}
      >
        <Icon name="plus" size={iconSize} color={tone === 'brand' ? 'onPrimary' : 'onSurface'} />
      </Pressable>
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainer,
  },
  button: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  brandButton: { backgroundColor: colors.primaryContainer },
  count: { minWidth: 20, textAlign: 'center' },
});
