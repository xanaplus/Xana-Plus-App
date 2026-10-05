import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, Chip, Icon, Screen, TopBar, Txt } from '@/components/ui';
import { productById } from '@/data/catalog';
import { PHARMACIST } from '@/data/prescriptions';
import { useRepeatScripts } from '@/features/account/sample-data';
import { formatKes } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

/** Screen 08e — Pharmacy: Consultation Chat. */

type Message = {
  id: string;
  from: 'user' | 'pharmacist';
  text: string;
  /** Pharmacist replies can carry a product recommendation. */
  productId?: string;
};

const QUICK_REPLIES = ['Take it with meals?', 'Check drug interactions', 'Request prescription refill'];

export default function ConsultationChatScreen() {
  const scripts = useRepeatScripts();
  const router = useRouter();
  const params = useLocalSearchParams<{ topic?: string; message?: string; shareMeds?: string }>();
  const scrollRef = useRef<ScrollView>(null);

  const opening = (params.message || '').trim();
  const topic = params.topic || 'General';
  const sharedMeds = params.shareMeds === '1';

  const [messages, setMessages] = useState<Message[]>(() => [
    {
      id: 'm1',
      from: 'user',
      text: opening.length > 0 ? opening : `I have a question about ${topic.toLowerCase()}.`,
    },
  ]);
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(true);

  // The pharmacist's first reply, so the screen demonstrates a real exchange.
  useEffect(() => {
    const timer = setTimeout(() => {
      setTyping(false);
      setMessages(prev => [
        ...prev,
        {
          id: 'm2',
          from: 'pharmacist',
          text: `Thanks for reaching out. Regarding ${topic.toLowerCase()}, take it with food to reduce stomach irritation, and keep at least 6 hours between doses. If you are also on blood-pressure medication, let me know.`,
          productId: 'ibuprofen-400mg-30s',
        },
      ]);
    }, 1800);
    return () => clearTimeout(timer);
  }, [topic]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages(prev => [...prev, { id: `u${prev.length}`, from: 'user', text: trimmed }]);
    setDraft('');
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMessages(prev => [
        ...prev,
        {
          id: `p${prev.length}`,
          from: 'pharmacist',
          text: 'Noted, that is safe alongside your current repeats. I have added a note to your file for the dispensing pharmacist.',
        },
      ]);
    }, 1600);
  };

  return (
    <Screen
      padded
      scroll={false}
      contentStyle={styles.content}
      footer={
        <View style={styles.composerBar}>
          <View style={styles.quickRow}>
            {QUICK_REPLIES.map(q => (
              <Chip key={q} label={q} onPress={() => send(q)} />
            ))}
          </View>
          <View style={styles.composer}>
            <Pressable accessibilityRole="button" accessibilityLabel="Attach prescription or lab photo" style={styles.attach}>
              <Icon name="prescription" size={18} color="onSurfaceVariant" />
            </Pressable>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Send a confidential message"
              placeholderTextColor={colors.outline}
              accessibilityLabel="Message"
              style={styles.input}
              onSubmitEditing={() => send(draft)}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send confidential message"
              onPress={() => send(draft)}
              style={[styles.send, draft.trim() ? null : styles.sendOff]}
            >
              <Icon name="arrow-right" size={18} color="onPrimary" />
            </Pressable>
          </View>
        </View>
      }
    >
      <TopBar
        title={PHARMACIST.name}
        subtitle={`${PHARMACIST.role} · ${PHARMACIST.registration}`}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/pharmacy/consult'))}
        actions={
          <Pressable accessibilityRole="button" accessibilityLabel="Start voice consultation" style={styles.callButton}>
            <Icon name="phone" size={16} color="primaryContainer" />
          </Pressable>
        }
      />

      <ScrollView
        ref={scrollRef}
        style={styles.thread}
        contentContainerStyle={styles.threadContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        showsVerticalScrollIndicator={false}
      >
        <Txt variant="caption" color="onSurfaceVariant" align="center" style={styles.dayDivider}>
          Today
        </Txt>

        {sharedMeds && scripts.length > 0 ? (
          <Card variant="tinted" padding={spacing.md} style={styles.contextCard}>
            <Txt variant="labelSm" color="primaryContainer">
              SHARED WITH PHARMACIST
            </Txt>
            <View style={styles.contextChips}>
              {scripts.map(s => {
                const product = productById(s.productId);
                return product ? <Chip key={s.productId} label={product.name} tone="mint" /> : null;
              })}
            </View>
          </Card>
        ) : null}

        {messages.map(message => {
          const mine = message.from === 'user';
          const product = message.productId ? productById(message.productId) : undefined;
          return (
            <View key={message.id} style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
              <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                <Txt variant="bodySm" tint={mine ? colors.onPrimary : colors.onSurface}>
                  {message.text}
                </Txt>

                {product ? (
                  <View style={styles.recommendation}>
                    <View style={styles.recText}>
                      <Txt variant="labelSm" numberOfLines={2}>
                        {product.name}
                      </Txt>
                      <Txt variant="caption" color="onSurfaceVariant">
                        {product.pack} · {formatKes(product.price)}
                      </Txt>
                    </View>
                    <Button label="View" size="sm" variant="outline" onPress={() => router.push(`/product/${product.id}`)} />
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}

        {typing ? (
          <View style={[styles.row, styles.rowTheirs]}>
            <View style={[styles.bubble, styles.bubbleTheirs, styles.typing]}>
              <Txt variant="caption" color="onSurfaceVariant">
                {PHARMACIST.name.split(' ')[1]} is typing…
              </Txt>
            </View>
          </View>
        ) : null}

        <Txt variant="caption" color="onSurfaceVariant" align="center" style={styles.disclaimer}>
          Not for emergencies. For urgent symptoms call 999.
        </Txt>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, gap: spacing.sm },
  callButton: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  thread: { flex: 1 },
  threadContent: { gap: spacing.md, paddingVertical: spacing.md },
  dayDivider: { marginBottom: spacing.xs },

  contextCard: { gap: spacing.sm },
  contextChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },

  row: { flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '82%', padding: spacing.md, borderRadius: radius.xl, gap: spacing.sm },
  bubbleMine: { backgroundColor: colors.primaryContainer, borderBottomRightRadius: radius.xs },
  bubbleTheirs: { backgroundColor: colors.surface, borderBottomLeftRadius: radius.xs, borderWidth: 1, borderColor: colors.outlineSoft30 },
  typing: { paddingVertical: spacing.sm },

  recommendation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainerLow,
  },
  recText: { flex: 1, gap: spacing.xxs },

  disclaimer: { marginTop: spacing.sm },

  composerBar: { gap: spacing.sm },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  composer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  attach: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
    paddingHorizontal: spacing.lg,
    color: colors.onSurface,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendOff: { opacity: 0.4 },
});
