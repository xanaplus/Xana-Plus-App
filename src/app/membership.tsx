import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Badge, Button, Divider, Icon, Screen, TopBar, Txt, type IconName } from '@/components/ui';
import { formatKes } from '@/lib/format';
import { useSession } from '@/store/session';
import { layout, radius, spacing } from '@/theme';
import { useTheme, useThemeStyles } from '@/theme/provider';
import type { Palette } from '@/theme';

/**
 * Member Services and Benefits (owner, 18 Nov 2026). Plans and prices are the owner's;
 * paying for a plan, member prices (a BC price group) and free health checks are not
 * live yet, so this page informs and charges nothing. No example "member prices":
 * none exist until BC has them.
 */

type Plan = { id: string; name: string; price: number | null; period: string; detail: string };
/** Owner, 18 Nov 2026: prices include VAT. */
const PLANS: Plan[] = [
  { id: 'associate', name: 'Associate', price: null, period: 'Free', detail: 'Regular prices. Every Xana Plus account starts here.' },
  { id: 'monthly', name: 'Member, monthly', price: 200, period: 'a month', detail: 'Member prices and member services, month by month.' },
  { id: 'annual', name: 'Member, annual', price: 2000, period: 'a year', detail: 'The same for a full year.' },
];
const MONTHLY_FOR_A_YEAR = 200 * 12;

const BENEFITS: { icon: IconName; title: string; body: string; status?: 'live' | 'soon' }[] = [
  {
    icon: 'tag',
    title: 'Member-only prices',
    body: 'Pay the Member price on marked supermarket and pharmacy items, and see what you save against the regular price.',
  },
  {
    icon: 'stethoscope',
    title: 'Free health checks',
    body: 'Which checks, where and how to book will be added here soon.',
  },
  {
    icon: 'receipt',
    title: 'Track your purchases and savings',
    body: 'See what you bought and what membership saved you.',
  },
  {
    icon: 'heart',
    title: 'Wellness check-ins',
    body: 'Water, mood and movement check-ins. Open to everyone already, in the Wellness tab.',
    status: 'live',
  },
];

const COMING_SOON = ['Recipe suggestions', 'Family Health Records', 'Group Bulk Buy', 'Smart basket building'];

export default function MembershipRoute() {
  const styles = useThemeStyles(createStyles);
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useSession();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const scroll = useRef<ScrollView>(null);
  const plansY = useRef(0);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  return (
    <Screen scroll={false} padded={false} contentStyle={styles.screenBody}>
      <TopBar title="Member Services and Benefits" onBack={goBack} />
      <ScrollView ref={scroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.page}>
        <View style={styles.hero}>
          <Txt variant="display" tint={colors.onPrimary}>Discover what comes with Membership</Txt>
          <Txt variant="body" tint={colors.onPrimaryContainer}>
            Join Xana Plus for Member-only prices on supermarket and pharmacy products, plus health and wellness services for you and your family.
          </Txt>
          <View style={styles.soonPill}>
            <Icon name="clock" size={14} color={colors.onSecondaryContainer} />
            <Txt variant="label" tint={colors.onSecondaryContainer}>Opens soon. Nothing is charged yet.</Txt>
          </View>
        </View>

        <View style={styles.section}>
          {BENEFITS.map((benefit, index) => (
            <View key={benefit.title}>
              {index > 0 ? <Divider /> : null}
              <View style={styles.benefit}>
                <View style={styles.benefitIcon}>
                  <Icon name={benefit.icon} size={20} color="primaryAccent" />
                </View>
                <View style={styles.flex}>
                  <View style={styles.benefitHead}>
                    <Txt variant="titleLg" style={styles.flexShrink}>{benefit.title}</Txt>
                    {benefit.status === 'live' ? <Badge label="Available now" tone="fresh" /> : null}
                  </View>
                  <Txt variant="bodySm" color="onSurfaceVariant">{benefit.body}</Txt>
                </View>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Txt variant="headline">Coming soon</Txt>
          <View style={styles.soonList}>
            {COMING_SOON.map(item => (
              <View key={item} style={styles.soonChip}>
                <Txt variant="label" color="onSurfaceVariant">{item}</Txt>
              </View>
            ))}
          </View>
        </View>

        <View
          style={styles.section}
          onLayout={event => {
            plansY.current = event.nativeEvent.layout.y;
            if (section === 'plans') scroll.current?.scrollTo({ y: plansY.current - spacing.lg, animated: false });
          }}
        >
          <Txt variant="headline">Membership levels</Txt>
          <View style={styles.plans}>
            {PLANS.map(plan => {
              const current = Boolean(user) && plan.id === 'associate';
              return (
                <View key={plan.id} style={[styles.plan, plan.id === 'annual' ? styles.planFeatured : null]}>
                  <View style={styles.planHead}>
                    <Txt variant="titleLg" style={styles.flexShrink}>{plan.name}</Txt>
                    {current ? <Badge label="Your plan" tone="brand" /> : null}
                    {plan.id === 'annual' ? <Badge label={`Save ${formatKes(MONTHLY_FOR_A_YEAR - (plan.price ?? 0))} a year`} tone="discount" /> : null}
                  </View>
                  <Txt variant="priceLg">
                    {plan.price === null ? 'Free' : formatKes(plan.price)}
                    {plan.price === null ? null : <Txt variant="body" color="onSurfaceVariant">{` ${plan.period}`}</Txt>}
                  </Txt>
                  <Txt variant="bodySm" color="onSurfaceVariant">{plan.detail}</Txt>
                </View>
              );
            })}
          </View>
          <Txt variant="caption" color="onSurfaceVariant">Prices include VAT.</Txt>
          {user ? (
            <Button label="Member plans open soon" disabled icon="clock" iconPosition="leading" />
          ) : (
            <Button label="Create your free account" icon="user" iconPosition="leading" onPress={() => router.push('/login')} />
          )}
          <Txt variant="caption" color="onSurfaceVariant" style={styles.center}>
            {user ? 'We will let you know when you can become a Member.' : 'Start with your name and mobile number.'}
          </Txt>
        </View>
      </ScrollView>
    </Screen>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  screenBody: { paddingTop: spacing.none, paddingBottom: spacing.none },
  page: { paddingBottom: spacing.colossal },
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  center: { textAlign: 'center' },
  hero: {
    marginHorizontal: layout.screenMargin,
    marginTop: spacing.lg,
    padding: spacing.xl,
    gap: spacing.sm,
    borderRadius: radius.card,
    backgroundColor: colors.primaryContainer,
  },
  soonPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.secondaryContainer,
  },
  section: { paddingHorizontal: layout.screenMargin, marginTop: spacing.xxxl, gap: spacing.sm },
  benefit: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md },
  benefitHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  benefitIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soonList: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  soonChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineSoft30,
    backgroundColor: colors.surface,
  },
  plans: { gap: spacing.sm, marginTop: spacing.xs },
  plan: {
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.outlineSoft30,
  },
  planFeatured: { borderColor: colors.primaryContainer, borderWidth: 2 },
  planHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
});
