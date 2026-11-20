import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';

import { Icon, Txt } from '@/components/ui';
import { radius, spacing } from '@/theme';
import { useTheme, useThemeStyles } from '@/theme/provider';
import type { Palette } from '@/theme';

/**
 * Marketing's "Shop announcement" from the admin site (20 Nov 2026): a solid amber banner at
 * the foot of Home's green masthead, so short news (holiday hours, a big sale) can't be missed.
 * Amber is the app's promotion colour and the only solid amber block on Home, so it stands out
 * against the mint header without competing with the green Shop now card. Information only:
 * the text is not a link.
 */
export function AnnouncementBanner({ text }: { text: string }) {
  const styles = useThemeStyles(createStyles);
  const { colors } = useTheme();
  return (
    <Animated.View
      entering={FadeInDown.duration(380).reduceMotion(ReduceMotion.System)}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Announcement: ${text}`}
      style={styles.banner}
    >
      <View style={styles.badge}>
        <Icon name="announce" size={20} color={colors.secondaryContainer} />
      </View>
      <Txt variant="titleSm" tint={colors.onSecondaryContainer} style={styles.text}>{text}</Txt>
    </Animated.View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.secondaryContainer,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 2,
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.onSecondaryContainer,
  },
  text: { flex: 1 },
});
