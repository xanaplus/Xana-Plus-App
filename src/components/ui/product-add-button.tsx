import { router } from 'expo-router';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { LAUNCH_SCOPE } from '@/lib/launch-scope';
import { useSession } from '@/store/session';
import { radius } from '@/theme';
import { useTheme } from '@/theme/provider';

export type ProductAddButtonProps = {
  productName: string;
  /** With no `onPress`, a prescription button opens this product's page. */
  productId?: string;
  onPress?: () => void;
  disabled?: boolean;
  /**
   * Prescription medicine: a signed-in customer adds it once and attaches the
   * prescription at checkout (owner, 29 Oct 2026); signed out, the button opens
   * sign-in. With no `onPress` it opens the product page (or, while a stand-alone upload
   * exists, LAUNCH_SCOPE.rxUploadAlone, the upload-prescription flow).
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
export function ProductAddButton({ productName, productId, onPress, disabled = false, rxRequired = false, style }: ProductAddButtonProps) {
  const { colors } = useTheme();
  const { isAuthenticated } = useSession();
  // Without onPress, the stand-alone upload is off, and no product page to open, there is nothing to do.
  const rxNoAction = !onPress && !LAUNCH_SCOPE.rxUploadAlone && !productId;
  const isDisabled = disabled || (!onPress && !rxRequired) || (rxRequired && rxNoAction);

  if (rxRequired) {
    const addRx = () => {
      if (onPress) {
        if (!isAuthenticated) router.push('/login');
        else onPress();
      } else if (LAUNCH_SCOPE.rxUploadAlone) openPrescriptionUpload(productName);
      else if (productId) router.push(`/product/${productId}`);
    };
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          onPress
            ? `Add ${productName} to cart. Prescription needed at checkout`
            : LAUNCH_SCOPE.rxUploadAlone
              ? `Prescription needed for ${productName}. Upload a prescription`
              : `Prescription needed for ${productName}. Open product`
        }
        disabled={isDisabled}
        onPress={addRx}
        hitSlop={4}
        style={({ pressed }) => [
          styles.button,
          styles.rx,
          { borderColor: colors.primary, backgroundColor: colors.surface, opacity: isDisabled ? 0.62 : 1 },
          pressed && !isDisabled ? styles.pressed : null,
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
