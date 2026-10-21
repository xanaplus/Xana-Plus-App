import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet, Icon, Txt } from '@/components/ui';
import { groupedPharmacyContacts, whatsappLink, type PharmacyContact } from '@/data/pharmacy-contacts';
import { useFulfilment } from '@/store/fulfilment';
import { radius, spacing } from '@/theme';
import { useThemeStyles } from '@/theme/provider';
import type { Palette } from '@/theme';

/**
 * "Ask a pharmacist on WhatsApp": the same list as the website, pickup branches
 * first (the customer's own branch leading), then the standalone pharmacies.
 * Nothing is stored or sent by us; the chat happens in WhatsApp.
 */
export function PharmacistWhatsAppSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useThemeStyles(createStyles);
  const { store } = useFulfilment();
  const { branches, standalone } = groupedPharmacyContacts(store.id);

  const open = (contact: PharmacyContact) => {
    void Linking.openURL(whatsappLink(contact));
    onClose();
  };

  const group = (title: string, contacts: readonly PharmacyContact[]) => (
    <View style={styles.group}>
      <Txt variant="overline" color="outline">
        {title}
      </Txt>
      {contacts.map(contact => (
        <Pressable
          key={contact.id}
          accessibilityRole="button"
          accessibilityLabel={`Ask ${contact.name} pharmacy on WhatsApp`}
          onPress={() => open(contact)}
          style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
        >
          <View style={styles.glyph}>
            <Icon name="whatsapp" size={20} color="primaryAccent" />
          </View>
          <View style={styles.rowText}>
            <Txt variant="label">{contact.name}</Txt>
            <Txt variant="caption" color="onSurfaceVariant">
              {contact.storeId === store.id ? `Your branch · ${contact.phone}` : `${contact.note} · ${contact.phone}`}
            </Txt>
          </View>
          <Icon name="arrow-right" size={18} color="outline" />
        </Pressable>
      ))}
    </View>
  );

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      scrollable
      title="Ask a pharmacist on WhatsApp"
      description="Pick a pharmacy. WhatsApp opens with a message ready to send."
    >
      {group('Order collection branches', branches)}
      {group('Standalone pharmacies', standalone)}
      <Txt variant="caption" color="onSurfaceVariant">
        WhatsApp is run by Meta, not by Xana Plus. For an emergency, call the pharmacy or go to a hospital.
      </Txt>
    </BottomSheet>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    group: { gap: spacing.sm },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 56,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceContainerLow,
    },
    pressed: { opacity: 0.85 },
    glyph: {
      width: 36,
      height: 36,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    rowText: { flex: 1, gap: 2 },
  });
