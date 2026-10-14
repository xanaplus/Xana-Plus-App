import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { Txt } from '@/components/ui/text';
import { radius } from '@/theme';
import { useTheme } from '@/theme/provider';

export type ProductAddButtonProps = {
  productName: string;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Compact, 44pt add action shared by product cards and category rails. */
export function ProductAddButton({ productName, onPress, disabled = false, style }: ProductAddButtonProps) {
  const { colors } = useTheme();
  const isDisabled = disabled || !onPress;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Add ${productName} to cart`}
      disabled={isDisabled}
      onPress={onPress}
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
      <Txt variant="buttonSm" tint={isDisabled ? colors.onSurfaceVariant : colors.onPrimary}>
        + Add
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: 62,
    height: 44,
    paddingHorizontal: 9,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.9, transform: [{ scale: 0.96 }] },
});
