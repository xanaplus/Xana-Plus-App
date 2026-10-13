import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { Skeleton, type SkeletonShape } from '@/components/ui/skeleton';
import { Txt } from '@/components/ui/text';
import { radius, spacing } from '@/theme';
import { useTheme } from '@/theme/provider';

export type ProgressBarProps = {
  /** 0 → 1. */
  value: number;
  height?: number;
  trackColor?: string;
  fillColor?: string;
  style?: StyleProp<ViewStyle>;
};

/** Thin progress track — splash loader, OTP timer, order status. */
export function ProgressBar({ value, height = 4, trackColor, fillColor, style }: ProgressBarProps) {
  const { colors } = useTheme();
  const clamped = Math.min(1, Math.max(0, value));
  return (
    <View style={[{ height, borderRadius: radius.pill, backgroundColor: trackColor ?? colors.surfaceContainerHigh }, style]}>
      <View style={{ width: `${clamped * 100}%`, height, borderRadius: radius.pill, backgroundColor: fillColor ?? colors.primaryAccent }} />
    </View>
  );
}

export type EmptyStateProps = {
  icon: IconName;
  title: string;
  description?: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Centred placeholder used by empty search, empty cart and error states. */
export function EmptyState({ icon, title, description, children, style }: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.empty, style]}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.mintSurface }]}>
        <Icon name={icon} size={32} color="primaryAccent" />
      </View>
      <Txt variant="headlineSm" align="center">
        {title}
      </Txt>
      {description ? (
        <Txt variant="body" color="onSurfaceVariant" align="center">
          {description}
        </Txt>
      ) : null}
      {children}
    </View>
  );
}

export type LoadStateProps = {
  status: 'loading' | 'error';
  /** Layout of the placeholder shown while loading, matched to what will appear. */
  placeholder?: SkeletonShape;
  /** Side margin for the placeholder when the surrounding body isn't padded. */
  inset?: boolean;
  /** What is loading, for the error copy — e.g. "products". */
  noun?: string;
  onRetry?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** Faint placeholders while live data loads; an offline message with a retry once it fails. */
export function LoadState({ status, noun = 'products', placeholder = 'grid', inset, onRetry, style }: LoadStateProps) {
  if (status === 'loading') return <Skeleton shape={placeholder} inset={inset} style={style} />;
  return (
    <EmptyState icon="refresh" title={`Couldn't load ${noun}`} description="Check your connection and try again." style={style}>
      {onRetry ? <Button label="Try again" variant="outline" fullWidth={false} onPress={onRetry} /> : null}
    </EmptyState>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.huge, paddingHorizontal: spacing.xl },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
