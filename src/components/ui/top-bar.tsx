import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { elevation, layout, radius, spacing } from '@/theme';
import { useTheme } from '@/theme/provider';

import { Icon, type IconName } from './icon';
import { Txt } from './text';

export type TopBarProps = {
  title?: string;
  /** Small line under the title (e.g. cart item count, delivery slot). */
  subtitle?: string;
  onBack?: () => void;
  /** Right-aligned actions. */
  actions?: ReactNode;
  /** Frosted variant used when content scrolls beneath the bar. */
  translucent?: boolean;
  /** Centre-aligned title (checkout / login flows). */
  centered?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Fixed app bar: 64pt tall with a hairline under translucent variants. */
export function TopBar({ title, subtitle, onBack, actions, translucent, centered, style }: TopBarProps) {
  const { colors, resolved } = useTheme();
  // The status-bar gap belongs to <Screen>, which keeps it fixed while the page scrolls.
  const body = (
    <View style={[styles.bar, centered ? styles.barCentered : null]}>
      {/* The back slot is only reserved when there is a back button, or to balance a centred title. */}
      {onBack || centered ? (
        <View style={styles.side}>
          {onBack ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} hitSlop={8} style={styles.back}>
              <Icon name="chevron-left" size={22} color="onSurface" />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <View style={[styles.titles, centered ? styles.titlesCentered : null]}>
        {title ? (
          <Txt variant="headline" numberOfLines={1}>
            {title}
          </Txt>
        ) : null}
        {subtitle ? (
          <Txt variant="caption" color="onSurfaceVariant" numberOfLines={1}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      <View style={[styles.actions, centered ? styles.actionsCentered : null]}>{actions}</View>
    </View>
  );

  if (!translucent) return <View style={[{ backgroundColor: colors.surface }, style]}>{body}</View>;

  return (
    <BlurView intensity={Platform.OS === 'web' ? 0 : 24} tint={resolved === 'dark' ? 'dark' : 'light'} style={[styles.translucent, { backgroundColor: colors.surface }, elevation.stickyTop, style]}>
      {body}
    </BlurView>
  );
}

/** Square glyph button for app-bar slots. */
export function TopBarAction({
  name,
  onPress,
  accessibilityLabel,
  badge,
}: {
  name: IconName;
  onPress?: () => void;
  accessibilityLabel: string;
  /** Small count on the icon's corner (e.g. items in the cart); hidden when 0 or missing. */
  badge?: number;
}) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} hitSlop={6} style={styles.action}>
      <Icon name={name} size={20} color="onSurface" />
      {badge ? (
        <View style={[styles.badge, { backgroundColor: colors.primaryContainer, borderColor: colors.surface }]}>
          <Txt variant="labelSm" tint={colors.onPrimary}>
            {badge > 99 ? '99+' : String(badge)}
          </Txt>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: layout.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenMargin,
    gap: spacing.sm,
  },
  barCentered: { justifyContent: 'space-between' },
  side: { minWidth: 28 },
  back: { width: 28, height: 28, alignItems: 'flex-start', justifyContent: 'center' },
  titles: { flex: 1, gap: 1 },
  titlesCentered: { alignItems: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actionsCentered: { minWidth: 28, justifyContent: 'flex-end' },
  action: { width: layout.touchTarget, height: layout.touchTarget, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  translucent: { overflow: 'hidden' },
});
