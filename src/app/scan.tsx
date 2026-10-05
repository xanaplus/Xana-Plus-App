import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon, Screen, Txt } from '@/components/ui';
import { fetchProductByBarcode } from '@/data/live-catalogue';
import type { Product } from '@/data/types';
import { tapFeedback } from '@/lib/haptics';
import { discountPercent, formatKesDecimal } from '@/lib/format';
import { useCart } from '@/store/cart';
import { colors, radius, spacing } from '@/theme';

/**
 * Screen: Barcode Scanner (FR-B.7). The camera reads the barcode and the
 * product is looked up by its GTIN in the Business Central catalogue. A typed
 * code does the same when the camera can't read the label or isn't allowed.
 */

/** Retail packaging barcodes: EAN/UPC plus Code 128, which some BC items use. */
const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] as const;

type Lookup =
  | { state: 'scanning' }
  | { state: 'looking'; code: string }
  | { state: 'found'; code: string; product: Product }
  | { state: 'missing'; code: string }
  | { state: 'error'; code: string };

export default function ScanRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cart = useCart();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [lookup, setLookup] = useState<Lookup>({ state: 'scanning' });
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  // The camera reports the same code many times a second; only the first read counts.
  const busy = useRef(false);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  const find = async (raw: string) => {
    const code = raw.replace(/\D/g, '');
    if (busy.current || code.length < 6) return;
    busy.current = true;
    tapFeedback();
    setLookup({ state: 'looking', code });
    try {
      const product = await fetchProductByBarcode(code);
      setLookup(product ? { state: 'found', code, product } : { state: 'missing', code });
    } catch {
      setLookup({ state: 'error', code });
    }
  };

  const scanAgain = () => {
    busy.current = false;
    setTyped('');
    setLookup({ state: 'scanning' });
  };

  const onScanned = (result: BarcodeScanningResult) => {
    if (lookup.state === 'scanning') void find(result.data);
  };

  const cameraReady = permission?.granted === true;
  const scanning = lookup.state === 'scanning';

  return (
    <Screen padded={false} edgeToEdgeTop backgroundColor={colors.inverseSurface} contentStyle={styles.content}>
      {/* Light clock and battery icons over the dark scanner. */}
      <StatusBar style="light" />

      {cameraReady ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
          onBarcodeScanned={scanning ? onScanned : undefined}
        />
      ) : null}

      {/* Full-bleed dark screen: the header clears the status bar itself. */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close scanner" onPress={close} style={styles.headerButton}>
          <Icon name="close" size={20} color="inverseOnSurface" />
        </Pressable>
        <View style={styles.headerPill}>
          <Txt variant="labelSm" tint={colors.inverseOnSurface}>
            Xana Plus Scanner
          </Txt>
        </View>
        {cameraReady ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={torch ? 'Turn off the light' : 'Turn on the light'}
            onPress={() => setTorch(on => !on)}
            style={[styles.headerButton, torch ? styles.headerButtonOn : null]}
          >
            <Icon name="flame" size={18} color={torch ? 'onPrimary' : 'inverseOnSurface'} />
          </Pressable>
        ) : (
          <View style={styles.headerButton} />
        )}
      </View>

      <View style={styles.viewfinderWrap}>
        {scanning && cameraReady ? (
          <View style={styles.tipBadge}>
            <Icon name="scan" size={14} color="inverseOnSurface" />
            <Txt variant="labelSm" tint={colors.inverseOnSurface}>
              Align barcode within frame
            </Txt>
          </View>
        ) : null}
        {cameraReady ? (
          <View style={styles.reticle}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
        ) : (
          <View style={styles.noCamera}>
            <Icon name="scan" size={40} color="inverseOnSurface" />
            <Txt variant="title" tint={colors.inverseOnSurface} align="center">
              {permission === null ? 'Starting the camera…' : 'Camera access is off'}
            </Txt>
            {permission && !permission.granted ? (
              <Button
                label={permission.canAskAgain ? 'Allow camera' : 'Open settings'}
                icon="scan"
                iconPosition="leading"
                fullWidth={false}
                onPress={() => (permission.canAskAgain ? void requestPermission() : void Linking.openSettings())}
              />
            ) : null}
          </View>
        )}
      </View>

      <View style={styles.sheet}>
        {lookup.state === 'found' ? (
          <View style={styles.foundCard}>
            <View style={[styles.foundBadge, lookup.product.inStock === false ? styles.foundBadgeOut : null]}>
              <Txt variant="labelSm" tint={colors.onPrimary}>
                {lookup.product.inStock === false ? 'ITEM FOUND · OUT OF STOCK' : 'ITEM FOUND · IN STOCK'}
              </Txt>
            </View>
            <View style={styles.foundMeta}>
              <Txt variant="titleLg" numberOfLines={2}>
                {lookup.product.name}
              </Txt>
              <Txt variant="caption" color="onSurfaceVariant">
                {[lookup.product.pack, `Barcode ${lookup.code}`].filter(Boolean).join(' · ')}
              </Txt>
              <View style={styles.priceRow}>
                <Txt variant="priceLg" color="primary">
                  {formatKesDecimal(lookup.product.price)}
                </Txt>
                {lookup.product.wasPrice ? (
                  <>
                    <Txt variant="priceStrike" color="onSurfaceVariant" style={styles.strike}>
                      {formatKesDecimal(lookup.product.wasPrice)}
                    </Txt>
                    <Txt variant="labelSm" tint={colors.secondaryContainer}>
                      {`-${discountPercent(lookup.product.price, lookup.product.wasPrice)}%`}
                    </Txt>
                  </>
                ) : null}
              </View>
            </View>
            <View style={styles.foundActions}>
              {lookup.product.inStock === false ? null : (
                <Button
                  label="Add to Cart"
                  icon="plus"
                  iconPosition="leading"
                  style={styles.flex}
                  onPress={() => {
                    cart.add(lookup.product.id);
                    scanAgain();
                  }}
                />
              )}
              <Button
                label="View product"
                variant="outline"
                style={styles.flex}
                onPress={() => router.replace(`/product/${lookup.product.id}`)}
              />
            </View>
            <Pressable accessibilityRole="button" onPress={scanAgain} style={styles.manualLink}>
              <Txt variant="label" color="primaryContainer">
                Scan another item
              </Txt>
            </Pressable>
          </View>
        ) : lookup.state === 'looking' ? (
          <View style={styles.status}>
            <Txt variant="headlineSm" align="center">
              Looking up {lookup.code}…
            </Txt>
          </View>
        ) : lookup.state === 'missing' || lookup.state === 'error' ? (
          <View style={styles.status}>
            <Txt variant="headlineSm" align="center">
              {lookup.state === 'missing' ? 'We don’t stock this item yet' : 'Couldn’t check that barcode'}
            </Txt>
            <Txt variant="bodySm" color="onSurfaceVariant" align="center" style={styles.helperBody}>
              {lookup.state === 'missing'
                ? `No Xana Plus product has barcode ${lookup.code}. Try searching by name instead.`
                : 'Check your connection and try again.'}
            </Txt>
            <View style={styles.foundActions}>
              <Button label="Scan again" style={styles.flex} onPress={scanAgain} />
              <Button label="Search by name" variant="outline" style={styles.flex} onPress={() => router.replace('/search')} />
            </View>
          </View>
        ) : typing ? (
          <View style={styles.status}>
            <Txt variant="title">Enter the barcode</Txt>
            <TextInput
              value={typed}
              onChangeText={text => setTyped(text.replace(/\D/g, '').slice(0, 14))}
              placeholder="e.g. 6009627050034"
              placeholderTextColor={colors.outline}
              keyboardType="number-pad"
              inputMode="numeric"
              returnKeyType="search"
              enterKeyHint="search"
              onSubmitEditing={() => void find(typed)}
              autoFocus
              accessibilityLabel="Barcode number"
              style={styles.input}
            />
            <View style={styles.foundActions}>
              <Button label="Find product" style={styles.flex} disabled={typed.length < 6} onPress={() => void find(typed)} />
              <Button label="Use camera" variant="outline" style={styles.flex} onPress={() => setTyping(false)} />
            </View>
          </View>
        ) : (
          <>
            <Txt variant="headlineSm" align="center">
              Point your camera at a barcode
            </Txt>
            <Txt variant="bodySm" color="onSurfaceVariant" align="center" style={styles.helperBody}>
              Scan packaged groceries to check the price and whether Xana Plus Syokimau and Ruiru have it in stock.
            </Txt>
            <Pressable accessibilityRole="button" onPress={() => setTyping(true)} style={styles.manualLink}>
              <Txt variant="label" color="primaryContainer">
                Having trouble scanning? Enter code manually
              </Txt>
            </Pressable>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  headerButtonOn: { backgroundColor: colors.primaryContainer },
  headerPill: { paddingHorizontal: spacing.md, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)' },

  viewfinderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xxl },
  tipBadge: {
    position: 'absolute',
    top: spacing.giant,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  reticle: { width: 240, height: 240 },
  corner: { position: 'absolute', width: 32, height: 32, borderColor: colors.primaryFixed },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: radius.md },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: radius.md },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: radius.md },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: radius.md },
  noCamera: { alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl },

  sheet: {
    gap: spacing.md,
    padding: spacing.xl,
    borderTopLeftRadius: radius.sheetTop,
    borderTopRightRadius: radius.sheetTop,
    backgroundColor: colors.surface,
  },
  helperBody: { paddingHorizontal: spacing.lg },
  manualLink: { alignSelf: 'center', paddingTop: spacing.sm },
  status: { gap: spacing.md },
  input: {
    height: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineSoft30,
    backgroundColor: colors.surface,
    color: colors.onSurface,
    fontSize: 18,
    letterSpacing: 1,
  },

  foundCard: { gap: spacing.md },
  foundBadge: { alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs, borderRadius: radius.xs, backgroundColor: colors.success },
  foundBadgeOut: { backgroundColor: colors.outline },
  foundMeta: { gap: spacing.xxs },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  strike: { textDecorationLine: 'line-through' },
  foundActions: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
