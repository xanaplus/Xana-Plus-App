import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Masthead } from '@/components/nav/masthead';
import { useTabScrollTop } from '@/components/nav/use-tab-scroll-top';
import { Badge, Button, Divider, Icon, Screen, Txt, type IconName } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { LAUNCH_SCOPE } from '@/lib/launch-scope';
import { PharmacistWhatsAppSheet } from '@/features/pharmacy/whatsapp-sheet';
import { TodayCard } from '@/features/wellness/today-card';
import { layout, radius, spacing } from '@/theme';
import { useThemeStyles } from '@/theme/provider';
import type { Palette } from '@/theme';

/** Community Groups stay a preview until our pharmacists moderate them (owner, 18 Nov 2026). */
const GROUPS: { title: string; description: string; icon: IconName }[] = [
  { title: 'Diabetes Support', description: 'Everyday tips and encouragement for living well with diabetes.', icon: 'molecule' },
  { title: 'Maternal Health', description: 'Support for pregnancy, new mothers and young families.', icon: 'heart' },
];

/**
 * The Wellness tab (owner, 18 Nov 2026): the private Today check-in card (water, Habari ya
 * leo?, moving, this week's question),
 * Diabetes and Hypertension help, and Community Groups as a preview. Check-ins stay on
 * this phone; nothing here is medical advice.
 */
export default function WellnessRoute() {
  const styles = useThemeStyles(createStyles);
  const router = useRouter();
  const scrollTop = useTabScrollTop();
  const [askOpen, setAskOpen] = useState(false);

  return (
    <Screen scroll={false} padded={false} contentStyle={styles.screenBody} edgeToEdgeTop>
      <ScrollView ref={scrollTop} showsVerticalScrollIndicator={false} contentContainerStyle={styles.page}>
        <Masthead title="Wellness" subtitle="Wellness, your way. A moment for you: little check-ins can help you notice how your day is going." />

        <View style={styles.section}>
          <TodayCard onAskPharmacist={() => setAskOpen(true)} />
        </View>

        <View style={styles.section}>
          <Txt variant="headline">Diabetes and Hypertension Help</Txt>
          <View style={styles.helpCard}>
            <Txt variant="body" color="onSurfaceVariant">
              {LAUNCH_SCOPE.wellnessPreviews
                ? 'Information, nutrition and everyday support, written by Xana pharmacists. Coming soon. Until then, our pharmacists are a message away.'
                : 'Questions about diabetes, blood pressure or your medicines? Our pharmacists are a message away.'}
            </Txt>
            <Button label="Ask a pharmacist" icon="whatsapp" iconPosition="leading" variant="tonal" onPress={() => setAskOpen(true)} />
          </View>
        </View>

        {LAUNCH_SCOPE.wellnessPreviews ? (
          <View style={styles.section}>
            <View style={styles.headRow}>
              <Txt variant="headline">Community Groups</Txt>
              <Badge label="Preview" tone="neutral" />
            </View>
            <Txt variant="bodySm" color="onSurfaceVariant">
              Support groups moderated by Xana pharmacists. Joining and discussions open once moderation is in place.
            </Txt>
            <View style={styles.list}>
              {GROUPS.map((group, index) => (
                <View key={group.title}>
                  {index > 0 ? <Divider /> : null}
                  <View style={styles.listRow}>
                    <View style={styles.listIcon}>
                      <Icon name={group.icon} size={18} color="primaryAccent" />
                    </View>
                    <View style={styles.flex}>
                      <Txt variant="title">{group.title}</Txt>
                      <Txt variant="caption" color="onSurfaceVariant">{group.description}</Txt>
                    </View>
                  </View>
                </View>
              ))}
              <Divider />
              <View style={styles.listRow}>
                <View style={styles.listIcon}>
                  <Icon name="receipt" size={18} color="primaryAccent" />
                </View>
                <View style={styles.flex}>
                  <Txt variant="title">Family Health Records</Txt>
                  <Txt variant="caption" color="onSurfaceVariant">Keep your family’s health details in one place.</Txt>
                </View>
                <Badge label="Coming soon" tone="neutral" />
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          {LAUNCH_SCOPE.memberPlans ? (
            <PressableScale accessibilityRole="button" accessibilityLabel="See Member Services and Benefits" onPress={() => router.push('/membership')} style={styles.memberLink}>
              <Icon name="star" size={18} color="primaryAccent" />
              <Txt variant="label" color="primaryAccent" style={styles.flex}>Free health checks come with membership</Txt>
              <Icon name="chevron-right" size={16} color="primaryAccent" />
            </PressableScale>
          ) : null}
          <Txt variant="caption" color="onSurfaceVariant" style={styles.disclaimer}>
            These are simple personal check-ins, not medical advice or a substitute for care from a qualified health professional.
          </Txt>
        </View>
      </ScrollView>

      <PharmacistWhatsAppSheet visible={askOpen} onClose={() => setAskOpen(false)} />
    </Screen>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  screenBody: { paddingTop: spacing.none, paddingBottom: spacing.none },
  page: { paddingBottom: spacing.colossal },
  flex: { flex: 1 },
  section: { paddingHorizontal: layout.screenMargin, marginTop: spacing.xxxl, gap: spacing.sm },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },

  helpCard: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.card,
    backgroundColor: colors.surfaceContainerLow,
  },

  list: {
    marginTop: spacing.xs,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.outlineSoft30,
  },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  listIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  memberLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.card,
    backgroundColor: colors.mintSurface,
  },
  disclaimer: { marginTop: spacing.sm, textAlign: 'center' },
});
