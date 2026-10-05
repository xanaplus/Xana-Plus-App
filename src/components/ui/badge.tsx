import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing, type ColorToken } from '@/theme';

import { Icon, type IconName } from './icon';
import { Txt } from './text';

export type BadgeTone = 'discount' | 'fresh' | 'new' | 'info' | 'warning' | 'danger' | 'neutral' | 'brand';

const tones: Record<BadgeTone, { bg: string; fg: ColorToken }> = {
  discount: { bg: colors.secondaryContainer, fg: 'onSecondary' },
  fresh: { bg: colors.primaryContainer, fg: 'onPrimary' },
  new: { bg: colors.tertiaryContainer, fg: 'onTertiary' },
  info: { bg: colors.mintSurface, fg: 'primary' },
  warning: { bg: colors.secondaryFixed, fg: 'secondary' },
  danger: { bg: colors.errorContainer, fg: 'onErrorContainer' },
  neutral: { bg: colors.surfaceContainer, fg: 'onSurfaceVariant' },
  brand: { bg: colors.primary, fg: 'onPrimary' },
};

export type BadgeProps = {
  label: string;
  tone?: BadgeTone;
  /** Badge is a `Txt`, so its style is a text style. */
  style?: StyleProp<TextStyle>;
};

/** Small status pill overlaid on cards and thumbnails ("SAVE 18%", "FRESH"). */
export function Badge({ label, tone = 'neutral', style }: BadgeProps) {
  const t = tones[tone];
  return (
    <Txt variant="micro" tint={colors[t.fg]} numberOfLines={1} style={[styles.badge, { backgroundColor: t.bg }, style]}>
      {label}
    </Txt>
  );
}

export type NoticePillProps = Omit<BadgeProps, 'style'> & {
  icon?: IconName;
  /** NoticePill is a `View` wrapper. */
  style?: StyleProp<ViewStyle>;
};

/** Outlined note strip: "In Stock", "Out of stock", "Rx required". */
export function NoticePill({ label, tone = 'info', icon, style }: NoticePillProps) {
  const t = tones[tone];
  return (
    <View style={[styles.notice, { backgroundColor: t.bg }, style]}>
      {icon ? <Icon name={icon} size={12} color={t.fg} /> : null}
      <Txt variant="labelSm" tint={colors[t.fg]} numberOfLines={1}>
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
});
