import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { markPhotoShown, photoShown } from '@/components/ui/product-photo';
import { PulseBox } from '@/components/ui/skeleton';
import { Txt } from '@/components/ui/text';
import { figmaAsset } from '@/data/images';
import { selectFeedback } from '@/lib/haptics';
import type { CategoryVertical } from '@/data/types';
import { elevation, radius, spacing, type as typeScale } from '@/theme';
import { useTheme } from '@/theme/provider';

/** A product photo that pulses in the department's wash until it has downloaded, never a blank white square. */
function PlatePhoto({ photo, wash }: { photo: string; wash: string }) {
  // A photo seen before this session shows at once when you switch back to its department.
  const [seen] = useState(() => photoShown(photo));
  const [loaded, setLoaded] = useState(seen);
  return (
    <View style={styles.fill}>
      {loaded ? null : <PulseFill color={wash} />}
      <Image
        source={figmaAsset(photo)}
        style={styles.plateImage}
        contentFit="contain"
        cachePolicy="memory-disk"
        transition={seen ? 0 : 160}
        onLoad={() => {
          markPhotoShown(photo);
          setLoaded(true);
        }}
      />
    </View>
  );
}

function PulseFill({ color }: { color: string }) {
  return <PulseBox color={color} style={styles.pulseFill} />;
}

/**
 * Each Shop department has its own colour and line (Roystone, 20 Nov 2026:
 * "make it unique"), inside the Home family: a solid panel like Home's Shop now card,
 * real product photos on white plates, never staged artwork.
 */
type DepartmentLook = {
  /** Panel colour and the text on it. */
  panel: string;
  ink: string;
  /** Secondary text on the panel, tinted from the panel's hue (≥ 4.5:1). */
  inkSoft: string;
  /** Pale tint behind the aisle tiles' photo plates. */
  wash: string;
  line: string;
};

type Looks = Record<CategoryVertical, DepartmentLook>;

const LINES: Record<CategoryVertical, { line: string }> = {
  retail: { line: 'Fresh food, pantry and home, one piece at a time.' },
  wholesale: { line: 'Buy more, pay less each. Quantity prices from the till.' },
  deli: { line: 'From our own kitchen and the chilled counter.' },
  pharmacy: { line: 'Medicines and care, checked by our pharmacists.' },
  groceries: { line: 'Fresh food and pantry staples for the week.' },
  household: { line: 'Cleaning, laundry and everything for the home.' },
  liquor: { line: '' },
  beauty: { line: 'Lotions, hair care and fragrance.' },
};

const light: Looks = {
  retail: { panel: '#046938', ink: '#ffffff', inkSoft: '#c9efd5', wash: '#e3f1e7', ...LINES.retail },
  wholesale: { panel: '#ffd84d', ink: '#2e2400', inkSoft: '#5c4a00', wash: '#fff4cc', ...LINES.wholesale },
  deli: { panel: '#6b3a1f', ink: '#ffffff', inkSoft: '#f1d6c4', wash: '#f6ebe3', ...LINES.deli },
  pharmacy: { panel: '#0f5e57', ink: '#ffffff', inkSoft: '#c6ebe6', wash: '#e2f2ef', ...LINES.pharmacy },
  groceries: { panel: '#b23a12', ink: '#ffffff', inkSoft: '#ffd9c9', wash: '#fbe9e1', ...LINES.groceries },
  household: { panel: '#1d5f8a', ink: '#ffffff', inkSoft: '#cfe5f5', wash: '#e3eff8', ...LINES.household },
  liquor: { panel: '#3f3f3f', ink: '#ffffff', inkSoft: '#dddddd', wash: '#efefef', ...LINES.liquor },
  beauty: { panel: '#8a2b5a', ink: '#ffffff', inkSoft: '#f6d2e3', wash: '#f8e8f0', ...LINES.beauty },
};

/** Dark mode keeps each colour, deeper, with dark tinted washes instead of pale ones. */
const dark: Looks = {
  retail: { ...light.retail, panel: '#17643a', wash: '#16231b' },
  wholesale: { ...light.wholesale, panel: '#e3c23a', ink: '#241c00', inkSoft: '#4a3c00', wash: '#2a2512' },
  deli: { ...light.deli, panel: '#5c321b', wash: '#2a1f18' },
  pharmacy: { ...light.pharmacy, panel: '#0d4f49', wash: '#13241f' },
  groceries: { ...light.groceries, panel: '#94300f', wash: '#2b1a14' },
  household: { ...light.household, panel: '#1b4f73', wash: '#15212b' },
  liquor: light.liquor,
  beauty: { ...light.beauty, panel: '#6f2348', wash: '#2a1820' },
};

export function useDepartmentLook(vertical: CategoryVertical): DepartmentLook {
  const { resolved } = useTheme();
  return (resolved === 'dark' ? dark : light)[vertical];
}

export type DepartmentOption = { value: CategoryVertical; label: string; icon?: IconName };

/** How the pills move: the chosen colour glides between them and settles without a bounce. */
const PILL_GLIDE = { damping: 26, stiffness: 300, mass: 0.8 };
const PILL_FADE = { duration: 220, easing: Easing.out(Easing.cubic) };

type PillSpot = { x: number; width: number };

/** A pill's words, fading between the resting ink and the chosen ink as the colour arrives. */
function PillLabel({ label, icon, selected, rest, active }: { label: string; icon?: IconName; selected: boolean; rest: string; active: string }) {
  const reduce = useReducedMotion();
  const progress = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    progress.value = reduce ? (selected ? 1 : 0) : withTiming(selected ? 1 : 0, PILL_FADE);
  }, [selected, reduce, progress]);
  const ink = useAnimatedStyle(() => ({ color: interpolateColor(progress.value, [0, 1], [rest, active]) }));
  return (
    <>
      {icon ? <Icon name={icon} size={14} color={selected ? active : rest} /> : null}
      <Animated.Text style={[typeScale.label, ink]}>{label}</Animated.Text>
    </>
  );
}

/**
 * The Shop's department pills (Roystone, 20 Nov 2026): Pharmacy on its own, then a gap, then
 * Retail, Wholesale and Deli in one capsule you toggle within.
 * The chosen pill takes its department's colour, matching the panel below. Inside the capsule
 * one coloured thumb glides from pill to pill (20 Nov 2026: "the pills have no animation");
 * Pharmacy's own pill fades its colour in and out.
 */
export function DepartmentSwitcher({
  grouped,
  separate,
  value,
  onChange,
  style,
}: {
  grouped: DepartmentOption[];
  separate: DepartmentOption[];
  value: CategoryVertical;
  onChange: (value: CategoryVertical) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, resolved } = useTheme();
  const looks = resolved === 'dark' ? dark : light;
  const reduce = useReducedMotion();

  // The pill lights up on the tap itself; the Shop's heavier re-render follows a frame later.
  const [active, setActive] = useState(value);
  useEffect(() => setActive(value), [value]);

  const [spots, setSpots] = useState<Partial<Record<CategoryVertical, PillSpot>>>({});
  const thumbX = useSharedValue(0);
  const thumbW = useSharedValue(0);
  const thumbOn = useSharedValue(0);
  const thumbColor = useSharedValue<string>(looks[active].panel);
  const placed = useRef(false);

  useEffect(() => {
    const spot = spots[active];
    const inCapsule = grouped.some(option => option.value === active);
    if (inCapsule && spot) {
      // First placement (or coming back from Pharmacy) jumps under the pill; moves within the capsule glide.
      const jump = !placed.current || reduce || thumbOn.value < 0.5;
      thumbX.value = jump ? spot.x : withSpring(spot.x, PILL_GLIDE);
      thumbW.value = jump ? spot.width : withSpring(spot.width, PILL_GLIDE);
      thumbColor.value = jump ? looks[active].panel : withTiming(looks[active].panel, PILL_FADE);
      placed.current = true;
    }
    thumbOn.value = reduce ? (inCapsule ? 1 : 0) : withTiming(inCapsule ? 1 : 0, PILL_FADE);
  }, [active, spots, grouped, looks, reduce, thumbX, thumbW, thumbOn, thumbColor]);

  const thumb = useAnimatedStyle(() => ({
    opacity: thumbOn.value,
    width: thumbW.value,
    backgroundColor: thumbColor.value,
    transform: [{ translateX: thumbX.value }, { scale: 0.94 + thumbOn.value * 0.06 }],
  }));

  const choose = (next: CategoryVertical) => {
    if (next === active) return;
    selectFeedback();
    setActive(next);
    requestAnimationFrame(() => onChange(next));
  };

  return (
    // Fits one line on a phone, so nothing hides off-screen (no sideways scroll, 20 Nov 2026).
    <View style={[styles.switcher, style]}>
      {separate.map(option => (
        <SeparatePill key={option.value} option={option} selected={option.value === active} look={looks[option.value]} onPress={() => choose(option.value)} />
      ))}
      <View style={[styles.capsule, { backgroundColor: colors.surfaceContainerLow }]}>
        <Animated.View pointerEvents="none" style={[styles.thumb, styles.pillSelected, thumb]} />
        {grouped.map(option => {
          const selected = option.value === active;
          return (
            <PressableScale
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
              onPress={() => choose(option.value)}
              onLayout={event => {
                const { x, width } = event.nativeEvent.layout;
                setSpots(current => (current[option.value]?.x === x && current[option.value]?.width === width ? current : { ...current, [option.value]: { x, width } }));
              }}
              style={[styles.pill, styles.capsulePill]}
            >
              <PillLabel label={option.label} icon={option.icon} selected={selected} rest={colors.onSurfaceVariant} active={looks[option.value].ink} />
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

/** Pharmacy's stand-alone pill: its colour fades in when chosen and out when you move to the capsule. */
function SeparatePill({ option, selected, look, onPress }: { option: DepartmentOption; selected: boolean; look: DepartmentLook; onPress: () => void }) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const progress = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    progress.value = reduce ? (selected ? 1 : 0) : withTiming(selected ? 1 : 0, PILL_FADE);
  }, [selected, reduce, progress]);
  const fill = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(progress.value, [0, 1], [colors.surfaceContainerLow, look.panel]) }));
  return (
    <PressableScale accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={option.label} onPress={onPress}>
      <Animated.View style={[styles.pill, selected ? styles.pillSelected : null, fill]}>
        <PillLabel label={option.label} icon={option.icon} selected={selected} rest={colors.onSurfaceVariant} active={look.ink} />
      </Animated.View>
    </PressableScale>
  );
}

/**
 * The department's opening panel: name, its line, "Browse all", and three real
 * product photos from its own rows fanned on white plates.
 */
export function DepartmentPanel({
  vertical,
  title,
  photos,
  loading,
  onBrowseAll,
}: {
  vertical: CategoryVertical;
  title: string;
  photos: string[];
  /** Shelves still loading: three pulsing plates hold the fan's place. */
  loading?: boolean;
  onBrowseAll: () => void;
}) {
  const look = useDepartmentLook(vertical);
  const plates: (string | null)[] = loading && !photos.length ? [null, null, null] : photos.slice(0, 3);
  // The panel's colour follows the pill above it instead of snapping.
  const reduce = useReducedMotion();
  const panelColor = useSharedValue(look.panel);
  useEffect(() => {
    panelColor.value = reduce ? look.panel : withTiming(look.panel, PILL_FADE);
  }, [look.panel, reduce, panelColor]);
  const panelFill = useAnimatedStyle(() => ({ backgroundColor: panelColor.value }));

  return (
    <Animated.View style={[styles.panel, panelFill]}>
      <View style={styles.copy}>
        <Txt variant="display" tint={look.ink} numberOfLines={1}>
          {title}
        </Txt>
        <Txt variant="body" tint={look.inkSoft}>
          {look.line}
        </Txt>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`Browse all ${title} products`}
          onPress={onBrowseAll}
          hitSlop={8}
          style={[styles.browse, { backgroundColor: look.ink }]}
        >
          <Txt variant="label" tint={look.panel}>
            Browse all
          </Txt>
          <Icon name="arrow-right" size={14} color={look.panel} />
        </PressableScale>
      </View>

      {plates.length ? (
        <View style={styles.fan} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {plates.map((photo, index) => (
            <View key={`${photo ?? 'loading'}-${index}`} style={[styles.plate, PLATE_SPOTS[plates.length - 1][index]]}>
              {photo ? <PlatePhoto photo={photo} wash={look.wash} /> : <PulseFill color={look.wash} />}
            </View>
          ))}
        </View>
      ) : null}
    </Animated.View>
  );
}

/** One aisle shortcut: a real photo from the row on a white plate over the department's wash. */
export function AisleTile({
  vertical,
  name,
  photo,
  mark,
  loading,
  size,
  onPress,
}: {
  vertical: CategoryVertical;
  name: string;
  /** Shelves still loading: a pulsing plate instead of a letter. */
  loading?: boolean;
  photo?: string;
  /** Shown instead of a photo: "Rx" on prescription aisles (their photos stay hidden), else the first letter. */
  mark?: string;
  size: number;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const look = useDepartmentLook(vertical);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { width: size }, pressed ? styles.pressed : null]}
    >
      <View style={[styles.tileFrame, { width: size, height: size, backgroundColor: look.wash }]}>
        {photo ? (
          <View style={styles.tilePlate}>
            <PlatePhoto photo={photo} wash={look.wash} />
          </View>
        ) : loading ? (
          <View style={styles.tilePlate}>
            <PulseFill color={look.wash} />
          </View>
        ) : (
          <Txt variant="display" tint={look.ink === '#ffffff' ? look.panel : look.inkSoft} style={{ fontSize: Math.round(size * 0.3), lineHeight: Math.round(size * 0.36) }}>
            {mark ?? name.charAt(0)}
          </Txt>
        )}
      </View>
      <Txt variant="label" align="center" numberOfLines={3} tint={colors.onSurface}>
        {name}
      </Txt>
    </Pressable>
  );
}

/** "More aisles": opens the rest of a long department's aisles in place. */
export function MoreAislesTile({ vertical, count, size, onPress }: { vertical: CategoryVertical; count: number; size: number; onPress: () => void }) {
  const { colors } = useTheme();
  const look = useDepartmentLook(vertical);
  const accent = look.ink === '#ffffff' ? look.panel : look.inkSoft;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Show ${count} more aisles`}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { width: size }, pressed ? styles.pressed : null]}
    >
      <View style={[styles.tileFrame, { width: size, height: size, backgroundColor: look.wash }]}>
        <Txt variant="display" tint={accent}>{`+${count}`}</Txt>
      </View>
      <Txt variant="label" align="center" numberOfLines={2} tint={colors.onSurface}>
        More aisles
      </Txt>
    </Pressable>
  );
}

/** Where the plates sit for one, two or three photos: a loose fan, the middle one largest. */
const PLATE_SPOTS = [
  [{ width: 84, height: 84, top: 22, right: 8 }],
  [
    { width: 64, height: 64, top: 8, right: 44, transform: [{ rotate: '-6deg' }] },
    { width: 72, height: 72, top: 46, right: 4, transform: [{ rotate: '5deg' }] },
  ],
  [
    { width: 58, height: 58, top: 6, right: 62, transform: [{ rotate: '-8deg' }] },
    { width: 72, height: 72, top: 30, right: 6, transform: [{ rotate: '6deg' }] },
    { width: 54, height: 54, top: 78, right: 70, transform: [{ rotate: '4deg' }] },
  ],
] as const;

const styles = StyleSheet.create({
  switcher: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  capsule: { flexDirection: 'row', alignItems: 'center', padding: 3, borderRadius: radius.pill, gap: 2 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, height: 36, borderRadius: radius.pill },
  capsulePill: { height: 32, paddingHorizontal: spacing.md },
  pillSelected: { ...elevation.hairline },
  thumb: { position: 'absolute', left: 0, top: 3, bottom: 3, borderRadius: radius.pill },
  panel: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    minHeight: 148,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  copy: { flex: 1, gap: spacing.sm, paddingRight: 128, justifyContent: 'center' },
  browse: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    minHeight: 36,
    borderRadius: radius.pill,
  },
  fan: { position: 'absolute', top: spacing.md, right: spacing.md, bottom: spacing.md, width: 140 },
  plate: {
    position: 'absolute',
    backgroundColor: '#ffffff',
    borderRadius: radius.lg,
    padding: 6,
    ...elevation.card,
  },
  plateImage: { width: '100%', height: '100%' },
  fill: { flex: 1, alignSelf: 'stretch' },
  pulseFill: { borderRadius: radius.md },
  tile: { gap: spacing.sm, alignItems: 'center' },
  pressed: { opacity: 0.9 },
  tileFrame: { borderRadius: radius.lg, padding: 5, alignItems: 'center', justifyContent: 'center' },
  tilePlate: { flex: 1, alignSelf: 'stretch', backgroundColor: '#ffffff', borderRadius: radius.md, padding: spacing.xs },
});
