import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Chip, Icon, Txt } from '@/components/ui';
import { radius, spacing } from '@/theme';
import { useTheme } from '@/theme/provider';

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
/** The usual quote lengths, one tap each. */
const QUICK = [
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
  { label: '3 months', days: 90 },
];

const pad = (value: number) => String(value).padStart(2, '0');
/** "YYYY-MM-DD" in local time, the form the quote is saved in. */
export const isoDay = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const fromIso = (day: string) => new Date(`${day}T12:00:00`);
const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};
export const daysFromToday = (days: number) => isoDay(new Date(startOfToday().getTime() + days * DAY_MS + 12 * 60 * 60 * 1000));
/** "Sat 26 Dec 2026". */
const longDay = (day: string) =>
  fromIso(day).toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/**
 * The quote's expiry: quick lengths (1 week to 3 months) or a month calendar.
 * Only tomorrow to a year ahead can be chosen, the range the database accepts.
 * Plain views, so it ships in a quick update with no new build.
 */
export function ExpiryPicker({ value, onChange, disabled }: { value: string; onChange: (day: string) => void; disabled?: boolean }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(() => {
    const base = value ? fromIso(value) : new Date();
    return { year: base.getFullYear(), month: base.getMonth() };
  });

  const first = daysFromToday(1);
  const last = daysFromToday(365);
  const lead = (new Date(shown.year, shown.month, 1).getDay() + 6) % 7;
  const length = new Date(shown.year, shown.month + 1, 0).getDate();
  const cells = [...Array<null>(lead).fill(null), ...Array.from({ length }, (_, index) => index + 1)];
  const monthKey = `${shown.year}-${pad(shown.month + 1)}`;
  const canBack = monthKey > first.slice(0, 7);
  const canForward = monthKey < last.slice(0, 7);
  const move = (step: number) => {
    const next = new Date(shown.year, shown.month + step, 1);
    setShown({ year: next.getFullYear(), month: next.getMonth() });
  };
  const pick = (day: string) => {
    onChange(day);
    setOpen(false);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.quick}>
        {QUICK.map(option => {
          const day = daysFromToday(option.days);
          return <Chip key={option.label} label={option.label} selected={value === day} onPress={disabled ? undefined : () => pick(day)} />;
        })}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={value ? `Quote expires ${longDay(value)}. Change date` : 'Choose the quote expiry date'}
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        onPress={() => setOpen(current => !current)}
        style={[styles.field, { borderColor: colors.outlineVariant, backgroundColor: colors.surface }]}
      >
        <Icon name="calendar" size={18} color="onSurfaceVariant" />
        <Txt variant="body" color={value ? 'onSurface' : 'outline'} style={styles.fieldText}>
          {value ? longDay(value) : 'Choose a date'}
        </Txt>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color="onSurfaceVariant" />
      </Pressable>

      {open ? (
        <View style={[styles.calendar, { borderColor: colors.outlineVariant, backgroundColor: colors.surface }]}>
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel="Previous month" disabled={!canBack} onPress={() => move(-1)} hitSlop={8} style={!canBack && styles.off}>
              <Icon name="chevron-left" size={20} color="onSurface" />
            </Pressable>
            <Txt variant="title">{`${MONTHS[shown.month]} ${shown.year}`}</Txt>
            <Pressable accessibilityRole="button" accessibilityLabel="Next month" disabled={!canForward} onPress={() => move(1)} hitSlop={8} style={!canForward && styles.off}>
              <Icon name="chevron-right" size={20} color="onSurface" />
            </Pressable>
          </View>
          <View style={styles.grid}>
            {WEEKDAYS.map(name => (
              <View key={name} style={styles.cell}>
                <Txt variant="labelSm" color="outline">{name}</Txt>
              </View>
            ))}
            {cells.map((date, index) => {
              if (date === null) return <View key={`blank-${index}`} style={styles.cell} />;
              const day = `${monthKey}-${pad(date)}`;
              const allowed = day >= first && day <= last;
              const chosen = day === value;
              return (
                <Pressable
                  key={day}
                  accessibilityRole="button"
                  accessibilityLabel={longDay(day)}
                  accessibilityState={{ selected: chosen, disabled: !allowed }}
                  disabled={!allowed}
                  onPress={() => pick(day)}
                  style={styles.cell}
                >
                  <View style={[styles.dayDot, chosen && { backgroundColor: colors.primary }]}>
                    <Txt variant="body" color={chosen ? 'onPrimary' : allowed ? 'onSurface' : 'outlineVariant'}>{date}</Txt>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  fieldText: { flex: 1 },
  calendar: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.sm, gap: spacing.xs },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xs, paddingBottom: spacing.xs },
  off: { opacity: 0.3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayDot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
