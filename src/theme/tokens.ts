/**
 * Design tokens extracted from the XanaPlus Figma file
 * (G4iVN6s7cWFkkl2oCXuhb8, "XanaPlusApp", Page 1 — 22 screens).
 *
 * Colour ramp is the Material-3 style palette used across every frame;
 * neutrals beyond the M3 set (mint tiers, warm promo tints) were sampled
 * from the frames directly.
 */

export const colors = {
  // ── Surfaces ────────────────────────────────────────────────────────────
  background: '#fcf9f8',
  surface: '#ffffff',
  surfaceDim: '#dcd9d9',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f6f3f2',
  surfaceContainer: '#f0eded',
  surfaceContainerHigh: '#eae7e7',
  surfaceContainerHighest: '#e5e2e1',
  inverseSurface: '#313030',
  inverseOnSurface: '#f3f0ef',

  // ── Content ─────────────────────────────────────────────────────────────
  onSurface: '#1c1b1b',
  onSurfaceVariant: '#3f4940',
  outline: '#6f7a70',
  outlineVariant: '#bec9be',

  // ── Brand green ─────────────────────────────────────────────────────────
  primary: '#004f28',
  onPrimary: '#ffffff',
  primaryContainer: '#046938',
  onPrimaryContainer: '#90e6a8',
  primaryFixed: '#9ff5b6',
  primaryFixedDim: '#83d99c',
  onPrimaryFixed: '#00210d',
  onPrimaryFixedVariant: '#00522a',
  inversePrimary: '#83d99c',
  surfaceTint: '#0c6d3b',

  // ── Secondary amber ─────────────────────────────────────────────────────
  secondary: '#8d4f00',
  onSecondary: '#ffffff',
  secondaryContainer: '#fd9926',
  onSecondaryContainer: '#663800',
  secondaryFixed: '#ffdcc0',
  secondaryFixedDim: '#ffb875',
  onSecondaryFixed: '#2d1600',
  secondarySoft: '#ffdcc0',

  // ── Tertiary gold ───────────────────────────────────────────────────────
  tertiary: '#6f5d00',
  onTertiary: '#ffffff',
  tertiaryContainer: '#c7a902',
  onTertiaryContainer: '#4b3e00',
  tertiaryFixed: '#ffe164',
  tertiaryFixedDim: '#e5c52d',

  // ── Status ──────────────────────────────────────────────────────────────
  error: '#ba1a1a',
  onError: '#ffffff',
  errorContainer: '#ffdad6',
  onErrorContainer: '#93000a',
  success: '#059669',
  successStrong: '#047857',
  successContainer: '#d1fae5',
  onSuccessContainer: '#065f46',
  warning: '#f59e0b',
  warningStrong: '#d97706',
  warningDeep: '#b45309',

  // ── App-specific tints ──────────────────────────────────────────────────
  mintSurface: '#eaf4ee',
  mintSubtle: '#ecfdf5',
  mintPale: '#e8f5e9',
  mintEdge: '#a7f3d0',
  warmSurface: '#ede8e6',
  scrim: 'rgba(28, 27, 27, 0.48)',
  transparent: 'transparent',
  white95: 'rgba(255, 255, 255, 0.95)',
  white70: 'rgba(255, 255, 255, 0.7)',
  black05: 'rgba(0, 0, 0, 0.05)',
  amberTint15: 'rgba(253, 153, 38, 0.15)',
  outlineSoft30: 'rgba(190, 201, 190, 0.3)',
} as const;

export type ColorToken = keyof typeof colors;

/** Linear gradients as ordered stop lists (expo-linear-gradient order). */
export const gradients = {
  /** Home promotional hero — warm cream wash. */
  promoHero: ['#fff8f0', '#fef3e2', '#fde8ce'] as const,
  /** Flash-drop / discount badges. */
  flash: ['#f69320', '#f9d841'] as const,
  /** Xana Club rewards card. */
  club: ['#004f28', '#046938'] as const,
  /** M-Pesa / checkout confirmation panels. */
  mpesa: ['#eaf4ee', '#d1fae5'] as const,
  /** Pharmacy hero. */
  pharmacy: ['#046938', '#0c6d3b'] as const,
} as const;

/** 4pt spacing scale, matching the frames' padding / gap values. */
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 28,
  huge: 32,
  giant: 40,
  colossal: 48,
} as const;

/** Corner radii observed in the file: 4, 6, 8, 12, 16, 18, 24, 32, 9999. */
export const radius = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  card: 18,
  xxl: 24,
  xxxl: 32,
  sheetTop: 28,
  pill: 9999,
} as const;

/** Elevation presets — offsets/blur/colour taken from the frames' effects. */
export const elevation = {
  none: {},
  hairline: {
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  raised: {
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  floating: {
    shadowColor: '#004f28',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  stickyTop: {
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -2 },
    elevation: 3,
  },
  sheet: {
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
} as const;

/** Structural constants shared by every screen. */
export const layout = {
  /** Frames are 390pt wide with a 20pt side margin. */
  screenMargin: 20,
  /** Grid gutter between category tiles / product cards. */
  gutter: 12,
  /** Fixed top app bar. */
  headerHeight: 64,
  /** Bottom navigation bar (nav links are 64pt tall). */
  tabBarHeight: 64,
  /** Centre "Pharmacy" FAB protrudes above the bar. */
  tabBarFab: 48,
  /** Minimum tap target. */
  touchTarget: 44,
  /** Standard product-rail card width (carousel peek ~30%). */
  productCardWidth: 168,
  /** Category tile. */
  categoryTileSize: 76,
  /** Content is capped on tablets/web so screens keep phone proportions. */
  maxContentWidth: 480,
} as const;

/** Timing used by the few animations in the app. */
export const motion = {
  fast: 140,
  base: 220,
  slow: 320,
} as const;

export const theme = { colors, gradients, spacing, radius, elevation, layout, motion };
export type Theme = typeof theme;
