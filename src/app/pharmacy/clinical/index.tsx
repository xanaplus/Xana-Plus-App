import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Chip, Icon, Screen, Txt, TopBar, TopBarAction } from '@/components/ui';
import { CLINICAL_CATEGORY_LABELS, CLINICAL_SERVICES, type ClinicalCategory } from '@/data/clinical';
import { useFulfilment } from '@/store/fulfilment';
import { colors, radius, spacing } from '@/theme';

/** Screen 1: Clinical Services Directory (FR-F.10). */
export default function ClinicalDirectoryRoute() {
  const router = useRouter();
  const { store } = useFulfilment();
  const [category, setCategory] = useState<ClinicalCategory | null>(null);

  const services = useMemo(
    () => (category ? CLINICAL_SERVICES.filter(service => service.category === category) : CLINICAL_SERVICES),
    [category],
  );

  return (
    <Screen padded={false} contentStyle={styles.content}>
      <TopBar
        title="Clinical Services"
        subtitle="Xana Plus Pharmacy"
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/pharmacy'))}
        actions={<TopBarAction name="phone" accessibilityLabel="Call the clinical helpline" onPress={() => Linking.openURL(`tel:${store.phone.replace(/\s/g, '')}`)} />}
      />

      <View style={styles.inset}>
        <View style={styles.introBanner}>
          <Icon name="shield" size={18} color="primary" />
          <View style={styles.flex}>
            <View style={styles.introHead}>
              <Txt variant="titleLg">In-Pharmacy Clinical Care</Txt>
              <View style={styles.ppbBadge}>
                <Txt variant="labelSm" color="primary">PPB Certified</Txt>
              </View>
            </View>
            <Txt variant="bodySm" color="onSurfaceVariant">
              Walk-in & scheduled consultations conducted by PPB-certified pharmacists at Syokimau and Ruiru dispensary suites.
            </Txt>
          </View>
        </View>

        <View style={styles.locationStrip}>
          <Icon name="map-pin" size={14} color="onSurfaceVariant" />
          <Txt variant="labelSm" color="onSurfaceVariant" style={styles.flex}>
            Xana Plus Syokimau & Ruiru
          </Txt>
          <Txt variant="caption" color="onSurfaceVariant">8:00 AM to 9:00 PM</Txt>
        </View>
      </View>

      <View style={styles.tabsRow}>
        {CLINICAL_CATEGORY_LABELS.map(entry => {
          const count = entry.value ? CLINICAL_SERVICES.filter(s => s.category === entry.value).length : CLINICAL_SERVICES.length;
          return (
            <Chip
              key={entry.label}
              label={entry.value === null ? `${entry.label} (${count})` : entry.label}
              selected={category === entry.value}
              onPress={() => setCategory(entry.value)}
            />
          );
        })}
      </View>

      <View style={[styles.inset, styles.grid]}>
        {services.map(service => (
          <View key={service.id} style={styles.card}>
            <View style={styles.cardHead}>
              <View style={styles.cardIcon}>
                <Icon name={service.icon} size={20} color="primaryContainer" />
              </View>
              <View style={styles.flex}>
                <View style={styles.cardTitleRow}>
                  <Txt variant="titleLg" style={styles.flex}>{service.name}</Txt>
                  {service.badge ? (
                    <View style={styles.badge}>
                      <Txt variant="labelSm" color="primary">{service.badge}</Txt>
                    </View>
                  ) : null}
                </View>
                <Txt variant="bodySm" color="onSurfaceVariant">{service.description}</Txt>
              </View>
            </View>

            <View style={styles.metaRow}>
              <View style={styles.metaChip}>
                <Icon name="clock" size={12} color="onSurfaceVariant" />
                <Txt variant="caption" color="onSurfaceVariant">{`${service.durationMinutes} mins`}</Txt>
              </View>
              <View style={styles.metaChip}>
                <Txt variant="caption" color="onSurfaceVariant">{service.tag}</Txt>
              </View>
            </View>

            <View style={styles.priceRow}>
              <View>
                <Txt variant="caption" color="onSurfaceVariant">{service.priceLabel}</Txt>
                <Txt variant="titleLg" color="primary">{`KES ${service.price.toLocaleString('en-KE')}`}</Txt>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Book ${service.name}`}
                onPress={() => router.push({ pathname: '/pharmacy/clinical/[serviceId]', params: { serviceId: service.id } })}
                style={styles.bookButton}
              >
                <Txt variant="buttonSm" tint={colors.onPrimary}>Book Now</Txt>
                <Icon name="arrow-right" size={14} color="onPrimary" />
              </Pressable>
            </View>
          </View>
        ))}
      </View>

      <View style={[styles.inset, styles.footer]}>
        <View style={styles.regNote}>
          <Icon name="shield" size={14} color="onSurfaceVariant" />
          <View style={styles.flex}>
            <Txt variant="label">Regulatory Accreditation</Txt>
            <Txt variant="caption" color="onSurfaceVariant">
              Kenya Pharmacy and Poisons Board (PPB) Licensed Premises · Reg PPB/NRB/RET-2024-884. Clinical screening
              is for monitoring and preventive care, not a substitute for emergency hospital treatment.
            </Txt>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Call 999 for a medical emergency"
          onPress={() => Linking.openURL('tel:999')}
          style={styles.emergency}
        >
          <Icon name="alert" size={14} color="error" />
          <Txt variant="caption" tint={colors.error} style={styles.flex}>For acute medical emergencies call 999</Txt>
          <Txt variant="label" tint={colors.error}>Call</Txt>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingBottom: spacing.giant },
  inset: { marginHorizontal: spacing.lg },
  flex: { flex: 1 },

  introBanner: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.mintSurface },
  introHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  ppbBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.xs, backgroundColor: colors.white95 },
  locationStrip: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },

  tabsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.lg },

  grid: { gap: spacing.md },
  card: { gap: spacing.md, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outlineSoft30 },
  cardHead: { flexDirection: 'row', gap: spacing.md },
  cardIcon: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.mintSurface, alignItems: 'center', justifyContent: 'center' },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.xs, backgroundColor: colors.mintSubtle },

  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs, borderRadius: radius.xs, backgroundColor: colors.surfaceContainerLow },

  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bookButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, height: 40, borderRadius: radius.pill, backgroundColor: colors.primary },

  footer: { gap: spacing.md },
  regNote: { flexDirection: 'row', gap: spacing.sm },
  emergency: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.errorContainer },
});
