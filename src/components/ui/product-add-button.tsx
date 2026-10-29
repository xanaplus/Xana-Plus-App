import { router } from 'expo-router';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { useSession } from '@/store/session';
import { radius } from '@/theme';
import { useTheme } from '@/theme/provider';

export type ProductAddButtonProps = {
  productName: string;
  onPress?: () => void;
  disabled?: boolean;
  /**
   * Prescription medicine: a signed-in customer adds it once and attaches the
   * prescription at checkout (owner, 29 Oct 2026); signed out, the button opens
   * sign-in. With no `onPress` it opens the upload-prescription flow instead.
   */
  rxRequired?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Upload screen with the item's name prefilled, so the pharmacist knows what was wanted. */
export const openPrescriptionUpload = (productName: string) =>
  router.push({ pathname: '/pharmacy/upload', params: { item: productName } });

/**
 * Round + add action shared by product cards and category rails (Instacart / Glovo style).
 * 36pt to match the − n + counter that replaces it, with hitSlop keeping a 44pt touch target.
 */
export function ProductAddButton({ productName, onPress, disabled = false, rxRequired = false, style }: ProductAddButtonProps) {
  const { colors } = useTheme();
  const { isAuthenticated } = useSession();
  const isDisabled = disabled || (!onPress && !rxRequired);

  if (rxRequired) {
    const addRx = () => {
      if (!onPress) openPrescriptionUpload(productName);
      else if (!isAuthenticated) router.push('/login');
      else onPress();
    };
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={onPress ? `Add ${productName} to cart. Prescription needed at checkout` : `Prescription needed for ${productName}. Upload a prescription`}
        disabled={disabled}
        onPress={addRx}
        hitSlop={4}
        style={({ pressed }) => [
          styles.button,
          styles.rx,
          { borderColor: colors.primary, backgroundColor: colors.surface, opacity: disabled ? 0.62 : 1 },
          pressed && !disabled ? styles.pressed : null,
          style,
        ]}
      >
        <Icon name="prescription" size={18} color="primaryAccent" />
      </Pressable>
    );
  }

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
  rx: { borderWidth: 1.5 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.96 }] },
});
