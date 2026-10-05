import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { spacing } from '@/theme';

import { Icon } from './icon';
import { Txt } from './text';

export type SectionHeaderProps = {
  title: string;
  /** Trailing action label, e.g. "See All" / "See 42 Items". */
  actionLabel?: string;
  onAction?: () => void;
  icon?: 'flame' | 'sparkle';
  style?: StyleProp<ViewStyle>;
};

/** Section title with an optional trailing link — used on every listing screen. */
export function SectionHeader({ title, actionLabel, onAction, icon, style }: SectionHeaderProps) {
  return (
    <View style={[styles.row, style]}>
      <View style={styles.titleRow}>
        {icon ? <Icon name={icon} size={18} color="secondaryContainer" /> : null}
        <Txt variant="headlineSm" numberOfLines={1}>
          {title}
        </Txt>
      </View>
      {actionLabel ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8} style={styles.action}>
          <Txt variant="label" color="primaryContainer">
            {actionLabel}
          </Txt>
          <Icon name="chevron-right" size={14} color="primaryContainer" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 2 },
});
