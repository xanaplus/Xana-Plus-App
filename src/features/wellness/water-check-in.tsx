import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Icon, Txt } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { selectFeedback, successFeedback } from '@/lib/haptics';
import { radius, spacing } from '@/theme';
import { useTheme, useThemeStyles } from '@/theme/provider';
import type { Palette } from '@/theme';

import { SignUpSheet } from './sign-up-sheet';
import { useWellness, wellness, type DayCheckIn, type WeekDay } from './store';
import { WaterGlass } from './water-glass';

type WaterCheckInProps = {
  /** Home shows the short card that points to Wellness; the Wellness tab shows the full one. */
  compact?: boolean;
  onOpen?: () => void;
};

/** Waking hours the pace is spread over, in Nairobi time (7 am to 9 pm). */
const DAY_START = 7;
const DAY_HOURS = 14;
/** How long "Undo" stays after logging a glass. */
const UNDO_MS = 5000;

const nairobiTime = (ms: number) =>
  new Intl.DateTimeFormat('en-KE', { timeZone: 'Africa/Nairobi', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(ms)).toLowerCase();

/** Hours since midnight in Nairobi, with minutes as a fraction. */
const nairobiHour = (now = new Date()) => {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(now).split(':').map(Number);
  return (h % 24) + m / 60;
};

/** "1 pm", "1:30 pm": an hour of the day rounded to the half hour. */
const clockLabel = (hour: number) => {
  const halves = Math.round(hour * 2);
  const h = Math.floor(halves / 2) % 24;
  const half = halves % 2 === 1;
  const suffix = h < 12 ? 'am' : 'pm';
  const shown = h % 12 === 0 ? 12 : h % 12;
  return `${shown}${half ? ':30' : ''} ${suffix}`;
};

/**
 * The pace line, from the time of day and real counts only: how many glasses "should" be in
 * by now if the goal is spread over waking hours, and when the next one is due.
 */
function paceLine(water: number, goal: number, short = false, now = new Date()): string {
  if (water >= goal) return short ? 'Goal reached' : 'Goal reached. Nicely done.';
  const hour = nairobiHour(now);
  if (hour < DAY_START) return short ? 'Start when you wake up' : 'Start with a glass when you wake up.';
  const due = Math.ceil((goal * Math.min(DAY_HOURS, hour - DAY_START)) / DAY_HOURS);
  const behind = due - water;
  if (behind >= 2) return short ? `${behind} behind for now` : `${behind} behind for this time of day. A glass now helps.`;
  if (behind === 1) return short ? 'One behind for now' : 'One behind. Have a glass now.';
  if (short) return 'On pace';
  const next = DAY_START + (DAY_HOURS * (water + 1)) / goal;
  return next >= DAY_START + DAY_HOURS ? 'On pace. One more before bed.' : `On pace. Next glass around ${clockLabel(next)}.`;
}

/** What is still waiting in Wellness today, in plain words. */
function waitingLine(today: DayCheckIn): string | null {
  const waiting = [
    today.mood ? null : 'your mood',
    today.moved ? null : 'moving',
    today.weekly ? null : 'this week’s question',
  ].filter((item): item is string => item !== null);
  if (waiting.length === 0) return null;
  const list = waiting.length === 1 ? waiting[0] : `${waiting.slice(0, -1).join(', ')} and ${waiting[waiting.length - 1]}`;
  return `Still waiting in Wellness: ${list}`;
}

/** Logging a glass, shared by both cards: a tap, a buzz at the goal, and the sign-up offer. */
function useLogGlass() {
  const { today, goal } = useWellness();
  const [askOpen, setAskOpen] = useState(false);
  const askTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (askTimer.current) clearTimeout(askTimer.current); }, []);
  const log = () => {
    wellness.addGlass();
    if (today.water + 1 === goal) successFeedback();
    else selectFeedback();
    // Signed out: offer an account once the glass has filled (the store limits how often).
    if (!askTimer.current && wellness.takeSignUpAsk()) {
      askTimer.current = setTimeout(() => {
        askTimer.current = null;
        setAskOpen(true);
      }, 900);
    }
  };
  return { log, askOpen, closeAsk: () => setAskOpen(false) };
}

/** "Today's water": the full card on Wellness, or the short one on Home. */
export function WaterCheckIn({ compact = false, onOpen }: WaterCheckInProps) {
  return compact ? <HomeWater onOpen={onOpen} /> : <WellnessWater />;
}

/**
 * Home: the glass, today's count and a quick +, then one line naming what is still
 * waiting in Wellness (20 Nov 2026), so there is a real reason to go there.
 */
function HomeWater({ onOpen }: { onOpen?: () => void }) {
  const styles = useThemeStyles(createStyles);
  const { colors } = useTheme();
  const { today, goal } = useWellness();
  const { log, askOpen, closeAsk } = useLogGlass();
  const waiting = waitingLine(today);

  return (
    <View style={[styles.card, styles.cardCompact]}>
      <SignUpSheet visible={askOpen} onClose={closeAsk} />
      <View style={styles.homeRow}>
        <WaterGlass value={today.water} goal={goal} size={40} />
        <View style={styles.flex}>
          <Txt variant="titleLg" tint={colors.onPrimary} accessibilityLabel={`${today.water} of ${goal} glasses of water today`}>
            {`${today.water} of ${goal} glasses`}
          </Txt>
          <Txt variant="caption" tint={colors.onPrimaryContainer} numberOfLines={1}>{paceLine(today.water, goal, true)}</Txt>
        </View>
        <Button label="Log a glass" icon="plus" iconPosition="leading" size="sm" variant="secondary" onPress={log} />
      </View>

      <PressableScale
        accessibilityRole="link"
        accessibilityLabel={waiting ? `${waiting}. Open Wellness` : 'All of today’s check-ins done. Open Wellness'}
        onPress={onOpen}
        style={styles.waiting}
      >
        <Txt variant="label" tint={colors.onPrimary} style={styles.flex}>
          {waiting ?? 'All of today’s check-ins done.'}
        </Txt>
        <Icon name="chevron-right" size={16} color={colors.onPrimary} />
      </PressableScale>
    </View>
  );
}

/**
 * Wellness: one glass per glass of the goal, tapped to fill (the next empty one fills with
 * the glass's spring), the pace for the time of day, the last glass's time, this week's
 * strip and a short-lived Undo. No streaks, no red, no "missed".
 */
function WellnessWater() {
  const styles = useThemeStyles(createStyles);
  const { colors } = useTheme();
  const { today, goal, week } = useWellness();
  const { log, askOpen, closeAsk } = useLogGlass();
  const [undoShown, setUndoShown] = useState(false);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  const add = () => {
    log();
    setUndoShown(true);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndoShown(false), UNDO_MS);
  };
  const undo = () => {
    wellness.removeGlass();
    setUndoShown(false);
  };
  const extra = Math.max(0, today.water - goal);
  const showUndo = undoShown && today.water > 0;

  return (
    <View style={styles.card}>
      <SignUpSheet visible={askOpen} onClose={closeAsk} />
      <View style={styles.head}>
        <Txt variant="titleLg" tint={colors.onPrimary}>Water today</Txt>
        <Txt variant="display" tint={colors.onPrimary} accessibilityLabel={`${today.water} of ${goal} glasses logged today`}>
          {today.water}
          <Txt variant="title" tint={colors.onPrimaryContainer}>{` of ${goal}`}</Txt>
        </Txt>
      </View>

      <View style={styles.glasses}>
        {Array.from({ length: goal }, (_, index) => {
          const filled = index < today.water;
          // The next empty glass logs one; the last full one takes it back.
          const isLast = filled && index === Math.min(today.water, goal) - 1;
          return (
            <PressableScale
              key={index}
              accessibilityRole="button"
              accessibilityLabel={filled ? `Glass ${index + 1}, logged${isLast ? '. Tap to take it back' : ''}` : `Glass ${index + 1}. Tap to log a glass`}
              onPress={() => (filled ? (isLast && today.water <= goal ? undo() : undefined) : add())}
              hitSlop={4}
              style={styles.glassTap}
            >
              <WaterGlass value={filled ? 1 : 0} goal={1} size={26} />
            </PressableScale>
          );
        })}
        {extra > 0 ? <Txt variant="label" tint={colors.onPrimary} style={styles.extra}>{`+${extra}`}</Txt> : null}
      </View>

      <View style={styles.lines}>
        <Txt variant="bodySm" tint={colors.onPrimary}>
          {today.water === 0 ? 'Tap a glass each time you drink one.' : paceLine(today.water, goal)}
        </Txt>
        {today.water === 0 ? (
          <Txt variant="caption" tint={colors.onPrimaryContainer}>{paceLine(0, goal)}</Txt>
        ) : today.lastGlassAt ? (
          <Txt variant="caption" tint={colors.onPrimaryContainer}>{`Last glass at ${nairobiTime(today.lastGlassAt)}.`}</Txt>
        ) : null}
      </View>

      <View style={styles.footer}>
        <WeekStrip week={week} goal={goal} />
        {today.water >= goal ? (
          <Button label="One more" icon="plus" iconPosition="leading" size="sm" variant="secondary" onPress={add} />
        ) : null}
        {showUndo ? (
          <PressableScale accessibilityRole="button" accessibilityLabel="Undo the last glass" onPress={undo} hitSlop={10} style={styles.undo}>
            <Txt variant="label" tint={colors.onPrimary}>Undo</Txt>
          </PressableScale>
        ) : null}
      </View>
    </View>
  );
}

/** Monday to Sunday: a full dot at the goal, a half dot for some water, an empty ring for none. */
function WeekStrip({ week, goal }: { week: WeekDay[]; goal: number }) {
  const styles = useThemeStyles(createStyles);
  const { colors } = useTheme();
  const letters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const reached = week.filter(day => !day.future && day.water >= goal).length;
  return (
    <View style={styles.week} accessible accessibilityLabel={`This week: goal reached on ${reached} ${reached === 1 ? 'day' : 'days'}`}>
      {week.map((day, index) => (
        <View key={day.key} style={styles.weekDay}>
          <Txt variant="micro" tint={day.isToday ? colors.onPrimary : colors.onPrimaryContainer} style={day.isToday ? styles.weekToday : null}>
            {letters[index]}
          </Txt>
          <View
            style={[
              styles.dot,
              day.future ? styles.dotFuture : day.water >= goal ? styles.dotFull : day.water > 0 ? styles.dotPart : null,
            ]}
          />
        </View>
      ))}
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  flex: { flex: 1 },
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.card,
    backgroundColor: colors.primaryContainer,
  },
  cardCompact: { gap: spacing.sm, paddingVertical: spacing.md },
  homeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  waiting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.white15,
    minHeight: 36,
  },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md },
  glasses: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.xs, rowGap: spacing.sm },
  /** 40pt wide with hitSlop: a full touch target per glass. */
  glassTap: { width: 32, alignItems: 'center' },
  extra: { marginLeft: spacing.xs },
  lines: { gap: 2 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, minHeight: 36 },
  week: { flexDirection: 'row', gap: spacing.sm },
  weekDay: { alignItems: 'center', gap: 4 },
  weekToday: { textDecorationLine: 'underline' },
  dot: { width: 10, height: 10, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.white15 },
  dotPart: { borderColor: colors.water, backgroundColor: colors.white15 },
  dotFull: { borderColor: colors.water, backgroundColor: colors.water },
  dotFuture: { borderColor: 'transparent', backgroundColor: colors.white15, width: 4, height: 4, marginVertical: 3 },
  undo: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
});
