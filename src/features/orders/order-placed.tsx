import { StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, ZoomIn } from 'react-native-reanimated';

import { Icon } from '@/components/ui/icon';
import { useCountUp } from '@/components/ui/motion';
import { Txt } from '@/components/ui/text';
import { radius, spacing } from '@/theme';
import { useTheme } from '@/theme/provider';

/**
 * The "order placed" moment: the tick springs in, then the points earned count up
 * (McDonald's-style). Shown by the checkout confirmation and by the order page after M-Pesa.
 */
export function OrderPlaced({ points }: { points: number }) {
  const { colors } = useTheme();
  const shown = useCountUp(points);

  return (
    <View style={styles.wrap}>
      <Animated.View entering={ZoomIn.springify().damping(12)} style={[styles.circle, { backgroundColor: colors.primaryContainer }]}>
        <Animated.View entering={ZoomIn.delay(160).duration(200)}>
          <Icon name="check" size={30} color="onPrimary" />
        </Animated.View>
      </Animated.View>
      {points > 0 ? (
        <Animated.View entering={FadeInUp.delay(250).duration(220)} style={[styles.points, { backgroundColor: colors.tertiaryContainer }]}>
          <Icon name="star" size={14} color="onTertiaryContainer" />
          <Txt variant="label" tint={colors.onTertiaryContainer}>
            {`+${shown} Xana Club ${points === 1 ? 'point' : 'points'}`}
          </Txt>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.md },
  circle: { width: 64, height: 64, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  points: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill },
});
