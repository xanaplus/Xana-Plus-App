import { Pressable, StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts, radius, spacing } from '@/theme';

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

/** Rounded search field used on Home, the Categories tab and Search Results. */
export function SearchBar({
  value,
  placeholder = 'Search groceries, meds & more',
  onChangeText,
  onSubmit,
  onPress,
  trailingIcon = 'mic',
  onTrailingPress,
  autoFocus,
  style,
}: SearchBarProps) {
  const showValue = (value ?? '').length > 0;

  return (
    <View style={[styles.field, style]}>
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
      <Pressable accessibilityRole="button" accessibilityLabel={trailingIcon === 'mic' ? 'Voice search' : 'Filters'} onPress={onTrailingPress} hitSlop={8}>
        <Icon name={trailingIcon} size={18} color="onSurfaceVariant" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainerLow,
  },
  input: { flex: 1, padding: 0, fontSize: 14, fontFamily: fonts.regular, color: colors.onSurface },
  inputPlaceholder: { fontFamily: fonts.regular },
  flex: { flex: 1 },
});
