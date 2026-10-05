import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Txt } from '@/components/ui/text';
import { spacing } from '@/theme';

export type RatingProps = {
  value: number;
  /** e.g. "94 customer reviews" / "184 verified patient reviews". */
  reviewLabel?: string;
};

/** "★ 4.8 · 94 customer reviews" — product detail masthead. */
export function Rating({ value, reviewLabel }: RatingProps) {
  return (
    <View style={styles.row}>
      <Icon name="star" size={14} color="secondaryContainer" />
      <Txt variant="label">{value.toFixed(1)}</Txt>
      <Txt variant="caption" color="outline">
        ·
      </Txt>
      {reviewLabel ? (
        <Txt variant="caption" color="onSurfaceVariant">
          {reviewLabel}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
