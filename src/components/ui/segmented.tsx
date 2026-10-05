import { Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { Txt } from '@/components/ui/text';
import { colors, elevation, radius, spacing } from '@/theme';

export type SegmentedOption<T extends string> = { value: T; label: string; icon?: IconName };

export type SegmentedProps<T extends string> = {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Scrolls horizontally instead of compressing — used for the 8 category verticals. */
  scrollable?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Pill filter row: category verticals, order tabs, sort chips. */
export function Segmented<T extends string>({ options, value, onChange, scrollable, style }: SegmentedProps<T>) {
  const pills = options.map(option => {
    const selected = option.value === value;
    return (
      <Pressable
        key={option.value}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={() => onChange(option.value)}
        style={[styles.pill, selected ? styles.pillSelected : null]}
      >
        {option.icon ? <Icon name={option.icon} size={14} color={selected ? 'onPrimary' : 'onSurfaceVariant'} /> : null}
        <Txt variant="label" tint={selected ? colors.onPrimary : colors.onSurfaceVariant}>
          {option.label}
        </Txt>
      </Pressable>
    );
  });

  if (scrollable) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.row, style]}>
        {pills}
      </ScrollView>
    );
  }

  return <View style={[styles.row, style]}>{pills}</View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainerLow,
  },
  pillSelected: { backgroundColor: colors.primaryContainer, ...elevation.hairline },
});
