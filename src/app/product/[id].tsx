import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Fragment, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  Icon,
  LoadState,
  NoticePill,
  ProductCard,
  QuantityStepper,
  Rating,
  Screen,
  SectionHeader,
  Txt,
  TopBar,
  TopBarAction,
} from '@/components/ui';
import { deliverySlots, productById, productsByCategory, productsByIds, verticalBySlug, verticals } from '@/data/catalog';
import { figmaAsset } from '@/data/images';
import { fetchProduct, LIVE_PHARMACY_CATEGORIES, liveProductById, useLive } from '@/data/live-catalogue';
import type { CategoryVertical, Product } from '@/data/types';
import { discountPercent, formatKes } from '@/lib/format';
import { unitPrice, useCart } from '@/store/cart';
import { colors, layout, radius, spacing } from '@/theme';

/**
 * Screen 4 — Product Detail (grocery) and Screen 4b — Product Detail (Pharmacy).
 *
 * One route renders both frames: a pack is presented as pharmacy stock when it
 * sits in the Pharmacy & Wellness vertical or needs a prescription, and as a
 * grocery pack otherwise. Prices, savings and the footer total are computed
 * from the catalogue and the product's wholesale tier.
 */

/**
 * Aisles the Pharmacy & Wellness vertical owns. The catalogue also files
 * antacids under `digestive-health`, which no vertical lists, so it is named
 * here to keep those packs on the pharmacy presentation.
 */
const PHARMACY_CATEGORY: Record<string, true> = Object.fromEntries([
  ...verticalBySlug('pharmacy').subcategories.map(sub => [sub.slug, true] as const),
  ['digestive-health', true] as const,
  ...LIVE_PHARMACY_CATEGORIES.map(slug => [slug, true] as const),
]);

/**
 * Home aisle for every category slug. A few aisles (cleaning products,
 * beverages, liquor) are listed by more than one vertical; `verticals` is
 * ordered so the later definition is the aisle the Categories tab treats as
 * home, and later definitions win here too.
 */
const AISLE_BY_CATEGORY: Record<string, { vertical: CategoryVertical; label: string; name: string }> = Object.fromEntries(
  verticals.flatMap(vertical =>
    vertical.subcategories.map(sub => [sub.slug, { vertical: vertical.slug, label: vertical.label, name: sub.name }] as const),
  ),
);

/** Eyebrow printed above the title — the vertical's own wording where the frames name one. */
const VERTICAL_EYEBROW: Partial<Record<CategoryVertical, string>> = {
  household: 'Household Essential',
  pharmacy: 'PHARMACY MEDICATION',
};

/** Rail packs Screen 4 ("You may also like") prints, left to right. */
const GROCERY_RAIL = ['farm-greens-bundle', 'brookside-milk-500ml', 'vitamin-c-zinc-immunity'];
/** Rail packs Screen 4b ("Related Health Essentials") prints, left to right. */
const PHARMACY_RAIL = ['vitamin-c-1000mg', 'digital-thermometer', 'oral-rehydration-salts'];

/**
 * Copy the catalogue has no field for. Everything else on this screen is
 * derived from the product record.
 */
type ProductCopy = {
  /** Last breadcrumb crumb, where the frame names the aisle shorter than the category does. */
  crumb?: string;
  /** Active ingredients printed after the pack size on pharmacy packs. */
  composition?: string;
  /** Manufacturer printed beside the pharmacy eyebrow. */
  manufacturer?: string;
  /** Dosage guidance the leaflet prints. */
  dosage?: string[];
};

const PRODUCT_COPY: Record<string, ProductCopy> = {
  'harpic-detergent-1kg': { crumb: 'Cleaning' },
  'panadol-extra-16s': {
    crumb: 'Paracetamol',
    composition: 'Paracetamol 500mg + Caffeine 65mg',
    manufacturer: 'GSK Healthcare',
    dosage: [
      'Adults & children 12 years and over: 1 to 2 tablets every 4 to 6 hours as required.',
      'Do not exceed 8 tablets in 24 hours.',
      'Do not give to children under 12 years.',
    ],
  },
};

const BULK_BADGE = 'BULK SAVINGS';
const PHARMACIST_REVIEW = 'Requires Pharmacist Review';
const EXPRESS_NOTE = 'Available for 30-min Nairobi delivery';
const UNAVAILABLE_NOTE = 'Currently unavailable. Check back soon';
const REGULATED_NOTE = 'Fixed regulated retail price • Incl. VAT';
const RX_NOTICE = 'Rx Required · Upload prescription at checkout';
const AGE_NOTICE = '18+ only · Confirm your age at checkout';
const RETURN_NOTE =
  'Unopened items can be returned within 24 hours for a full M-Pesa refund. Our shopper collects them from your door.';

const EXPRESS_SERVICE = {
  title: '30-Min Nairobi Express',
  description: 'Fulfilled fresh from our Syokimau & Ruiru stores',
};

const PHARMACIST_SERVICE = {
  title: 'Collection or delivery after pharmacist approval',
  description:
    'Our registered Nairobi superintendent pharmacist verifies medical safety before dispatch. Ready within 45 mins.',
};

/** Patient-leaflet wording for the collapsed safety row (the frame never prints its body). */
const PHARMACY_SAFETY = [
  'Check with our pharmacist before use if pregnant, breastfeeding or taking prescription medicine.',
  'Keep out of reach of children.',
  'Stop use and speak to our pharmacist if symptoms continue beyond 3 days.',
];

const ASK_PHARMACIST = {
  title: 'Ask a Pharmacist about this',
  description: 'Free, confidential consultation via WhatsApp or in-app chat',
};

const SECTION = {
  description: 'Description',
  specifications: 'Product Specifications & Usage',
  delivery: 'Delivery & Returns',
  leaflet: 'DESCRIPTION, USAGE & DOSAGE',
  ingredients: 'ACTIVE INGREDIENTS & COMPOSITION',
  safety: 'SAFETY & CONTRAINDICATIONS',
  dispatch: 'PHARMACY DISPATCH & REGULATION',
};

const RELATED = {
  grocery: { title: 'You may also like', action: 'See All' },
  pharmacy: { title: 'Related Health Essentials', action: 'View All' },
};

/** Title-cases a category slug for crumbs and rows the verticals do not cover. */
const humanize = (slug: string): string =>
  slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

/** The frame's cross-aisle picks first, then same-aisle neighbours — three cards, never the pack itself. */
function relatedProducts(product: Product): Product[] {
  // Business Central items skip the frame's sample picks and show real neighbours only.
  const fromBc = liveProductById(product.id) !== undefined;
  const rail = fromBc ? [] : PHARMACY_CATEGORY[product.category] ? PHARMACY_RAIL : GROCERY_RAIL;
  const candidates = [...productsByIds(rail), ...productsByCategory(product.category)];
  const picked: Product[] = [];
  const seen = new Set([product.id]);

  for (const candidate of candidates) {
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    picked.push(candidate);
    if (picked.length === 3) break;
  }
  return picked;
}

/** App bar back: pops the history, or returns to the tab shell on a deep link. */
function useBack(): () => void {
  const router = useRouter();
  return () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };
}

export default function ProductDetailRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const goBack = useBack();
  const known = id ? productById(id) : undefined;
  // A deep link or a restored screen can name a BC item this device hasn't loaded yet.
  const live = useLive(`product:${id ?? ''}`, () => (known || !id ? Promise.resolve(known) : fetchProduct(id)), undefined);
  const product = known ?? live.data;

  if (!product && id && live.status !== 'ready') {
    return (
      <Screen padded={false}>
        <TopBar title="Product" onBack={goBack} />
        <LoadState status={live.status} noun="this product" placeholder="detail" onRetry={live.retry} />
      </Screen>
    );
  }

  if (!product) {
    return (
      <Screen padded={false}>
        <TopBar title="Product" onBack={goBack} />
        <EmptyState
          icon="help"
          title="Product not found"
          description={
            id
              ? `No pack matches “${id}”. It may have sold out, been renamed or moved to another aisle.`
              : 'This link is missing a product reference.'
          }
        >
          <Button label="Browse categories" variant="tonal" fullWidth={false} onPress={() => router.push('/(tabs)/categories')} />
        </EmptyState>
      </Screen>
    );
  }

  return <ProductDetail key={product.id} product={product} />;
}

function ProductDetail({ product }: { product: Product }) {
  const router = useRouter();
  const goBack = useBack();
  const cart = useCart();
  const [quantity, setQuantity] = useState(() => Math.max(1, cart.quantityOf(product.id)));
  const [saved, setSaved] = useState(false);

  const isPharmacy = product.rxRequired === true || PHARMACY_CATEGORY[product.category] === true;
  const [openSection, setOpenSection] = useState(isPharmacy ? SECTION.leaflet : '');

  const image = figmaAsset(product.image);
  const aisle = AISLE_BY_CATEGORY[product.category];
  const copy = PRODUCT_COPY[product.id];
  const eyebrow = aisle ? VERTICAL_EYEBROW[aisle.vertical] ?? aisle.label : undefined;
  const inStock = product.inStock !== false;

  /** "Home / Household / Cleaning" for grocery packs, "Pharmacy / Pain Relief / Paracetamol" for pharmacy. */
  const crumbs = (isPharmacy
    ? ['Pharmacy', aisle?.name ?? humanize(product.category), copy?.crumb]
    : ['Home', aisle?.label ?? 'Shop All', copy?.crumb ?? aisle?.name ?? humanize(product.category)]
  ).filter((crumb): crumb is string => crumb !== undefined);

  const tier =
    product.wholesalePrice !== undefined && product.wholesaleMinQty !== undefined
      ? {
          price: product.wholesalePrice,
          minQty: product.wholesaleMinQty,
          savePercent: discountPercent(product.wholesalePrice, product.price),
        }
      : undefined;

  const saving = product.wasPrice !== undefined ? product.wasPrice - product.price : 0;
  const lineTotal = unitPrice(product, quantity) * quantity;
  const reviewLabel =
    product.reviewCount === undefined
      ? undefined
      : isPharmacy
        ? `${product.reviewCount} verified patient reviews`
        : `${product.reviewCount} customer reviews`;

  const highlights = product.highlights ?? [];
  const related = relatedProducts(product);
  const relatedCopy = isPharmacy ? RELATED.pharmacy : RELATED.grocery;

  const specificationRows =
    product.specifications ?? [
      { label: 'Pack size', value: product.pack },
      { label: 'Aisle', value: aisle?.name ?? humanize(product.category) },
      { label: 'Availability', value: inStock ? 'In stock' : 'Out of stock' },
    ];

  const compositionRows = [
    ...(copy?.composition ? [{ label: 'Active ingredients', value: copy.composition }] : []),
    ...(product.specifications ?? [{ label: 'Pack size', value: product.pack }]),
  ];

  const toggle = (key: string) => setOpenSection(current => (current === key ? '' : key));

  const onAdd = () => {
    cart.add(product.id, quantity);
    if (product.rxRequired) router.push('/checkout');
  };

  return (
    <Screen
      padded={false}
      contentStyle={styles.content}
      footer={
        <View style={styles.footer}>
          {product.rxRequired ? <NoticePill label={RX_NOTICE} tone="danger" icon="prescription" /> : null}
          {product.ageRestricted ? <NoticePill label={AGE_NOTICE} tone="warning" icon="shield" /> : null}
          <View style={styles.footerRow}>
            <QuantityStepper
              quantity={quantity}
              min={1}
              tone="brand"
              onDecrement={() => setQuantity(current => Math.max(1, current - 1))}
              onIncrement={() => setQuantity(current => current + 1)}
            />
            <Button
              label={`Add to Cart · ${formatKes(lineTotal)}`}
              icon="cart"
              iconPosition="leading"
              fullWidth={false}
              style={styles.cta}
              onPress={onAdd}
            />
          </View>
        </View>
      }
    >
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={goBack} hitSlop={8} style={styles.back}>
          <Icon name="chevron-left" size={22} color="onSurface" />
        </Pressable>
        <View style={styles.crumbs}>
          {crumbs.map((label, index) => (
            <Fragment key={label}>
              {index > 0 ? (
                <Txt variant="titleSm" color="outline">
                  /
                </Txt>
              ) : null}
              {index === 0 ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Back to the previous screen" onPress={goBack} hitSlop={6}>
                  <Txt variant="titleSm" color="onSurfaceVariant">
                    {label}
                  </Txt>
                </Pressable>
              ) : (
                <Txt variant="titleSm" color={index === crumbs.length - 1 ? 'onSurface' : 'onSurfaceVariant'}>
                  {label}
                </Txt>
              )}
            </Fragment>
          ))}
        </View>
        <View style={styles.barActions}>
          <TopBarAction
            name="share"
            accessibilityLabel={`Share ${product.name}`}
            onPress={() => {
              void Share.share({ message: `${product.name}, ${formatKes(product.price)} on Xana Plus` }).catch(() => undefined);
            }}
          />
          <TopBarAction
            name={saved ? 'heart-filled' : 'heart'}
            accessibilityLabel={saved ? `Remove ${product.name} from saved items` : `Save ${product.name}`}
            onPress={() => setSaved(current => !current)}
          />
        </View>
      </View>

      <View style={styles.hero}>
        {image ? <Image source={image} style={styles.heroImage} contentFit="cover" transition={120} /> : null}
        <View style={styles.heroBadges}>
          {isPharmacy ? <NoticePill icon="shieldPlus" label={PHARMACIST_REVIEW} tone="brand" /> : null}
          {!isPharmacy && tier ? <Badge label={BULK_BADGE} tone="discount" /> : null}
          {!isPharmacy && eyebrow ? <NoticePill label={eyebrow} tone="info" /> : null}
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.headline}>
          {isPharmacy && eyebrow ? (
            <View style={styles.metaRow}>
              <NoticePill label={eyebrow} tone="info" />
              {copy?.manufacturer ? (
                <Txt variant="bodySm" color="onSurfaceVariant">
                  {`• ${copy.manufacturer}`}
                </Txt>
              ) : null}
            </View>
          ) : null}
          <Txt variant="headlineLg">{product.name}</Txt>
          <Txt variant="bodySm" color="onSurfaceVariant">
            {isPharmacy && copy?.composition ? `${product.pack} • ${copy.composition}` : product.pack}
          </Txt>
          {product.rating !== undefined ? <Rating value={product.rating} reviewLabel={reviewLabel} /> : null}
        </View>

        <View style={styles.priceBlock}>
          <View style={styles.priceRow}>
            <View style={styles.priceGroup}>
              <Txt variant="priceLg">{formatKes(product.price)}</Txt>
              {product.wasPrice !== undefined ? (
                <Txt variant="priceStrike" color="outline" style={styles.strike}>
                  {formatKes(product.wasPrice)}
                </Txt>
              ) : null}
              {saving > 0 ? <Badge label={`Save ${formatKes(saving)}`} tone="warning" /> : null}
            </View>
            {isPharmacy ? <NoticePill icon="check-circle" label="Licensed Pharmacy Stock" tone="info" /> : null}
          </View>
          {isPharmacy ? (
            <Txt variant="bodySm" color="onSurfaceVariant">
              {REGULATED_NOTE}
            </Txt>
          ) : (
            <View style={styles.stockRow}>
              <View style={[styles.stockDot, inStock ? null : styles.stockDotOut]} />
              <Txt variant="label" color={inStock ? 'primaryContainer' : 'error'}>
                {inStock ? 'In Stock' : 'Out of stock'}
              </Txt>
              <Txt variant="bodySm" color="onSurfaceVariant">
                {inStock ? `· ${EXPRESS_NOTE}` : `· ${UNAVAILABLE_NOTE}`}
              </Txt>
            </View>
          )}
        </View>

        {tier ? (
          <View style={styles.tierTable}>
            <View style={styles.tierRow}>
              <Txt variant="body">{`1 to ${tier.minQty - 1} units`}</Txt>
              <Txt variant="title">{`${formatKes(product.price)} each`}</Txt>
            </View>
            <View style={[styles.tierRow, styles.tierRowActive]}>
              <View style={styles.tierLeft}>
                <Txt variant="title" color="primary">{`${tier.minQty}+ units`}</Txt>
                <Txt variant="bodySm" color="onSurfaceVariant">
                  Wholesale price
                </Txt>
              </View>
              <View style={styles.tierRight}>
                <Badge label={`Save ${tier.savePercent}%`} tone="brand" />
                <Txt variant="title">{`${formatKes(tier.price)} each`}</Txt>
              </View>
            </View>
          </View>
        ) : null}

        {isPharmacy ? (
          <Card variant="outline" padding={spacing.md}>
            <View style={styles.serviceRow}>
              <View style={styles.serviceIcon}>
                <Icon name="pharmacy" size={20} color="primary" />
              </View>
              <View style={styles.serviceBody}>
                <Txt variant="title">{PHARMACIST_SERVICE.title}</Txt>
                <Txt variant="bodySm" color="onSurfaceVariant">
                  {PHARMACIST_SERVICE.description}
                </Txt>
              </View>
            </View>
          </Card>
        ) : (
          <View style={styles.express}>
            <View style={styles.serviceRow}>
              <View style={styles.serviceIcon}>
                <Icon name="delivery" size={20} color="primary" />
              </View>
              <View style={styles.serviceBody}>
                <Txt variant="title">{EXPRESS_SERVICE.title}</Txt>
                <Txt variant="bodySm" color="onSurfaceVariant">
                  {EXPRESS_SERVICE.description}
                </Txt>
              </View>
            </View>
          </View>
        )}

        {isPharmacy ? (
          <View style={styles.leaflets}>
            <AccordionCard title={SECTION.leaflet} expanded={openSection === SECTION.leaflet} onToggle={() => toggle(SECTION.leaflet)}>
              {product.description ? (
                <Txt variant="body" color="onSurfaceVariant">
                  {product.description}
                </Txt>
              ) : (
                compositionRows.map(row => <SpecRow key={row.label} label={row.label} value={row.value} />)
              )}
              {copy?.dosage ? (
                <View style={styles.dosage}>
                  <Txt variant="title" color="primary">
                    Recommended Dosage Guidelines:
                  </Txt>
                  {copy.dosage.map(line => (
                    <Bullet key={line} text={line} />
                  ))}
                </View>
              ) : (
                highlights.map(line => <Bullet key={line} text={line} />)
              )}
            </AccordionCard>

            <AccordionCard title={SECTION.ingredients} expanded={openSection === SECTION.ingredients} onToggle={() => toggle(SECTION.ingredients)}>
              {compositionRows.map(row => (
                <SpecRow key={row.label} label={row.label} value={row.value} />
              ))}
            </AccordionCard>

            <AccordionCard title={SECTION.safety} expanded={openSection === SECTION.safety} onToggle={() => toggle(SECTION.safety)}>
              {PHARMACY_SAFETY.map(line => (
                <Bullet key={line} text={line} />
              ))}
            </AccordionCard>

            <AccordionCard title={SECTION.dispatch} expanded={openSection === SECTION.dispatch} onToggle={() => toggle(SECTION.dispatch)}>
              <Txt variant="body" color="onSurfaceVariant">
                {PHARMACIST_SERVICE.description}
              </Txt>
              {deliverySlots.map(slot => (
                <SlotRow key={slot.id} label={`${slot.label} · ${slot.window}`} note={slot.free ? 'Free' : undefined} />
              ))}
            </AccordionCard>
          </View>
        ) : (
          <View style={styles.grocerySections}>
            {product.description || highlights.length > 0 ? (
              <View style={styles.description}>
                <Txt variant="headlineLg">{SECTION.description}</Txt>
                {product.description ? (
                  <Txt variant="bodyLg" color="onSurfaceVariant">
                    {product.description}
                  </Txt>
                ) : null}
                {highlights.map(line => (
                  <Bullet key={line} text={line} />
                ))}
              </View>
            ) : null}

            <View>
              <Divider />
              <AccordionRow
                title={SECTION.specifications}
                expanded={openSection === SECTION.specifications}
                onToggle={() => toggle(SECTION.specifications)}
              >
                {specificationRows.map(row => (
                  <SpecRow key={row.label} label={row.label} value={row.value} />
                ))}
              </AccordionRow>
              <Divider />
              <AccordionRow title={SECTION.delivery} expanded={openSection === SECTION.delivery} onToggle={() => toggle(SECTION.delivery)}>
                <Txt variant="bodySm" color="onSurfaceVariant">
                  {RETURN_NOTE}
                </Txt>
                {deliverySlots.map(slot => (
                  <SlotRow key={slot.id} label={`${slot.label} · ${slot.window}`} note={slot.free ? 'Free' : undefined} />
                ))}
              </AccordionRow>
              <Divider />
            </View>
          </View>
        )}
      </View>

      {related.length > 0 ? (
        <View style={styles.railSection}>
          <SectionHeader
            title={relatedCopy.title}
            actionLabel={relatedCopy.action}
            onAction={() => router.push(isPharmacy ? '/(tabs)/pharmacy' : '/(tabs)/categories')}
            style={styles.railHead}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {related.map(item => (
              <ProductCard
                key={item.id}
                product={item}
                width={layout.productCardWidth}
                quantity={cart.quantityOf(item.id)}
                onPress={() => router.push(`/product/${item.id}`)}
                onAdd={() => cart.add(item.id)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {isPharmacy ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ASK_PHARMACIST.title}
          onPress={() => router.push('/(tabs)/pharmacy')}
          style={({ pressed }) => [styles.ask, pressed ? styles.askPressed : null]}
        >
          <View style={styles.askIcon}>
            <Icon name="message" size={20} color="primary" />
          </View>
          <View style={styles.askBody}>
            <Txt variant="title">{ASK_PHARMACIST.title}</Txt>
            <Txt variant="bodySm" color="onSurfaceVariant">
              {ASK_PHARMACIST.description}
            </Txt>
          </View>
          <Icon name="arrow-right" size={20} color="primary" />
        </Pressable>
      ) : null}
    </Screen>
  );
}

/** Bordered leaflet card — Screen 4b's pharmacy sections. */
function AccordionCard({
  title,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <Card variant="outline" padding={0}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={styles.leafletHead}
      >
        <Txt variant="label" style={styles.leafletTitle}>
          {title}
        </Txt>
        <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="primary" />
      </Pressable>
      {expanded ? (
        <>
          <Divider />
          <View style={styles.leafletBody}>{children}</View>
        </>
      ) : null}
    </Card>
  );
}

/** Hairline-separated row — Screen 4's grocery sections. */
function AccordionRow({
  title,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <View>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={onToggle} style={styles.accordionRow}>
        <Txt variant="titleLg" style={styles.accordionTitle}>
          {title}
        </Txt>
        <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="onSurfaceVariant" />
      </Pressable>
      {expanded ? <View style={styles.accordionBody}>{children}</View> : null}
    </View>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bullet}>
      <View style={styles.bulletDot} />
      <Txt variant="body" color="onSurfaceVariant" style={styles.bulletText}>
        {text}
      </Txt>
    </View>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.specRow}>
      <Txt variant="bodySm" color="onSurfaceVariant" style={styles.specLabel}>
        {label}
      </Txt>
      <Txt variant="label" style={styles.specValue}>
        {value}
      </Txt>
    </View>
  );
}

function SlotRow({ label, note }: { label: string; note?: string }) {
  return (
    <View style={styles.slotRow}>
      <Txt variant="bodySm" color="onSurfaceVariant" style={styles.slotLabel}>
        {label}
      </Txt>
      {note ? (
        <Txt variant="labelSm" color="primary">
          {note}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.xl, paddingTop: 0 },
  body: { marginHorizontal: layout.screenMargin, gap: spacing.lg },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: layout.headerHeight,
    paddingHorizontal: layout.screenMargin,
  },
  back: { width: 28, height: 28, alignItems: 'flex-start', justifyContent: 'center' },
  crumbs: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  barActions: { flexDirection: 'row', alignItems: 'center' },
  hero: { aspectRatio: 1, backgroundColor: colors.surfaceContainerLow },
  heroImage: { width: '100%', height: '100%' },
  heroBadges: { position: 'absolute', top: spacing.lg, left: spacing.lg, right: spacing.lg, alignItems: 'flex-start', gap: spacing.sm },
  headline: { gap: spacing.xxs },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  priceBlock: { gap: spacing.sm },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  priceGroup: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  strike: { textDecorationLine: 'line-through' },
  stockRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
  stockDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.success },
  stockDotOut: { backgroundColor: colors.error },
  tierTable: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outlineSoft30, overflow: 'hidden' },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  tierRowActive: { backgroundColor: colors.successContainer },
  tierLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  tierRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  express: { backgroundColor: colors.surfaceContainerLow, borderRadius: radius.lg, padding: spacing.md },
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  serviceIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.mintSurface, alignItems: 'center', justifyContent: 'center' },
  serviceBody: { flex: 1, gap: spacing.xxs },
  grocerySections: { gap: spacing.md },
  description: { gap: spacing.md },
  accordionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingVertical: spacing.lg },
  accordionTitle: { flexShrink: 1 },
  accordionBody: { gap: spacing.sm, paddingBottom: spacing.lg },
  leaflets: { gap: spacing.md },
  leafletHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, padding: spacing.lg },
  leafletTitle: { flexShrink: 1 },
  leafletBody: { gap: spacing.md, padding: spacing.lg },
  dosage: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.mintSurface },
  bullet: { flexDirection: 'row', gap: spacing.sm },
  bulletDot: { width: 5, height: 5, borderRadius: radius.pill, backgroundColor: colors.outline, marginTop: spacing.sm },
  bulletText: { flex: 1 },
  specRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  specLabel: { flexShrink: 0 },
  specValue: { flexShrink: 1, textAlign: 'right' },
  slotRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  slotLabel: { flexShrink: 1 },
  railSection: { gap: spacing.md },
  railHead: { marginHorizontal: layout.screenMargin },
  rail: { gap: layout.gutter, paddingHorizontal: layout.screenMargin, paddingRight: layout.screenMargin + spacing.xl },
  ask: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: layout.screenMargin,
    padding: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.mintEdge,
    backgroundColor: colors.mintSubtle,
  },
  askPressed: { opacity: 0.9 },
  askIcon: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  askBody: { flex: 1, gap: spacing.xxs },
  footer: { gap: spacing.md },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cta: { flex: 1 },
});
