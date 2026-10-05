import { useEffect, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, elevation, layout, radius, spacing } from '@/theme';

import { Icon } from './icon';
import { Txt } from './text';

export type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Optional supporting line under the title. */
  description?: string;
  children: ReactNode;
  /** Sticky footer (primary action). */
  footer?: ReactNode;
  /** Allows the body to scroll when content exceeds 70% of the viewport. */
  scrollable?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Bottom sheet with scrim, drag handle and rounded top corners — used by the
 * cart substitution preference and the checkout login prompt.
 */
/** Far enough below the screen that any sheet starts fully hidden. */
const OFFSCREEN = 900;
const OPEN_SPRING = { damping: 26, stiffness: 260, mass: 0.9 };
const CLOSE_TIMING = { duration: 200, easing: Easing.in(Easing.cubic) };

export function BottomSheet({ visible, onClose, title, description, children, footer, scrollable, style }: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  // The backdrop fades while the sheet springs up; closing plays in reverse
  // before the modal unmounts, so the sheet never just vanishes.
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);
  const progress = useSharedValue(0);
  const offset = useSharedValue(OFFSCREEN);

  useEffect(() => {
    if (!mounted) return;
    if (visible) {
      progress.value = withTiming(1, { duration: 220 });
      offset.value = withSpring(0, OPEN_SPRING);
    } else {
      progress.value = withTiming(0, CLOSE_TIMING);
      offset.value = withTiming(OFFSCREEN, CLOSE_TIMING, finished => {
        if (finished) runOnJS(setMounted)(false);
      });
    }
  }, [visible, mounted, progress, offset]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {/* A sheet with a text field (name, notes) rises above the keyboard instead of hiding behind it.
          Modals don't get the window's own keyboard resizing, so this is needed on Android too. */}
      <KeyboardAvoidingView behavior={Platform.OS === 'web' ? undefined : 'padding'} style={styles.root}>
        <Animated.View style={[styles.scrim, scrimStyle]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close sheet" onPress={onClose} style={styles.fill} />
        </Animated.View>
        <Animated.View style={[styles.sheet, elevation.sheet, { paddingBottom: insets.bottom + spacing.lg }, style, sheetStyle]}>
          <View style={styles.handle} />
          {title ? (
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Txt variant="headlineSm">{title}</Txt>
                {description ? (
                  <Txt variant="bodySm" color="onSurfaceVariant">
                    {description}
                  </Txt>
                ) : null}
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={8}>
                <Icon name="close" size={20} color="onSurfaceVariant" />
              </Pressable>
            </View>
          ) : null}
          {scrollable ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
              {children}
            </ScrollView>
          ) : (
            <View style={styles.body}>{children}</View>
          )}
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim },
  fill: { flex: 1 },
  sheet: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheetTop,
    borderTopRightRadius: radius.sheetTop,
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.md,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceContainerHighest, marginBottom: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.lg, marginBottom: spacing.lg },
  headerText: { flex: 1, gap: spacing.xs },
  body: { gap: spacing.lg },
  footer: { paddingTop: spacing.lg },
});
