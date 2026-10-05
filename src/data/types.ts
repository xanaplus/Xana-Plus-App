/**
 * Domain model for the XanaPlus retail app (pharmacy + grocery + wholesale).
 * Field names follow the wording used in the Figma screens so copy in the
 * design maps 1:1 onto the data.
 */

export type FulfilmentMode = 'delivery' | 'pickup';

export type PaymentMethodId = 'mpesa' | 'cod' | 'card';

export type ProductBadge = 'discount' | 'fresh' | 'new' | 'organic' | 'bulk';

/** A purchasable item. Money is in KES, stored as whole shillings. */
export type Product = {
  id: string;
  name: string;
  /** Short line under the name, e.g. "Pack of 3 pcs · ~650g". */
  pack: string;
  price: number;
  /** Struck-through comparison price, when the design shows one. */
  wasPrice?: number;
  /** Wholesale price applied from `wholesaleMinQty` units upwards. */
  wholesalePrice?: number;
  wholesaleMinQty?: number;
  image: string;
  badges?: ProductBadge[];
  /** Category slug from `categories`. */
  category: string;
  /** Pharmacy items gate checkout behind a prescription when `rxRequired`. */
  rxRequired?: boolean;
  /** Alcohol: checkout asks the shopper to confirm they are 18 or over. */
  ageRestricted?: boolean;
  inStock?: boolean;
  rating?: number;
  reviewCount?: number;
  /** Rail / grid section the product belongs to on Home. */
  rail?: 'fresh-everyday' | 'popular' | 'buy-again';
  /** Long-form copy shown on the product detail screen. */
  description?: string;
  highlights?: string[];
  specifications?: { label: string; value: string }[];
};

export type Category = {
  slug: string;
  name: string;
  image: string;
  /** True for the four tiles pinned to the top of the Categories grid. */
  featured?: boolean;
  /** Vertical the tile belongs to; drives the Categories tab filter. */
  vertical: CategoryVertical;
  itemCount?: number;
};

export type CategoryVertical = 'groceries' | 'pharmacy' | 'retail' | 'deli' | 'wholesale' | 'liquor' | 'household' | 'beauty';

/** Promotional cards in the Home hero and "Trending Deals" rail. */
export type Deal = {
  id: string;
  /** Small label above the title; some deals only carry a  instead. */
  eyebrow?: string;
  title: string;
  description: string;
  image: string;
  /** Primary call to action. */
  cta: string;
  tone: 'promo' | 'harvest' | 'wellness' | 'breakfast';
  /** e.g. "UP TO 35% OFF", "HEALTH ESSENTIALS". */
  tag?: string;
};

export type DeliverySlot = {
  id: string;
  label: string;
  window: string;
  mode: FulfilmentMode;
  free?: boolean;
};

export type CartLine = {
  productId: string;
  quantity: number;
};

/** How the shopper wants substitutions handled for unavailable items. */
export type SubstitutionPreference = 'similar' | 'refund' | 'call';

export type OrderSummary = {
  itemsSubtotal: number;
  wholesaleSavings: number;
  deliveryFee: number;
  platformFee: number;
  /** Promo code taken off the items, when one was used. */
  promoCode?: string;
  promoDiscount?: number;
  total: number;
  itemCount: number;
  unitCount: number;
};

export type User = {
  id: string;
  name: string;
  phone: string;
  /** Xana Club tier shown on the Home rewards card. */
  clubTier: 'Bronze' | 'Silver' | 'Gold';
  clubPoints: number;
};
