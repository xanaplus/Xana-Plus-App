import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, elevation, layout, spacing } from '@/theme';

export type ScreenProps = {
  children: ReactNode;
  /** Vertical scroll (default) — pass `false` for screens with their own lists. */
  scroll?: boolean;
  /** Applies the 20pt frame side margin. */
  padded?: boolean;
  backgroundColor?: string;
  contentStyle?: StyleProp<ViewStyle>;
  /** Pinned action bar under the scroll area (cart and checkout CTAs). */
  footer?: ReactNode;
  /**
   * The screen draws under the status bar and clears it itself (full-bleed
   * hero or dark camera screens). Otherwise the shell keeps a solid strip
   * behind the status bar so scrolling content never runs under the clock.
   */
  edgeToEdgeTop?: boolean;
  /** Colour of that status-bar strip; white by default to match the app bar. */
  topInsetColor?: string;
  /** Trailing spacer for screens with a floating element at the bottom. */
  bottomSpace?: number;
  testID?: string;
};

/**
 * Page shell: honours the safe area, centres content at phone width on wide
 * viewports and optionally pins a footer action bar under the scroll area.
 */
export function Screen({
  children,
  scroll = true,
  padded = true,
  backgroundColor = colors.background,
  contentStyle,
  footer,
  edgeToEdgeTop = false,
  topInsetColor = colors.surface,
  bottomSpace,
  testID,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const content = [
    {
      paddingHorizontal: padded ? layout.screenMargin : 0,
      paddingBottom: footer ? spacing.xl : spacing.xl + insets.bottom,
      paddingTop: spacing.xs,
    },
    bottomSpace ? { paddingBottom: bottomSpace } : null,
    contentStyle,
  ];

  return (
    <View testID={testID} style={[styles.root, { backgroundColor }]}>
      {edgeToEdgeTop ? null : <View style={{ height: insets.top, alignSelf: 'stretch', backgroundColor: topInsetColor }} />}
      <View style={styles.column}>
        {scroll ? (
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={content}>
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.flex, content]}>{children}</View>
        )}
        {footer ? <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>{footer}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: layout.maxContentWidth },
  flex: { flex: 1 },
  footer: {
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.surfaceContainerHigh,
    ...elevation.stickyTop,
  },
});
