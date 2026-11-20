import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { PulseBox } from '@/components/ui/skeleton';
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

/**
 * Photos that have already loaded once this session. Coming back to them (switching Shop
 * pills, going back a screen) skips the pulsing placeholder and the fade: they're in the
 * image cache, so they appear straight away.
 */
const shown = new Set<string>();
export const photoShown = (key: string) => shown.has(key);
export const markPhotoShown = (key: string) => {
  shown.add(key);
};

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
  const sourceKey = typeof source === 'object' ? source.uri : undefined;
  const [seen] = useState(() => (sourceKey ? photoShown(sourceKey) : false));
  const [loaded, setLoaded] = useState(seen);
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
          transition={seen ? 0 : 140}
          onLoad={() => {
            if (sourceKey) markPhotoShown(sourceKey);
            setLoaded(true);
          }}
          onError={() => {
            setFailed(true);
            reportBrokenPhoto(productId, source);
          }}
        />
      ) : null}
      {/* A pulsing box while the photo loads, like the skeletons; the photo fades in over it. */}
      {available && !loaded ? <PulseBox color={colors.surfaceContainerHigh} /> : null}
      {/* No photo (prescription medicines, items not yet photographed): a calm mark, no "unavailable" caption. */}
      {!available ? (
        <View style={styles.fallback}>
          <View style={[styles.mark, variant === 'row' ? styles.markRow : null, { backgroundColor: colors.surfaceContainerLow }]}>
            <Icon name="store" size={variant === 'row' ? 16 : variant === 'hero' ? 34 : 24} color="outline" />
          </View>
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
  mark: { width: '56%', aspectRatio: 1, maxWidth: 96, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  markRow: { width: '70%' },
  // Thin margin so the pack fills the box, as on Jumia and Instacart.
  card: { padding: spacing.xxs },
  row: { padding: spacing.xxs },
  hero: { padding: spacing.xl },
});
