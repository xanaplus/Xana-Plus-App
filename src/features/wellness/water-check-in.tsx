import { StyleSheet, View } from 'react-native';

import { Button, Icon, IconButton, Txt } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { selectFeedback, successFeedback } from '@/lib/haptics';
import { radius, spacing } from '@/theme';
import { useTheme, useThemeStyles } from '@/theme/provider';
import type { Palette } from '@/theme';

import { useWellness, wellness } from './store';
import { WaterGlass } from './water-glass';

type WaterCheckInProps = {
  /** Home shows the short card that opens Wellness; the Wellness tab shows the full one. */
  compact?: boolean;
  onOpen?: () => void;
};

/** "Today's water check-in": the glass fills as glasses are logged. Same count on Home and Wellness. */
export function WaterCheckIn({ compact = false, onOpen }: WaterCheckInProps) {
  const styles = useThemeStyles(createStyles);
  const { colors } = useTheme();
  const { today, goal } = useWellness();
  const reached = today.water >= goal;

  const log = () => {
    wellness.addGlass();
    if (today.water + 1 === goal) successFeedback();
    else selectFeedback();
  };

  const line = reached
    ? 'Goal reached for today. Nicely done.'
    : today.water === 0
      ? 'A small sip goes a long way.'
      : 'A gentle reminder to take a sip.';

  return (
    <View style={[styles.card, compact ? styles.cardCompact : null]}>
      <WaterGlass value={today.water} goal={goal} size={compact ? 52 : 76} />
      <View style={styles.body}>
        {compact ? (
          <PressableScale accessibilityRole="button" accessibilityLabel="Open Wellness" onPress={onOpen} style={styles.titleRow}>
            <Txt variant="titleLg" tint={colors.onPrimary}>Your daily check-in</Txt>
            <Icon name="chevron-right" size={18} color={colors.onPrimary} />
          </PressableScale>
        ) : (
          <Txt variant="titleLg" tint={colors.onPrimary}>{"Today's water check-in"}</Txt>
        )}
        <Txt variant="display" tint={colors.onPrimary} accessibilityLabel={`${today.water} of ${goal} glasses logged today`}>
          {today.water}
          <Txt variant="title" tint={colors.onPrimaryContainer}>{` of ${goal} glasses`}</Txt>
        </Txt>
        {/* One mark per glass of the goal. */}
        <View style={styles.pips} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {Array.from({ length: goal }, (_, index) => (
            <View key={index} style={[styles.pip, index < today.water ? styles.pipOn : null]} />
          ))}
        </View>
        <Txt variant="bodySm" tint={colors.onPrimaryContainer}>{line}</Txt>
        <View style={styles.actions}>
          <Button label="Log a glass" icon="plus" iconPosition="leading" size="sm" variant="secondary" onPress={log} style={styles.logButton} />
          {!compact && today.water > 0 ? (
            <IconButton name="minus" accessibilityLabel="Remove one glass" onPress={wellness.removeGlass} size={36} iconSize={16} background={colors.white15} color="onPrimary" />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.card,
    backgroundColor: colors.primaryContainer,
  },
  cardCompact: { paddingVertical: spacing.md },
  body: { flex: 1, gap: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, alignSelf: 'flex-start', minHeight: 32 },
  pips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginVertical: spacing.xxs },
  pip: { width: 14, height: 6, borderRadius: radius.pill, backgroundColor: colors.white15 },
  pipOn: { backgroundColor: colors.water },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  logButton: { alignSelf: 'flex-start' },
});
