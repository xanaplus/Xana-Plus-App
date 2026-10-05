import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, spacing, type ColorToken } from '@/theme';

import { Icon, type IconName } from './icon';
import { Txt } from './text';

export type ChipTone = 'neutral' | 'brand' | 'mint' | 'amber' | 'outline';

const tones: Record<ChipTone, { bg: string; fg: ColorToken }> = {
  neutral: { bg: colors.surfaceContainerLow, fg: 'onSurfaceVariant' },
  brand: { bg: colors.primaryContainer, fg: 'onPrimary' },
  mint: { bg: colors.mintSurface, fg: 'primary' },
  amber: { bg: colors.amberTint15, fg: 'secondary' },
  outline: { bg: colors.surface, fg: 'onSurfaceVariant' },
};

export type ChipProps = {
  label: string;
  tone?: ChipTone;
  icon?: IconName;
  selected?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** Pill used for filters, delivery-mode switches and category quick-picks. */
export function Chip({ label, tone = 'neutral', icon, selected, onPress, style }: ChipProps) {
  const t = selected ? tones.brand : tones[tone];
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={{ selected: !!selected }}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: t.bg,
          borderWidth: tone === 'outline' || selected ? 1 : 0,
          borderColor: selected ? colors.primary : colors.outlineSoft30,
          opacity: pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={14} color={t.fg} /> : null}
      <Txt variant="label" tint={colors[t.fg]} numberOfLines={1}>
        {label}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    height: 32,
    borderRadius: radius.pill,
  },
});
