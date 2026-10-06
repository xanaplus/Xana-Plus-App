import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Switch, View, type StyleProp, type ViewStyle } from 'react-native';

import {
  BottomSheet,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  Icon,
  ProgressBar,
  Screen,
  SectionHeader,
  Segmented,
  SelectableOption,
  TopBar,
  TopBarAction,
  Txt,
  type IconName,
  type SegmentedOption,
} from '@/components/ui';
import { deliverySlots, productById, stores } from '@/data/catalog';
import { ORDER_HISTORY, type OrderRecord } from '@/data/orders';
import type { FulfilmentMode, PaymentMethodId, Product } from '@/data/types';
import { NameSheet } from '@/features/account/name-sheet';
import { formatCartCounts, formatKes } from '@/lib/format';
import { unitPrice, useCart } from '@/store/cart';
import { useFulfilment } from '@/store/fulfilment';
import { useOrders } from '@/store/orders';
import { useSession } from '@/store/session';
import { colors, elevation, gradients, layout, radius, spacing } from '@/theme';

/** Xana Club tier ladder — the thresholds the rewards card measures against. */
const CLUB_TIERS = [
  { tier: 'Bronze', from: 0 },
  { tier: 'Silver', from: 1_000 },
  { tier: 'Gold', from: 2_000 },
  { tier: 'Platinum', from: 5_000 },
] as const;

type AlertKey =
  | 'orderConfirmed'
  | 'outForDelivery'
  | 'delivered'
  | 'paymentIssues'
  | 'prescriptionStatus'
  | 'repeatReminders'
  | 'promotions'
  | 'loyaltyUpdates';

type AlertRow = { key: AlertKey; icon: IconName; title: string; description: string };

/** Matches the "Notification Preferences" Figma frame — three sections, in order. */
const ALERT_SECTIONS: { title: string; rows: AlertRow[] }[] = [
  {
    title: 'ORDERS',
    rows: [
      { key: 'orderConfirmed', icon: 'receipt', title: 'Order confirmed', description: 'Immediate confirmation and store packing updates' },
      { key: 'outForDelivery', icon: 'delivery', title: 'Out for delivery', description: 'Live courier dispatch and GPS arrival notices' },
      { key: 'delivered', icon: 'check-circle', title: 'Delivered', description: 'Proof of delivery and drop-off photo notifications' },
      { key: 'paymentIssues', icon: 'mpesa', title: 'Payment issues', description: 'M-Pesa STK push timeout and retry notifications' },
    ],
  },
  {
    title: 'PHARMACY & HEALTH',
    rows: [
      { key: 'prescriptionStatus', icon: 'prescription', title: 'Prescription status updates', description: 'Pharmacist review, verification & dispensing alerts' },
      { key: 'repeatReminders', icon: 'pill', title: 'Repeat medicine reminders', description: 'Timely refills before your chronic medication runs out' },
    ],
  },
  {
    title: 'OFFERS & REWARDS',
    rows: [
      { key: 'promotions', icon: 'tag', title: 'Promotions & flash drops', description: 'Supa Deals, weekly grocery discounts & flash sales' },
      { key: 'loyaltyUpdates', icon: 'gift', title: 'Xana Club points & tier updates', description: 'Earned points, monthly savings breakdown & expiry warnings' },
    ],
  },
];

const ALERT_ROWS: AlertRow[] = ALERT_SECTIONS.flatMap(section => section.rows);

const DEFAULT_ALERTS: Record<AlertKey, boolean> = {
  orderConfirmed: true,
  outForDelivery: true,
  delivered: true,
  paymentIssues: true,
  prescriptionStatus: true,
  repeatReminders: true,
  promotions: false,
  loyaltyUpdates: true,
};

type PrivacyKey = 'shareOrderHistoryForRx' | 'marketingMessages' | 'orderAndDeliveryUpdates' | 'usageAnalytics';

/** Matches the "Account & Privacy" Figma frame's three toggle rows. */
const PRIVACY_ROWS: { key: PrivacyKey; icon: IconName; title: string; description: string }[] = [
  {
    key: 'shareOrderHistoryForRx',
    icon: 'prescription',
    title: 'Share order history with pharmacist',
    description: 'Enables the dispensing pharmacist to check for drug interactions with grocery items',
  },
  {
    key: 'marketingMessages',
    icon: 'tag',
    title: 'Marketing & promotional messages',
    description: 'Weekly Supa Deals, weekend discounts and fresh grocery arrivals via SMS or WhatsApp',
  },
  {
    key: 'orderAndDeliveryUpdates',
    icon: 'delivery',
    title: 'Order and delivery updates',
    description: 'Real-time rider tracking, M-Pesa receipt confirmations and pharmacist review alerts',
  },
  {
    key: 'usageAnalytics',
    icon: 'info',
    title: 'Usage and crash reports',
    description: 'Tells us which screens you use and when the app breaks, so we can fix it. Never your name or number',
  },
];

const DEFAULT_PRIVACY: Record<PrivacyKey, boolean> = {
  shareOrderHistoryForRx: false,
  marketingMessages: false,
  orderAndDeliveryUpdates: true,
  usageAnalytics: true,
};

const PAYMENT_METHODS: { id: PaymentMethodId; icon: IconName; title: string; description: string }[] = [
  { id: 'mpesa', icon: 'mpesa', title: 'M-Pesa', description: 'STK Push prompt will be sent to this line' },
  { id: 'cod', icon: 'cash', title: 'Cash on Delivery', description: 'Pay the rider or in-store when your order arrives.' },
  { id: 'card', icon: 'card', title: 'Credit / Debit Card', description: 'Hosted Card Gateway: Visa and Mastercard' },
];

const MODE_OPTIONS: SegmentedOption<FulfilmentMode>[] = [
  { value: 'delivery', label: 'Delivery', icon: 'delivery' },
  { value: 'pickup', label: 'Pickup', icon: 'pickup' },
];

const POINT_RULES: { icon: IconName; title: string; description: string }[] = [
  { icon: 'cart', title: '1 point per KES 120 spent', description: 'Earned on every delivered Xana order' },
  { icon: 'prescription', title: 'Pharmacy orders count too', description: 'Rx items earn once the pharmacist releases them' },
  { icon: 'tag', title: 'Club Member Savings', description: 'Tiered wholesale savings from 6 units stack with your points' },
];

const PRIVACY_BLOCKS: { title: string; body: string }[] = [
  {
    title: 'Your account',
    body: 'Your name, saved addresses and settings are kept on your Xana Plus account, so they follow you to a new phone. Delete your account below to remove them.',
  },
  {
    title: 'Prescriptions',
    body: 'Rx items are dispensed only after a Xana Plus pharmacist verifies your prescription, and we call you before dispatch.',
  },
  {
    title: 'Payments',
    body: 'M-Pesa requests are authorised by Safaricom on your handset. Xana Plus never sees or stores your PIN.',
  },
  {
    title: 'Usage and crash reports',
    body: 'The app notes the screens you open, what you add to your cart and any crash, so we can see where shopping gets stuck. Only Xana Plus staff can see this. Switch it off above.',
  },
];

type RepeatScript = { productId: string; prescriber: string; refillsLeft: number; nextRefill: string };

/** Verified repeats on file — the "My Prescriptions" sheet. */
const REPEAT_SCRIPTS: RepeatScript[] = [
  {
    productId: 'ibuprofen-400mg-30s',
    prescriber: 'Dr. Achieng’ · Nairobi Hospital',
    refillsLeft: 2,
    nextRefill: '30 Sep 2026',
  },
  {
    productId: 'milk-magnesia-200ml',
    prescriber: 'Dr. Kamau · Kilimani Health',
    refillsLeft: 1,
    nextRefill: '04 Oct 2026',
  },
  {
    productId: 'calpol-infant-100ml',
    prescriber: 'Paediatrics desk · Xana Plus Ruiru',
    refillsLeft: 3,
    nextRefill: '18 Oct 2026',
  },
];

type SheetId =
  | 'orders'
  | 'prescriptions'
  | 'address'
  | 'payment'
  | 'rewards'
  | 'notifications'
  | 'help'
  | 'terms'
  | 'settings'
  | 'edit-name'
  | 'delete-account';

type RowSpec = {
  key: string;
  icon: IconName;
  title: string;
  description: string;
  /** Trailing meta line, e.g. "2 of 3 on". */
  value?: string;
  onPress: () => void;
};

/** `+254712345678` → `+254 712 ••• •78` — same mask used at checkout. */
const maskPhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '').slice(-9);
  return `+254 ${digits.slice(0, 3)} ••• •${digits.slice(-2)}`;
};

/** Order lines joined to their products, priced with the cart's wholesale tier. */
function resolveOrder(order: OrderRecord): { items: { product: Product; quantity: number; lineTotal: number }[]; unitCount: number; total: number } {
  const items = order.lines.flatMap(line => {
    const product = productById(line.productId);
    if (!product) return [];
    const price = unitPrice(product, line.quantity);
    return [{ product, quantity: line.quantity, lineTotal: price * line.quantity }];
  });
  return {
    items,
    unitCount: items.reduce((sum, item) => sum + item.quantity, 0),
    total: items.reduce((sum, item) => sum + item.lineTotal, 0),
  };
}

/**
 * Profile tab — the fifth tab has no Figma frame, so it is composed from the
 * system the exported frames established: Cart's masthead rhythm and row
 * treatment, Home's Xana Club gradient, and the shared card / list kit.
 */
export default function ProfileRoute() {
  const router = useRouter();
  const cart = useCart();
  const { orders } = useOrders();
  const {
    user,
    isAuthenticated,
    signOut,
    preferences,
    updatePreferences,
    preferencesSaving,
    preferencesError,
    retryPreferences,
    deleteAccount,
    isStaff,
    isDemo,
  } = useSession();
  const { address, addresses, setAddress, removeAddress, hasAddress, mode, setMode, mpesaNumber, paymentMethod, setPaymentMethod, setStoreId, slot, store, storeId } = useFulfilment();

  const [sheet, setSheet] = useState<SheetId | null>(null);
  const [deleting, setDeleting] = useState(false);
  /** Address waiting for a second tap to delete, and one whose delete failed. */
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeFailed, setRemoveFailed] = useState(false);

  const confirmRemove = async (id: string) => {
    if (removingId !== id) {
      setRemovingId(id);
      setRemoveFailed(false);
      return;
    }
    const ok = await removeAddress(id);
    setRemovingId(null);
    setRemoveFailed(!ok);
  };
  const [deleteFailed, setDeleteFailed] = useState(false);

  // Switches read from the settings saved on the account, falling back to these defaults.
  const pushEnabled = preferences.pushEnabled ?? true;
  const alerts: Record<AlertKey, boolean> = { ...DEFAULT_ALERTS, ...preferences.alerts };
  const privacy: Record<PrivacyKey, boolean> = { ...DEFAULT_PRIVACY, ...preferences.privacy };

  const confirmDelete = async () => {
    setDeleting(true);
    setDeleteFailed(false);
    const ok = await deleteAccount();
    setDeleting(false);
    if (ok) setSheet(null);
    else setDeleteFailed(true);
  };

  const closeSheet = () => setSheet(null);
  const alertsOn = ALERT_ROWS.filter(row => alerts[row.key]).length;

  const changeNumber = () => {
    closeSheet();
    router.push('/login');
  };

  const reorder = (order: OrderRecord) => {
    resolveOrder(order).items.forEach(item => cart.add(item.product.id, item.quantity));
    closeSheet();
    router.push('/(tabs)/cart');
  };

  const signIn = () => {
    closeSheet();
    router.push('/login');
  };

  const accountRows: RowSpec[] = [
    { key: 'orders', icon: 'receipt', title: 'My Orders', description: 'Track, reorder & view receipts', onPress: () => router.push('/orders') },
    {
      key: 'requests',
      icon: 'refresh',
      title: 'Returns & bookings',
      description: 'Return requests and clinic bookings you have sent',
      onPress: () => router.push('/requests'),
    },
    {
      key: 'prescriptions',
      icon: 'prescription',
      title: 'My Prescriptions',
      description: 'Repeats, dispensing status & Rx upload',
      onPress: () => router.push('/pharmacy/prescriptions'),
    },
    {
      key: 'addresses',
      icon: 'map-pin',
      title: 'Saved Addresses',
      description: !isAuthenticated ? 'Log in to save an address' : hasAddress ? address.line : 'Add your delivery address',
      onPress: () => setSheet('address'),
    },
    {
      key: 'payment',
      icon: 'wallet',
      title: 'Payment Methods',
      description: `M-Pesa · ${mpesaNumber}`,
      onPress: () => setSheet('payment'),
    },
  ];

  const rewardRows: RowSpec[] = [
    { key: 'rewards', icon: 'gift', title: 'Xana Club Rewards', description: 'Points, tiers and member offers', onPress: () => setSheet('rewards') },
    {
      key: 'notifications',
      icon: 'bell',
      title: 'Notifications',
      description: 'Order updates and offers',
      value: `${alertsOn} of ${ALERT_ROWS.length} on`,
      onPress: () => setSheet('notifications'),
    },
  ];

  const supportRows: RowSpec[] = [
    { key: 'help', icon: 'help', title: 'Help & Support', description: 'Chat with a pharmacist', onPress: () => setSheet('help') },
    { key: 'terms', icon: 'shield', title: 'Terms & Privacy', description: 'Sign-in details, privacy settings & how we handle your data', onPress: () => setSheet('terms') },
  ];

  const helpRows: RowSpec[] = [
    {
      key: 'call',
      icon: 'phone',
      title: `Call ${store.name}`,
      description: store.phone,
      onPress: () => {
        void Linking.openURL(`tel:${store.phone.replace(/\s+/g, '')}`);
      },
    },
    {
      key: 'pharmacist',
      icon: 'message',
      title: 'Chat with a pharmacist',
      description: 'Ask about dosage, stock or refills',
      onPress: () => {
        void Linking.openURL(`https://wa.me/${store.phone.replace(/\D/g, '')}`);
      },
    },
    {
      key: 'pharmacy-tab',
      icon: 'prescription',
      title: 'Browse the Pharmacy',
      description: 'Shop Rx items and upload a prescription',
      onPress: () => {
        closeSheet();
        router.push('/(tabs)/pharmacy');
      },
    },
  ];

  const tierIndex = user ? Math.max(0, CLUB_TIERS.findIndex(t => t.tier === user.clubTier)) : 0;
  const tier = CLUB_TIERS[tierIndex];
  const nextTier = CLUB_TIERS[tierIndex + 1];
  const clubProgress = user && nextTier ? Math.min(1, Math.max(0, (user.clubPoints - tier.from) / (nextTier.from - tier.from))) : 0;
  const pointsToNext = user && nextTier ? Math.max(0, nextTier.from - user.clubPoints) : 0;

  /** The slot the chosen mode will use, even before checkout picks one. */
  const activeSlot = slot.mode === mode ? slot : (deliverySlots.find(entry => entry.mode === mode) ?? slot);

  return (
    <Screen padded={false} contentStyle={styles.content}>
      <TopBar title="Profile" actions={<TopBarAction name="settings" accessibilityLabel="Settings" onPress={() => setSheet('settings')} />} />

      {preferencesSaving || preferencesError ? (
        <PreferencesSyncFeedback
          saving={preferencesSaving}
          error={preferencesError}
          onRetry={retryPreferences}
          style={styles.inset}
        />
      ) : null}

      {user ? (
        <Card variant="elevated" padding={spacing.lg} style={styles.inset}>
          <View style={styles.identityRow}>
            <View style={styles.avatar}>
              <Txt variant="display" tint={colors.onPrimary}>
                {user.name.charAt(0)}
              </Txt>
            </View>
            <View style={styles.identityBody}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Edit your name"
                hitSlop={8}
                onPress={() => setSheet('edit-name')}
                style={styles.nameRow}
              >
                <Txt variant="headlineSm" numberOfLines={1} style={styles.nameText}>
                  {user.name}
                </Txt>
                <Icon name="edit" size={16} color="primary" />
              </Pressable>
              <Txt variant="bodySm" color="onSurfaceVariant">
                {user.phone}
              </Txt>
              <View style={styles.memberChip}>
                <Icon name="star" size={14} color={colors.onTertiaryContainer} />
                <Txt variant="label" tint={colors.onTertiaryContainer}>
                  {user.clubTier} member
                </Txt>
              </View>
            </View>
          </View>
        </Card>
      ) : (
        <Card variant="elevated" padding={spacing.lg} style={styles.inset}>
          <View style={styles.identityRow}>
            <View style={styles.avatarMuted}>
              <Icon name="profile" size={28} color="onSurfaceVariant" />
            </View>
            <View style={styles.identityBody}>
              <Txt variant="headlineSm">Log in to Xana Plus</Txt>
              <Txt variant="bodySm" color="onSurfaceVariant">
                Track orders, save addresses and earn Xana Club points on every delivery.
              </Txt>
            </View>
          </View>
          <Button label="Log in" icon="arrow-right" onPress={signIn} style={styles.identityAction} />
        </Card>
      )}

      <LinearGradient colors={gradients.club} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.inset, styles.clubCard]}>
        {user ? (
          <>
            <View style={styles.clubHead}>
              <View style={styles.clubHeadText}>
                <Txt variant="overline" tint={colors.onPrimaryContainer}>
                  Xana Club
                </Txt>
                <Txt variant="headlineLg" tint={colors.onPrimary}>
                  {user.clubTier} member
                </Txt>
              </View>
              <View style={styles.clubPoints}>
                <Txt variant="display" tint={colors.onPrimary}>
                  {user.clubPoints.toLocaleString('en-KE')}
                </Txt>
                <Txt variant="caption" tint={colors.white70}>
                  points
                </Txt>
              </View>
            </View>
            <ProgressBar value={clubProgress} height={6} trackColor={colors.white70} fillColor={colors.tertiaryFixed} />
            <View style={styles.clubFoot}>
              <Txt variant="caption" tint={colors.white70} style={styles.clubFootText}>
                {nextTier ? `${pointsToNext.toLocaleString('en-KE')} points to ${nextTier.tier}` : 'Top tier unlocked. Earn on every order'}
              </Txt>
              <Pressable accessibilityRole="button" accessibilityLabel="View Xana Club rewards" hitSlop={8} onPress={() => setSheet('rewards')} style={styles.clubAction}>
                <Txt variant="label" tint={colors.onPrimary}>
                  View rewards
                </Txt>
                <Icon name="chevron-right" size={16} color={colors.onPrimary} />
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Txt variant="overline" tint={colors.onPrimaryContainer}>
              Xana Club
            </Txt>
            <Txt variant="headlineLg" tint={colors.onPrimary}>
              Rewards on every order
            </Txt>
            <Txt variant="bodySm" tint={colors.onPrimaryContainer}>
              Join free and earn points on groceries, pharmacy refills and wholesale cartons.
            </Txt>
            <Pressable accessibilityRole="button" accessibilityLabel="Join Xana Club" hitSlop={8} onPress={signIn} style={styles.clubAction}>
              <Txt variant="label" tint={colors.onPrimary}>
                Join the club
              </Txt>
              <Icon name="chevron-right" size={16} color={colors.onPrimary} />
            </Pressable>
          </>
        )}
      </LinearGradient>

      {user ? (
        <Card variant="elevated" padding={spacing.lg} style={styles.inset}>
          <View style={styles.statsRow}>
            <Stat value={String(orders.length)} label="Orders" onPress={() => router.push('/orders')} />
            <View style={styles.statDivider} />
            <Stat value={formatKes(cart.summary.wholesaleSavings)} label="Savings" onPress={() => router.push('/spending')} />
            <View style={styles.statDivider} />
            <Stat value={String(isDemo ? REPEAT_SCRIPTS.length : 0)} label="Prescriptions" onPress={() => router.push('/pharmacy/prescriptions')} />
          </View>
        </Card>
      ) : null}

      <Card variant="elevated" padding={spacing.lg} style={styles.inset}>
        <View style={styles.fulfilmentHead}>
          <View style={styles.fulfilmentIcon}>
            <Icon name={mode === 'delivery' ? 'delivery' : 'pickup'} size={20} color="primary" />
          </View>
          <View style={styles.fulfilmentText}>
            <Txt variant="title">Delivery or pickup</Txt>
            <Txt variant="caption" color="onSurfaceVariant" numberOfLines={2}>
              {mode === 'delivery' ? `${activeSlot.label} · ${activeSlot.window}` : `Collect from ${store.name} · ${activeSlot.window}`}
            </Txt>
          </View>
        </View>
        <Segmented options={MODE_OPTIONS} value={mode} onChange={setMode} />
        <Pressable accessibilityRole="button" accessibilityLabel="Change fulfilment store" onPress={() => setSheet('settings')} style={styles.storeRow}>
          <Icon name="store" size={18} color="primaryContainer" />
          <View style={styles.storeText}>
            <Txt variant="label" numberOfLines={1}>
              {store.name}
            </Txt>
            <Txt variant="caption" color="onSurfaceVariant" numberOfLines={1}>
              {store.address} · {store.phone}
            </Txt>
          </View>
          <Txt variant="labelSm" color="primary">
            Change
          </Txt>
        </Pressable>
      </Card>

      {isStaff ? (
        <View style={styles.section}>
          <SectionHeader title="For staff" style={styles.inset} />
          <RowGroup
            rows={[
              {
                key: 'staff',
                icon: 'store',
                title: 'Staff tools',
                description: 'Orders, returns and clinic bookings',
                onPress: () => router.push('/staff'),
              },
            ]}
          />
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionHeader title="Your account" style={styles.inset} />
        <RowGroup rows={accountRows} />
      </View>

      <View style={styles.section}>
        <SectionHeader title="Rewards & alerts" icon="sparkle" style={styles.inset} />
        <RowGroup rows={rewardRows} />
      </View>

      <View style={styles.section}>
        <SectionHeader title="Support & legal" style={styles.inset} />
        <RowGroup rows={supportRows} />
      </View>

      {user ? (
        <View style={styles.signOut}>
          <Button label="Sign out" variant="danger" icon="logout" iconPosition="leading" onPress={signOut} />
          <Txt variant="caption" color="onSurfaceVariant" align="center">
            Signed in as {user.name} · {user.phone}
          </Txt>
        </View>
      ) : null}

      <BottomSheet
        visible={sheet === 'orders'}
        onClose={closeSheet}
        title="My Orders"
        description={isAuthenticated ? 'Reorder a past basket in one tap.' : 'Log in to see your order history.'}
        scrollable
      >
        {isAuthenticated ? (
          ORDER_HISTORY.map(order => (
            <OrderBlock
              key={order.id}
              order={order}
              onReorder={() => reorder(order)}
              onOpenProduct={productId => {
                closeSheet();
                router.push(`/product/${productId}`);
              }}
            />
          ))
        ) : (
          <EmptyState icon="receipt" title="No orders yet" description="Log in to track deliveries, download receipts and reorder past baskets.">
            <Button label="Log in" onPress={signIn} />
          </EmptyState>
        )}
      </BottomSheet>

      <BottomSheet
        visible={sheet === 'prescriptions'}
        onClose={closeSheet}
        title="My Prescriptions"
        description={isAuthenticated ? 'Repeats a pharmacist has verified for you.' : 'Log in to manage your repeat prescriptions.'}
        scrollable
      >
        {isAuthenticated ? (
          <>
            {REPEAT_SCRIPTS.map(script => {
              const product = productById(script.productId);
              if (!product) return null;
              return (
                <Card key={script.productId} variant="flat" padding={spacing.lg} style={styles.cardStack}>
                  <View style={styles.scriptHead}>
                    <Txt variant="titleLg" numberOfLines={2} style={styles.scriptTitle}>
                      {product.name}
                    </Txt>
                    <Chip label={`${script.refillsLeft} refill${script.refillsLeft === 1 ? '' : 's'} left`} tone="mint" />
                  </View>
                  <Txt variant="caption" color="onSurfaceVariant">
                    {script.prescriber}
                  </Txt>
                  <Txt variant="bodySm" color="onSurfaceVariant">
                    Next refill {script.nextRefill}
                  </Txt>
                  <Button
                    label="Add to cart"
                    variant="tonal"
                    size="sm"
                    icon="cart"
                    iconPosition="leading"
                    fullWidth={false}
                    onPress={() => {
                      cart.add(product.id);
                      closeSheet();
                    }}
                  />
                </Card>
              );
            })}
            <Card variant="flat" padding={spacing.none}>
              <SettingsRow
                icon="prescription"
                title="Upload Prescription"
                description="Send it to our pharmacist from the Pharmacy tab"
                onPress={() => {
                  closeSheet();
                  router.push('/(tabs)/pharmacy');
                }}
              />
            </Card>
          </>
        ) : (
          <EmptyState icon="prescription" title="No prescriptions on file" description="Log in to upload an Rx and manage your repeats.">
            <Button label="Log in" onPress={signIn} />
          </EmptyState>
        )}
      </BottomSheet>

      <BottomSheet
        visible={sheet === 'address'}
        onClose={closeSheet}
        title="Saved Addresses"
        description={isAuthenticated ? 'Where we bring your Xana orders.' : 'Log in to save a delivery address.'}
        footer={
          isAuthenticated ? (
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
          ) : undefined
        }
      >
        {isAuthenticated && addresses.length === 0 ? (
          <EmptyState icon="map-pin" title="No saved address yet" description="Add one and checkout fills it in for you." />
        ) : isAuthenticated ? (
          <View style={styles.cardStack}>
            {removeFailed ? (
              <Txt variant="caption" color="error">
                Couldn&apos;t delete that address. Check your connection and try again.
              </Txt>
            ) : null}
            {addresses.map(entry => (
              <View key={entry.id} style={styles.addressItem}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Deliver to ${entry.label}`}
                onPress={() => {
                  setAddress(entry);
                  setMode('delivery');
                  closeSheet();
                }}
              >
                <Card variant={entry.id === address.id ? 'elevated' : 'flat'} padding={spacing.lg}>
                  <View style={styles.addressHead}>
                    <Chip label={entry.label} tone="mint" />
                    {entry.id === address.id && mode === 'delivery' ? <Chip label="Delivering now" tone="brand" /> : null}
                  </View>
                  <Txt variant="titleLg">{entry.contact}</Txt>
                  <Txt variant="bodySm" color="onSurfaceVariant">{entry.line}</Txt>
                  <Txt variant="bodySm" color="onSurfaceVariant">{entry.phone}</Txt>
                </Card>
              </Pressable>
              {/* A sibling of the card, not inside it: a button can't sit inside another button. */}
              <Button
                label={removingId === entry.id ? 'Tap again to delete' : 'Delete address'}
                icon="trash"
                iconPosition="leading"
                size="sm"
                variant={removingId === entry.id ? 'danger' : 'ghost'}
                fullWidth={false}
                onPress={() => void confirmRemove(entry.id)}
                style={styles.addressDelete}
              />
              </View>
            ))}
          </View>
        ) : (
          <EmptyState icon="map-pin" title="No saved address" description="Log in and add your address once and checkout will fill it in for you.">
            <Button label="Log in" onPress={signIn} />
          </EmptyState>
        )}
      </BottomSheet>

      <BottomSheet
        visible={sheet === 'payment'}
        onClose={closeSheet}
        title="Payment Methods"
        description="How you pay for this order at checkout."
        footer={<Button label="Done" onPress={closeSheet} />}
      >
        {PAYMENT_METHODS.map(method => (
          <SelectableOption
            key={method.id}
            title={method.title}
            description={method.description}
            note={method.id === 'mpesa' ? mpesaNumber : undefined}
            icon={method.icon}
            selected={paymentMethod === method.id}
            onPress={() => setPaymentMethod(method.id)}
          />
        ))}
      </BottomSheet>

      <BottomSheet
        visible={sheet === 'rewards'}
        onClose={closeSheet}
        title="Xana Club Rewards"
        description={user ? `${user.clubTier} member · ${user.clubPoints.toLocaleString('en-KE')} points` : 'Join free and earn on every order.'}
        scrollable
      >
        {user ? (
          <>
            <Card variant="tinted" padding={spacing.lg} style={styles.cardStack}>
              <View style={styles.clubHead}>
                <View style={styles.clubHeadText}>
                  <Txt variant="overline" color="primary">
                    Points balance
                  </Txt>
                  <Txt variant="display">{user.clubPoints.toLocaleString('en-KE')}</Txt>
                </View>
                <Chip label={user.clubTier} tone="mint" icon="star" />
              </View>
              <ProgressBar value={clubProgress} height={6} />
              <Txt variant="caption" color="onSurfaceVariant">
                {nextTier ? `${pointsToNext.toLocaleString('en-KE')} points to ${nextTier.tier}` : 'You are on the top tier'}
              </Txt>
            </Card>

            <Card variant="flat" padding={spacing.none}>
              {CLUB_TIERS.map((entry, index) => (
                <View key={entry.tier}>
                  {index > 0 ? <Divider inset={spacing.lg} /> : null}
                  <View style={styles.tierRow}>
                    <View style={styles.rowIcon}>
                      <Icon name="star" size={20} color={entry.tier === user.clubTier ? 'tertiaryContainer' : 'primaryContainer'} />
                    </View>
                    <View style={styles.rowBody}>
                      <Txt variant="title">{entry.tier} tier</Txt>
                      <Txt variant="caption" color="onSurfaceVariant">
                        From {entry.from.toLocaleString('en-KE')} points
                      </Txt>
                    </View>
                    {entry.tier === user.clubTier ? <Chip label="Your tier" tone="brand" /> : null}
                  </View>
                </View>
              ))}
            </Card>

            <Card variant="flat" padding={spacing.none}>
              {POINT_RULES.map((rule, index) => (
                <View key={rule.title}>
                  {index > 0 ? <Divider inset={spacing.lg} /> : null}
                  <View style={styles.tierRow}>
                    <View style={styles.rowIcon}>
                      <Icon name={rule.icon} size={20} color="primaryContainer" />
                    </View>
                    <View style={styles.rowBody}>
                      <Txt variant="title">{rule.title}</Txt>
                      <Txt variant="caption" color="onSurfaceVariant">
                        {rule.description}
                      </Txt>
                    </View>
                  </View>
                </View>
              ))}
            </Card>
          </>
        ) : (
          <EmptyState icon="gift" title="Xana Club is free to join" description="Log in to start earning points on groceries, pharmacy refills and wholesale cartons.">
            <Button label="Log in" onPress={signIn} />
          </EmptyState>
        )}
      </BottomSheet>

      <BottomSheet
        visible={sheet === 'notifications'}
        onClose={closeSheet}
        title="Notification Preferences"
        description="Choose the alerts you want from Xana Plus."
        footer={<Button label="Done" onPress={closeSheet} />}
        scrollable
      >
        <PreferencesSyncFeedback
          saving={preferencesSaving}
          error={preferencesError}
          onRetry={retryPreferences}
        />
        <Card variant="flat" padding={spacing.lg}>
          <ToggleRow
            icon="bell"
            title="Push notifications"
            description="Turn off to silence every alert below"
            value={pushEnabled}
            onValueChange={next => updatePreferences({ pushEnabled: next })}
          />
        </Card>

        <View style={!pushEnabled ? styles.alertsDisabled : undefined} pointerEvents={pushEnabled ? 'auto' : 'none'}>
          {ALERT_SECTIONS.map((section, sectionIndex) => (
            <View key={section.title} style={sectionIndex > 0 ? styles.cardStack : undefined}>
              <SectionHeader title={section.title} />
              <Card variant="flat" padding={spacing.none}>
                {section.rows.map((row, index) => (
                  <View key={row.key}>
                    {index > 0 ? <Divider inset={spacing.lg} /> : null}
                    <ToggleRow
                      icon={row.icon}
                      title={row.title}
                      description={row.description}
                      value={alerts[row.key]}
                      onValueChange={next => updatePreferences({ alerts: { [row.key]: next } })}
                    />
                  </View>
                ))}
              </Card>
            </View>
          ))}
        </View>

        <Txt variant="caption" color="onSurfaceVariant" style={styles.cardStack}>
          {`SMS and WhatsApp order status updates are managed under your account phone number (${
            user ? maskPhone(user.phone) : '+254 712 ••• •78'
          }). Critical transactional and safety notifications cannot be disabled.`}
        </Txt>
      </BottomSheet>

      <BottomSheet
        visible={sheet === 'help'}
        onClose={closeSheet}
        title="Help & Support"
        description={`Orders are picked at ${store.name}, ${store.address}.`}
        scrollable
      >
        <RowGroup rows={helpRows} flat />
      </BottomSheet>

      <BottomSheet visible={sheet === 'terms'} onClose={closeSheet} title="Terms & Privacy" description="Sign-in, privacy settings and the short version of how we handle your data." scrollable>
        {isAuthenticated && user ? (
          <>
            <SectionHeader title="Sign-in details" />
            <Card variant="flat" padding={spacing.lg} style={styles.cardStack}>
              <View style={styles.signInRow}>
                <View>
                  <Txt variant="title">{maskPhone(user.phone)}</Txt>
                  <Txt variant="caption" color="onSurfaceVariant">
                    Used to sign in and receive the M-Pesa prompt
                  </Txt>
                </View>
                <Button label="Change number" size="sm" variant="outline" onPress={changeNumber} />
              </View>
            </Card>

            <SectionHeader title="Privacy settings" style={styles.cardStack} />
            <Card variant="flat" padding={spacing.none} style={styles.cardStack}>
              {preferencesSaving || preferencesError ? (
                <View style={styles.privacySync}>
                  <PreferencesSyncFeedback
                    saving={preferencesSaving}
                    error={preferencesError}
                    onRetry={retryPreferences}
                  />
                </View>
              ) : null}
              {PRIVACY_ROWS.map((row, index) => (
                <View key={row.key}>
                  {index > 0 ? <Divider inset={spacing.lg} /> : null}
                  <ToggleRow
                    icon={row.icon}
                    title={row.title}
                    description={row.description}
                    value={privacy[row.key]}
                    onValueChange={next => updatePreferences({ privacy: { [row.key]: next } })}
                  />
                </View>
              ))}
            </Card>
          </>
        ) : null}

        <SectionHeader title="How we handle your data" style={styles.cardStack} />
        {PRIVACY_BLOCKS.map(block => (
          <Card key={block.title} variant="flat" padding={spacing.lg} style={styles.cardStack}>
            <Txt variant="titleLg">{block.title}</Txt>
            <Txt variant="bodySm" color="onSurfaceVariant">
              {block.body}
            </Txt>
          </Card>
        ))}

        {isAuthenticated ? (
          <View style={styles.cardStack}>
            <Button
              label="Delete my account"
              variant="danger"
              icon="trash"
              iconPosition="leading"
              onPress={() => {
                setDeleteFailed(false);
                setSheet('delete-account');
              }}
            />
          </View>
        ) : null}
      </BottomSheet>

      <BottomSheet
        visible={sheet === 'delete-account'}
        onClose={deleting ? () => {} : () => setSheet('terms')}
        title="Delete your account?"
        description="This can't be undone."
        footer={
          <View style={styles.sheetFooter}>
            <Button label={deleting ? 'Deleting…' : 'Delete account'} variant="danger" disabled={deleting} onPress={confirmDelete} />
            <Button label="Keep my account" variant="outline" disabled={deleting} onPress={() => setSheet('terms')} />
          </View>
        }
      >
        <Txt variant="bodySm" color="onSurfaceVariant">
          {`Your name, saved addresses, settings and ${
            user ? user.clubPoints.toLocaleString('en-KE') : 'your'
          } Xana Club points will be removed and you'll be signed out. Past orders stay in our records for accounting, without your name or address.`}
        </Txt>
        {deleteFailed ? (
          <Txt variant="caption" color="error">
            Couldn&apos;t delete your account. Check your connection and try again.
          </Txt>
        ) : null}
      </BottomSheet>

      <NameSheet
        visible={sheet === 'edit-name'}
        onClose={closeSheet}
        title="Your name"
        description="Shown on your orders and to your rider."
        initialName={user && user.name !== 'Xana member' ? user.name : ''}
      />

      <BottomSheet
        visible={sheet === 'settings'}
        onClose={closeSheet}
        title="Settings"
        description="Choose the store that picks and packs your orders."
        footer={<Button label="Done" onPress={closeSheet} />}
        scrollable
      >
        {stores.map(entry => (
          <SelectableOption
            key={entry.id}
            title={entry.name}
            description={`${entry.address} · ${entry.phone}`}
            icon="store"
            selected={storeId === entry.id}
            onPress={() => setStoreId(entry.id)}
          />
        ))}
      </BottomSheet>
    </Screen>
  );
}

/** Persistent, calm status for the optimistic account-preferences save. */
function PreferencesSyncFeedback({
  saving,
  error,
  onRetry,
  style,
}: {
  saving: boolean;
  error: string | null;
  onRetry: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  if (!saving && !error) return null;

  return (
    <View
      accessibilityRole="summary"
      style={[styles.syncNotice, error ? styles.syncNoticeError : styles.syncNoticePending, style]}
    >
      <Icon name="info" size={18} color={error ? 'error' : 'primaryContainer'} />
      <View style={styles.syncNoticeBody}>
        <Txt variant="caption" color={error ? 'error' : 'onSurfaceVariant'}>
          {error ?? 'Saving your settings…'}
        </Txt>
        {error ? (
          <Button label="Retry" size="sm" variant="outline" fullWidth={false} onPress={onRetry} />
        ) : null}
      </View>
    </View>
  );
}

/** One tappable list row: glyph, title, supporting line and a disclosure chevron. */
function SettingsRow({
  icon,
  title,
  description,
  value,
  onPress,
}: {
  icon: IconName;
  title: string;
  description: string;
  value?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
    >
      <View style={styles.rowIcon}>
        <Icon name={icon} size={20} color="primaryContainer" />
      </View>
      <View style={styles.rowBody}>
        <Txt variant="title" numberOfLines={1}>
          {title}
        </Txt>
        <Txt variant="caption" color="onSurfaceVariant" numberOfLines={1}>
          {description}
        </Txt>
      </View>
      {value ? (
        <Txt variant="labelSm" color="onSurfaceVariant">
          {value}
        </Txt>
      ) : null}
      <Icon name="chevron-right" size={18} color="onSurfaceVariant" />
    </Pressable>
  );
}

/** Divider-separated rows inside one card — every list on this screen uses it. */
function RowGroup({ rows, flat }: { rows: RowSpec[]; flat?: boolean }) {
  return (
    <Card variant={flat ? 'flat' : 'elevated'} padding={spacing.none} style={flat ? undefined : styles.inset}>
      {rows.map((row, index) => (
        <View key={row.key}>
          {index > 0 ? <Divider inset={spacing.lg} /> : null}
          <SettingsRow icon={row.icon} title={row.title} description={row.description} value={row.value} onPress={row.onPress} />
        </View>
      ))}
    </Card>
  );
}

/** Switch row used by the notification sheet. */
function ToggleRow({
  icon,
  title,
  description,
  value,
  onValueChange,
}: {
  icon: IconName;
  title: string;
  description: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.rowIcon}>
        <Icon name={icon} size={20} color="primaryContainer" />
      </View>
      <View style={styles.rowBody}>
        <Txt variant="title">{title}</Txt>
        <Txt variant="caption" color="onSurfaceVariant">
          {description}
        </Txt>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        accessibilityLabel={title}
        trackColor={{ false: colors.surfaceContainerHighest, true: colors.primaryContainer }}
        thumbColor={colors.surface}
        ios_backgroundColor={colors.surfaceContainerHighest}
      />
    </View>
  );
}

/** One past order: status, items and a reorder action. */
function OrderBlock({ order, onReorder, onOpenProduct }: { order: OrderRecord; onReorder: () => void; onOpenProduct: (productId: string) => void }) {
  const { items, total, unitCount } = resolveOrder(order);

  return (
    <Card variant="flat" padding={spacing.lg}>
      <View style={styles.orderHead}>
        <View style={styles.orderHeadText}>
          <Txt variant="titleLg">{order.id}</Txt>
          <Txt variant="caption" color="onSurfaceVariant">
            {order.placed} · {formatCartCounts(items.length, unitCount)}
          </Txt>
        </View>
        <Chip label={order.status} tone={order.tone} />
      </View>
      <View>
        {items.map(item => (
          <Pressable
            key={item.product.id}
            accessibilityRole="button"
            accessibilityLabel={item.product.name}
            onPress={() => onOpenProduct(item.product.id)}
            style={styles.orderLine}
          >
            <Txt variant="bodySm" numberOfLines={1} style={styles.orderLineName}>
              {item.product.name}
            </Txt>
            <Txt variant="labelSm" color="onSurfaceVariant">
              ×{item.quantity}
            </Txt>
            <Icon name="chevron-right" size={14} color="onSurfaceVariant" />
          </Pressable>
        ))}
      </View>
      <Divider />
      <View style={styles.orderFoot}>
        <Txt variant="titleLg">{formatKes(total)}</Txt>
        <Button label="Reorder" variant="outline" size="sm" icon="refresh" fullWidth={false} onPress={onReorder} />
      </View>
    </Card>
  );
}

/** Quick stat: big number over its label. */
function Stat({ value, label, onPress }: { value: string; label: string; onPress?: () => void }) {
  const body = (
    <>
      <Txt variant="headlineLg" numberOfLines={1}>
        {value}
      </Txt>
      <View style={styles.statLabel}>
        <Txt variant="caption" color="onSurfaceVariant" align="center" numberOfLines={1}>
          {label}
        </Txt>
        {onPress ? <Icon name="chevron-right" size={12} color="primaryContainer" /> : null}
      </View>
    </>
  );

  if (!onPress) return <View style={styles.stat}>{body}</View>;

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}. View breakdown`} onPress={onPress} style={styles.stat}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  inset: { marginHorizontal: layout.screenMargin },
  section: { gap: spacing.sm },
  /** Multi-line card bodies (sheets) need their own vertical rhythm. */
  cardStack: { gap: spacing.sm },
  signInRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  alertsDisabled: { opacity: 0.4 },

  identityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  avatar: { width: 64, height: 64, borderRadius: radius.pill, backgroundColor: colors.primaryContainer, alignItems: 'center', justifyContent: 'center' },
  avatarMuted: { width: 64, height: 64, borderRadius: radius.pill, backgroundColor: colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' },
  identityBody: { flex: 1, gap: spacing.xxs, alignItems: 'flex-start' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, maxWidth: '100%' },
  nameText: { flexShrink: 1 },
  sheetFooter: { gap: spacing.sm },
  addressItem: { gap: spacing.xs },
  addressDelete: { alignSelf: 'flex-end' },
  identityAction: { marginTop: spacing.lg },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.tertiaryContainer,
    marginTop: spacing.xs,
  },

  clubCard: { borderRadius: radius.card, padding: spacing.lg, gap: spacing.md, ...elevation.card },
  clubHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  clubHeadText: { flex: 1, gap: spacing.xxs },
  clubPoints: { alignItems: 'flex-end' },
  statLabel: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  clubFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  clubFootText: { flexShrink: 1 },
  clubAction: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },

  statsRow: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center', gap: spacing.xxs },
  statDivider: { width: StyleSheet.hairlineWidth, height: 32, backgroundColor: colors.surfaceContainerHigh },

  fulfilmentHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  fulfilmentIcon: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.mintSurface, alignItems: 'center', justifyContent: 'center' },
  fulfilmentText: { flex: 1, gap: spacing.xxs },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainerLow,
  },
  storeText: { flex: 1, gap: spacing.xxs },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: layout.touchTarget },
  rowPressed: { backgroundColor: colors.surfaceContainerHigh },
  rowIcon: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.mintSurface, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, gap: spacing.xxs },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceContainerLow },
  syncNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md },
  syncNoticeError: { backgroundColor: colors.amberTint15 },
  syncNoticePending: { backgroundColor: colors.surfaceContainerLow },
  syncNoticeBody: { flex: 1, gap: spacing.xs, alignItems: 'flex-start' },
  privacySync: { paddingHorizontal: spacing.md, paddingTop: spacing.md },

  tierRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: layout.touchTarget },

  orderHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.md },
  orderHeadText: { flex: 1, gap: spacing.xxs },
  orderLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  orderLineName: { flex: 1 },
  orderFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.md },

  scriptHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  scriptTitle: { flex: 1 },

  addressHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },

  signOut: { marginHorizontal: layout.screenMargin, gap: spacing.sm },
});
