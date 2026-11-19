import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Masthead } from '@/components/nav/masthead';
import { useTabScrollTop } from '@/components/nav/use-tab-scroll-top';
import { Badge, Button, Divider, Icon, IconButton, Screen, Txt, type IconName } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { PharmacistWhatsAppSheet } from '@/features/pharmacy/whatsapp-sheet';
import { useWellness, wellness, type Mood } from '@/features/wellness/store';
import { WaterCheckIn } from '@/features/wellness/water-check-in';
import { selectFeedback } from '@/lib/haptics';
import { layout, radius, spacing } from '@/theme';
import { useTheme, useThemeStyles } from '@/theme/provider';
import type { Palette } from '@/theme';

/** Eyes and mouth on the yellow mood faces (dark gold ink, readable in light and dark mode). */
const FACE_INK = '#3d3200';

/** "How are you feeling?": every answer is a fine answer. */
const MOODS: { id: Mood; label: string; note: string }[] = [
  { id: 'great', label: 'Great', note: 'Glad to hear it.' },
  { id: 'okay', label: 'Okay', note: 'Thanks for checking in.' },
  { id: 'low', label: 'Low', note: 'Be gentle with yourself today. If it keeps up, a pharmacist or doctor can help.' },
];

/** Community Groups stay a preview until our pharmacists moderate them (owner, 18 Nov 2026). */
const GROUPS: { title: string; description: string; icon: IconName }[] = [
  { title: 'Diabetes Support', description: 'Everyday tips and encouragement for living well with diabetes.', icon: 'molecule' },
  { title: 'Maternal Health', description: 'Support for pregnancy, new mothers and young families.', icon: 'heart' },
];

/**
 * The Wellness tab (owner, 18 Nov 2026): private daily check-ins (water, mood, moving),
 * Diabetes and Hypertension help, and Community Groups as a preview. Check-ins stay on
 * this phone; nothing here is medical advice.
 */
export default function WellnessRoute() {
  const styles = useThemeStyles(createStyles);
  const { colors } = useTheme();
  const router = useRouter();
  const scrollTop = useTabScrollTop();
  const { today, goal } = useWellness();
  const [askOpen, setAskOpen] = useState(false);
  const mood = MOODS.find(entry => entry.id === today.mood);

  return (
    <Screen scroll={false} padded={false} contentStyle={styles.screenBody} edgeToEdgeTop>
      <ScrollView ref={scrollTop} showsVerticalScrollIndicator={false} contentContainerStyle={styles.page}>
        <Masthead title="Wellness" subtitle="Wellness, your way. A moment for you: little check-ins can help you notice how your day is going." />

        <View style={styles.section}>
          <WaterCheckIn />
          <View style={styles.goalRow}>
            <Txt variant="label" color="onSurfaceVariant">Daily goal</Txt>
            <View style={styles.goalStepper}>
              <IconButton name="minus" accessibilityLabel="Lower the daily goal" onPress={() => wellness.setGoal(goal - 1)} size={36} iconSize={16} background={colors.surfaceContainerLow} />
              <Txt variant="title" accessibilityLabel={`Daily goal ${goal} glasses`}>{`${goal} glasses`}</Txt>
              <IconButton name="plus" accessibilityLabel="Raise the daily goal" onPress={() => wellness.setGoal(goal + 1)} size={36} iconSize={16} background={colors.surfaceContainerLow} />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Txt variant="headline">How are you feeling?</Txt>
          <Txt variant="bodySm" color="onSurfaceVariant">A private daily check-in.</Txt>
          <View style={styles.moods} accessibilityRole="radiogroup">
            {MOODS.map(entry => {
              const selected = today.mood === entry.id;
              return (
                <PressableScale
                  key={entry.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Feeling ${entry.label}`}
                  onPress={() => {
                    selectFeedback();
                    wellness.setMood(entry.id);
                  }}
                  style={[styles.mood, selected ? styles.moodOn : null]}
                >
                  <MoodFace mood={entry.id} selected={selected} />
                  <Txt variant="label" tint={selected ? colors.onPrimary : colors.onSurface}>{entry.label}</Txt>
                </PressableScale>
              );
            })}
          </View>
          {mood ? <Txt variant="bodySm" color="onSurfaceVariant">{mood.note}</Txt> : null}
        </View>

        <View style={styles.section}>
          <PressableScale
            accessibilityRole="checkbox"
            accessibilityState={{ checked: today.moved === true }}
            accessibilityLabel="I made time to move today"
            onPress={() => {
              selectFeedback();
              wellness.toggleMoved();
            }}
            style={[styles.moveRow, today.moved ? styles.moveRowOn : null]}
          >
            <View style={[styles.checkbox, today.moved ? styles.checkboxOn : null]}>
              {today.moved ? <Icon name="check" size={16} color="onPrimary" /> : null}
            </View>
            <View style={styles.flex}>
              <Txt variant="titleLg">I made time to move</Txt>
              <Txt variant="bodySm" color="onSurfaceVariant">A walk, a stretch or something you enjoy.</Txt>
            </View>
          </PressableScale>
          <View style={styles.privacy}>
            <Icon name="lock" size={14} color="onSurfaceVariant" />
            <Txt variant="caption" color="onSurfaceVariant" style={styles.flex}>
              Your check-ins stay on this phone. Nobody at Xana sees them.
            </Txt>
          </View>
        </View>

        <View style={styles.section}>
          <Txt variant="headline">Diabetes and Hypertension Help</Txt>
          <View style={styles.helpCard}>
            <Txt variant="body" color="onSurfaceVariant">
              Information, nutrition and everyday support, written by Xana pharmacists. Coming soon. Until then, our pharmacists are a message away.
            </Txt>
            <Button label="Ask a pharmacist" icon="whatsapp" iconPosition="leading" variant="tonal" onPress={() => setAskOpen(true)} />
          </View>
        </View>

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

        <View style={styles.section}>
          <PressableScale accessibilityRole="button" accessibilityLabel="See Member Services and Benefits" onPress={() => router.push('/membership')} style={styles.memberLink}>
            <Icon name="star" size={18} color="primaryAccent" />
            <Txt variant="label" color="primaryAccent" style={styles.flex}>Free health checks come with membership</Txt>
            <Icon name="chevron-right" size={16} color="primaryAccent" />
          </PressableScale>
          <Txt variant="caption" color="onSurfaceVariant" style={styles.disclaimer}>
            These are simple personal check-ins, not medical advice or a substitute for care from a qualified health professional.
          </Txt>
        </View>
      </ScrollView>

      <PharmacistWhatsAppSheet visible={askOpen} onClose={() => setAskOpen(false)} />
    </Screen>
  );
}

/** A simple drawn face per mood: the mouth curves up, flat or down. */
function MoodFace({ mood, selected }: { mood: Mood; selected: boolean }) {
  const styles = useThemeStyles(createStyles);
  return (
    <View style={[styles.face, selected ? styles.faceOn : null]}>
      <View style={styles.eyes}>
        <View style={[styles.eye, selected ? styles.eyeOn : null]} />
        <View style={[styles.eye, selected ? styles.eyeOn : null]} />
      </View>
      <View
        style={[
          styles.mouth,
          selected ? styles.mouthOn : null,
          mood === 'great' ? styles.mouthUp : mood === 'low' ? styles.mouthDown : styles.mouthFlat,
        ]}
      />
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  screenBody: { paddingTop: spacing.none, paddingBottom: spacing.none },
  page: { paddingBottom: spacing.colossal },
  flex: { flex: 1 },
  section: { paddingHorizontal: layout.screenMargin, marginTop: spacing.xxxl, gap: spacing.sm },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },

  goalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xs },
  goalStepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },

  moods: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  mood: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.outlineSoft30,
  },
  moodOn: { backgroundColor: colors.primaryContainer, borderColor: colors.primaryContainer },
  face: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.tertiaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  faceOn: { backgroundColor: colors.tertiaryFixedDim },
  eyes: { flexDirection: 'row', gap: 9 },
  // The face is the same yellow in both themes, so its features use one dark ink.
  eye: { width: 4, height: 4, borderRadius: 2, backgroundColor: FACE_INK },
  eyeOn: { backgroundColor: FACE_INK },
  mouth: { width: 14, height: 7, borderColor: FACE_INK },
  mouthOn: { borderColor: FACE_INK },
  mouthUp: { borderBottomWidth: 2, borderLeftWidth: 2, borderRightWidth: 2, borderBottomLeftRadius: 7, borderBottomRightRadius: 7, height: 6 },
  mouthFlat: { borderTopWidth: 2, height: 2, marginTop: 2 },
  mouthDown: { borderTopWidth: 2, borderLeftWidth: 2, borderRightWidth: 2, borderTopLeftRadius: 7, borderTopRightRadius: 7, height: 6, marginTop: 2 },

  moveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.outlineSoft30,
  },
  moveRowOn: { backgroundColor: colors.mintSurface, borderColor: colors.mintEdge },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.primaryContainer, borderColor: colors.primaryContainer },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xs },

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
