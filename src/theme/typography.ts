import { StyleSheet, type TextStyle } from 'react-native';

/**
 * Inter is the design's type family. Frames also contain a handful of
 * Liberation Sans / Plus Jakarta Sans / FreeSans nodes — generation noise,
 * not intent — so every role resolves to Inter here.
 */
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export type TypeToken =
  | 'display'
  | 'headlineLg'
  | 'headline'
  | 'headlineSm'
  | 'titleLg'
  | 'title'
  | 'titleSm'
  | 'bodyLg'
  | 'body'
  | 'bodySm'
  | 'label'
  | 'labelSm'
  | 'caption'
  | 'micro'
  | 'overline'
  | 'priceLg'
  | 'priceStrike'
  | 'button'
  | 'buttonSm'
  | 'tab';

export const type: Record<TypeToken, TextStyle> = {
  /** 24/700 — screen-driving numbers, hero prices. */
  display: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 30, letterSpacing: -0.6 },
  /** 20/700 — page titles inside content. */
  headlineLg: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 26, letterSpacing: -0.5 },
  /** 18/700 — app bar titles ("Home", "Cart"). */
  headline: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24, letterSpacing: -0.18 },
  /** 18/600 — sheet titles. */
  headlineSm: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24, letterSpacing: -0.18 },
  /** 16/700 — card and product names. */
  titleLg: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 22, letterSpacing: -0.16 },
  /** 15/600 — list rows, section sub-labels. */
  title: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20 },
  /** 14/700 — compact product titles. */
  titleSm: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 19, letterSpacing: -0.14 },
  /** 15/400 — long-form body copy. */
  bodyLg: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  /** 14/400 — default body. */
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  /** 13/400 — dense body / secondary rows. */
  bodySm: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  /** 12/600 — chips, badges, nav labels. */
  label: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16 },
  /** 11/600 — meta rows, timestamps. */
  labelSm: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 15 },
  /** 11/400 — helper text. */
  caption: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 15 },
  /** 10/700 — badge micro-copy. */
  micro: { fontFamily: fonts.bold, fontSize: 10, lineHeight: 13, letterSpacing: 0.25 },
  /** 11/700 uppercase — eyebrow labels. */
  overline: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 15, letterSpacing: 0.55, textTransform: 'uppercase' },
  /** 20/700 — primary price. */
  priceLg: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 26, letterSpacing: -0.4 },
  /** 13/400 — struck-through comparison price. */
  priceStrike: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  /** 15/700 — filled button labels. */
  button: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20 },
  /** 13/700 — compact button labels. */
  buttonSm: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18 },
  /** 11/600 — bottom navigation labels. */
  tab: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14 },
};

export const textPresets = StyleSheet.create({
  reset: { color: '#1c1b1b' },
});
