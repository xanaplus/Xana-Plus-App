import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Ionicons from '@expo/vector-icons/Ionicons';

import { colors, type ColorToken } from '@/theme';

/**
 * Semantic icon names. Screens reference meaning ("cart", "mpesa"), never a
 * glyph or icon-set name, so glyph swaps stay local to this map.
 */
const glyphs = {
  home: ['ion', 'home'],
  categories: ['mci', 'view-grid-outline'],
  pharmacy: ['mci', 'medical-bag'],
  profile: ['ion', 'person-outline'],
  cart: ['ion', 'cart-outline'],

  search: ['ion', 'search'],
  mic: ['ion', 'mic-outline'],
  sliders: ['ion', 'options-outline'],
  scan: ['ion', 'barcode-outline'],
  filter: ['ion', 'filter-outline'],
  sort: ['ion', 'swap-vertical-outline'],
  list: ['ion', 'list-outline'],

  'chevron-right': ['ion', 'chevron-forward'],
  'chevron-left': ['ion', 'chevron-back'],
  'chevron-up': ['ion', 'chevron-up'],
  'chevron-down': ['ion', 'chevron-down'],
  'arrow-right': ['ion', 'arrow-forward'],
  'arrow-left': ['ion', 'arrow-back'],
  close: ['ion', 'close'],
  plus: ['ion', 'add'],
  minus: ['ion', 'remove'],
  check: ['ion', 'checkmark'],
  'check-circle': ['ion', 'checkmark-circle'],
  trash: ['ion', 'trash-outline'],
  edit: ['ion', 'create-outline'],
  share: ['ion', 'share-social-outline'],
  more: ['ion', 'ellipsis-horizontal'],
  refresh: ['ion', 'refresh'],

  'map-pin': ['ion', 'location-outline'],
  'map-pin-filled': ['ion', 'location'],
  bell: ['ion', 'notifications-outline'],
  clock: ['ion', 'time-outline'],
  calendar: ['ion', 'calendar-outline'],
  delivery: ['mci', 'truck-fast-outline'],
  pickup: ['mci', 'storefront-outline'],
  store: ['mci', 'store-outline'],
  shield: ['ion', 'shield-checkmark-outline'],
  lock: ['ion', 'lock-closed-outline'],
  info: ['ion', 'information-circle-outline'],
  alert: ['ion', 'alert-circle-outline'],
  'alert-triangle': ['ion', 'warning-outline'],
  star: ['ion', 'star'],
  'star-outline': ['ion', 'star-outline'],
  heart: ['ion', 'heart-outline'],
  'heart-filled': ['ion', 'heart'],
  user: ['ion', 'person-circle-outline'],
  phone: ['ion', 'call-outline'],
  message: ['ion', 'chatbubble-ellipses-outline'],
  'thumbs-up': ['ion', 'thumbs-up-outline'],
  'thumbs-down': ['ion', 'thumbs-down-outline'],
  'thumbs-up-filled': ['ion', 'thumbs-up'],
  'thumbs-down-filled': ['ion', 'thumbs-down'],
  insights: ['ion', 'stats-chart-outline'],
  help: ['ion', 'help-circle-outline'],
  settings: ['ion', 'settings-outline'],
  logout: ['ion', 'log-out-outline'],
  receipt: ['ion', 'receipt-outline'],
  wallet: ['ion', 'wallet-outline'],

  flame: ['mci', 'fire'],
  tag: ['mci', 'tag-outline'],
  percent: ['mci', 'percent'],
  gift: ['mci', 'gift-outline'],
  sparkle: ['mci', 'shimmer'],
  eye: ['ion', 'eye-outline'],

  mpesa: ['mci', 'cellphone'],
  card: ['ion', 'card-outline'],
  cash: ['mci', 'cash'],
  bank: ['mci', 'bank-outline'],

  prescription: ['mci', 'prescription'],
  pill: ['mci', 'pill'],
  thermometer: ['mci', 'thermometer'],
  bandage: ['mci', 'bandage'],
  stethoscope: ['mci', 'stethoscope'],
  molecule: ['mci', 'molecule'],
  heartPulse: ['mci', 'heart-pulse'],
  babyBottle: ['mci', 'baby-bottle-outline'],
  scale: ['mci', 'scale-balance'],
  shieldPlus: ['mci', 'shield-plus-outline'],
} as const satisfies Record<string, readonly ['ion' | 'mci', string]>;

export type IconName = keyof typeof glyphs;

export type IconProps = {
  name: IconName;
  size?: number;
  color?: ColorToken | string;
};

export function Icon({ name, size = 20, color = 'onSurface' }: IconProps) {
  const [set, glyph] = glyphs[name];
  const tint = color in colors ? colors[color as ColorToken] : color;
  if (set === 'ion') {
    return <Ionicons name={glyph as never} size={size} color={tint} />;
  }
  return <MaterialCommunityIcons name={glyph as never} size={size} color={tint} />;
}

export const iconNames = Object.keys(glyphs) as IconName[];
