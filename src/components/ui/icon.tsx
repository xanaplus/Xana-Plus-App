import Ionicons from '@expo/vector-icons/Ionicons';
import {
  ArrowLeft, ArrowRight, ArrowUpDown, Atom, Baby, Bandage, Banknote, Bell, BriefcaseMedical, Calendar, Camera,
  ChartColumn, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleAlert, CircleCheck, CircleQuestionMark,
  CircleUser, Clock, CreditCard, Ellipsis, Eye, FileText, Flame, Funnel, Gift, Heart, HeartPulse, House, Image, Info,
  Landmark, LayoutGrid, List, Lock, LogOut, Mail, MapPin, Megaphone, MessageCircle, Mic, Minus, Pencil, Percent, Phone,
  Pill, Plus, Receipt, RefreshCw, Scale, ScanBarcode, Search, Settings, Share2, ShieldCheck, ShieldPlus, ShoppingCart,
  SlidersHorizontal, Smartphone, Sparkles, Star, Stethoscope, Store, Tag, Thermometer, ThumbsDown, ThumbsUp, Trash2,
  TriangleAlert, Truck, User, Wallet, X, type LucideIcon,
} from 'lucide-react-native';

import { type ColorToken } from '@/theme';
import { useTheme } from '@/theme/provider';

/**
 * Semantic icon names. Screens reference meaning ("cart", "mpesa"), never a glyph,
 * so glyph swaps stay local to this map.
 *
 * One family since 20 Nov 2026: Lucide, one rounded 1.75 line everywhere (the mixed
 * Ionicons + Material sets read as assembled). "-filled" names are the selected state:
 * a heavier line, and a fill only where the shape reads well solid (heart, star, pin…).
 * WhatsApp keeps its own brand mark.
 */
type Glyph = { icon: LucideIcon; selected?: boolean; solid?: boolean } | { brand: 'logo-whatsapp' };

const glyphs = {
  home: { icon: House },
  'home-filled': { icon: House, selected: true },
  categories: { icon: LayoutGrid },
  'categories-filled': { icon: LayoutGrid, selected: true },
  pharmacy: { icon: BriefcaseMedical },
  'pharmacy-tab': { icon: BriefcaseMedical },
  'pharmacy-tab-filled': { icon: BriefcaseMedical, selected: true },
  profile: { icon: User },
  'profile-filled': { icon: User, selected: true },
  cart: { icon: ShoppingCart },
  'cart-filled': { icon: ShoppingCart, selected: true },

  search: { icon: Search },
  mic: { icon: Mic },
  sliders: { icon: SlidersHorizontal },
  scan: { icon: ScanBarcode },
  filter: { icon: Funnel },
  sort: { icon: ArrowUpDown },
  list: { icon: List },

  'chevron-right': { icon: ChevronRight },
  'chevron-left': { icon: ChevronLeft },
  'chevron-up': { icon: ChevronUp },
  'chevron-down': { icon: ChevronDown },
  'arrow-right': { icon: ArrowRight },
  'arrow-left': { icon: ArrowLeft },
  close: { icon: X },
  plus: { icon: Plus },
  minus: { icon: Minus },
  check: { icon: Check },
  'check-circle': { icon: CircleCheck, selected: true },
  'check-circle-outline': { icon: CircleCheck },
  trash: { icon: Trash2 },
  edit: { icon: Pencil },
  share: { icon: Share2 },
  more: { icon: Ellipsis },
  refresh: { icon: RefreshCw },

  'map-pin': { icon: MapPin },
  'map-pin-filled': { icon: MapPin, selected: true },
  bell: { icon: Bell },
  announce: { icon: Megaphone },
  clock: { icon: Clock },
  calendar: { icon: Calendar },
  delivery: { icon: Truck },
  pickup: { icon: Store },
  store: { icon: Store },
  shield: { icon: ShieldCheck },
  lock: { icon: Lock },
  camera: { icon: Camera },
  image: { icon: Image },
  info: { icon: Info },
  alert: { icon: CircleAlert },
  'alert-triangle': { icon: TriangleAlert },
  star: { icon: Star, solid: true },
  'star-outline': { icon: Star },
  heart: { icon: Heart },
  'heart-filled': { icon: Heart, solid: true },
  user: { icon: CircleUser },
  phone: { icon: Phone },
  mail: { icon: Mail },
  message: { icon: MessageCircle },
  whatsapp: { brand: 'logo-whatsapp' },
  'thumbs-up': { icon: ThumbsUp },
  'thumbs-down': { icon: ThumbsDown },
  'thumbs-up-filled': { icon: ThumbsUp, solid: true },
  'thumbs-down-filled': { icon: ThumbsDown, solid: true },
  insights: { icon: ChartColumn },
  help: { icon: CircleQuestionMark },
  settings: { icon: Settings },
  logout: { icon: LogOut },
  receipt: { icon: Receipt },
  wallet: { icon: Wallet },

  flame: { icon: Flame },
  tag: { icon: Tag },
  percent: { icon: Percent },
  gift: { icon: Gift },
  sparkle: { icon: Sparkles },
  eye: { icon: Eye },

  mpesa: { icon: Smartphone },
  card: { icon: CreditCard },
  cash: { icon: Banknote },
  bank: { icon: Landmark },

  prescription: { icon: FileText },
  pill: { icon: Pill },
  thermometer: { icon: Thermometer },
  bandage: { icon: Bandage },
  stethoscope: { icon: Stethoscope },
  molecule: { icon: Atom },
  heartPulse: { icon: HeartPulse },
  babyBottle: { icon: Baby },
  scale: { icon: Scale },
  shieldPlus: { icon: ShieldPlus },
} as const satisfies Record<string, Glyph>;

export type IconName = keyof typeof glyphs;

export type IconProps = {
  name: IconName;
  size?: number;
  color?: ColorToken | string;
};

/** Lucide's 24-unit line, kept visually even across sizes (thinner on big icons, never hairline on small). */
const strokeFor = (size: number, selected: boolean) => {
  const base = size <= 16 ? 2 : size >= 28 ? 1.5 : 1.75;
  return selected ? base + 0.5 : base;
};

export function Icon({ name, size = 20, color = 'onSurface' }: IconProps) {
  const { colors } = useTheme();
  const glyph: Glyph = glyphs[name];
  const tint = color in colors ? colors[color as ColorToken] : color;
  if ('brand' in glyph) return <Ionicons name={glyph.brand} size={size} color={tint} />;
  const Glyph = glyph.icon;
  return (
    <Glyph
      size={size}
      color={tint}
      strokeWidth={strokeFor(size, glyph.selected === true)}
      fill={glyph.solid ? tint : 'none'}
      absoluteStrokeWidth={false}
    />
  );
}

export const iconNames = Object.keys(glyphs) as IconName[];
