import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import {
  Badge,
  BottomSheet,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  Icon,
  IconButton,
  NoticePill,
  Screen,
  SelectableOption,
  TopBar,
  Txt,
  type IconName,
} from '@/components/ui';
import { deliverySlots, stores } from '@/data/catalog';
import { figmaAsset } from '@/data/images';
import type { PaymentMethodId } from '@/data/types';
import {
  AuthSheet,
  EMPTY_PHONE_INPUT,
  PHONE_INVALID_MESSAGE,
  formatPhoneDisplay,
  isValidPhone,
  phoneFromInput,
  type PhoneInput,
} from '@/features/auth/auth-sheet';
import { track } from '@/lib/analytics';
import { formatKes, formatKesDecimal } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useCart } from '@/store/cart';
import { useFulfilment, type Address, type AppliedPromo } from '@/store/fulfilment';
import { placeOrderErrorMessage, promoErrorMessage, useOrders, type PromoError } from '@/store/orders';
import { useSession } from '@/store/session';
import { colors, layout, radius, spacing } from '@/theme';

/** Payment rows in the order Screen 6 stacks them. */
type PaymentMethodCopy = { id: PaymentMethodId; title: string; icon: IconName; trust: string; showsTotal: boolean };

const PAYMENT_METHODS: PaymentMethodCopy[] = [
  { id: 'mpesa', title: 'M-Pesa', icon: 'mpesa', trust: 'Instant M-Pesa Prompt', showsTotal: true },
  { id: 'cod', title: 'Cash on Delivery', icon: 'cash', trust: 'Cash on Delivery', showsTotal: false },
  { id: 'card', title: 'Credit / Debit Card', icon: 'card', trust: 'Hosted Card Gateway', showsTotal: true },
];

/** Xana Club returns 5% of the order value as points — KES 370 shows as 18 pts in Screen 6. */
const CLUB_POINTS_RATE = 1 / 120;

/** Redemption rate on the "Use Xana Club Points" frame: 10 points = KES 1. */
const POINTS_PER_KES = 10;
const POINT_PRESETS = [500, 1000, 1500];

/** Shortest prescription reference the upload sheet accepts. */
const REFERENCE_MIN_LENGTH = 4;

/** The overlay a checkout screen can raise. */
type SheetKind = 'address' | 'slot' | 'mpesa-number' | 'upload-rx' | 'age' | null;

/** The counter address used when the shopper collects from a store. */
const pickupAddress = (pickupStore: (typeof stores)[number], contact: string): Address => ({
  id: `pickup_${pickupStore.id}`,
  label: `PICKUP · ${pickupStore.id.toUpperCase()}`,
  contact,
  line: `${pickupStore.name} · ${pickupStore.address}`,
  phone: pickupStore.phone,
  isDefault: false,
});

type PromoQuote =
  | { ok: true; promo: AppliedPromo }
  | { ok: false; error: PromoError | 'network'; minSpend?: number };

/** Asks the database what a promo code is worth on this basket (place-order checks it again). */
const quotePromo = async (code: string, itemsSubtotal: number): Promise<PromoQuote> => {
  const { data, error } = await supabase.rpc('check_promo', { p_code: code, p_subtotal: itemsSubtotal });
  if (error || !data) return { ok: false, error: 'network' };
  const reply = data as { error?: PromoError; min_spend?: number; code?: string; description?: string; discount?: number };
  if (reply.error) return { ok: false, error: reply.error, minSpend: reply.min_spend };
  return { ok: true, promo: { code: reply.code ?? code, description: reply.description ?? '', discount: Number(reply.discount ?? 0) } };
};

/** `+254 712 345 678` → `712345678` — prefills the M-Pesa number field. */
const mpesaDigits = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  const national = digits.startsWith('254') ? digits.slice(3) : digits.startsWith('0') ? digits.slice(1) : digits;
  return national.slice(0, 9);
};

/** `712345678` → `712 345 678` — the digit grouping used across the frames. */
const groupDigits = (digits: string): string => (digits.match(/\d{1,3}/g) ?? []).join(' ');

/**
 * Screens 6 / 6a / 6c / 6d / 6e — Checkout: the standard M-Pesa view, the login
 * sheet host, the cash and card variants and the prescription-blocked state.
 * One screen, driven by the fulfilment and cart stores.
 */
export default function CheckoutRoute() {
  const router = useRouter();
  const cart = useCart();
  const session = useSession();
  const fulfilment = useFulfilment();
  const orders = useOrders();

  const [sheet, setSheet] = useState<SheetKind>(null);
  const [itemsExpanded, setItemsExpanded] = useState(true);
  /** Pharmacy items whose prescription has been supplied locally. */
  // A reference given earlier (before an M-Pesa retry) still clears the basket's Rx lines.
  const [approvedRx, setApprovedRx] = useState<string[]>(() =>
    fulfilment.rxReference ? cart.items.filter(item => item.product.rxRequired).map(item => item.product.id) : [],
  );
  const prescriptionRef = fulfilment.rxReference;
  const setPrescriptionRef = fulfilment.setRxReference;
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [referenceDraft, setReferenceDraft] = useState('');
  const [phoneDraft, setPhoneDraft] = useState<PhoneInput>(EMPTY_PHONE_INPUT);
  const [authOpen, setAuthOpen] = useState(false);
  const [pendingPay, setPendingPay] = useState(false);
  const [placed, setPlaced] = useState<{ method: PaymentMethodId; total: number } | null>(null);
  const [pointsExpanded, setPointsExpanded] = useState(false);
  const [promoDraft, setPromoDraft] = useState('');
  const [promoChecking, setPromoChecking] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);

  const method = PAYMENT_METHODS.find(entry => entry.id === fulfilment.paymentMethod) ?? PAYMENT_METHODS[0];
  const blockedItems = cart.items.filter(item => item.product.rxRequired && !approvedRx.includes(item.product.id));
  const rxBlocked = blockedItems.length > 0;
  const blockedNames = blockedItems.map(item => item.product.name).join(', ');
  const rxNames = cart.items.filter(item => item.product.rxRequired).map(item => item.product.name).join(', ');
  /** Alcohol in the basket: the shopper confirms they are 18 or over before paying. */
  const needsAgeCheck = cart.items.some(item => item.product.ageRestricted);
  const { ageConfirmed, setAgeConfirmed } = fulfilment;
  const ageBlocked = needsAgeCheck && !ageConfirmed;
  // Pickup orders go to the store counter under the customer's own name; delivery uses the saved address.
  const orderAddress =
    fulfilment.mode === 'pickup'
      ? pickupAddress(fulfilment.store, session.user?.name ?? fulfilment.address.contact)
      : fulfilment.address;
  const needsAddress = fulfilment.mode === 'delivery' && !fulfilment.hasAddress;
  // Signed out, an address added now would be lost at sign-in, so they log in first (then add one).
  const payBlockedByAddress = needsAddress && session.user !== null;
  const empty = cart.items.length === 0;

  const { promo, setPromo } = fulfilment;
  const totalAfterPromo = Math.max(0, cart.summary.total - (promo?.discount ?? 0));
  const availablePoints = session.user?.clubPoints ?? 0;
  const maxRedeemable = Math.min(availablePoints, Math.floor(totalAfterPromo * POINTS_PER_KES));
  const pointsUsed = Math.min(fulfilment.pointsRedeemed, maxRedeemable);
  const pointsValue = pointsUsed / POINTS_PER_KES;
  const amountDue = Math.max(0, totalAfterPromo - pointsValue);
  const remainingPoints = availablePoints - pointsUsed;
  const clubPoints = Math.floor(amountDue * CLUB_POINTS_RATE);

  const setPoints = (next: number) => fulfilment.setPointsRedeemed(Math.max(0, Math.min(next, maxRedeemable)));

  // Alcohol doesn't disable the button: tapping it asks for the 18+ confirmation (the 'age' sheet).
  const payDisabled = empty || rxBlocked || payBlockedByAddress;
  const payLabel = method.showsTotal ? `Place Order · ${formatKesDecimal(amountDue)}` : 'Place Order';
  const storeArea = fulfilment.store.name.replace('Xana Plus ', '');
  const phoneError = phoneDraft.digits.length === 9 && !isValidPhone(phoneDraft) ? PHONE_INVALID_MESSAGE : null;

  const placedCopy = placed
    ? placed.method === 'cod'
      ? {
          title: 'Cash on delivery confirmed',
          description: `Pay ${formatKes(placed.total)} in cash when the rider hands over your order at ${orderAddress.line}.`,
        }
      : {
          title: 'Card payment authorised',
          description: `The card gateway charges ${formatKes(placed.total)} once your order is packed and leaves ${fulfilment.store.name}.`,
        }
    : { title: '', description: '' };

  const closeSheet = () => setSheet(null);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.push('/(tabs)/cart');
  };

  const chooseSavedAddress = (saved: Address) => {
    fulfilment.setMode('delivery');
    fulfilment.setAddress(saved);
    closeSheet();
  };

  const choosePickupStore = (pickupStore: (typeof stores)[number]) => {
    fulfilment.setMode('pickup');
    fulfilment.setStoreId(pickupStore.id);
    closeSheet();
  };

  const openNumberSheet = () => {
    setPhoneDraft({ digits: mpesaDigits(fulfilment.mpesaNumber), prefix: '+254', channel: 'sms' });
    setSheet('mpesa-number');
  };

  const saveNumber = () => {
    if (!isValidPhone(phoneDraft)) return;
    fulfilment.setMpesaNumber(phoneFromInput(phoneDraft));
    closeSheet();
  };

  const submitPrescription = () => {
    const reference = referenceDraft.trim().toUpperCase();
    if (reference.length < REFERENCE_MIN_LENGTH) return;
    setApprovedRx(previous => [...previous, ...blockedItems.map(item => item.product.id)]);
    setPrescriptionRef(reference);
    setReferenceDraft('');
    closeSheet();
  };

  const removeBlockedItems = () => {
    blockedItems.forEach(item => cart.remove(item.product.id));
  };

  const placeOrder = async (confirmedAge = ageConfirmed) => {
    if (method.id === 'mpesa') {
      router.replace('/checkout/mpesa');
      return;
    }
    setPlacing(true);
    setPlaceError(null);
    const result = await orders.placeOrder({
      lines: cart.items.map(item => ({ productId: item.product.id, quantity: item.quantity })),
      paymentMethod: method.id,
      contact: orderAddress.contact,
      addressLine: orderAddress.line,
      slotLabel: fulfilment.slot.label,
      storeName: fulfilment.store.name,
      substitution: cart.substitution,
      pointsRedeemed: pointsUsed,
      ageConfirmed: confirmedAge,
      rxSupplied: !rxBlocked,
      rxReference: prescriptionRef || undefined,
      promoCode: promo?.code,
    });
    setPlacing(false);
    if (!result.ok) {
      if (result.error.startsWith('promo_')) {
        // The code stopped working after it was applied: take it off so the new total shows.
        setPromo(null);
        setPromoError(promoErrorMessage(result.error as PromoError, result.minSpend));
      }
      setPlaceError(placeOrderErrorMessage(result.error));
      return;
    }
    setPlaced({ method: method.id, total: amountDue });
    cart.clear();
    session.spendPoints(pointsUsed);
    fulfilment.setPointsRedeemed(0);
    setPromo(null);
    setAgeConfirmed(false);
    setPrescriptionRef('');
  };

  const applyPromo = async () => {
    const code = promoDraft.trim().toUpperCase();
    if (!code) return;
    setPromoChecking(true);
    setPromoError(null);
    const result = await quotePromo(code, cart.summary.itemsSubtotal);
    setPromoChecking(false);
    if (result.ok) {
      setPromo(result.promo);
      setPromoDraft('');
      track('promo_applied', { code: result.promo.code });
      return;
    }
    track('promo_refused', { reason: result.error });
    setPromoError(result.error === 'network' ? 'No connection. Check your internet and try again.' : promoErrorMessage(result.error, result.minSpend));
  };

  // The basket changed after the code went on: work the discount out again.
  const itemsSubtotal = cart.summary.itemsSubtotal;
  const promoCode = promo?.code;
  const signedIn = session.user !== null;
  useEffect(() => {
    if (!promoCode || !signedIn) return;
    let live = true;
    quotePromo(promoCode, itemsSubtotal).then(result => {
      if (!live) return;
      if (result.ok) setPromo(result.promo);
      else if (result.error !== 'network') {
        setPromo(null);
        setPromoError(promoErrorMessage(result.error, result.minSpend));
      }
    });
    return () => {
      live = false;
    };
  }, [itemsSubtotal, promoCode, signedIn, setPromo]);

  /** Alcohol in the basket: ask for the 18+ confirmation, then place the order. */
  const payAfterAgeCheck = () => {
    // Just signed in with no saved address: stay on checkout, which now asks for one.
    if (fulfilment.mode === 'delivery' && !fulfilment.hasAddress) return;
    if (ageBlocked) {
      setSheet('age');
      return;
    }
    void placeOrder();
  };

  /** Signed-out shoppers authenticate inline (Screen 6a) before the order is placed. */
  const startPay = () => {
    if (!session.user) {
      setPendingPay(true);
      setAuthOpen(true);
      return;
    }
    payAfterAgeCheck();
  };

  const confirmAge = () => {
    setAgeConfirmed(true);
    closeSheet();
    void placeOrder(true);
  };

  /** "I'm under 18": take the alcohol out so the rest of the order can go ahead. */
  const removeAlcohol = () => {
    cart.items.filter(item => item.product.ageRestricted).forEach(item => cart.remove(item.product.id));
    closeSheet();
  };

  const finishOrder = () => {
    setPlaced(null);
    router.replace('/(tabs)');
  };

  return (
    <Screen
      padded={false}
      contentStyle={styles.content}
      footer={
        <View style={styles.footer}>
          <Button
            label={payLabel}
            icon="lock"
            iconPosition="leading"
            size="lg"
            loading={placing}
            disabled={payDisabled || placing}
            onPress={startPay}
          />
          {placeError ? (
            <Txt variant="caption" tint={colors.error} align="center">
              {placeError}
            </Txt>
          ) : null}
          {rxBlocked ? (
            <View style={styles.blockedNote}>
              <Icon name="lock" size={12} color="error" />
              <Txt variant="caption" tint={colors.error}>
                Checkout blocked · Resolve Rx requirement above to proceed
              </Txt>
            </View>
          ) : payBlockedByAddress && !empty ? (
            <View style={styles.blockedNote}>
              <Icon name="map-pin" size={12} color="error" />
              <Txt variant="caption" tint={colors.error}>
                Add a delivery address, or choose pickup, to place your order
              </Txt>
            </View>
          ) : null}
          <View style={styles.trust}>
            <Icon name="lock" size={12} color="outline" />
            <Txt variant="caption" color="onSurfaceVariant">
              {`256-bit Encrypted · ${method.trust}`}
            </Txt>
          </View>
        </View>
      }
    >
      <TopBar
        centered
        title="Checkout"
        onBack={goBack}
        actions={<Chip label="Secure" tone="mint" icon="lock" />}
      />

      {empty ? (
        <View style={styles.inset}>
          <EmptyState icon="cart" title="Your cart is empty" description="Add items to your basket and the checkout will pick them up here.">
            <Button label="Browse groceries" onPress={() => router.replace('/(tabs)')} />
          </EmptyState>
        </View>
      ) : (
        <>
          <Card variant="outline" padding={spacing.lg} style={styles.inset}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <View style={styles.headerIcon}>
                  <Icon name={fulfilment.mode === 'pickup' ? 'store' : 'map-pin'} size={18} color="primaryContainer" />
                </View>
                <Txt variant="titleLg">{fulfilment.mode === 'pickup' ? 'Pickup Address' : 'Delivery Address'}</Txt>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Change delivery address"
                hitSlop={8}
                onPress={() => setSheet('address')}
                style={styles.changeLink}
              >
                <Txt variant="label" color="primary">
                  Change
                </Txt>
              </Pressable>
            </View>

            {needsAddress ? (
              <View style={styles.cardBody}>
                <Txt variant="bodySm" color="onSurfaceVariant">
                  {session.user
                    ? 'Add where we should deliver, or choose to collect from a store.'
                    : 'Log in to add your delivery address, or choose to collect from a store.'}
                </Txt>
                <Button
                  label={session.user ? 'Add delivery address' : 'Log in'}
                  icon={session.user ? 'plus' : 'user'}
                  iconPosition="leading"
                  variant="tonal"
                  size="sm"
                  fullWidth={false}
                  onPress={() => (session.user ? router.push('/address/add') : setAuthOpen(true))}
                />
              </View>
            ) : (
              <View style={styles.cardBody}>
                <View style={styles.addressHead}>
                  <Txt variant="titleLg" style={styles.flex} numberOfLines={2}>
                    {orderAddress.contact}
                  </Txt>
                  <NoticePill label={orderAddress.label} tone="neutral" />
                </View>
                <Txt variant="bodySm" color="onSurfaceVariant">
                  {orderAddress.line}
                </Txt>
                <Txt variant="bodySm" color="onSurfaceVariant">
                  {orderAddress.phone}
                </Txt>
              </View>
            )}
          </Card>

          <Card variant="outline" padding={spacing.lg} style={styles.inset}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <View style={styles.headerIcon}>
                  <Icon name="clock" size={18} color="primaryContainer" />
                </View>
                <Txt variant="titleLg">Delivery Slot</Txt>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Change delivery slot"
                hitSlop={8}
                onPress={() => setSheet('slot')}
                style={styles.changeLink}
              >
                <Txt variant="label" color="primary">
                  Change
                </Txt>
              </Pressable>
            </View>

            <View style={styles.slotBody}>
              <Txt variant="titleLg">{fulfilment.slot.window}</Txt>
              <Chip label={fulfilment.slot.label} tone="mint" icon={fulfilment.slot.mode === 'pickup' ? 'pickup' : 'delivery'} />
            </View>
          </Card>

          <Card variant="outline" padding={spacing.lg} style={styles.inset}>
            <Txt variant="titleLg">Payment Method</Txt>

            <View style={styles.methodList}>
              {PAYMENT_METHODS.map(entry => {
                const selected = fulfilment.paymentMethod === entry.id;
                const attached = selected && entry.id !== 'card';
                return (
                  <View key={entry.id}>
                    <SelectableOption
                      title={entry.title}
                      icon={entry.icon}
                      selected={selected}
                      onPress={() => fulfilment.setPaymentMethod(entry.id)}
                      style={attached ? styles.attachedOption : undefined}
                      trailing={entry.id === 'card' ? <CardMarks /> : undefined}
                    />

                    {selected && entry.id === 'mpesa' ? (
                      <View style={styles.detailPanel}>
                        <View style={styles.numberField}>
                          <View style={styles.flex}>
                            <Txt variant="overline" color="onSurfaceVariant">
                              M-Pesa mobile number
                            </Txt>
                            <Txt variant="titleLg">{formatPhoneDisplay(fulfilment.mpesaNumber)}</Txt>
                          </View>
                          <IconButton
                            name="edit"
                            accessibilityLabel="Change M-Pesa number"
                            onPress={openNumberSheet}
                            size={32}
                            iconSize={16}
                            background={colors.transparent}
                            color="onSurfaceVariant"
                          />
                        </View>
                        <View style={styles.numberNote}>
                          <Icon name="check-circle" size={14} color="primaryContainer" />
                          <Txt variant="caption" color="primary">
                            STK Push prompt will be sent to this line
                          </Txt>
                        </View>
                      </View>
                    ) : null}

                    {selected && entry.id === 'cod' ? (
                      <View style={styles.detailPanel}>
                        <View style={styles.cashNote}>
                          <Icon name="info" size={14} color="warningDeep" />
                          <Txt variant="caption" tint={colors.warningDeep} style={styles.flex}>
                            Pay the rider or in-store when your order arrives. Please have the exact amount if possible, as our riders carry limited change.
                          </Txt>
                        </View>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </Card>

          {session.user ? (
            <Card variant="outline" padding={spacing.lg} style={styles.inset}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={pointsExpanded ? 'Hide points redemption' : 'Use Xana Club points'}
                onPress={() => setPointsExpanded(previous => !previous)}
                style={styles.pointsHeader}
              >
                <View style={styles.headerIcon}>
                  <Icon name="star" size={18} color="primaryContainer" />
                </View>
                <View style={styles.flex}>
                  <Txt variant="titleLg">Use Xana Club points</Txt>
                  <Txt variant="bodySm" color="onSurfaceVariant">
                    {pointsUsed > 0 ? `${pointsUsed.toLocaleString('en-KE')} pts applied (-${formatKes(pointsValue)})` : `${availablePoints.toLocaleString('en-KE')} pts available`}
                  </Txt>
                </View>
                <Icon name={pointsExpanded ? 'chevron-up' : 'chevron-down'} size={18} color="onSurfaceVariant" />
              </Pressable>

              {pointsExpanded ? (
                <View style={styles.pointsBody}>
                  <View style={styles.pointsBanner}>
                    <Txt variant="label">Redeem points</Txt>
                    <Txt variant="caption" color="onSurfaceVariant">{`${POINTS_PER_KES} pts = KES 1.00`}</Txt>
                  </View>
                  <View style={styles.pointsPresets}>
                    {POINT_PRESETS.filter(preset => preset <= maxRedeemable).map(preset => (
                      <Chip key={preset} label={`${preset.toLocaleString('en-KE')} pts (${formatKes(preset / POINTS_PER_KES)})`} selected={pointsUsed === preset} onPress={() => setPoints(preset)} />
                    ))}
                    {maxRedeemable > 0 ? (
                      <Chip
                        label={`Max: ${maxRedeemable.toLocaleString('en-KE')} (${formatKes(maxRedeemable / POINTS_PER_KES)})`}
                        selected={pointsUsed === maxRedeemable}
                        onPress={() => setPoints(maxRedeemable)}
                      />
                    ) : null}
                    {pointsUsed > 0 ? <Chip label="Clear" tone="outline" onPress={() => setPoints(0)} /> : null}
                  </View>
                  <View style={styles.summaryRow}>
                    <Txt variant="bodySm" color="onSurfaceVariant">Remaining balance:</Txt>
                    <Txt variant="label">{`${remainingPoints.toLocaleString('en-KE')} pts`}</Txt>
                  </View>
                  <View style={styles.numberNote}>
                    <Icon name="info" size={14} color="onSurfaceVariant" />
                    <Txt variant="caption" color="onSurfaceVariant">
                      Points used are deducted after payment is confirmed
                    </Txt>
                  </View>
                </View>
              ) : null}
            </Card>
          ) : null}

          {session.user ? (
            <Card variant="outline" padding={spacing.lg} style={[styles.inset, styles.promoCard]}>
              <View style={styles.pointsHeader}>
                <View style={styles.headerIcon}>
                  <Icon name="tag" size={18} color="primaryContainer" />
                </View>
                <View style={styles.flex}>
                  <Txt variant="titleLg">Promo code</Txt>
                  <Txt variant="bodySm" color="onSurfaceVariant">
                    {promo ? `${promo.code} applied (-${formatKes(promo.discount)})` : 'Got a code by SMS or on a flyer? Enter it here'}
                  </Txt>
                </View>
              </View>
              {promo ? (
                <View style={styles.summaryRow}>
                  <Txt variant="bodySm" color="onSurfaceVariant" style={styles.flex}>
                    {promo.description}
                  </Txt>
                  <Button
                    label="Remove"
                    size="sm"
                    variant="ghost"
                    fullWidth={false}
                    onPress={() => {
                      setPromo(null);
                      setPromoError(null);
                    }}
                  />
                </View>
              ) : (
                <View style={styles.promoRow}>
                  <View style={[styles.fieldRow, styles.flex]}>
                    <TextInput
                      value={promoDraft}
                      onChangeText={text => {
                        setPromoDraft(text.toUpperCase().replace(/\s/g, ''));
                        setPromoError(null);
                      }}
                      placeholder="Enter code"
                      placeholderTextColor={colors.outline}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      maxLength={30}
                      returnKeyType="done"
                      onSubmitEditing={() => void applyPromo()}
                      accessibilityLabel="Promo code"
                      style={styles.input}
                    />
                  </View>
                  <Button
                    label="Apply"
                    size="sm"
                    fullWidth={false}
                    loading={promoChecking}
                    disabled={promoChecking || promoDraft.trim() === ''}
                    onPress={() => void applyPromo()}
                  />
                </View>
              )}
              {promoError ? (
                <Txt variant="caption" tint={colors.error}>
                  {promoError}
                </Txt>
              ) : null}
            </Card>
          ) : null}

          <Card variant="outline" padding={spacing.lg} style={styles.inset}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={itemsExpanded ? 'Hide order items' : 'Show order items'}
              onPress={() => setItemsExpanded(previous => !previous)}
              style={[styles.summaryHeader, itemsExpanded ? styles.summaryHeaderOpen : null]}
            >
              <View style={styles.summaryHeaderLeft}>
                <Txt variant="titleLg">Order Summary</Txt>
                <Txt variant="bodySm" color="onSurfaceVariant">
                  {`(${cart.itemCount} ${cart.itemCount === 1 ? 'item' : 'items'})`}
                </Txt>
              </View>
              <Icon name={itemsExpanded ? 'chevron-up' : 'chevron-down'} size={18} color="onSurfaceVariant" />
            </Pressable>

            {itemsExpanded ? (
              <>
                <View style={styles.preview}>
                  {cart.items.map(item => {
                    const image = figmaAsset(item.product.image);
                    const blocked = rxBlocked && item.product.rxRequired;
                    return (
                      <View key={item.product.id} style={styles.previewRow}>
                        {rxBlocked ? (
                          <View style={styles.previewThumb}>
                            {image ? <Image source={image} style={styles.previewImage} contentFit="cover" /> : null}
                          </View>
                        ) : null}
                        <View style={styles.previewBody}>
                          <Txt variant="bodySm" color="onSurfaceVariant" numberOfLines={2}>
                            {rxBlocked ? item.product.name : `${item.product.name} (x${item.quantity})`}
                          </Txt>
                          {rxBlocked ? (
                            <View style={styles.previewMeta}>
                              <Txt variant="caption" color="onSurfaceVariant">
                                {`Qty: ${item.quantity}`}
                              </Txt>
                              {blocked ? <NoticePill label="Rx Required · Not Uploaded" tone="warning" /> : null}
                            </View>
                          ) : null}
                        </View>
                        <Txt variant="label">{formatKes(item.lineTotal)}</Txt>
                      </View>
                    );
                  })}
                </View>
                <Divider />
              </>
            ) : null}

            <View style={styles.financials}>
              <SummaryLine label="Items Subtotal" value={formatKes(cart.summary.itemsSubtotal)} />
              {cart.summary.wholesaleSavings > 0 ? (
                <SummaryLine label="Quantity Wholesale Savings" value={`-${formatKes(cart.summary.wholesaleSavings)}`} tone="primary" />
              ) : null}
              <SummaryLine
                label={`Delivery Fee (${storeArea} / Ruiru)`}
                value={cart.summary.deliveryFee === 0 ? 'Free' : formatKes(cart.summary.deliveryFee)}
                tone={cart.summary.deliveryFee === 0 ? 'primary' : 'default'}
              />
              {promo ? <SummaryLine label={`Promo Code (${promo.code})`} value={`-${formatKes(promo.discount)}`} tone="primary" /> : null}
              {pointsUsed > 0 ? (
                <SummaryLine label={`Points Redeemed (${pointsUsed.toLocaleString('en-KE')} pts)`} value={`-${formatKes(pointsValue)}`} tone="primary" />
              ) : null}
              <Divider />
              <View style={styles.totalRow}>
                <Txt variant="titleLg">Total to Pay</Txt>
                <Txt variant="display" tint={colors.primary}>
                  {formatKes(amountDue)}
                </Txt>
              </View>
              <View style={styles.pointsRow}>
                <Icon name="star" size={14} color="secondary" />
                <Txt variant="label" color="secondary" style={styles.flex}>
                  {`You'll earn ${clubPoints} Xana Club ${clubPoints === 1 ? 'point' : 'points'}`}
                </Txt>
                <Badge label={`+${clubPoints} pts`} tone="warning" />
              </View>
            </View>
          </Card>


          {rxBlocked ? (
            <View style={[styles.inset, styles.rxPanel]}>
              <View style={styles.rxHead}>
                <View style={styles.rxHeadLeft}>
                  <View style={styles.rxIcon}>
                    <Icon name="alert-triangle" size={18} color="warningDeep" />
                  </View>
                  <Txt variant="titleLg">Prescription Required</Txt>
                </View>
                <NoticePill label="ACTION REQUIRED" tone="warning" />
              </View>

              <Txt variant="bodySm" color="onSurfaceVariant">
                {`${blockedNames} ${blockedItems.length === 1 ? 'requires' : 'require'} a valid prescription before this order can be placed.`}
              </Txt>

              <View style={styles.rxLegal}>
                <Icon name="prescription" size={16} color="warningDeep" />
                <Txt variant="caption" tint={colors.warningDeep} style={styles.flex}>
                  {"Kenya Pharmacy & Poisons Board regulations require a verified doctor's prescription for this medication."}
                </Txt>
              </View>

              <Pressable accessibilityRole="button" onPress={() => setSheet('upload-rx')} style={styles.rxRefLink}>
                <Txt variant="label" color="primaryContainer">
                  I already have a prescription reference
                </Txt>
              </Pressable>

              <View style={styles.rxActions}>
                <Button
                  label="Upload Prescription"
                  icon="prescription"
                  iconPosition="leading"
                  onPress={() => router.push('/pharmacy/upload')}
                  style={styles.flex}
                />
                <Button
                  label={blockedItems.length === 1 ? 'Remove Item' : 'Remove Items'}
                  icon="trash"
                  iconPosition="leading"
                  variant="outline"
                  onPress={removeBlockedItems}
                  style={styles.flex}
                />
              </View>
            </View>
          ) : prescriptionRef && rxNames ? (
            <View style={[styles.inset, styles.rxResolved]}>
              <Icon name="check-circle" size={18} color="primaryContainer" />
              <Txt variant="bodySm" color="onSuccessContainer" style={styles.flex}>
                {`Prescription ${prescriptionRef} attached for ${rxNames}. A pharmacist verifies it before your order leaves ${fulfilment.store.name}.`}
              </Txt>
            </View>
          ) : null}
        </>
      )}

      <BottomSheet
        visible={sheet === 'address'}
        onClose={closeSheet}
        title="Delivery address"
        description="Send this order to the saved address, or collect it from a Xana Plus store."
        scrollable
      >
        <View style={styles.sheetGroup}>
          <Txt variant="overline" color="onSurfaceVariant">
            Saved addresses
          </Txt>
          {fulfilment.addresses.map(saved => (
            <SelectableOption
              key={saved.id}
              title={`${saved.label} · ${saved.contact}`}
              description={`${saved.line} · ${saved.phone}`}
              icon="map-pin"
              selected={fulfilment.mode === 'delivery' && fulfilment.address.id === saved.id}
              onPress={() => chooseSavedAddress(saved)}
            />
          ))}
          <Button
            label="Add new address"
            icon="plus"
            iconPosition="leading"
            variant="outline"
            onPress={() => {
              closeSheet();
              router.push('/address/add');
            }}
          />
        </View>
        <View style={styles.sheetGroup}>
          <Txt variant="overline" color="onSurfaceVariant">
            Collect instead
          </Txt>
          {stores.map(store => (
            <SelectableOption
              key={store.id}
              title={`Pick up from ${store.name}`}
              description={`${store.address} · ${store.phone}`}
              icon="store"
              selected={fulfilment.mode === 'pickup' && fulfilment.storeId === store.id}
              onPress={() => choosePickupStore(store)}
            />
          ))}
        </View>
      </BottomSheet>

      <BottomSheet
        visible={sheet === 'slot'}
        onClose={closeSheet}
        title="Delivery slot"
        description="Pick the window that suits you. Express arrives within 30 minutes."
        scrollable
      >
        {deliverySlots.map(slot => (
          <SelectableOption
            key={slot.id}
            title={slot.window}
            description={`${slot.label} · ${slot.free ? 'Free' : 'Delivery fee applies'}`}
            icon={slot.mode === 'pickup' ? 'pickup' : 'delivery'}
            selected={fulfilment.slotId === slot.id}
            onPress={() => {
              fulfilment.setSlotId(slot.id);
              closeSheet();
            }}
          />
        ))}
      </BottomSheet>

      <BottomSheet
        visible={sheet === 'mpesa-number'}
        onClose={closeSheet}
        title="M-Pesa number"
        description="The STK push prompt goes to this line. It must be the phone you enter the PIN on."
        footer={<Button label="Save number" disabled={!isValidPhone(phoneDraft)} onPress={saveNumber} />}
      >
        <View style={styles.field}>
          <Txt variant="overline" color="onSurfaceVariant">
            M-Pesa mobile number
          </Txt>
          <View style={styles.fieldRow}>
            <Txt variant="label">+254</Txt>
            <TextInput
              value={groupDigits(phoneDraft.digits)}
              onChangeText={text => setPhoneDraft(previous => ({ ...previous, digits: mpesaDigits(text) }))}
              placeholder="712 345 678"
              placeholderTextColor={colors.outline}
              keyboardType="number-pad"
              inputMode="numeric"
              accessibilityLabel="M-Pesa mobile number"
              style={styles.input}
            />
          </View>
          {phoneError ? (
            <Txt variant="caption" tint={colors.error}>
              {phoneError}
            </Txt>
          ) : (
            <Txt variant="caption" color="onSurfaceVariant">
              {"We'll send the M-Pesa prompt to this number each time you order."}
            </Txt>
          )}
        </View>
      </BottomSheet>

      <BottomSheet
        visible={sheet === 'upload-rx'}
        onClose={closeSheet}
        title="Upload prescription"
        description="A pharmacist verifies every prescription before pharmacy items leave the store."
        footer={
          <Button
            label="Submit prescription"
            icon="prescription"
            iconPosition="leading"
            disabled={referenceDraft.trim().length < REFERENCE_MIN_LENGTH}
            onPress={submitPrescription}
          />
        }
      >
        <View style={styles.sheetGroup}>
          <Txt variant="overline" color="onSurfaceVariant">
            Awaiting prescription
          </Txt>
          {blockedItems.map(item => (
            <View key={item.product.id} style={styles.rxItem}>
              <View style={styles.rxItemIcon}>
                <Icon name="prescription" size={16} color="primaryContainer" />
              </View>
              <View style={styles.flex}>
                <Txt variant="title" numberOfLines={2}>
                  {item.product.name}
                </Txt>
                <Txt variant="caption" color="onSurfaceVariant">
                  {item.product.pack}
                </Txt>
              </View>
              <Txt variant="label">{formatKes(item.lineTotal)}</Txt>
            </View>
          ))}
        </View>
        <View style={styles.field}>
          <Txt variant="overline" color="onSurfaceVariant">
            Prescription reference
          </Txt>
          <View style={styles.fieldRow}>
            <TextInput
              value={referenceDraft}
              onChangeText={setReferenceDraft}
              placeholder="RX-2481-PB"
              placeholderTextColor={colors.outline}
              autoCapitalize="characters"
              autoCorrect={false}
              accessibilityLabel="Prescription reference"
              style={styles.input}
            />
          </View>
          <Txt variant="caption" color="onSurfaceVariant">
            Printed on the prescription slip or in the SMS from your doctor.
          </Txt>
        </View>
      </BottomSheet>

      <BottomSheet visible={placed !== null} onClose={finishOrder} title={placedCopy.title} description={placedCopy.description}>
        <View style={styles.placedBody}>
          <View style={styles.placedIcon}>
            <Icon name="check-circle" size={30} color="primaryContainer" />
          </View>
          <View style={styles.sheetGroup}>
            <Txt variant="overline" color="onSurfaceVariant">
              Order total
            </Txt>
            <Txt variant="headlineLg">{formatKes(placed?.total ?? 0)}</Txt>
            <Txt variant="overline" color="onSurfaceVariant">
              Fulfilment
            </Txt>
            <Txt variant="bodySm" color="onSurfaceVariant">
              {`${fulfilment.store.name} · ${fulfilment.slot.window}`}
            </Txt>
          </View>
        </View>
      </BottomSheet>

      <BottomSheet
        visible={sheet === 'age'}
        onClose={closeSheet}
        title="Are you 18 or over?"
        description="Your order contains alcohol. Kenyan law bars its sale to anyone under 18, and the rider may ask for ID on delivery."
        footer={
          <View style={styles.ageActions}>
            <Button label="Yes, I'm 18 or over" icon="shield" iconPosition="leading" size="lg" onPress={confirmAge} />
            <Button label="No, remove the alcohol" variant="outline" onPress={removeAlcohol} />
          </View>
        }
      >
        {cart.items
          .filter(item => item.product.ageRestricted)
          .map(item => (
            <Txt key={item.product.id} variant="bodySm" color="onSurfaceVariant">
              {`${item.quantity} × ${item.product.name}`}
            </Txt>
          ))}
      </BottomSheet>

      <AuthSheet
        visible={authOpen}
        onClose={() => {
          setAuthOpen(false);
          setPendingPay(false);
        }}
        onSuccess={() => {
          if (!pendingPay) return;
          setPendingPay(false);
          payAfterAgeCheck();
        }}
      />
    </Screen>
  );
}

/** One line of the order summary breakdown. */
function SummaryLine({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'primary' }) {
  return (
    <View style={styles.summaryRow}>
      <Txt variant="bodySm" color="onSurfaceVariant" numberOfLines={2} style={styles.summaryLabel}>
        {label}
      </Txt>
      <Txt variant="label" tint={tone === 'primary' ? colors.primary : colors.onSurface}>
        {value}
      </Txt>
    </View>
  );
}

/** Visa / Mastercard marks on the card row. Card-network colours are brand assets, not palette tokens. */
function CardMarks() {
  return (
    <View style={styles.marks}>
      <View style={styles.visa}>
        <Txt variant="micro" tint={colors.onPrimary}>
          VISA
        </Txt>
      </View>
      <View style={styles.circles}>
        <View style={styles.circleRed} />
        <View style={styles.circleAmber} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ageActions: { gap: spacing.sm },
  content: { gap: spacing.lg },
  inset: { marginHorizontal: layout.screenMargin },
  flex: { flex: 1 },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surfaceContainerHigh,
  },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  headerIcon: { width: 32, height: 32, borderRadius: radius.pill, backgroundColor: colors.mintSurface, alignItems: 'center', justifyContent: 'center' },
  changeLink: { paddingVertical: spacing.xs },
  cardBody: { gap: spacing.xs, paddingTop: spacing.md },
  addressHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },

  slotBody: { gap: spacing.sm, paddingTop: spacing.md },

  pointsHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pointsBody: { gap: spacing.md, paddingTop: spacing.md },
  pointsBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.mintSubtle },
  pointsPresets: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

  methodList: { gap: spacing.md, paddingTop: spacing.md },
  attachedOption: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottomWidth: 0 },
  detailPanel: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: colors.primaryContainer,
    borderBottomLeftRadius: radius.card,
    borderBottomRightRadius: radius.card,
    backgroundColor: colors.mintSubtle,
    gap: spacing.md,
  },
  numberField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHigh,
    backgroundColor: colors.surfaceContainerLow,
  },
  numberNote: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xs },
  cashNote: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.amberTint15 },

  summaryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingBottom: spacing.md },
  summaryHeaderOpen: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.surfaceContainerHigh },
  summaryHeaderLeft: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, flexShrink: 1 },
  preview: { gap: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.md },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  previewThumb: { width: 46, height: 46, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceContainerLow },
  previewImage: { width: '100%', height: '100%' },
  previewBody: { flex: 1, gap: spacing.xxs },
  previewMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  financials: { gap: spacing.md, paddingTop: spacing.md },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  summaryLabel: { flexShrink: 1 },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  pointsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },

  rxPanel: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.card,
    borderWidth: 2,
    borderColor: colors.tertiaryFixed,
    backgroundColor: colors.amberTint15,
  },
  rxHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  rxHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  rxIcon: { width: 32, height: 32, borderRadius: radius.pill, backgroundColor: colors.secondaryFixed, alignItems: 'center', justifyContent: 'center' },
  rxLegal: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.secondaryFixed },
  rxRefLink: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
  rxActions: { flexDirection: 'row', gap: spacing.sm },
  rxResolved: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.mintEdge,
    backgroundColor: colors.mintSurface,
  },

  sheetGroup: { gap: spacing.sm },
  field: { gap: spacing.sm },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, height: 48, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outlineSoft30, backgroundColor: colors.surface },
  input: { flex: 1, color: colors.onSurface, fontSize: 15, padding: 0 },
  promoCard: { gap: spacing.md },
  promoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rxItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceContainerLow },
  rxItemIcon: { width: 32, height: 32, borderRadius: radius.pill, backgroundColor: colors.mintSurface, alignItems: 'center', justifyContent: 'center' },

  placedBody: { gap: spacing.lg, alignItems: 'center' },
  placedIcon: { width: 64, height: 64, borderRadius: radius.pill, backgroundColor: colors.mintSurface, alignItems: 'center', justifyContent: 'center' },

  marks: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  visa: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.xs, backgroundColor: '#1a1f71' },
  circles: { flexDirection: 'row', alignItems: 'center' },
  circleRed: { width: 14, height: 14, borderRadius: radius.pill, backgroundColor: '#eb001b', opacity: 0.9 },
  circleAmber: { width: 14, height: 14, borderRadius: radius.pill, backgroundColor: '#f79e1b', opacity: 0.9, marginLeft: -6 },

  footer: { gap: spacing.sm },
  blockedNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  trust: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
});
