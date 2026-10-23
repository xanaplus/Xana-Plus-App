import { Platform, Pressable, StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import { fonts, radius, spacing } from '@/theme';
import { useTheme } from '@/theme/provider';

import { Icon, type IconName } from './icon';
import { Txt } from './text';

export type SearchBarProps = {
  value?: string;
  placeholder?: string;
  onChangeText?: (text: string) => void;
  onSubmit?: () => void;
  /** Non-editable variant: the whole field is a button that navigates. */
  onPress?: () => void;
  trailingIcon?: IconName;
  onTrailingPress?: () => void;
  autoFocus?: boolean;
  style?: StyleProp<ViewStyle>;
};

const TRAILING_LABELS: Partial<Record<IconName, string>> = { close: 'Clear search', scan: 'Scan a barcode' };

/** Rounded search field used on Home, the Categories tab and Search Results. */
export function SearchBar({
  value,
  placeholder = 'Search groceries, meds & more',
  onChangeText,
  onSubmit,
  onPress,
  trailingIcon,
  onTrailingPress,
  autoFocus,
  style,
}: SearchBarProps) {
  const { colors } = useTheme();
  const showValue = (value ?? '').length > 0;

  return (
    <View style={[styles.field, { backgroundColor: colors.surfaceContainerLow }, style]}>
      <Icon name="search" size={18} color="outline" />
      {onPress ? (
        <Pressable accessibilityRole="search" accessibilityLabel={placeholder} onPress={onPress} style={styles.flex}>
          <Txt variant="body" color="outline" numberOfLines={1}>
            {placeholder}
          </Txt>
        </Pressable>
      ) : (
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmit}
          placeholder={placeholder}
          placeholderTextColor={colors.outline}
          autoFocus={autoFocus}
          returnKeyType="search"
          accessibilityLabel={placeholder}
          style={[styles.input, showValue ? null : styles.inputPlaceholder]}
        />
      )}
      {trailingIcon ? (
        <Pressable accessibilityRole="button" accessibilityLabel={TRAILING_LABELS[trailingIcon] ?? 'Filters'} onPress={onTrailingPress} hitSlop={8}>
          <Icon name={trailingIcon} size={18} color="onSurfaceVariant" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
  },
  // iOS browsers zoom focused inputs below 16px; leave user-controlled zoom enabled.
  input: { flex: 1, minWidth: 0, padding: 0, fontSize: Platform.OS === 'web' ? 16 : 14, fontFamily: fonts.regular },
  inputPlaceholder: { fontFamily: fonts.regular },
  flex: { flex: 1 },
});
