import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { Txt } from '@/components/ui/text';
import { radius, spacing } from '@/theme';
import { useTheme } from '@/theme/provider';

export type SelectableOptionProps = {
  title: string;
  description?: string;
  icon?: IconName;
  /** Extra line rendered under the description (blocked reasons, fees). */
  note?: string;
  noteTone?: 'neutral' | 'warning' | 'danger';
  selected: boolean;
  onPress: () => void;
  /** Renders a tick instead of a radio dot — used by preference sheets. */
  indicator?: 'radio' | 'check';
  disabled?: boolean;
  trailing?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Full-width selectable row with a leading glyph and an edge indicator.
 * Used for payment methods, delivery slots and substitution preferences.
 */
export function SelectableOption({
  title,
  description,
  icon,
  note,
  noteTone = 'neutral',
  selected,
  onPress,
  indicator = 'radio',
  disabled,
  trailing,
  style,
}: SelectableOptionProps) {
  const { colors } = useTheme();
  const noteColor = noteTone === 'danger' ? colors.error : noteTone === 'warning' ? colors.warningDeep : colors.onSurfaceVariant;

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={description ? `${title}. ${description}` : title}
      accessibilityState={{ checked: selected, disabled: !!disabled }}
      aria-checked={selected}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderColor: colors.outlineSoft30, backgroundColor: colors.surface },
        selected ? { borderColor: colors.primaryAccent, backgroundColor: colors.mintSubtle } : null,
        { opacity: disabled ? 0.5 : pressed ? 0.9 : 1 },
        style,
      ]}
    >
      {icon ? (
          <View style={[styles.iconWrap, { backgroundColor: selected ? colors.primaryContainer : colors.surfaceContainerLow }]}>
          <Icon name={icon} size={18} color={selected ? 'onPrimary' : 'onSurfaceVariant'} />
        </View>
      ) : null}
      <View style={styles.body}>
        <Txt variant="title">{title}</Txt>
        {description ? (
          <Txt variant="caption" color="onSurfaceVariant">
            {description}
          </Txt>
        ) : null}
        {note ? (
          <Txt variant="caption" tint={noteColor}>
            {note}
          </Txt>
        ) : null}
      </View>
      {trailing}
      {indicator === 'check' ? (
        selected ? <Icon name="check-circle" size={20} color="primaryAccent" /> : <View style={styles.checkPlaceholder} />
      ) : (
        <View style={[styles.radio, { borderColor: selected ? colors.primaryAccent : colors.outline }]}>{selected ? <View style={[styles.radioDot, { backgroundColor: colors.primaryContainer }]} /> : null}</View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.card,
    borderWidth: 1,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: radius.pill },
  checkPlaceholder: { width: 20, height: 20 },
});
