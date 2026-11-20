import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useTabScrollTop } from '@/components/nav/use-tab-scroll-top';
import {
  Badge,
  BottomSheet,
  Button,
  Card,
  Chip,
  Icon,
  LoadState,
  Screen,
  SearchBar,
  SectionHeader,
  SelectableOption,
  Txt,
  type IconName,
} from '@/components/ui';
import { useTabBack } from '@/components/nav/use-tab-back';
import { Masthead } from '@/components/nav/masthead';
import { StoreChooser } from '@/features/store/store-chooser';
import { ProductAddButton } from '@/components/ui/product-add-button';
import { ProductPhoto } from '@/components/ui/product-photo';
import { pharmacyQuickActions, verticalBySlug } from '@/data/catalog';
import { figmaAsset } from '@/data/images';
import { useShelves } from '@/data/live-catalogue';
import type { Product } from '@/data/types';
import { discountPercent, formatKes } from '@/lib/format';
import { useOffer } from '@/lib/use-offer';
import { useCart } from '@/store/cart';
import { useFulfilment } from '@/store/fulfilment';
import { useSession } from '@/store/session';
import { elevation, layout, radius, spacing } from '@/theme';
import { useTheme, useThemeStyles } from '@/theme/provider';
import type { Palette } from '@/theme';
import { PharmacistWhatsAppSheet } from '@/features/pharmacy/whatsapp-sheet';
import { PressableScale } from '@/components/ui/pressable-scale';
import { LAUNCH_SCOPE } from '@/lib/launch-scope';

/**
 * The three prescription groups (GENERAL / CHRONIC / CONTROLLED in BC). Their photos are
 * hidden, so they share one text list instead of three rails of empty photo boxes.
 */
const RX_SLUGS: readonly string[] = ['medicines', 'chronic-care', 'controlled-medicines'];
/** Rows in the prescription list on "All"; the Prescription chip shows every loaded row. */
const RX_PREVIEW_ROWS = 6;

/**
 * Photo rows, in screen order: beauty leads (best photos, browsed rather than searched,
 * December gifting), then everyday remedies, then vitamins (owner, 19 Nov 2026).
 */
const PHOTO_SLUGS: readonly string[] = ['skin-care', 'otc-medicines', 'vitamins-supplements'];
const PHOTO_SECTIONS = PHOTO_SLUGS.flatMap(slug => verticalBySlug('pharmacy').sections.filter(section => section.categorySlug === slug));

/** The first rail's "you can swipe me" hint plays once per app launch. */
let railHintShown = false;
/** How far the hint slides the first rail, and when. */
const RAIL_HINT = { distance: 72, delayMs: 700, holdMs: 450 } as const;

/** Filter chips above the product groups — `null` shows every group. */
const PHARMACY_FILTERS: readonly { label: string; categorySlugs: readonly string[] | null }[] = [
  { label: 'All Pharmacy', categorySlugs: null },
  // Buy-now groups with photos first, then one chip for the prescription groups together,
  // as on the website (owner, 29 Oct 2026).
  ...PHOTO_SECTIONS.map(section => ({ label: section.title, categorySlugs: [section.categorySlug] })),
  { label: 'Prescription', categorySlugs: RX_SLUGS },
];

type IntakeChoice = { id: string; title: string; description: string; icon: IconName };

type IntakeAction = {
  id: string;
  /** Sheet title — matches the quick action that opened it. */
  title: string;
  description: string;
  choices: readonly IntakeChoice[];
  submitLabel: string;
  confirmationTitle: string;
  confirmation: string;
};

/**
 * Intake flows behind the four pharmacy quick actions and the skin-analysis
 * promo. Prescriptions and pharmacist chats require an account, so those two
 * route to sign-in first (see `runAction`).
 */
const INTAKE_ACTIONS: readonly IntakeAction[] = [
  {
    id: 'upload-rx',
    title: 'Upload Rx',
    description: 'Send a photo of your prescription. A licensed pharmacist verifies it before the order is dispensed.',
    choices: [
      { id: 'photograph', title: 'Photograph the prescription', description: 'Include the doctor’s signature, stamp and date', icon: 'scan' },
      { id: 'file', title: 'Upload from files', description: 'Clinic printouts, e-prescriptions and referrals', icon: 'receipt' },
    ],
    submitLabel: 'Send to pharmacist',
    confirmationTitle: 'Prescription received',
    confirmation: 'A licensed pharmacist verifies it and calls you back within 15 minutes.',
  },
  {
    id: 'consult',
    title: 'Consult Doctor',
    description: 'Speak to a licensed clinician about symptoms, dosage or a repeat prescription.',
    choices: [
      { id: 'video', title: 'Video consultation', description: 'Ten-minute call with a general practitioner', icon: 'phone' },
      { id: 'callback', title: 'Call me back', description: 'A doctor rings the number on your account', icon: 'clock' },
      { id: 'chat', title: 'In-app chat', description: 'Type your symptoms and attach photos', icon: 'message' },
    ],
    submitLabel: 'Request consultation',
    confirmationTitle: 'Consultation requested',
    confirmation: 'Our clinical team confirms your slot by SMS shortly.',
  },
  {
    id: 'prescriptions',
    title: 'My Prescriptions',
    description: 'Repeat, transfer or track a prescription with your pharmacy team.',
    choices: [
      { id: 'repeat', title: 'Repeat a prescription', description: 'Reorder what a pharmacist dispensed for you last', icon: 'refresh' },
      { id: 'transfer', title: 'Transfer from another pharmacy', description: 'We verify the original script with your prescriber', icon: 'prescription' },
      { id: 'track', title: 'Track a prescription', description: 'Check verification status and refill timing', icon: 'clock' },
    ],
    submitLabel: 'Continue',
    confirmationTitle: 'Request received',
    confirmation: 'Your pharmacist confirms the next step by SMS within 15 minutes.',
  },
  {
    id: 'ask',
    title: 'Ask a Pharmacist',
    description: 'Free, confidential clinical consultation via WhatsApp or real-time in-app chat.',
    choices: [
      { id: 'whatsapp', title: 'WhatsApp chat', description: 'Continue the consultation on the pharmacy WhatsApp line', icon: 'phone' },
      { id: 'in-app', title: 'In-app chat', description: 'Chat with the pharmacist without leaving the app', icon: 'message' },
    ],
    submitLabel: 'Start chat',
    confirmationTitle: 'Chat requested',
    confirmation: 'A pharmacist replies within a few minutes. Keep this screen open or check WhatsApp.',
  },
  {
    id: 'skin-analysis',
    title: 'Free Skin Analysis This Week',
    description: 'Get a personalised skincare consultation, free with any purchase.',
    choices: [
      { id: 'dryness', title: 'Dryness, redness & sensitivity', description: 'Barrier repair and fragrance-free routines', icon: 'heart' },
      { id: 'acne', title: 'Acne & breakouts', description: 'Cleansing, actives and daily sun protection', icon: 'sparkle' },
      { id: 'pigmentation', title: 'Pigmentation & ageing', description: 'Brightening steps and an SPF routine', icon: 'eye' },
    ],
    submitLabel: 'Book free analysis',
    confirmationTitle: 'Analysis booked',
    confirmation: 'A skincare consultant confirms your slot. The analysis is free with any purchase.',
  },
];

/** Square packshot inside a rail card: card width minus the card's side padding. */
const CARD_IMAGE_SIZE = layout.productCardWidth - spacing.md * 2;

/** Actions that need an account before a pharmacist can handle the request. */
// The in-app chat needs an account; WhatsApp (used while the chat is off) does not.
const ACCOUNT_REQUIRED = LAUNCH_SCOPE.pharmacistChat ? ['prescriptions', 'ask'] : ['prescriptions'];

/** Screen 8a — Pharmacy & Wellness. */
export default function PharmacyRoute() {
  const scrollTop = useTabScrollTop();
  const { colors, gradients } = useTheme();
  const styles = useThemeStyles(createStyles);
  const router = useRouter();
  const goBack = useTabBack();
  const cart = useCart();
  const { store } = useFulfilment();
  const { isAuthenticated } = useSession();
  const [filter, setFilter] = useState(PHARMACY_FILTERS[0]);
  const [openIntake, setOpenIntake] = useState<string | null>(null);
  const [choice, setChoice] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [storeSheetOpen, setStoreSheetOpen] = useState(false);

  const vertical = verticalBySlug('pharmacy');
  const shows = (slug: string) => !filter.categorySlugs || filter.categorySlugs.includes(slug);
  const photoSections = PHOTO_SECTIONS.filter(section => shows(section.categorySlug));
  const showRx = RX_SLUGS.some(shows);
  const shelves = useShelves(vertical.sections, 8);

  // Swipe hint: once the first rail has products, slide it a little left and back,
  // so customers see the row scrolls sideways. Skipped with Reduce Motion, and a
  // touch on the rail before it plays cancels it.
  const firstRail = useRef<ScrollView>(null);
  const reduceMotion = useReducedMotion();
  const firstRailCount = photoSections[0] ? (shelves.data[photoSections[0].title] ?? []).length : 0;
  const hintTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cancelHint = () => {
    railHintShown = true;
    hintTimers.current.forEach(clearTimeout);
    hintTimers.current = [];
  };
  useFocusEffect(
    useCallback(() => {
      if (railHintShown || reduceMotion || firstRailCount < 3) return undefined;
      hintTimers.current = [
        setTimeout(() => {
          railHintShown = true;
          firstRail.current?.scrollTo({ x: RAIL_HINT.distance, animated: true });
        }, RAIL_HINT.delayMs),
        setTimeout(() => {
          hintTimers.current = [];
          firstRail.current?.scrollTo({ x: 0, animated: true });
        }, RAIL_HINT.delayMs + RAIL_HINT.holdMs),
      ];
      return () => {
        // Leaving mid-hint: stop it and put the row back at the start.
        if (hintTimers.current.length) firstRail.current?.scrollTo({ x: 0, animated: false });
        hintTimers.current.forEach(clearTimeout);
        hintTimers.current = [];
      };
    }, [reduceMotion, firstRailCount]),
  );
  // Take turns across Medicines, Chronic Care and Controlled so the short list shows all three.
  const rxProducts = (() => {
    const lists = vertical.sections
      .filter(section => RX_SLUGS.includes(section.categorySlug))
      .map(section => shelves.data[section.title] ?? []);
    const merged: Product[] = [];
    for (let row = 0; lists.some(list => row < list.length); row += 1) {
      lists.forEach(list => {
        if (row < list.length) merged.push(list[row]);
      });
    }
    return filter.categorySlugs ? merged : merged.slice(0, RX_PREVIEW_ROWS);
  })();
  /** "See all" opens that group in full on its own page, never a search. */
  const openAisle = (slug: string) => router.push({ pathname: '/aisle', params: { vertical: 'pharmacy', slug } });
  const intake = INTAKE_ACTIONS.find(action => action.id === openIntake) ?? null;

  /** Quick actions and the promo link: gate account-bound flows, then open the sheet. */
  const runAction = (id: string) => {
    if (!isAuthenticated && ACCOUNT_REQUIRED.includes(id)) {
      router.push('/login');
      return;
    }
    // Quick actions that now have real screens route to them; the rest still
    // open their intake sheet.
    if (id === 'prescriptions') {
      router.push('/pharmacy/prescriptions');
      return;
    }
    if (id === 'upload-rx') {
      router.push('/pharmacy/upload');
      return;
    }
    if (id === 'ask') {
      // The in-app chat has sample replies; until it is real, pharmacists answer on WhatsApp.
      if (LAUNCH_SCOPE.pharmacistChat) router.push('/pharmacy/consult');
      else setAskOpen(true);
      return;
    }
    if (id === 'consult') {
      // expo-router's typed-routes generator doesn't yet alias this nested
      // index folder to its bare path; the literal below is the correct route.
      router.push('/pharmacy/clinical' as Parameters<typeof router.push>[0]);
      return;
    }
    const action = INTAKE_ACTIONS.find(entry => entry.id === id);
    if (!action) return;
    setChoice(action.choices[0]?.id ?? '');
    setSubmitted(false);
    setOpenIntake(id);
  };

  const closeIntake = () => {
    setOpenIntake(null);
    setSubmitted(false);
  };

  return (
    <Screen padded={false} contentStyle={styles.content} scrollRef={scrollTop} edgeToEdgeTop>
      {/* App bar, search field and quick actions sit flush; groups below are spaced. */}
      <View>
        <Masthead
          title="Pharmacy"
          subtitle={`Licensed pharmacy at ${store.name.replace('Xana Plus ', '')}. Prescription orders are checked by a pharmacist.`}
          onBack={goBack}
          onChangeStore={() => setStoreSheetOpen(true)}
        />

        <View style={styles.inset}>
          <SearchBar
            placeholder="Search medicines and wellness products"
            onPress={() => router.push('/search')}
            trailingIcon="scan"
            onTrailingPress={() => router.push('/scan')}
            style={styles.searchField}
          />
        </View>

        {/* The reason to open a pharmacy: send a prescription. One clear action, then the two helpers. */}
        <View style={[styles.inset, styles.rxBlock]}>
          <Card variant="flat" padding={spacing.lg} radiusSize={radius.xl} style={styles.rxHero}>
            <View style={styles.rxHeroHead}>
              <View style={styles.rxHeroText}>
                {/* Prescriptions are attached at checkout; a stand-alone upload reaches no one yet (LAUNCH_SCOPE.rxUploadAlone). */}
                <Txt variant="headlineSm">{LAUNCH_SCOPE.rxUploadAlone ? 'Have a prescription?' : 'Order prescription medicine'}</Txt>
                <Txt variant="bodySm" color="onSurfaceVariant">
                  {LAUNCH_SCOPE.rxUploadAlone
                    ? 'Send a photo. A pharmacist checks it before your order is packed.'
                    : 'Add the medicine to your basket, then attach a photo of your prescription at checkout. A pharmacist checks it before your order is packed.'}
                </Txt>
              </View>
            </View>
            {LAUNCH_SCOPE.rxUploadAlone ? (
              <Button label="Upload prescription" icon="scan" iconPosition="leading" onPress={() => runAction('upload-rx')} />
            ) : (
              <Button label="Find prescription medicine" onPress={() => openAisle('medicines')} />
            )}
          </Card>

          <View style={styles.helperRow}>
            {pharmacyQuickActions
              .filter(action => action.id !== 'upload-rx' && (LAUNCH_SCOPE.clinicalServices || action.id !== 'consult'))
              .map(action => (
                <PressableScale
                  key={action.id}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  onPress={() => runAction(action.id)}
                  style={styles.helper}
                >
                  <Icon name={action.icon} size={20} color="primaryAccent" />
                  <Txt variant="label" numberOfLines={2} style={styles.helperLabel}>
                    {action.label}
                  </Txt>
                </PressableScale>
              ))}
          </View>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {PHARMACY_FILTERS.map(entry => (
          <Chip
            key={entry.label}
            label={entry.label}
            selected={filter.label === entry.label}
            onPress={() => setFilter(entry)}
          />
        ))}
      </ScrollView>

      {shelves.status !== 'ready' ? <LoadState status={shelves.status} placeholder="rail" inset onRetry={shelves.retry} /> : null}

      {photoSections.map((section, index) => (
        <View key={section.title} style={[styles.inset, styles.section]}>
          <SectionHeader title={section.title} actionLabel="See All" onAction={() => openAisle(section.categorySlug)} />
          <ScrollView
            ref={index === 0 ? firstRail : undefined}
            onScrollBeginDrag={index === 0 ? cancelHint : undefined}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.railBleed}
            contentContainerStyle={styles.rail}
          >
            {(shelves.data[section.title] ?? []).map(product => (
              <PharmacyCard
                key={product.id}
                product={product}
                quantity={cart.quantityOf(product.id)}
                onPress={() => router.push(`/product/${product.id}`)}
                onAdd={() => cart.add(product.id)}
              />
            ))}
          </ScrollView>
        </View>
      ))}

      {showRx && rxProducts.length > 0 ? (
        <View style={[styles.inset, styles.section]}>
          <View style={styles.rxListHead}>
            <SectionHeader title="Prescription medicines" />
            <Txt variant="bodySm" color="onSurfaceVariant">
              Add to your basket, then attach your prescription at checkout.
            </Txt>
          </View>
          <View style={styles.rxList}>
            {rxProducts.map((product, index) => (
              <RxRow
                key={product.id}
                product={product}
                first={index === 0}
                quantity={cart.quantityOf(product.id)}
                onPress={() => router.push(`/product/${product.id}`)}
                onAdd={() => cart.add(product.id)}
              />
            ))}
            <PressableScale
              accessibilityRole="button"
              onPress={() => openAisle('medicines')}
              style={styles.rxSeeAll}
            >
              <Txt variant="label" color="primaryAccent">
                See all prescription medicines
              </Txt>
              <Icon name="chevron-right" size={14} color="primaryAccent" />
            </PressableScale>
          </View>
        </View>
      ) : null}

      <View style={[styles.inset, styles.bottomBand]}>
        {LAUNCH_SCOPE.skinAnalysis ? <LinearGradient colors={gradients.promoHero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.promo}>
          <View style={styles.promoGlyph}>
            <Icon name="sparkle" size={20} color="primaryAccent" />
          </View>
          <Txt variant="label" style={styles.promoBody}>
            <Txt variant="label" tint={colors.primaryAccent}>
              Free Skin Analysis This Week · Get a
            </Txt>
            {' personalised skincare consultation, free with any purchase.'}
          </Txt>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Learn more about the free skin analysis"
            onPress={() => runAction('skin-analysis')}
            style={({ pressed }) => [styles.promoLink, pressed ? styles.pressed : null]}
          >
            <Txt variant="label" color="primaryAccent">
              Learn More
            </Txt>
            <Icon name="arrow-right" size={16} color="primaryAccent" />
          </Pressable>
        </LinearGradient> : null}

        {/* No PPB licence line until there is a licence number to show (Play release check, 20 Nov 2026). */}
      </View>

      <BottomSheet
        visible={intake !== null}
        onClose={closeIntake}
        title={intake?.title}
        description={intake?.description}
        footer={
          intake ? (
            <Button
              label={submitted ? 'Done' : intake.submitLabel}
              onPress={() => {
                if (submitted) closeIntake();
                else setSubmitted(true);
              }}
            />
          ) : null
        }
      >
        {intake ? (
          submitted ? (
            <View style={styles.confirmation}>
              <Icon name="check-circle" size={28} color="success" />
              <Txt variant="titleLg">{intake.confirmationTitle}</Txt>
              <Txt variant="bodySm" color="onSurfaceVariant">
                {intake.confirmation}
              </Txt>
            </View>
          ) : (
            intake.choices.map(option => (
              <SelectableOption
                key={option.id}
                title={option.title}
                description={option.description}
                icon={option.icon}
                selected={choice === option.id}
                onPress={() => setChoice(option.id)}
              />
            ))
          )
        ) : null}
      </BottomSheet>
      <PharmacistWhatsAppSheet visible={askOpen} onClose={() => setAskOpen(false)} />
      <StoreChooser visible={storeSheetOpen} onClose={() => setStoreSheetOpen(false)} />
    </Screen>
  );
}

/**
 * Compact pharmacy rail card: square packshot with the `Rx Required` flag, the
 * pack line, the product name, then the two-decimal price and add control.
 */
function PharmacyCard({
  product,
  quantity,
  onPress,
  onAdd,
}: {
  product: Product;
  quantity: number;
  onPress: () => void;
  onAdd: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const image = figmaAsset(product.image);
  const offer = useOffer(product);

  return (
    <View style={styles.card}>
      <View style={styles.cardImageWrap}>
        <ProductPhoto source={image} productId={product.id} accessibilityLabel={`${product.name} product photo`} variant="card" />
        {product.rxRequired ? (
          <Badge label="Rx Required" tone="brand" style={styles.rxBadge} />
        ) : offer ? (
          <Badge label={`SAVE ${discountPercent(offer.price, product.price)}%`} tone="discount" style={styles.rxBadge} />
        ) : null}
      </View>

      <View style={styles.cardText}>
        <Txt variant="label" color="onSurfaceVariant" numberOfLines={1}>
          {product.pack}
        </Txt>
        <Txt variant="title" numberOfLines={2}>
          {product.name}
        </Txt>
      </View>

      {/* Card-wide tap target; a sibling of the add control, never its parent. */}
      <Pressable accessibilityRole="button" accessibilityLabel={product.name} onPress={onPress} style={styles.cardOverlay} />

      <View style={styles.cardFooter}>
        <Txt variant="titleLg" tint={colors.primaryAccent} style={styles.cardPrice}>
          {formatKes(offer?.price ?? product.price)}
        </Txt>
        {quantity > 0 ? (
          <View style={styles.qtyPill}>
            <Txt variant="label" tint={colors.onPrimary}>
              {quantity}
            </Txt>
          </View>
        ) : product.rxRequired ? (
          <ProductAddButton productName={product.name} onPress={onAdd} rxRequired />
        ) : (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`Add ${product.name} to cart`}
            onPress={onAdd}
            hitSlop={6}
            style={styles.addButton}
          >
            <Icon name="plus" size={18} color="onPrimary" />
          </PressableScale>
        )}
      </View>
    </View>
  );
}

/**
 * One prescription medicine as a price-list row: name and pack, the till price and the
 * prescription add control. No photo box: these groups' photos are hidden.
 */
function RxRow({
  product,
  first,
  quantity,
  onPress,
  onAdd,
}: {
  product: Product;
  first: boolean;
  quantity: number;
  onPress: () => void;
  onAdd: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const offer = useOffer(product);

  return (
    <View style={[styles.rxRow, first ? null : styles.rxRowDivider]}>
      {/* Row-wide tap target; a sibling of the add control, never its parent. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${product.name}, ${product.pack}, ${formatKes(offer?.price ?? product.price)}`}
        onPress={onPress}
        style={({ pressed }) => [styles.cardOverlay, pressed ? styles.rxRowPressed : null]}
      />
      <View style={styles.rxRowText} pointerEvents="none">
        <Txt variant="title" numberOfLines={2}>
          {product.name}
        </Txt>
        <Txt variant="label" color="onSurfaceVariant" numberOfLines={1}>
          {product.pack}
        </Txt>
      </View>
      <Txt variant="title" tint={colors.primaryAccent} style={styles.rxRowPrice}>
        {formatKes(offer?.price ?? product.price)}
      </Txt>
      {quantity > 0 ? (
        <View style={styles.qtyPill}>
          <Txt variant="label" tint={colors.onPrimary}>
            {quantity}
          </Txt>
        </View>
      ) : (
        <ProductAddButton productName={product.name} onPress={onAdd} rxRequired />
      )}
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  content: { gap: spacing.xxxl },
  inset: { marginHorizontal: layout.screenMargin },
  pressed: { opacity: 0.94 },
  cardOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchField: { borderRadius: radius.lg },
  rxBlock: { gap: spacing.sm, marginTop: spacing.md },
  rxHero: { gap: spacing.md },
  rxHeroHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  rxHeroGlyph: {
    width: spacing.giant,
    height: spacing.giant,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rxHeroText: { flex: 1, gap: spacing.xxs },
  helperRow: { flexDirection: 'row', gap: spacing.sm },
  helper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: layout.touchTarget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainerLow,
  },
  helperLabel: { flexShrink: 1 },
  rxListHead: { gap: spacing.xxs },
  rxList: {
    paddingHorizontal: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    ...elevation.card,
  },
  rxRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  rxRowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.outlineVariant },
  rxRowPressed: { backgroundColor: colors.surfaceContainerLow },
  rxRowText: { flex: 1, gap: spacing.xxs },
  rxRowPrice: { flexShrink: 0 },
  rxSeeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minHeight: layout.touchTarget,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.outlineVariant,
  },
  chipRow: { gap: spacing.sm, paddingHorizontal: layout.screenMargin },
  section: { gap: spacing.md },
  // Rails sit in an inset section but scroll edge to edge, so cards aren't clipped at the margin (and the shadow isn't cut off).
  railBleed: { marginHorizontal: -layout.screenMargin },
  rail: { gap: layout.gutter, paddingHorizontal: layout.screenMargin, paddingVertical: spacing.xs },
  card: {
    width: layout.productCardWidth,
    padding: spacing.md,
    gap: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    ...elevation.card,
  },
  cardImageWrap: {
    height: CARD_IMAGE_SIZE,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  rxBadge: { position: 'absolute', top: spacing.sm, left: spacing.sm },
  cardText: { flexGrow: 1, gap: spacing.xxs },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  cardPrice: { flexShrink: 1 },
  addButton: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.hairline,
  },
  qtyPill: {
    minWidth: 34,
    height: 34,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBand: { gap: spacing.md },
  promo: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.xl },
  promoGlyph: {
    width: spacing.giant,
    height: spacing.giant,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoBody: { flex: 1 },
  promoLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, paddingVertical: spacing.sm },
  confirmation: { gap: spacing.sm, alignItems: 'flex-start' },
});
