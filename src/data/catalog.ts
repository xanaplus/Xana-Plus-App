import { groupsForCategory, liveProductById, liveProductsByCategory, type LiveQuery } from './live-catalogue';
import type { Category, CategoryVertical, DeliverySlot, Deal, Product } from './types';

/**
 * Catalogue data lifted from the Figma screens: product names, pack sizes,
 * prices and promo copy are the exact strings used in the design, so screens
 * built from this data match the reference frames.
 */

export const stores = [
  { id: 'syokimau', name: 'Xana Plus Syokimau', address: 'Syokimau, Mombasa Road', phone: '+254 718 666 661' },
  { id: 'ruiru', name: 'Xana Plus Ruiru', address: 'Ruiru, Kamakis', phone: '+254 718 666 662' },
] as const;

export const deliverySlots: DeliverySlot[] = [
  { id: 'express-30', label: 'Express 30 min', window: 'Within 30 minutes', mode: 'delivery' },
  { id: 'std-am', label: 'Standard Home Delivery', window: 'Tomorrow, 9:00 AM - 11:00 AM', mode: 'delivery', free: true },
  { id: 'std-pm', label: 'Standard Home Delivery', window: 'Tomorrow, 2:00 PM - 4:00 PM', mode: 'delivery', free: true },
  { id: 'pickup-syokimau', label: 'Pickup · Xana Plus Syokimau', window: 'Ready in 45 minutes', mode: 'pickup', free: true },
];

/** Home category grid, in the order shown on Screen 2a. */
export const homeCategoryTiles: Category[] = [
  { slug: 'meat-poultry', name: 'Meat & Poultry', image: 'meat-poultry', vertical: 'groceries' },
  { slug: 'bakery', name: 'Bakery (Xana Bread)', image: 'bakery', vertical: 'groceries' },
  { slug: 'deli-cold-cuts', name: 'Deli & Cold Cuts', image: 'deli-cold-cuts', vertical: 'deli' },
  { slug: 'pharmacy', name: 'Pharmacy', image: 'pharmacy', vertical: 'pharmacy', featured: true },
  { slug: 'cooking-oil', name: 'Cooking Oil', image: 'cooking-oil', vertical: 'groceries' },
  { slug: 'beverages', name: 'Beverages', image: 'beverages', vertical: 'groceries' },
  { slug: 'liquor', name: 'Liquor', image: 'liquor', vertical: 'liquor' },
  { slug: 'frozen-foods', name: 'Frozen Foods', image: 'frozen-foods', vertical: 'groceries' },
  { slug: 'fresh-produce', name: 'Fresh Produce', image: 'fresh-produce', vertical: 'groceries' },
  { slug: 'dairy-eggs', name: 'Dairy & Eggs', image: 'dairy-eggs', vertical: 'groceries' },
  { slug: 'cleaning-household', name: 'Cleaning & Household', image: 'cleaning-household', vertical: 'household' },
  { slug: 'beauty-personal-care', name: 'Beauty & Personal Care', image: 'beauty-personal-care', vertical: 'beauty' },
  { slug: 'books-stationery', name: 'Books & Stationery', image: 'books-stationery', vertical: 'retail' },
  { slug: 'baby-products', name: 'Baby Products', image: 'baby-products', vertical: 'retail' },
  { slug: 'retail-wholesale', name: 'Retail & Wholesale', image: 'retail-wholesale', vertical: 'wholesale' },
  { slug: 'snacks', name: 'Snacks', image: 'snacks', vertical: 'groceries' },
  { slug: 'pet-care', name: 'Pet Care', image: 'pet-care', vertical: 'retail' },
];

/** Home promotional hero (Screen 2a, "Supa Deals This Week"). */
export const heroDeal: Deal = {
  id: 'supa-deals',
  eyebrow: 'UP TO 35% OFF',
  tag: 'Flash Drop',
  title: 'Supa Deals This Week',
  description: 'Save big on fresh produce, pantry staples & everyday household…',
  image: 'home-hero-basket',
  cta: 'Shop All',
  tone: 'promo',
};

/** "Trending Deals" rail (Screen 2a). */
export const trendingDeals: Deal[] = [
  {
    id: 'fresh-farm-picks',
    eyebrow: 'UP TO 25% OFF',
    title: 'Fresh Farm Picks',
    description: 'Sweet mangoes, spinach & crisp greens direct from…',
    image: 'vibrant-farm-greens-spinach',
    cta: 'Shop Harvest',
    tone: 'harvest',
  },
  {
    id: 'wellness-immunity',
    tag: 'HEALTH ESSENTIALS',
    title: 'Wellness & Immunity',
    description: 'Vitamins, pain relief & daily healthcare essentials',
    image: 'vitamins-supplements',
    cta: 'Explore Pharmacy',
    tone: 'wellness',
  },
  {
    id: 'breakfast-combo',
    tag: 'BREAKFAST COMBO',
    title: 'Dairy & Bakery',
    description: 'Fresh milk, artisan bread & rich cheddar',
    image: 'dairy-eggs',
    cta: 'View Combos',
    tone: 'breakfast',
  },
];

const products: Product[] = [
  {
    id: 'hass-avocados-3pc',
    name: 'Fresh Hass Avocados',
    pack: 'Pack of 3 pcs',
    price: 180,
    wasPrice: 220,
    image: 'kenyan-organic-hass-avocados',
    badges: ['discount'],
    category: 'fresh-produce',
    rail: 'fresh-everyday',
    inStock: true,
    rating: 4.7,
    reviewCount: 62,
    description: 'Creamy Kenyan Hass avocados picked at peak ripeness and delivered from our Syokimau and Ruiru stores.',
    highlights: ['Ready to eat in 1-2 days', 'Rich in healthy monounsaturated fats', 'Grown by smallholder farms in Murang’a'],
  },
  {
    id: 'brookside-milk-500ml',
    name: 'Brookside Whole Fresh Milk',
    pack: '500ml Pouch',
    price: 75,
    image: 'brookside-whole-fresh-milk-500ml-pouch',
    badges: ['fresh'],
    category: 'dairy-eggs',
    rail: 'fresh-everyday',
    inStock: true,
    rating: 4.8,
    reviewCount: 214,
  },
  {
    id: 'beef-sausages-400g',
    name: 'Farmers Choice Beef Sausages',
    pack: '400g Chilled',
    price: 340,
    wasPrice: 375,
    image: 'farmers-choice-beef-sausages',
    badges: ['new'],
    category: 'meat-poultry',
    rail: 'fresh-everyday',
    inStock: true,
  },
  {
    id: 'cucumbers-2pc',
    name: 'Crisp English Cucumbers',
    pack: '2 pcs pack',
    price: 110,
    image: 'crisp-english-cucumbers',
    badges: ['organic'],
    category: 'fresh-produce',
    rail: 'fresh-everyday',
    inStock: true,
  },
  {
    id: 'sukuma-wiki',
    name: 'Fresh Sukuma Wiki',
    pack: 'Bunch · ~400g',
    price: 60,
    image: 'fresh-sukuma-wiki',
    category: 'fresh-produce',
    inStock: true,
  },
  {
    id: 'spinach-organic',
    name: 'Fresh Organic Spinach',
    pack: 'Bunch · ~300g',
    price: 80,
    image: 'fresh-organic-spinach',
    badges: ['organic'],
    category: 'fresh-produce',
    inStock: true,
  },
  {
    id: 'acacia-honey-500g',
    name: 'Pure Acacia Honey',
    pack: '500g Jar',
    price: 520,
    image: 'pure-acacia-honey',
    category: 'snacks',
    inStock: true,
  },
  {
    id: 'mountain-honey-500g',
    name: 'Pure Mountain Honey',
    pack: '500g Jar',
    price: 480,
    image: 'pure-mountain-honey',
    category: 'snacks',
    inStock: true,
  },
  {
    id: 'panadol-extra-16s',
    name: 'Panadol Extra Tablets',
    pack: '16-Tablet Blister Pack',
    price: 210,
    image: 'panadol-extra-tablets',
    category: 'pain-relief',
    inStock: true,
    rating: 4.9,
    reviewCount: 184,
    description:
      'Panadol Extra contains a dual-action formula of paracetamol and caffeine. Formulated to provide extra effective, fast relief from tough headaches, migraines, backache, rheumatic pain, toothache, and period pain.',
    highlights: [
      'Paracetamol 500mg + Caffeine 65mg per tablet',
      'Fast relief from tough headaches and migraines',
      '16-tablet blister pack',
    ],
  },
  {
    id: 'ibuprofen-400mg-30s',
    name: 'Ibuprofen 400mg Tablets',
    pack: '30 Tablets · 400mg',
    price: 320,
    image: 'ibuprofen-400mg',
    category: 'pain-relief',
    rxRequired: true,
    inStock: true,
  },
  {
    id: 'deep-heat-spray-150ml',
    name: 'Deep Heat Pain Spray',
    pack: '150ml · Topical Spray',
    price: 780,
    image: 'deep-heat-pain-spray',
    category: 'pain-relief',
    inStock: true,
  },
  {
    id: 'seven-seas-cod-liver-oil',
    name: 'Seven Seas Cod Liver Oil',
    pack: '120 Softgels · Omega 3',
    price: 1450,
    image: 'seven-seas-cod-liver-oil',
    category: 'vitamins-supplements',
    inStock: true,
  },
  {
    id: 'vitamin-c-1000mg',
    name: 'Vitamin C 1000mg High Potency',
    pack: '20 Effervescent Tablets',
    price: 620,
    image: 'vitamin-c-1000mg-effervescent',
    category: 'vitamins-supplements',
    inStock: true,
  },
  {
    id: 'calcium-zinc-complex',
    name: 'Calcium + Zinc Complex',
    pack: '60 Coated Tablets',
    price: 950,
    image: 'calcium-zinc-complex',
    category: 'vitamins-supplements',
    inStock: true,
  },
  {
    id: 'betadine-antiseptic-100ml',
    name: 'Betadine Antiseptic Solution',
    pack: '100ml · Antiseptic Liquid',
    price: 420,
    image: 'betadine-antiseptic',
    category: 'first-aid',
    inStock: true,
  },
  {
    id: 'hansaplast-elastic-strips',
    name: 'Hansaplast Elastic Strips',
    pack: '20 Strips · Breathable',
    price: 260,
    image: 'hansaplast-elastic-strips',
    category: 'first-aid',
    inStock: true,
  },
  {
    id: 'sterile-gauze-swabs',
    name: 'Sterile Gauze Swabs',
    pack: 'Pack of 10 · 7.5cm x 7.5cm',
    price: 150,
    image: 'sterile-gauze-swabs',
    category: 'first-aid',
    inStock: true,
  },
  {
    id: 'calpol-infant-100ml',
    name: 'Calpol Infant Suspension',
    pack: '100ml · Strawberry Flavor',
    price: 540,
    image: 'calpol-infant-suspension',
    category: 'baby-health',
    inStock: true,
  },
  {
    id: 'infacol-colic-drops',
    name: 'Infacol Colic Drops',
    pack: '50ml · Colic Relief',
    price: 890,
    image: 'infacol-colic-drops',
    category: 'baby-health',
    inStock: true,
  },
  {
    id: 'sudocrem-care-protect',
    name: 'Sudocrem Care & Protect',
    pack: '60g · Barrier Cream',
    price: 480,
    image: 'sudocrem-care-protect',
    category: 'baby-health',
    inStock: true,
  },
  {
    id: 'dettol-antiseptic-250ml',
    name: 'Dettol Antiseptic Liquid',
    pack: '250ml · Disinfectant',
    price: 390,
    image: 'dettol-antiseptic-liquid',
    category: 'personal-care',
    inStock: true,
  },
  {
    id: 'sensodyne-rapid-relief-75ml',
    name: 'Sensodyne Rapid Relief',
    pack: '75ml · Sensitive Teeth',
    price: 460,
    image: 'sensodyne-rapid-relief',
    category: 'personal-care',
    inStock: true,
  },
  {
    id: 'sebamed-gentle-wash-200ml',
    name: 'Sebamed Gentle Wash',
    pack: '200ml · pH 5.5 Formula',
    price: 890,
    image: 'sebamed-gentle-wash',
    category: 'personal-care',
    inStock: true,
  },
  {
    id: 'omron-m2-bp-monitor',
    name: 'Omron M2 BP Monitor',
    pack: 'Automatic Arm Monitor',
    price: 5800,
    image: 'omron-m2-bp-monitor',
    category: 'wellness-devices',
    inStock: true,
  },
  {
    id: 'digital-thermometer',
    name: 'Digital Medical Thermometer',
    pack: '10s Fast Read · Flexible Tip',
    price: 650,
    image: 'digital-medical-thermometer',
    category: 'wellness-devices',
    inStock: true,
  },
  {
    id: 'accu-chek-instant-kit',
    name: 'Accu-Chek Instant Kit',
    pack: 'Complete Starter Kit',
    price: 3200,
    image: 'accu-chek-instant-kit',
    category: 'wellness-devices',
    inStock: true,
  },
  {
    id: 'farm-greens-bundle',
    name: 'Vibrant Farm Greens & Spinach',
    pack: 'Bundle',
    price: 120,
    image: 'vibrant-farm-greens-spinach',
    category: 'fresh-produce',
    inStock: true,
  },
  {
    id: 'vitamin-c-zinc-immunity',
    name: 'Organic Vitamin C + Zinc Immunity',
    pack: '60 Tablets',
    price: 950,
    image: 'organic-vitamin-c-zinc-immunity',
    category: 'vitamins-supplements',
    inStock: true,
  },
  {
    id: 'oral-rehydration-salts',
    name: 'Oral Rehydration Salts Electrolytes',
    pack: '10 Sachets · Oral',
    price: 180,
    image: 'oral-rehydration-salts-electrolytes',
    category: 'digestive-health',
    inStock: true,
  },
  {
    id: 'milk-magnesia-200ml',
    name: 'Phillips Milk of Magnesia Mint',
    pack: '200ml · Gentle antacid & laxative',
    price: 550,
    image: 'phillips-milk-of-magnesia-mint-200ml',
    category: 'digestive-health',
    inStock: true,
  },
  {
    id: 'milk-thistle-60s',
    name: 'Milk Thistle & Vitamin C',
    pack: '60s · Antioxidant & liver care',
    price: 1280,
    image: 'milk-thistle-vitamin-c',
    category: 'vitamins-supplements',
    inStock: true,
  },
  {
    id: 'bio-organic-milk-500ml',
    name: 'Bio Organic Whole Milk',
    pack: '500ml · Glass bottle refillable',
    price: 165,
    image: 'bio-organic-whole-milk-500ml',
    badges: ['organic'],
    category: 'dairy-eggs',
    inStock: true,
  },
  {
    id: 'ilara-milk-500ml',
    name: 'Ilara Full Cream Milk Pouch',
    pack: '500ml · Everyday value',
    price: 65,
    wasPrice: 70,
    image: 'ilara-full-cream-milk-pouch-500ml',
    category: 'dairy-eggs',
    inStock: true,
  },
  {
    id: 'freshfields-milk-1l',
    name: 'Freshfields Fresh Kenyan Whole Milk',
    pack: '1L · Pasteurised · Fresh daily',
    price: 120,
    image: 'freshfields-fresh-kenyan-whole-milk-1l',
    category: 'dairy-eggs',
    inStock: true,
  },
  {
    id: 'almond-milk-1l',
    name: 'Almond Milk Unsweetened',
    pack: '1L · Dairy-free alternative',
    price: 420,
    image: 'almond-milk-unsweetened-1l',
    badges: ['new'],
    category: 'dairy-eggs',
    inStock: true,
  },
  {
    id: 'harpic-detergent-1kg',
    name: 'Harpic Detergent 1kg',
    pack: '1kg Bottle · Bleach & Power Clean · Fresh Citrus',
    price: 250,
    wasPrice: 290,
    wholesalePrice: 210,
    wholesaleMinQty: 6,
    image: 'harpic-power-bleach-detergent-1kg',
    category: 'cleaning-products',
    inStock: true,
    rating: 4.8,
    reviewCount: 94,
    description:
      'Harpic Power Bleach & Detergent delivers multi-action deep sanitisation and stain removal. Formulated with active cleaning power that kills 99.9% of bacteria, viruses, and germs while leaving a long-lasting fresh citrus scent.',
    highlights: [
      'Kills 99.9% of disease-causing germs and eliminates tough grime',
      'Suitable for household bathrooms, tiles and commercial sanitisation in bulk',
      'Heavy-duty bleach formulation ideal for deep disinfecting routines',
    ],
    specifications: [
      { label: 'Volume', value: '1kg bottle' },
      { label: 'Formula', value: 'Power Bleach · Fresh Citrus' },
      { label: 'Wholesale', value: 'KES 210 each from 6 units' },
    ],
  },
  {
    id: 'omo-hand-washing-1kg',
    name: 'Omo Hand Washing Powder 1kg',
    pack: '1kg · Extra Clean Fabric Detergent',
    price: 280,
    wholesalePrice: 238,
    wholesaleMinQty: 6,
    image: 'omo-hand-washing-powder',
    category: 'household',
    inStock: true,
  },
  {
    id: 'omo-carton-10x1kg',
    name: 'Omo Hand Washing Powder (Carton 10 x 1kg)',
    pack: 'Carton · Bulk pack',
    price: 2650,
    wasPrice: 2800,
    image: 'omo-hand-washing-powder',
    badges: ['bulk'],
    category: 'household',
    inStock: true,
  },
  {
    id: 'rina-oil-carton-4x5l',
    name: 'Rina Vegetable Oil (Carton 4 x 5L)',
    pack: 'Carton of 4x5L',
    price: 4150,
    wasPrice: 4500,
    image: 'wholesale-pack-1',
    badges: ['bulk'],
    category: 'cooking-oil',
    rail: 'popular',
    inStock: true,
  },
  {
    id: 'golden-fry-box-6x3l',
    name: 'Golden Fry Pure Sunflower Oil (Box 6 x 3L)',
    pack: 'Box of 6x3L',
    price: 4890,
    wasPrice: 5310,
    image: 'wholesale-pack-2',
    badges: ['bulk'],
    category: 'cooking-oil',
    inStock: true,
  },
  {
    id: 'basmati-rice-5kg',
    name: 'Pishori Basmati Rice 5kg',
    pack: '5kg · Aromatic long grain',
    price: 1250,
    wholesalePrice: 1150,
    wholesaleMinQty: 6,
    image: 'rice-grains',
    category: 'rice-grains',
    inStock: true,
  },
  {
    id: 'sugar-2kg',
    name: 'Kabras Sugar 2kg',
    pack: '2kg · Fine grain',
    price: 320,
    wholesalePrice: 295,
    wholesaleMinQty: 6,
    image: 'sugar-and-baking',
    category: 'sugar-baking',
    inStock: true,
  },
  {
    id: 'rotisserie-chicken',
    name: 'Herb Roasted Whole Rotisserie Chicken (1.2kg)',
    pack: 'Hot & Fresh · Serves 2-3',
    price: 1150,
    wasPrice: 1300,
    image: 'rotisserie-hot-foods',
    badges: ['fresh'],
    category: 'rotisserie',
    inStock: true,
  },
  {
    id: 'glazed-chicken-quarter',
    name: 'Crispy Glazed Chicken Quarter & Wedges',
    pack: 'Combo Meal · Deli Special',
    price: 620,
    image: 'rotisserie-hot-foods',
    category: 'rotisserie',
    inStock: true,
  },
  {
    id: 'cheese-cheddar-250g',
    name: 'Aged Cheddar Block 250g',
    pack: '250g · Deli counter cut',
    price: 780,
    image: 'cheese-counter',
    category: 'cheese-counter',
    inStock: true,
  },
  {
    id: 'cold-cuts-ham-200g',
    name: 'Honey Glazed Ham Slices',
    pack: '200g · Cold cuts counter',
    price: 690,
    image: 'cold-cuts-cured-meats',
    category: 'cold-cuts',
    inStock: true,
  },
  {
    id: 'olives-mixed-300g',
    name: 'Mixed Marinated Olives',
    pack: '300g · Deli antipasti',
    price: 540,
    image: 'olives-antipasti',
    category: 'olives-antipasti',
    inStock: true,
  },
  {
    id: 'tusker-lager-500ml',
    name: 'Tusker Lager 500ml',
    pack: '500ml Bottle · 4.2% ABV',
    price: 250,
    image: 'liquor',
    category: 'liquor',
    ageRestricted: true,
    inStock: true,
  },
  {
    id: 'cooking-oil-2l',
    name: 'Fresh Fri Cooking Oil 2L',
    pack: '2L Bottle',
    price: 620,
    image: 'cooking-oil',
    category: 'cooking-oil',
    inStock: true,
  },
  {
    id: 'soda-crate-24',
    name: 'Coca-Cola 300ml (Crate of 24)',
    pack: 'Crate of 24 · Returnable',
    price: 1450,
    wasPrice: 1600,
    image: 'beverages',
    badges: ['bulk'],
    category: 'beverages',
    inStock: true,
  },
  {
    id: 'frozen-peas-500g',
    name: 'Frozen Garden Peas 500g',
    pack: '500g · Frozen',
    price: 260,
    image: 'frozen-foods',
    category: 'frozen-foods',
    inStock: false,
  },
];

export const allProducts = products;

const productIndex: Record<string, Product> = Object.fromEntries(products.map(p => [p.id, p]));

/** Sample products first (demo orders and prescriptions use them), then Business Central items seen so far. */
export const productById = (id: string): Product | undefined => productIndex[id] ?? liveProductById(id);

export const productsByCategory = (slug: string): Product[] => [
  ...products.filter(p => p.category === slug),
  ...liveProductsByCategory(slug),
];

/** Resolve a list of ids in the given order, skipping unknown ids. */
export const productsByIds = (ids: string[]): Product[] =>
  ids.flatMap(id => {
    const product = productById(id);
    return product ? [product] : [];
  });

export const productsByRail = (rail: NonNullable<Product['rail']>): Product[] => products.filter(p => p.rail === rail);

export const productsByBadge = (badge: NonNullable<Product['badges']>[number]): Product[] =>
  products.filter(p => p.badges?.includes(badge));

/** Free-text search across name, pack size and category. */
export const searchProducts = (query: string): Product[] => {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  // Category slugs are hyphenated ('cooking-oil'); shoppers type 'cooking oil'.
  const flat = q.replace(/[^a-z0-9]+/g, ' ');
  return products.filter(p => `${p.name} ${p.pack} ${p.category}`.toLowerCase().replace(/[^a-z0-9]+/g, ' ').includes(flat));
};

export const categoryBySlug = (slug: string): Category | undefined => homeCategoryTiles.find(c => c.slug === slug);

/** Pharmacy & Wellness hub (Screen 8a) — quick actions in the hero strip. */
export const pharmacyQuickActions = [
  { id: 'upload-rx', label: 'Upload Rx', icon: 'prescription' as const },
  { id: 'consult', label: 'Consult Doctor', icon: 'stethoscope' as const },
  { id: 'prescriptions', label: 'My Prescriptions', icon: 'pill' as const },
  { id: 'ask', label: 'Ask Pharmacist', icon: 'message' as const },
];

/** A product row in a Categories aisle, filled live from the Business Central catalogue. */
export type VerticalSection = { title: string; subtitle: string; categorySlug: string; query: LiveQuery };

/** Shelf of one app category's BC groups. */
const shelf = (slug: string, nameHas?: string[]): LiveQuery => ({ groups: groupsForCategory(slug), nameHas });

/** Names that mark a bulk pack in BC ("... Box 12 pcs", "... Outer", "Bale x 6Pc"). */
const BULK_WORDS = ['box', 'outer', 'carton', 'ctn', 'bale', 'crate'];

export type VerticalDefinition = {
  slug: CategoryVertical;
  label: string;
  title: string;
  /** Sub-category tiles shown under the title. */
  subcategories: { slug: string; name: string; image: string }[];
  sections: VerticalSection[];
};

/** Content for the Categories tab, one definition per filter chip. */
export const verticals: VerticalDefinition[] = [
  {
    slug: 'groceries',
    label: 'Groceries',
    title: 'Grocery Aisles',
    subcategories: homeCategoryTiles.filter(c => c.vertical === 'groceries').map(c => ({ slug: c.slug, name: c.name, image: c.image })),
    sections: [
      { title: 'Fresh Produce', subtitle: 'Fruit and vegetables', categorySlug: 'fresh-produce', query: shelf('fresh-produce') },
      { title: 'Dairy & Eggs', subtitle: 'Milk, yoghurt, cheese & ice cream', categorySlug: 'dairy-eggs', query: shelf('dairy-eggs') },
      { title: 'Meat & Poultry', subtitle: 'Chilled meat, sausages & bacon', categorySlug: 'meat-poultry', query: shelf('meat-poultry') },
      { title: 'Bakery', subtitle: 'Bread and spreads', categorySlug: 'bakery', query: shelf('bakery') },
      { title: 'Cooking Oil', subtitle: 'Oils and fats', categorySlug: 'cooking-oil', query: shelf('cooking-oil') },
      { title: 'Beverages', subtitle: 'Juice, soft drinks & water', categorySlug: 'beverages', query: shelf('beverages') },
      { title: 'Staples & Cereals', subtitle: 'Flour, rice, sugar & breakfast', categorySlug: 'staples', query: shelf('staples') },
      { title: 'Snacks', subtitle: 'Biscuits, crisps & sweets', categorySlug: 'snacks', query: shelf('snacks') },
      { title: 'Spices & Flavours', subtitle: 'Seasoning, sauces & baking', categorySlug: 'spices', query: shelf('spices') },
    ],
  },
  {
    slug: 'retail',
    label: 'Retail',
    title: 'Retail Essentials',
    subcategories: [
      { slug: 'cooking-oil', name: 'Cooking Oil', image: 'cooking-oil' },
      { slug: 'cleaning-products', name: 'Cleaning Products', image: 'cleaning-products' },
      { slug: 'beverages', name: 'Soft Drinks & Water', image: 'beverages' },
      { slug: 'rice-grains', name: 'Rice & Grains', image: 'rice-grains' },
      { slug: 'sugar-baking', name: 'Sugar & Baking', image: 'sugar-and-baking' },
      { slug: 'liquor', name: 'Beer & Cider', image: 'liquor' },
      { slug: 'liquor', name: 'Wine & Spirits', image: 'liquor' },
    ],
    sections: [
      { title: 'Cooking Oil', subtitle: 'Oils and fats', categorySlug: 'cooking-oil', query: shelf('cooking-oil') },
      { title: 'Cleaning Products', subtitle: 'Soaps and detergents', categorySlug: 'cleaning-products', query: shelf('cleaning-products') },
      { title: 'Soft Drinks & Water', subtitle: 'Juice, soda & bottled water', categorySlug: 'beverages', query: shelf('beverages') },
      { title: 'Staples', subtitle: 'Flour, rice & sugar', categorySlug: 'staples', query: shelf('staples') },
      { title: 'Books & Stationery', subtitle: 'School and office supplies', categorySlug: 'books-stationery', query: shelf('books-stationery') },
      { title: 'Baby Products', subtitle: 'Feeding, bathing & care', categorySlug: 'baby-products', query: shelf('baby-products') },
      { title: 'General Merchandise', subtitle: 'Accessories, bags & more', categorySlug: 'general-merchandise', query: shelf('general-merchandise') },
    ],
  },
  {
    slug: 'wholesale',
    label: 'Wholesale',
    title: 'Wholesale Essentials',
    subcategories: [
      { slug: 'household', name: 'Household', image: 'cleaning-household' },
      { slug: 'rice-grains', name: 'Staples', image: 'rice-grains' },
      { slug: 'beverages', name: 'Beverages', image: 'beverages' },
      { slug: 'beauty-personal-care', name: 'Personal Care', image: 'beauty-personal-care' },
    ],
    sections: [
      { title: 'Detergents & Cleaning', subtitle: 'Boxes and outers', categorySlug: 'cleaning-products', query: shelf('cleaning-products', BULK_WORDS) },
      {
        title: 'Staples & Dry Goods',
        subtitle: 'Bulk packs for shops and kitchens',
        categorySlug: 'staples',
        query: { groups: [...groupsForCategory('staples'), ...groupsForCategory('cooking-oil')], nameHas: BULK_WORDS },
      },
      { title: 'Beverages', subtitle: 'Crates and outers', categorySlug: 'beverages', query: shelf('beverages', BULK_WORDS) },
      { title: 'Snacks & Sweets', subtitle: 'Boxes for resale', categorySlug: 'snacks', query: shelf('snacks', BULK_WORDS) },
    ],
  },
  {
    slug: 'deli',
    label: 'Deli',
    title: 'Deli Counter & Kitchen',
    subcategories: [
      { slug: 'cold-cuts', name: 'Cold Cuts & Cured Meats', image: 'cold-cuts-cured-meats' },
      { slug: 'cheese-counter', name: 'Cheese Counter', image: 'cheese-counter' },
      { slug: 'rotisserie', name: 'Rotisserie & Hot Foods', image: 'rotisserie-hot-foods' },
      { slug: 'olives-antipasti', name: 'Olives & Antipasti', image: 'olives-antipasti' },
    ],
    sections: [
      {
        title: 'Cold Cuts & Sausages',
        subtitle: 'From the chilled counter',
        categorySlug: 'deli-cold-cuts',
        query: shelf('meat-poultry', ['sausage', 'bacon', 'ham', 'salami', 'brawn', 'smokie', 'polony']),
      },
      { title: 'Cheese', subtitle: 'Sliced, grated & block', categorySlug: 'cheese-counter', query: shelf('dairy-eggs', ['cheese']) },
    ],
  },
  {
    slug: 'pharmacy',
    label: 'Pharmacy',
    title: 'Pharmacy Essentials',
    subcategories: [
      { slug: 'pain-relief', name: 'Pain Relief', image: 'pain-relief' },
      { slug: 'vitamins-supplements', name: 'Vitamins & Supplements', image: 'vitamins-supplements' },
      { slug: 'first-aid', name: 'First Aid', image: 'first-aid-wound-care' },
      { slug: 'baby-health', name: 'Baby Health', image: 'baby-products' },
      { slug: 'personal-care', name: 'Personal Care', image: 'beauty-personal-care' },
      { slug: 'wellness-devices', name: 'Wellness Devices', image: 'wellness-devices' },
    ],
    sections: [
      { title: 'Medicines', subtitle: 'Dispensed by our pharmacists', categorySlug: 'medicines', query: shelf('medicines') },
      { title: 'Over the Counter', subtitle: 'Everyday remedies', categorySlug: 'otc-medicines', query: shelf('otc-medicines') },
      { title: 'Vitamins & Supplements', subtitle: 'Immunity, vitality & bone health', categorySlug: 'vitamins-supplements', query: shelf('vitamins-supplements') },
      { title: 'Chronic Care', subtitle: 'Blood pressure, diabetes & heart', categorySlug: 'chronic-care', query: shelf('chronic-care') },
      { title: 'Skin & Dermatology', subtitle: 'Dermatologist-recommended care', categorySlug: 'skin-care', query: shelf('skin-care') },
      { title: 'Oral Care', subtitle: 'Toothpaste, brushes & mouthwash', categorySlug: 'oral-care', query: shelf('oral-care') },
    ],
  },
  {
    slug: 'liquor',
    label: 'Liquor',
    title: 'Liquor Essentials',
    subcategories: [
      { slug: 'liquor', name: 'Beer & Cider', image: 'liquor' },
      { slug: 'liquor', name: 'Wine & Spirits', image: 'liquor' },
    ],
    sections: [
      {
        title: 'Beer & Cider',
        subtitle: 'Chilled and ready to deliver',
        categorySlug: 'beer-cider',
        query: shelf('liquor', ['beer', 'lager', 'cider', 'stout', 'tusker', 'guinness']),
      },
      {
        title: 'Wine & Spirits',
        subtitle: 'Wine, whisky, gin & more',
        categorySlug: 'liquor',
        query: shelf('liquor', ['wine', 'whisky', 'whiskey', 'vodka', 'gin', 'brandy', 'rum', 'liqueur', 'tequila']),
      },
    ],
  },
  {
    slug: 'household',
    label: 'Household',
    title: 'Household & Cleaning',
    subcategories: [
      { slug: 'cleaning-products', name: 'Cleaning Products', image: 'cleaning-products' },
      { slug: 'cleaning-household', name: 'Cleaning & Household', image: 'cleaning-household' },
      { slug: 'household', name: 'Detergents', image: 'omo-hand-washing-powder' },
    ],
    sections: [
      { title: 'Cleaning & Laundry', subtitle: 'Everyday household essentials', categorySlug: 'cleaning-products', query: shelf('cleaning-products') },
      { title: 'Tissue & Sanitary', subtitle: 'Tissue, diapers & pads', categorySlug: 'tissue-sanitary', query: shelf('tissue-sanitary') },
      { title: 'Kitchen & Household', subtitle: 'Cutlery, plastics & storage', categorySlug: 'household', query: shelf('household') },
      { title: 'Air Fresheners & Pest Control', subtitle: 'Fresheners, insecticides & shoe care', categorySlug: 'home-care', query: shelf('home-care') },
    ],
  },
  {
    slug: 'beauty',
    label: 'Beauty',
    title: 'Beauty & Personal Care',
    subcategories: [
      { slug: 'beauty-personal-care', name: 'Beauty & Personal Care', image: 'beauty-personal-care' },
      { slug: 'personal-care', name: 'Personal Care', image: 'sebamed-gentle-wash' },
    ],
    sections: [
      { title: 'Beauty & Hair', subtitle: 'Lotions, hair care & fragrance', categorySlug: 'beauty-personal-care', query: shelf('beauty-personal-care') },
      { title: 'Skin Care', subtitle: 'Dermatologist-favourite brands', categorySlug: 'skin-care', query: shelf('skin-care') },
      { title: 'Oral Care', subtitle: 'Toothpaste, brushes & mouthwash', categorySlug: 'oral-care', query: shelf('oral-care') },
    ],
  },
];

export const verticalBySlug = (slug: CategoryVertical): VerticalDefinition => verticals.find(v => v.slug === slug) ?? verticals[0];

/**
 * The shelf behind a name the app itself links to search with — a section's
 * "See All", a sub-category or Home tile, an aisle's "Browse all". Undefined
 * for anything else (typed searches) or when BC has no matching group.
 */
export const shelfForTerm = (term: string): LiveQuery | undefined => {
  const wanted = term.trim().toLowerCase();
  const named = (name: string) => name.toLowerCase() === wanted;

  for (const vertical of verticals) {
    const section = vertical.sections.find(entry => named(entry.title));
    if (section) return section.query;
  }
  for (const vertical of verticals) {
    if (named(vertical.label) || named(vertical.title)) {
      return { groups: [...new Set(vertical.sections.flatMap(section => section.query.groups))] };
    }
  }
  const tile =
    homeCategoryTiles.find(entry => named(entry.name)) ??
    verticals.flatMap(vertical => vertical.subcategories).find(entry => named(entry.name));
  const groups = tile ? groupsForCategory(tile.slug) : [];
  return groups.length > 0 ? { groups } : undefined;
};

/** Quick suggestions shown on the empty search screen (Screen 12b). */
export const popularSearches = [
  { emoji: '🥛', label: 'Fresh Milk' },
  { emoji: '🍞', label: 'Farm Bread' },
  { emoji: '🌾', label: 'Basmati Rice' },
  { emoji: '💊', label: 'Paracetamol 500mg' },
  { emoji: '🥑', label: 'Hass Avocado' },
  { emoji: '🧴', label: 'Hand Wash' },
];

export const searchSortOptions = ['Sort: Relevance', 'Category', 'In Stock Only', 'Price: Low-High'] as const;

/**
 * Department a product is counted under for reporting (Spending breakdown).
 *
 * Product `category` slugs are fine-grained ("pain-relief", "cleaning-products")
 * and several appear under more than one vertical, so resolution is by priority:
 * the most specific, most recognisable department wins. Pharmacy first so
 * medicines are never miscounted as groceries.
 */
const VERTICAL_PRIORITY: CategoryVertical[] = [
  'pharmacy',
  'deli',
  'liquor',
  'groceries',
  'household',
  'beauty',
  'wholesale',
  'retail',
];

const categoryVerticalIndex: Record<string, CategoryVertical> = {};

for (const slug of VERTICAL_PRIORITY) {
  const vertical = verticals.find(v => v.slug === slug);
  if (!vertical) continue;
  for (const section of vertical.sections) {
    if (!categoryVerticalIndex[section.categorySlug]) categoryVerticalIndex[section.categorySlug] = slug;
  }
  for (const sub of vertical.subcategories) {
    if (!categoryVerticalIndex[sub.slug]) categoryVerticalIndex[sub.slug] = slug;
  }
}

/** Resolves a product to the department it reports under. */
export const verticalForProduct = (product: Product): CategoryVertical =>
  categoryVerticalIndex[product.category] ??
  categoryBySlug(product.category)?.vertical ??
  'groceries';
