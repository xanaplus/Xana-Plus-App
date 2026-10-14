import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Txt } from '@/components/ui/text';
import { spacing } from '@/theme';

type SignInDetailsProps = {
  maskedPhone: string;
  onChangeNumber: () => void;
};

/** Keep account text readable; move the action below it on narrow screens. */
export function SignInDetails({ maskedPhone, onChangeNumber }: SignInDetailsProps) {
  return (
    <View style={styles.row}>
      <View style={styles.details}>
        <Txt variant="title">{maskedPhone}</Txt>
        <Txt variant="caption" color="onSurfaceVariant">
          Used to sign in and receive the M-Pesa prompt
        </Txt>
      </View>
      <Button label="Change number" size="sm" variant="outline" fullWidth={false} onPress={onChangeNumber} style={styles.action} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md },
  details: { flexGrow: 1, flexShrink: 1, flexBasis: 160, minWidth: 160 },
  action: { flexShrink: 0, minHeight: 44 },
});
