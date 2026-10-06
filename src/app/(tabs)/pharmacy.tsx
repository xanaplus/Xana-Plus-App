import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

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
  TopBar,
  TopBarAction,
  Txt,
  type IconName,
} from '@/components/ui';
import { ProductPhoto } from '@/components/ui/product-photo';
import { pharmacyQuickActions, verticalBySlug } from '@/data/catalog';
import { figmaAsset } from '@/data/images';
import { useShelves } from '@/data/live-catalogue';
import type { Product } from '@/data/types';
import { formatKesDecimal } from '@/lib/format';
import { useCart } from '@/store/cart';
import { useFulfilment } from '@/store/fulfilment';
import { useSession } from '@/store/session';
import { colors, elevation, gradients, layout, radius, spacing } from '@/theme';

/** Clinical filter chips above the product groups — `null` shows every group. */
const PHARMACY_FILTERS: readonly { label: string; categorySlug: string | null }[] = [
  { label: 'All Pharmacy', categorySlug: null },
  { label: 'Pain Relief', categorySlug: 'pain-relief' },
  { label: 'Vitamins & Supplements', categorySlug: 'vitamins-supplements' },
  { label: 'First Aid', categorySlug: 'first-aid' },
  { label: 'Baby Health', categorySlug: 'baby-health' },
  { label: 'Personal Care', categorySlug: 'personal-care' },
  { label: 'Wellness Devices', categorySlug: 'wellness-devices' },
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
const ACCOUNT_REQUIRED = ['prescriptions', 'ask'];

/** Screen 8a — Pharmacy & Wellness. */
export default function PharmacyRoute() {
  const router = useRouter();
  const cart = useCart();
  const { store } = useFulfilment();
  const { isAuthenticated } = useSession();
  const [filter, setFilter] = useState<string | null>(null);
  const [openIntake, setOpenIntake] = useState<string | null>(null);
  const [choice, setChoice] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const vertical = verticalBySlug('pharmacy');
  const sections = filter ? vertical.sections.filter(section => section.categorySlug === filter) : vertical.sections;
  const shelves = useShelves(vertical.sections, 8);
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
    if (id === 'ask') {
      router.push('/pharmacy/consult');
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
    <Screen padded={false} contentStyle={styles.content}>
      {/* App bar, search field and quick actions sit flush; groups below are spaced. */}
      <View>
        <TopBar
          title={vertical.label}
          subtitle={store.name}
          actions={
            <>
              <TopBarAction name="search" accessibilityLabel="Search medicines and wellness products" onPress={() => router.push('/search')} />
              <Pressable accessibilityRole="button" accessibilityLabel="Account" onPress={() => router.push('/profile')} style={styles.avatar}>
                <Icon name="profile" size={18} color="onPrimary" />
              </Pressable>
            </>
          }
        />

        <View style={styles.inset}>
          <SearchBar
            placeholder="Search medicines & wellness products..."
            onPress={() => router.push('/search')}
            trailingIcon="scan"
            onTrailingPress={() => router.push('/search')}
            style={styles.searchField}
          />
        </View>

        <View style={[styles.inset, styles.quickRow]}>
          {pharmacyQuickActions.map(action => (
            <Pressable
              key={action.id}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              onPress={() => runAction(action.id)}
              style={({ pressed }) => [styles.quickAction, pressed ? styles.pressed : null]}
            >
              <View style={styles.quickGlyph}>
                <Icon name={action.icon} size={22} color="primary" />
              </View>
              <Txt variant="label" align="center" numberOfLines={2}>
                {action.label}
              </Txt>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {PHARMACY_FILTERS.map(entry => (
          <Chip
            key={entry.label}
            label={entry.label}
            selected={filter === entry.categorySlug}
            onPress={() => setFilter(entry.categorySlug)}
          />
        ))}
      </ScrollView>

      {shelves.status !== 'ready' ? <LoadState status={shelves.status} placeholder="rail" inset onRetry={shelves.retry} /> : null}

      {sections.map(section => (
        <View key={section.title} style={[styles.inset, styles.section]}>
          <View style={styles.sectionHead}>
            <SectionHeader title={section.title} actionLabel="See All" onAction={() => router.push('/search')} />
            <Txt variant="bodySm" color="onSurfaceVariant">
              {section.subtitle}
            </Txt>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.railBleed} contentContainerStyle={styles.rail}>
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

      <View style={[styles.inset, styles.bottomBand]}>
        <LinearGradient colors={gradients.promoHero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.promo}>
          <View style={styles.promoGlyph}>
            <Icon name="sparkle" size={20} color="primary" />
          </View>
          <Txt variant="label" style={styles.promoBody}>
            <Txt variant="label" tint={colors.primary}>
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
            <Txt variant="label" color="primary">
              Learn More
            </Txt>
            <Icon name="arrow-right" size={16} color="primary" />
          </Pressable>
        </LinearGradient>

        <Card variant="flat" padding={spacing.lg} radiusSize={radius.xl} style={styles.pharmacist}>
          <View style={styles.pharmacistHead}>
            <View style={styles.pharmacistGlyph}>
              <Icon name="message" size={20} color="onPrimary" />
            </View>
            <Txt variant="headlineSm">Ask a Pharmacist</Txt>
          </View>
          <Txt variant="bodySm" color="onSurfaceVariant">
            Free, confidential clinical consultation via WhatsApp or real-time in-app chat.
          </Txt>
          <Button label="Chat with Pharmacist" icon="message" iconPosition="leading" onPress={() => runAction('ask')} />
        </Card>

        <View style={styles.licence}>
          <View style={styles.licenceOverline}>
            <Icon name="shield" size={14} color="outline" />
            <Txt variant="overline" color="outline">
              OFFICIAL PHARMACY LICENSE
            </Txt>
          </View>
          <Txt variant="bodySm" color="outline" align="center">
            Licensed by the Kenya Pharmacy & Poisons Board (PPB) · Xana Plus Syokimau & Xana Plus Ruiru
          </Txt>
        </View>
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
  const image = figmaAsset(product.image);

  return (
    <View style={styles.card}>
      <View style={styles.cardImageWrap}>
        <ProductPhoto source={image} productId={product.id} accessibilityLabel={`${product.name} product photo`} variant="card" />
        {product.rxRequired ? <Badge label="Rx Required" tone="brand" style={styles.rxBadge} /> : null}
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
        <View style={styles.cardPrice}>
          <Txt variant="label" color="outline">
            Price
          </Txt>
          <Txt variant="titleLg" tint={colors.primary}>
            {formatKesDecimal(product.price)}
          </Txt>
        </View>
        {quantity > 0 ? (
          <View style={styles.qtyPill}>
            <Txt variant="label" tint={colors.onPrimary}>
              {quantity}
            </Txt>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Add ${product.name} to cart`}
            onPress={onAdd}
            hitSlop={6}
            style={styles.addButton}
          >
            <Icon name="plus" size={18} color="onPrimary" />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  quickRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.md },
  quickAction: { flex: 1, alignItems: 'center', gap: spacing.sm },
  quickGlyph: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRow: { gap: spacing.sm, paddingHorizontal: layout.screenMargin },
  section: { gap: spacing.md },
  sectionHead: { gap: spacing.xxs },
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
    backgroundColor: colors.surfaceContainerLow,
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
  pharmacist: { gap: spacing.md },
  pharmacistHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pharmacistGlyph: {
    width: spacing.giant,
    height: spacing.giant,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  licence: { alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },
  licenceOverline: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  confirmation: { gap: spacing.sm, alignItems: 'flex-start' },
});
