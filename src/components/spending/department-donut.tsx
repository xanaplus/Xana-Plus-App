import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Txt } from '@/components/ui';
import { formatKes, formatKesDecimal } from '@/lib/format';
import type { SpendingBreakdown, SpendingSegment } from '@/lib/spending-breakdown';
import { radius, spacing } from '@/theme';
import { useTheme, useThemeStyles } from '@/theme/provider';
import type { Palette } from '@/theme';

type DepartmentDonutProps = {
  breakdown: SpendingBreakdown;
  onDepartmentPress?: (id: string) => void;
};

type DonutEntry = SpendingSegment & { colorKey: string; isOther?: boolean };
const NAVIGABLE_DEPARTMENTS = new Set([
  'groceries', 'deli', 'pharmacy', 'retail', 'wholesale', 'liquor', 'household', 'beauty',
]);

const LIGHT_COLORS: Record<string, string> = {
  groceries: '#176B50',
  deli: '#C46A28',
  pharmacy: '#9B4B55',
  other: '#5A7186',
};

const DARK_COLORS: Record<string, string> = {
  groceries: '#70C9A2',
  deli: '#F0AE72',
  pharmacy: '#E69BA4',
  other: '#A8C0D4',
};

const FALLBACK_LIGHT = ['#3C7890', '#9A7430', '#796A9A', '#4A806D', '#AF6655'];
const FALLBACK_DARK = ['#86C4D8', '#E1C078', '#B5A5D8', '#9BD1B7', '#E5A697'];

function colorForId(id: string, dark: boolean) {
  const named = (dark ? DARK_COLORS : LIGHT_COLORS)[id.toLowerCase()];
  if (named) return named;
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  const palette = dark ? FALLBACK_DARK : FALLBACK_LIGHT;
  return palette[hash % palette.length];
}

function buildEntries(segments: SpendingSegment[]): DonutEntry[] {
  return segments.map(segment => ({
    ...segment,
    colorKey: segment.id,
    isOther: Boolean(segment.members?.length),
  }));
}

function percent(value: number, total: number) {
  if (total <= 0) return '0%';
  const exact = (value / total) * 100;
  return `${exact > 0 && exact < 1 ? '<1' : Math.round(exact)}%`;
}

const money = (value: number) => Number.isInteger(value) ? formatKes(value) : formatKesDecimal(value);

export default function DepartmentDonut({ breakdown, onDepartmentPress }: DepartmentDonutProps) {
  const { colors, resolved } = useTheme();
  const styles = useThemeStyles(createStyles);
  const { width: windowWidth } = useWindowDimensions();
  const [otherExpanded, setOtherExpanded] = useState(false);
  const dark = resolved === 'dark';
  const total = Math.max(0, Number.isFinite(breakdown.total) ? breakdown.total : 0);
  const entries = useMemo(() => buildEntries(breakdown.segments ?? []), [breakdown.segments]);
  const chartTotal = entries.reduce((sum, segment) => sum + segment.total, 0);
  const isEmpty = total <= 0 || chartTotal <= 0 || entries.length === 0;
  const diameter = Math.min(204, Math.max(164, windowWidth - 112));
  const strokeWidth = 22;
  const inset = strokeWidth / 2 + 2;
  const radiusValue = diameter / 2 - inset;
  const circumference = 2 * Math.PI * radiusValue;
  const moneyStyle = total >= 10_000_000 ? styles.centerMoneySmall : total >= 1_000_000 ? styles.centerMoneyCompact : styles.centerMoney;

  const chartParts = useMemo(() => {
    if (isEmpty) return [];
    let elapsed = 0;
    return entries.map(entry => {
      const fraction = entry.total / chartTotal;
      const arcLength = fraction * circumference;
      const gap = entries.length === 1 ? 0 : Math.min(2.5, arcLength * 0.16);
      const visibleLength = Math.max(0, arcLength - gap);
      const part = {
        ...entry,
        dashArray: `${visibleLength} ${circumference - visibleLength}`,
        dashOffset: -elapsed,
      };
      elapsed += arcLength;
      return part;
    });
  }, [entries, chartTotal, circumference, isEmpty]);

  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <View style={styles.headingCopy}>
          <Txt variant="titleLg">Where it went</Txt>
          <Txt variant="caption" color="onSurfaceVariant">Recorded department spending</Txt>
        </View>
        {!isEmpty ? (
          <View style={styles.recordedTag}>
            <View style={styles.recordedDot} />
            <Txt variant="micro" color="onSurfaceVariant">RECORDED</Txt>
          </View>
        ) : null}
      </View>

      {isEmpty ? (
        <View style={styles.emptyState} accessibilityRole="text">
          <View style={styles.emptyRing}>
            <View style={styles.emptyRingInner}>
              <Txt variant="label" align="center">No spending{'\n'}to show</Txt>
            </View>
          </View>
          <Txt variant="bodySm" color="onSurfaceVariant" align="center" style={styles.emptyCopy}>
            Department totals will appear here when recorded spending is available.
          </Txt>
        </View>
      ) : (
        <>
          <View
            style={[styles.chartArea, { width: diameter, height: diameter }]}
            accessible
            accessibilityRole="image"
            accessibilityLabel={`Department spending donut. Total item spending ${money(total)}. ${entries.map(entry => `${entry.label}: ${money(entry.total)}, ${percent(entry.total, total)}`).join('. ')}.`}
          >
            <Svg width={diameter} height={diameter} viewBox={`0 0 ${diameter} ${diameter}`}>
              <Circle
                cx={diameter / 2}
                cy={diameter / 2}
                r={radiusValue}
                fill="none"
                stroke={colors.surfaceContainerHigh}
                strokeWidth={strokeWidth}
              />
              {chartParts.map(part => (
                <Circle
                  key={part.id}
                  cx={diameter / 2}
                  cy={diameter / 2}
                  r={radiusValue}
                  fill="none"
                  stroke={colorForId(part.colorKey, dark)}
                  strokeWidth={strokeWidth}
                  strokeDasharray={part.dashArray}
                  strokeDashoffset={part.dashOffset}
                  transform={`rotate(-90 ${diameter / 2} ${diameter / 2})`}
                  strokeLinecap={entries.length === 1 ? 'round' : 'butt'}
                />
              ))}
            </Svg>
            <View pointerEvents="none" style={styles.centerLabel}>
              <Txt variant="caption" color="onSurfaceVariant" align="center">ITEM SPENDING</Txt>
              <Txt variant="display" numberOfLines={1} adjustsFontSizeToFit style={[styles.centerMoney, moneyStyle]}>
                {money(total)}
              </Txt>
              <Txt variant="caption" color="onSurfaceVariant" align="center">across departments</Txt>
            </View>
          </View>

          <View style={styles.legend} accessibilityLabel="Department spending amounts and shares">
            {entries.map(entry => {
              const share = percent(entry.total, total);
              const hasMembers = Boolean(entry.isOther && entry.members?.length);
              const canNavigate = Boolean(onDepartmentPress && NAVIGABLE_DEPARTMENTS.has(entry.id));
              const legendContent = (
                <>
                  <View style={[styles.swatch, { backgroundColor: colorForId(entry.colorKey, dark) }]} />
                  <View style={styles.legendText}>
                    <Txt variant="label" numberOfLines={2}>{entry.label}</Txt>
                    <Txt variant="caption" color="onSurfaceVariant">{share} of item spending</Txt>
                  </View>
                  <Txt variant="label" style={styles.legendAmount}>{money(entry.total)}</Txt>
                </>
              );
              return (
                <View key={entry.id} style={styles.legendGroup}>
                  <View style={styles.legendRow}>
                    {canNavigate ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${entry.label}, ${money(entry.total)}, ${share} of item spending`}
                        accessibilityHint="Opens this department"
                        onPress={() => onDepartmentPress?.(entry.id)}
                        style={({ pressed }) => [styles.legendMain, pressed ? styles.pressed : null]}
                      >
                        {legendContent}
                      </Pressable>
                    ) : (
                      <View
                        accessible
                        accessibilityRole="text"
                        accessibilityLabel={`${entry.label}, ${money(entry.total)}, ${share} of item spending`}
                        style={styles.legendMain}
                      >
                        {legendContent}
                      </View>
                    )}
                    {hasMembers ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${otherExpanded ? 'Hide' : 'Show'} other department amounts`}
                        accessibilityState={{ expanded: otherExpanded }}
                        aria-expanded={otherExpanded}
                        onPress={() => setOtherExpanded(open => !open)}
                        hitSlop={8}
                        style={({ pressed }) => [styles.expandButton, pressed ? styles.pressed : null]}
                      >
                        <Txt variant="label" color="primaryAccent">{otherExpanded ? 'Hide' : `+${entry.members?.length}`}</Txt>
                        <Txt variant="bodySm" color="onSurfaceVariant">{otherExpanded ? '−' : '+'}</Txt>
                      </Pressable>
                    ) : null}
                  </View>

                  {hasMembers && otherExpanded ? (
                    <View style={styles.membersList}>
                      <Txt variant="caption" color="onSurfaceVariant" style={styles.membersHeading}>
                        INCLUDED DEPARTMENTS
                      </Txt>
                      {entry.members?.map(member => (
                        NAVIGABLE_DEPARTMENTS.has(member.id) && onDepartmentPress ? (
                          <Pressable
                            key={member.id}
                            accessibilityRole="button"
                            accessibilityLabel={`${member.label}, ${money(member.total)}, ${percent(member.total, total)} of item spending`}
                            onPress={() => onDepartmentPress(member.id)}
                            style={({ pressed }) => [styles.memberRow, pressed ? styles.pressed : null]}
                          >
                            <Txt variant="bodySm" numberOfLines={2} style={styles.memberName}>{member.label}</Txt>
                            <View style={styles.memberValue}>
                              <Txt variant="labelSm">{money(member.total)}</Txt>
                              <Txt variant="caption" color="onSurfaceVariant">{percent(member.total, total)}</Txt>
                            </View>
                          </Pressable>
                        ) : (
                          <View
                            key={member.id}
                            accessible
                            accessibilityRole="text"
                            accessibilityLabel={`${member.label}, ${money(member.total)}, ${percent(member.total, total)} of item spending`}
                            style={styles.memberRow}
                          >
                            <Txt variant="bodySm" numberOfLines={2} style={styles.memberName}>{member.label}</Txt>
                            <View style={styles.memberValue}>
                              <Txt variant="labelSm">{money(member.total)}</Txt>
                              <Txt variant="caption" color="onSurfaceVariant">{percent(member.total, total)}</Txt>
                            </View>
                          </View>
                        )
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
          <Txt variant="caption" color="onSurfaceVariant" style={styles.disclaimer}>
            Percentages use total item spending. Department colours stay consistent when you change periods.
          </Txt>
        </>
      )}
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  container: { gap: spacing.md },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  headingCopy: { flex: 1, gap: spacing.xxs },
  recordedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainerLow,
  },
  recordedDot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: colors.primaryAccent },
  chartArea: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  centerLabel: {
    position: 'absolute',
    width: 148,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
  },
  centerMoney: { textAlign: 'center', fontSize: 22, lineHeight: 27, letterSpacing: -0.7, maxWidth: 148 },
  centerMoneyCompact: { fontSize: 18, lineHeight: 23, letterSpacing: -0.4 },
  centerMoneySmall: { fontSize: 15, lineHeight: 20, letterSpacing: -0.2 },
  emptyState: { alignItems: 'center', paddingVertical: spacing.md, gap: spacing.md },
  emptyRing: {
    width: 128,
    height: 128,
    borderRadius: radius.pill,
    borderWidth: 16,
    borderColor: colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyRingInner: { width: 82, alignItems: 'center' },
  emptyCopy: { maxWidth: 260 },
  legend: { gap: 0 },
  legendGroup: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.outlineVariant },
  legendRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendMain: { minHeight: 60, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  swatch: { width: 11, height: 30, borderRadius: radius.pill },
  legendText: { flex: 1, gap: spacing.xxs },
  legendAmount: { textAlign: 'right', flexShrink: 0 },
  expandButton: {
    minWidth: 48,
    minHeight: 44,
    paddingHorizontal: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  membersList: {
    marginLeft: 18,
    marginBottom: spacing.md,
    paddingLeft: spacing.md,
    borderLeftWidth: 2,
    borderLeftColor: colors.outlineVariant,
  },
  membersHeading: { marginBottom: spacing.xs },
  memberRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  memberName: { flex: 1 },
  memberValue: { alignItems: 'flex-end', gap: 1 },
  disclaimer: { lineHeight: 16 },
  pressed: { opacity: 0.68 },
});
