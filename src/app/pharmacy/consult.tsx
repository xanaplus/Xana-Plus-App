import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, TextInput, View } from 'react-native';

import { Button, Card, Chip, Icon, Screen, SectionHeader, TopBar, Txt } from '@/components/ui';
import { productById } from '@/data/catalog';
import { CONSULT_TOPICS, PHARMACIST, PPB_FOOTER } from '@/data/prescriptions';
import { useRepeatScripts } from '@/features/account/sample-data';
import { colors, radius, spacing } from '@/theme';

/** Screen 08d — Pharmacy: Ask a Pharmacist (consultation intake). */
export default function ConsultScreen() {
  const router = useRouter();
  const [topic, setTopic] = useState<string | null>(null);
  const [shareMeds, setShareMeds] = useState(false);
  const [message, setMessage] = useState('');

  const scripts = useRepeatScripts();
  const meds = scripts.map(s => productById(s.productId)).filter(Boolean);

  return (
    <Screen
      padded
      contentStyle={styles.content}
      footer={
        <View style={styles.footerBar}>
          <Button
            label="Start Consultation"
            size="lg"
            fullWidth
            disabled={!topic && message.trim().length === 0}
            onPress={() =>
              router.push({
                pathname: '/pharmacy/chat',
                params: { topic: topic ?? 'General', message, shareMeds: shareMeds ? '1' : '0' },
              })
            }
          />
          <Txt variant="caption" color="onSurfaceVariant" align="center">
            Free and confidential · WhatsApp or in-app chat
          </Txt>
        </View>
      }
    >
      <TopBar
        title="Ask a Pharmacist"
        subtitle="Free confidential consultation"
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/pharmacy'))}
      />

      {/* Pharmacist */}
      <Card variant="elevated" padding={spacing.lg} style={styles.pharmacist}>
        <View style={styles.avatar}>
          <Icon name="stethoscope" size={22} color="onPrimary" />
        </View>
        <View style={styles.pharmacistText}>
          <Txt variant="label">{PHARMACIST.name}</Txt>
          <Txt variant="caption" color="onSurfaceVariant">
            {PHARMACIST.role} · {PHARMACIST.registration}
          </Txt>
          <View style={styles.onlineRow}>
            <View style={styles.onlineDot} />
            <Txt variant="caption" color="primaryContainer">
              Online now · {PHARMACIST.responseTime}
            </Txt>
          </View>
        </View>
      </Card>

      {/* Privacy */}
      <Card variant="tinted" padding={spacing.lg} style={styles.privacy}>
        <Icon name="lock" size={16} color="primaryContainer" />
        <Txt variant="caption" color="onSurfaceVariant" style={styles.privacyText}>
          This conversation is private. It is not shared with your household and does not appear in your order
          history.
        </Txt>
      </Card>

      {/* Topics */}
      <SectionHeader title="What would you like to ask about?" style={styles.sectionHead} />
      <View style={styles.topics}>
        {CONSULT_TOPICS.map(t => (
          <Chip key={t} label={t} selected={topic === t} onPress={() => setTopic(topic === t ? null : t)} />
        ))}
      </View>

      {/* Medication context */}
      <Card variant="elevated" padding={spacing.lg} style={styles.card}>
        <View style={styles.shareRow}>
          <View style={styles.shareText}>
            <Txt variant="label">Share my current medications</Txt>
            <Txt variant="caption" color="onSurfaceVariant">
              Lets {PHARMACIST.name.split(' ')[1]} cross-reference known interactions.
            </Txt>
          </View>
          <Switch
            value={shareMeds}
            onValueChange={setShareMeds}
            trackColor={{ true: colors.primaryContainer, false: colors.surfaceContainerHigh }}
            thumbColor={colors.surface}
          />
        </View>
        <View style={styles.medChips}>
          {meds.map(product =>
            product ? (
              <Chip key={product.id} label={product.name} tone={shareMeds ? 'mint' : 'neutral'} />
            ) : null,
          )}
        </View>
      </Card>

      {/* Composer */}
      <SectionHeader title="Your question" style={styles.sectionHead} />
      <Card variant="elevated" padding={spacing.lg} style={styles.card}>
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder="Describe your question. Do not include your ID or payment details."
          placeholderTextColor={colors.outline}
          multiline
          numberOfLines={4}
          accessibilityLabel="Your question"
          style={styles.input}
        />
        <Txt variant="caption" color="onSurfaceVariant" align="right">
          {message.length}/500
        </Txt>
      </Card>

      {/* Emergency caution */}
      <Card variant="flat" padding={spacing.lg} style={styles.caution}>
        <Icon name="alert" size={16} color="secondaryContainer" />
        <Txt variant="caption" color="onSurfaceVariant" style={styles.cautionText}>
          This service is not for emergencies. For urgent symptoms call 999 or go to your nearest facility.
        </Txt>
      </Card>

      <View style={styles.footer}>
        {PPB_FOOTER.map(line => (
          <Txt key={line} variant="caption" color="onSurfaceVariant" align="center">
            {line}
          </Txt>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.giant },
  sectionHead: { marginTop: spacing.sm },
  card: { gap: spacing.md },

  pharmacist: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pharmacistText: { flex: 1, gap: spacing.xxs },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  onlineDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.success },

  privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  privacyText: { flex: 1 },

  topics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

  shareRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  shareText: { flex: 1, gap: spacing.xxs },
  medChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

  input: {
    minHeight: 96,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
    padding: spacing.md,
    color: colors.onSurface,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    textAlignVertical: 'top',
  },

  caution: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  cautionText: { flex: 1 },

  footerBar: { gap: spacing.sm },
  footer: { gap: spacing.xxs, marginTop: spacing.lg },
});
