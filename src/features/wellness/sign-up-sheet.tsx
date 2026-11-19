import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { BottomSheet, Button, Icon, Txt, type IconName } from '@/components/ui';
import { radius, spacing } from '@/theme';
import { useThemeStyles } from '@/theme/provider';
import type { Palette } from '@/theme';

import { useWellness, wellness } from './store';
import { WaterGlass } from './water-glass';

/** Only what an account really gives today: nothing promised that isn't built. */
const BENEFITS: { icon: IconName; text: string }[] = [
  { icon: 'shield', text: 'Your check-ins on any phone, private to you' },
  { icon: 'delivery', text: 'Order updates and tracking' },
  { icon: 'refresh', text: 'Buy it again in one tap' },
];

type SignUpSheetProps = { visible: boolean; onClose: () => void };

/**
 * Shown right after a signed-out shopper logs a glass (Roystone, 19 Nov 2026): the moment
 * they've just got value is the moment to offer an account. The store caps it: at most
 * once every 3 days, never again after 3 "Maybe later"s.
 */
export function SignUpSheet({ visible, onClose }: SignUpSheetProps) {
  const styles = useThemeStyles(createStyles);
  const router = useRouter();
  const { today, goal } = useWellness();
  const glasses = today.water === 1 ? '1 glass' : `${today.water} glasses`;

  const later = () => {
    wellness.dismissSignUpAsk();
    onClose();
  };
  const signUp = () => {
    onClose();
    router.push('/login');
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={later}
      footer={
        <View style={styles.actions}>
          <Button label="Sign up free" icon="user" iconPosition="leading" onPress={signUp} />
          <Button label="Maybe later" variant="ghost" onPress={later} />
        </View>
      }
    >
      <View style={styles.hero}>
        <View style={styles.glassTile}>
          <WaterGlass value={today.water} goal={goal} size={52} />
        </View>
        <View style={styles.flex}>
          <Txt variant="headline">{`${glasses} logged`}</Txt>
          <Txt variant="body" color="onSurfaceVariant">Keep it going on any phone with a free Xana Plus account.</Txt>
        </View>
      </View>
      <View style={styles.benefits}>
        {BENEFITS.map(benefit => (
          <View key={benefit.text} style={styles.benefit}>
            <View style={styles.benefitIcon}>
              <Icon name={benefit.icon} size={16} color="primaryAccent" />
            </View>
            <Txt variant="body" style={styles.flex}>{benefit.text}</Txt>
          </View>
        ))}
      </View>
      <Txt variant="caption" color="onSurfaceVariant">Sign up with your phone number. It takes a minute.</Txt>
    </BottomSheet>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  flex: { flex: 1 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginBottom: spacing.lg },
  // The glass is drawn for the green check-in card, so it sits on the same green here.
  glassTile: { padding: spacing.md, borderRadius: radius.xl, backgroundColor: colors.primaryContainer },
  benefits: { gap: spacing.md, marginBottom: spacing.lg },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  benefitIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { gap: spacing.xs },
});
