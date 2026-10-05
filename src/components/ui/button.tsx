import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, elevation, layout, radius, spacing, type ColorToken } from '@/theme';

import { Icon, type IconName } from './icon';
import { PressableScale } from './pressable-scale';
import { Txt } from './text';

export type ButtonVariant = 'primary' | 'secondary' | 'tonal' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

type VariantStyle = { bg: string; fg: ColorToken | string; border?: string };

const variants: Record<ButtonVariant, VariantStyle> = {
  primary: { bg: colors.primaryContainer, fg: 'onPrimary' },
  secondary: { bg: colors.secondaryContainer, fg: 'onSecondary' },
  tonal: { bg: colors.mintSurface, fg: 'primary' },
  outline: { bg: colors.surface, fg: 'primary', border: colors.outlineSoft30 },
  ghost: { bg: colors.transparent, fg: 'primary' },
  danger: { bg: colors.errorContainer, fg: 'onErrorContainer' },
};

const sizes: Record<ButtonSize, { height: number; px: number; gap: number; icon: number }> = {
  sm: { height: 36, px: spacing.lg, gap: spacing.xs, icon: 16 },
  md: { height: 44, px: spacing.xl, gap: spacing.sm, icon: 18 },
  lg: { height: 52, px: spacing.xxl, gap: spacing.sm, icon: 20 },
};

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconPosition?: 'leading' | 'trailing';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'trailing',
  disabled,
  loading,
  fullWidth = true,
  style,
}: ButtonProps) {
  const v = variants[variant];
  const s = sizes[size];
  const inactive = disabled || loading;
  const fg = v.fg in colors ? colors[v.fg as ColorToken] : v.fg;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={[
        styles.base,
        {
          height: s.height,
          paddingHorizontal: s.px,
          gap: s.gap,
          borderRadius: radius.pill,
          backgroundColor: v.bg,
          borderWidth: v.border ? 1 : 0,
          borderColor: v.border,
          opacity: inactive ? 0.45 : 1,
        },
        variant === 'primary' ? elevation.hairline : null,
        fullWidth ? styles.full : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <>
          {icon && iconPosition === 'leading' ? <Icon name={icon} size={s.icon} color={fg} /> : null}
          <Txt variant={size === 'sm' ? 'buttonSm' : 'button'} tint={fg} numberOfLines={1}>
            {label}
          </Txt>
          {icon && iconPosition === 'trailing' ? <Icon name={icon} size={s.icon} color={fg} /> : null}
        </>
      )}
    </PressableScale>
  );
}

/** Circular icon-only affordance — app-bar actions, card add buttons. */
export function IconButton({
  name,
  onPress,
  size = layout.touchTarget,
  iconSize = 20,
  background = colors.surfaceContainerLow,
  color = 'onSurface',
  accessibilityLabel,
  style,
}: {
  name: IconName;
  onPress?: () => void;
  size?: number;
  iconSize?: number;
  background?: string;
  color?: ColorToken;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: radius.pill, backgroundColor: background, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 },
        style,
      ]}
    >
      <Icon name={name} size={iconSize} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  full: { alignSelf: 'stretch' },
});

/** Row of labelled actions spaced apart — used by detail screens. */
export function ButtonRow({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', gap: spacing.md }, style]}>{children}</View>;
}
