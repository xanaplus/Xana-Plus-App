import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { radius } from '@/theme';
import { useTheme } from '@/theme/provider';

export type ProductAddButtonProps = {
  productName: string;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Round + add action shared by product cards and category rails (Instacart / Glovo style).
 * 36pt to match the − n + counter that replaces it, with hitSlop keeping a 44pt touch target.
 */
export function ProductAddButton({ productName, onPress, disabled = false, style }: ProductAddButtonProps) {
  const { colors } = useTheme();
  const isDisabled = disabled || !onPress;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Add ${productName} to cart`}
      disabled={isDisabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: isDisabled ? colors.surfaceContainerHigh : colors.primary,
          opacity: isDisabled ? 0.62 : 1,
        },
        pressed && !isDisabled ? styles.pressed : null,
        style,
      ]}
    >
      <Icon name="plus" size={18} color={isDisabled ? 'onSurfaceVariant' : 'onPrimary'} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.9, transform: [{ scale: 0.96 }] },
});
