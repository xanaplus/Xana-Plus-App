import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge, Button, Divider, Icon, IconButton, Txt } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { selectFeedback } from '@/lib/haptics';
import { radius, spacing } from '@/theme';
import { useTheme, useThemeStyles } from '@/theme/provider';
import type { Palette } from '@/theme';

import { useWellness, useWellnessSync, wellness, type Mood, type WeeklyAnswer } from './store';
import { WaterCheckIn } from './water-check-in';
import { THEMES_ARE_SAMPLE, themeOfTheWeek } from './weekly-themes';

/** Eyes and mouth on the yellow mood faces (dark gold ink, readable in light and dark mode). */
const FACE_INK = '#3d3200';

/** "Habari ya leo?": asked the way people greet each other here. Every answer is a fine answer. */
const MOODS: { id: Mood; label: string; english: string; note: string }[] = [
  { id: 'great', label: 'Nzuri', english: 'Great', note: 'Glad to hear it.' },
  { id: 'okay', label: 'Sawa', english: 'Okay', note: 'Thanks for checking in.' },
  { id: 'low', label: 'Si poa', english: 'Low', note: 'Be gentle with yourself today. If it keeps up, a pharmacist or doctor can help.' },
];

const WEEKLY: { id: WeeklyAnswer; label: string }[] = [
  { id: 'yes', label: 'Yes' },
  { id: 'notToday', label: 'Not today' },
];

const dateLine = () =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Nairobi', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

type TodayCardProps = {
  /** "Si poa" offers a pharmacist, never products. */
  onAskPharmacist: () => void;
};

/**
 * The Wellness "Today" card: water, how you feel, moving and this week's question in one
 * place, about ten seconds a day. No streaks, no scores; check-ins stay on this phone
 * unless the signed-in customer chooses to save them to their account.
 */
export function TodayCard({ onAskPharmacist }: TodayCardProps) {
  const styles = useThemeStyles(createStyles);
  const { colors } = useTheme();
  const { today, goal } = useWellness();
  const mood = MOODS.find(entry => entry.id === today.mood);
  const theme = themeOfTheWeek();

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Txt variant="headline">Today</Txt>
        <Txt variant="bodySm" color="onSurfaceVariant">{dateLine()}</Txt>
      </View>

      <WaterCheckIn />
      <View style={styles.goalRow}>
        <Txt variant="label" color="onSurfaceVariant">Daily goal</Txt>
        <View style={styles.goalStepper}>
          <IconButton name="minus" accessibilityLabel="Lower the daily goal" onPress={() => wellness.setGoal(goal - 1)} size={32} iconSize={14} background={colors.surfaceContainerLow} />
          <Txt variant="title" accessibilityLabel={`Daily goal ${goal} glasses`}>{`${goal} glasses`}</Txt>
          <IconButton name="plus" accessibilityLabel="Raise the daily goal" onPress={() => wellness.setGoal(goal + 1)} size={32} iconSize={14} background={colors.surfaceContainerLow} />
        </View>
      </View>

      <Divider />

      <View style={styles.block}>
        <Txt variant="titleLg">Habari ya leo?</Txt>
        <Txt variant="caption" color="onSurfaceVariant">{"How's your day?"}</Txt>
        <View style={styles.moods} accessibilityRole="radiogroup">
          {MOODS.map(entry => {
            const selected = today.mood === entry.id;
            return (
              <PressableScale
                key={entry.id}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${entry.label}, ${entry.english}`}
                onPress={() => {
                  selectFeedback();
                  wellness.setMood(entry.id);
                }}
                style={[styles.mood, selected ? styles.moodOn : null]}
              >
                <MoodFace mood={entry.id} />
                <Txt variant="label" tint={selected ? colors.onPrimary : colors.onSurface}>{entry.label}</Txt>
                <Txt variant="caption" tint={selected ? colors.onPrimaryContainer : colors.onSurfaceVariant}>{entry.english}</Txt>
              </PressableScale>
            );
          })}
        </View>
        {mood ? <Txt variant="bodySm" color="onSurfaceVariant">{mood.note}</Txt> : null}
        {mood?.id === 'low' ? (
          <Button label="Ask a pharmacist" icon="whatsapp" iconPosition="leading" variant="tonal" size="sm" onPress={onAskPharmacist} style={styles.askButton} />
        ) : null}
      </View>

      <Divider />

      <PressableScale
        accessibilityRole="checkbox"
        accessibilityState={{ checked: today.moved === true }}
        accessibilityLabel="I made time to move today"
        onPress={() => {
          selectFeedback();
          wellness.toggleMoved();
        }}
        style={styles.moveRow}
      >
        <View style={[styles.checkbox, today.moved ? styles.checkboxOn : null]}>
          {today.moved ? <Icon name="check" size={16} color="onPrimary" /> : null}
        </View>
        <View style={styles.flex}>
          <Txt variant="title">I made time to move</Txt>
          <Txt variant="caption" color="onSurfaceVariant">A walk, a stretch or something you enjoy.</Txt>
        </View>
      </PressableScale>

      <Divider />

      <View style={styles.block}>
        <View style={styles.themeHead}>
          <Badge label={theme.name} tone="info" />
          {THEMES_ARE_SAMPLE ? <Badge label="Sample" tone="neutral" /> : null}
        </View>
        <Txt variant="title">{theme.question}</Txt>
        <View style={styles.answers} accessibilityRole="radiogroup">
          {WEEKLY.map(entry => {
            const selected = today.weekly === entry.id;
            return (
              <PressableScale
                key={entry.id}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${theme.question} ${entry.label}`}
                onPress={() => {
                  selectFeedback();
                  wellness.setWeekly(entry.id);
                }}
                style={[styles.answer, selected ? styles.answerOn : null]}
              >
                <Txt variant="label" tint={selected ? colors.onPrimary : colors.onSurface}>{entry.label}</Txt>
              </PressableScale>
            );
          })}
        </View>
        <View style={styles.tip}>
          <Icon name="sparkle" size={16} color="primaryAccent" />
          <Txt variant="bodySm" color="onSurfaceVariant" style={styles.flex}>{theme.tip}</Txt>
        </View>
      </View>

      <SavePlace started={today.water > 0 || Boolean(today.mood) || Boolean(today.moved) || Boolean(today.weekly)} />
    </View>
  );
}

/**
 * Where check-ins are kept (owner, 18 Nov 2026: saved to the account only with consent).
 * A signed-in customer is asked once, after their first check-in; "Keep on this phone"
 * works just as well. Saved copies can be stopped and deleted at any time.
 */
function SavePlace({ started }: { started: boolean }) {
  const styles = useThemeStyles(createStyles);
  const status = useWellnessSync();
  const [busy, setBusy] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [failed, setFailed] = useState(false);

  const run = async (action: () => Promise<boolean>) => {
    setBusy(true);
    setFailed(false);
    const ok = await action();
    setBusy(false);
    setFailed(!ok);
    if (ok) setConfirmStop(false);
  };
  const tryAgain = failed ? <Txt variant="caption" color="error">{"That didn't work. Check your connection and try again."}</Txt> : null;

  if (status === 'unasked' && started) {
    return (
      <View style={styles.ask}>
        <Txt variant="title">Save your check-ins to your account?</Txt>
        <Txt variant="bodySm" color="onSurfaceVariant">
          Then they show on any phone you sign in on. Only you can see them, not Xana staff or pharmacists, and you can stop and delete them at any time.
        </Txt>
        <View style={styles.askActions}>
          <Button label="Save to my account" size="sm" loading={busy} onPress={() => void run(wellness.saveToAccount)} />
          <Button label="Keep on this phone" size="sm" variant="ghost" disabled={busy} onPress={() => void run(wellness.keepOnPhone)} />
        </View>
        {tryAgain}
      </View>
    );
  }

  if (status === 'sync') {
    return (
      <View style={styles.footer}>
        <View style={styles.privacy}>
          <Icon name="lock" size={14} color="onSurfaceVariant" />
          <Txt variant="caption" color="onSurfaceVariant" style={styles.flex}>
            Saved to your account. Only you can see them.
          </Txt>
          {confirmStop ? null : (
            <Button label="Stop saving" size="sm" variant="ghost" onPress={() => setConfirmStop(true)} />
          )}
        </View>
        {confirmStop ? (
          <View style={styles.ask}>
            <Txt variant="bodySm" color="onSurfaceVariant">
              This deletes the check-ins saved to your account. The ones on this phone stay.
            </Txt>
            <View style={styles.askActions}>
              <Button label="Stop and delete" size="sm" variant="danger" loading={busy} onPress={() => void run(wellness.stopSaving)} />
              <Button label="Cancel" size="sm" variant="ghost" disabled={busy} onPress={() => setConfirmStop(false)} />
            </View>
          </View>
        ) : null}
        {tryAgain}
      </View>
    );
  }

  return (
    <View style={styles.footer}>
      <View style={styles.privacy}>
        <Icon name="lock" size={14} color="onSurfaceVariant" />
        <Txt variant="caption" color="onSurfaceVariant" style={styles.flex}>
          Your check-ins stay on this phone. Nobody at Xana sees them.
        </Txt>
        {status === 'phone' ? (
          <Button label="Save to account" size="sm" variant="ghost" loading={busy} onPress={() => void run(wellness.saveToAccount)} />
        ) : null}
      </View>
      {tryAgain}
    </View>
  );
}

/** A simple drawn face per mood: the mouth curves up, flat or down. */
function MoodFace({ mood }: { mood: Mood }) {
  const styles = useThemeStyles(createStyles);
  return (
    <View style={styles.face}>
      <View style={styles.eyes}>
        <View style={styles.eye} />
        <View style={styles.eye} />
      </View>
      <View style={[styles.mouth, mood === 'great' ? styles.mouthUp : mood === 'low' ? styles.mouthDown : styles.mouthFlat]} />
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  card: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.outlineSoft30,
  },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: spacing.xs },
  block: { gap: spacing.xs, paddingHorizontal: spacing.xs },

  goalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xs },
  goalStepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },

  moods: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  mood: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xxs,
    paddingVertical: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.outlineSoft30,
  },
  moodOn: { backgroundColor: colors.primaryContainer, borderColor: colors.primaryContainer },
  face: {
    width: 32,
    height: 32,
    marginBottom: spacing.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.tertiaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  eyes: { flexDirection: 'row', gap: 8 },
  // The face is the same yellow in both themes, so its features use one dark ink.
  eye: { width: 4, height: 4, borderRadius: 2, backgroundColor: FACE_INK },
  mouth: { width: 12, height: 6, borderColor: FACE_INK },
  mouthUp: { borderBottomWidth: 2, borderLeftWidth: 2, borderRightWidth: 2, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, height: 5 },
  mouthFlat: { borderTopWidth: 2, height: 2, marginTop: 2 },
  mouthDown: { borderTopWidth: 2, borderLeftWidth: 2, borderRightWidth: 2, borderTopLeftRadius: 6, borderTopRightRadius: 6, height: 5, marginTop: 2 },
  askButton: { alignSelf: 'flex-start', marginTop: spacing.xs },

  moveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xs, minHeight: 48 },
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

  themeHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  answers: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  answer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.outlineSoft30,
  },
  answerOn: { backgroundColor: colors.primaryContainer, borderColor: colors.primaryContainer },
  tip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.mintSurface,
  },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xs },
  footer: { gap: spacing.sm },
  ask: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceContainerLow },
  askActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
});
