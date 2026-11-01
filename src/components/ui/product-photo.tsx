import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Txt } from '@/components/ui/text';
import { supabase } from '@/lib/supabase';
import { spacing } from '@/theme';
import { useTheme } from '@/theme/provider';

type ProductPhotoSource = number | { uri: string };

/** Items already reported this session, so a list of broken photos asks once each. */
const reported = new Set<string>();

/**
 * A POS photo address that won't load may have moved (product-image-api.md §3):
 * ask the server to re-check the item, and the photo sync fetches a fresh address.
 */
function reportBrokenPhoto(productId: string, source?: ProductPhotoSource) {
  if (typeof source !== 'object' || !source.uri.startsWith('http') || reported.has(productId)) return;
  reported.add(productId);
  void supabase.rpc('report_broken_photo', { p_item_no: productId }).then(() => undefined, () => undefined);
}

type ProductPhotoProps = {
  source?: ProductPhotoSource;
  productId: string;
  accessibilityLabel: string;
  variant: 'card' | 'row' | 'hero';
};

/**
 * Product-only image treatment. Containment keeps the complete pack visible;
 * a keyed inner view ensures load/error state never leaks between products.
 */
export function ProductPhoto({ source, productId, accessibilityLabel, variant }: ProductPhotoProps) {
  const sourceKey = source === undefined ? 'missing' : typeof source === 'number' ? String(source) : source.uri;

  return (
    <ProductPhotoContent
      key={`${productId}:${sourceKey}`}
      source={source}
      productId={productId}
      accessibilityLabel={accessibilityLabel}
      variant={variant}
    />
  );
}

function ProductPhotoContent({ source, productId, accessibilityLabel, variant }: ProductPhotoProps) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const available = source !== undefined && !failed;
  const unavailableLabel = source === undefined ? 'Product photo unavailable' : 'Unable to load product photo';

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={available ? accessibilityLabel : `${unavailableLabel} for ${accessibilityLabel}`}
      style={[styles.frame, styles[variant]]}
    >
      {available ? (
        <Image
          source={source}
          style={styles.image}
          contentFit="contain"
          contentPosition="center"
          cachePolicy="memory-disk"
          transition={140}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setFailed(true);
            reportBrokenPhoto(productId, source);
          }}
        />
      ) : null}
      {available && !loaded ? (
        <View pointerEvents="none" style={[styles.loading, { backgroundColor: colors.surfaceContainerLow }]}>
          <Icon name="store" size={variant === 'row' ? 18 : 26} color="outlineVariant" />
          {variant !== 'row' ? (
            <Txt variant="caption" color="outline" numberOfLines={1} style={styles.fallbackText}>
              Loading product photo
            </Txt>
          ) : null}
        </View>
      ) : !available ? (
        <View style={styles.fallback}>
          <Icon name="store" size={variant === 'row' ? 18 : 26} color="outlineVariant" />
          {variant !== 'row' ? (
            <Txt variant="caption" color="outline" numberOfLines={1} style={styles.fallbackText}>
              {unavailableLabel}
            </Txt>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
  fallback: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  fallbackText: { maxWidth: '90%' },
  loading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  // Thin margin so the pack fills the box, as on Jumia and Instacart.
  card: { padding: spacing.xxs },
  row: { padding: spacing.xxs },
  hero: { padding: spacing.xl },
});
