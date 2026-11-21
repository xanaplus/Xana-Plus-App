import { Redirect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button, Card, PressableScale, SearchBar, Screen, TopBar, Txt } from '@/components/ui';
import { stores } from '@/data/catalog';
import { DeliveryMap, deliveryMapAvailable, type DeliveryMapHandle, type LatLng } from '@/features/delivery/delivery-map';
import { locateDelivery, locateMessage, quoteIsFresh, type DeliveryQuote, type LocateRequest } from '@/lib/delivery-locate';
import { formatKes } from '@/lib/format';
import { useFulfilment } from '@/store/fulfilment';
import { useSession } from '@/store/session';
import { elevation, radius, spacing, type Palette } from '@/theme';
import { useTheme, useThemeStyles } from '@/theme/provider';

/** Rough store spots, only to open the map nearby when the phone's location is refused. */
const STORE_POINTS: Record<string, LatLng> = {
  syokimau: { lat: -1.3606, lng: 36.9352 },
  ruiru: { lat: -1.1855, lng: 36.9395 },
};

/** Waits this long after the map stops before measuring, so a drag in steps asks once. */
const SETTLE_MS = 600;

type DeviceFix = { point: LatLng } | { refused: true } | { failed: true };

/** The phone's location; expo-location is loaded on first use so older builds without it don't crash. */
async function deviceLocation(): Promise<DeviceFix> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Location = require('expo-location') as typeof import('expo-location');
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return { refused: true };
    const fix = (await Location.getLastKnownPositionAsync({ maxAge: 60_000 })) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return { point: { lat: fix.coords.latitude, lng: fix.coords.longitude } };
  } catch {
    return { failed: true };
  }
}

/** A typed "Green Park, Syokimau" is the line and the area; one word or place is the area. */
function splitTyped(text: string): { line: string; area: string } {
  const parts = text.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length < 2) return { line: '', area: parts[0] ?? '' };
  return { line: parts.slice(0, -1).join(', '), area: parts[parts.length - 1] };
}

/**
 * Screen: where the door delivery goes (owner, 20 Nov 2026, Glovo/Uber style). The
 * customer drags the map under a fixed centre pin to their gate, sees the distance
 * and fee from web-checkout, and taps "Deliver here". The quote is kept in the
 * fulfilment store for checkout. Behind LAUNCH_SCOPE.delivery.
 */
function DeliveryMapScreen() {
  const styles = useThemeStyles(createStyles);
  const { resolved } = useTheme();
  const router = useRouter();
  const session = useSession();
  const fulfilment = useFulfilment();
  const signedIn = session.user != null;
  const branchCode = fulfilment.store.id.toUpperCase();

  const mapRef = useRef<DeliveryMapHandle>(null);
  const [hasMap] = useState(deliveryMapAvailable);
  // The place chosen before, while its quote still holds.
  const [held] = useState(() => (quoteIsFresh(fulfilment.deliveryQuote) ? fulfilment.deliveryQuote : null));
  const [start] = useState<LatLng>(() => (held ? { lat: held.lat, lng: held.lng } : (STORE_POINTS[fulfilment.store.id] ?? STORE_POINTS.syokimau)));

  const [query, setQuery] = useState('');
  const [moving, setMoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [finding, setFinding] = useState(false);
  const [quote, setQuote] = useState<DeliveryQuote | null>(held);
  const [areaOnly, setAreaOnly] = useState(false);
  const [problem, setProblem] = useState<string | null>(signedIn ? null : 'signed_out');
  const [note, setNote] = useState<string | null>(null);

  // Newer requests win: a slow reply for an old pin never replaces a newer one.
  const serial = useRef(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
  }, []);

  const locate = useCallback(
    async (where: LocateRequest, moveMap: boolean) => {
      if (!signedIn) {
        setProblem('signed_out');
        return;
      }
      const mine = ++serial.current;
      setBusy(true);
      setProblem(null);
      setNote(null);
      const result = await locateDelivery(where, branchCode);
      if (mine !== serial.current) return;
      setBusy(false);
      if (!result.ok) {
        setQuote(null);
        setProblem(result.error);
        return;
      }
      setQuote(result.quote);
      setAreaOnly(result.precision === 'area');
      if (moveMap) mapRef.current?.moveTo({ lat: result.quote.lat, lng: result.quote.lng }, result.precision !== 'area');
    },
    [signedIn, branchCode],
  );

  const locateMe = useCallback(async () => {
    setFinding(true);
    setNote(null);
    const fix = await deviceLocation();
    setFinding(false);
    if ('point' in fix) {
      mapRef.current?.moveTo(fix.point);
      await locate({ point: { ...fix.point, source: 'device', label: 'Your location' } }, false);
    } else {
      setNote(
        'refused' in fix
          ? 'Location is off for Xana Plus. Search for your area, or move the map to your gate.'
          : "We couldn't get your location. Search for your area, or move the map to your gate.",
      );
    }
  }, [locate]);

  // Opens on the phone's location when allowed (and nothing was chosen before).
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || held || !signedIn) return;
    opened.current = true;
    void locateMe();
  }, [held, signedIn, locateMe]);

  const onMoveStart = useCallback(() => {
    serial.current++;
    setMoving(true);
    if (settleTimer.current) clearTimeout(settleTimer.current);
  }, []);

  const onSettled = useCallback(
    (point: LatLng) => {
      setMoving(false);
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => {
        void locate({ point: { ...point, source: 'pin', label: 'Pinned place' } }, false);
      }, SETTLE_MS);
    },
    [locate],
  );

  const search = () => {
    const typed = splitTyped(query);
    if (typed.area.length < 2) {
      setProblem('invalid_address');
      return;
    }
    void locate({ address: typed }, true);
  };

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/checkout'));

  const deliverHere = () => {
    if (!quote) return;
    fulfilment.setDeliveryQuote(quote);
    goBack();
  };

  const branchName = (code: string, fallback: string) => stores.find(s => s.id.toUpperCase() === code)?.name ?? fallback;
  const working = busy || moving;
  // A place found only by its area needs the pin on the gate (as the website asks).
  const ready = quote != null && !working && !areaOnly && problem == null;

  return (
    <Screen
      scroll={false}
      padded={false}
      footer={
        <View style={styles.footer}>
          {working ? (
            <View style={styles.row}>
              {moving ? null : <ActivityIndicator size="small" />}
              <Txt variant="bodySm" color="onSurfaceVariant">
                {moving ? 'Let go where we should deliver' : 'Working out the distance…'}
              </Txt>
            </View>
          ) : problem ? (
            <View style={styles.cardText}>
              <Txt variant="bodySm" color="error">{locateMessage(problem)}</Txt>
              {problem === 'signed_out' ? (
                <Button label="Log in" variant="tonal" size="sm" fullWidth={false} onPress={() => router.push('/login')} />
              ) : null}
            </View>
          ) : quote ? (
            <View style={styles.cardText}>
              <Txt variant="titleSm" numberOfLines={2}>{quote.locationLabel || 'Pinned place'}</Txt>
              <Txt variant="bodySm" color="onSurfaceVariant">
                {`${quote.distanceKm.toLocaleString('en-KE', { maximumFractionDigits: 1 })} km from ${branchName(quote.branchCode, quote.branchName)} · Delivery ${formatKes(quote.deliveryFee)}`}
              </Txt>
              {areaOnly ? (
                <Txt variant="bodySm" color="error">
                  {hasMap ? 'We only found the area. Move the map so the pin sits on your gate.' : 'We only found the area. Type your estate or a landmark too, for example "Green Park, Syokimau".'}
                </Txt>
              ) : null}
            </View>
          ) : (
            <Txt variant="bodySm" color="onSurfaceVariant">
              {hasMap ? 'Move the map so the pin sits on your gate, or search for your area.' : 'Search for your estate and area, for example "Green Park, Syokimau".'}
            </Txt>
          )}
          {note ? <Txt variant="caption" color="onSurfaceVariant">{note}</Txt> : null}
          <Txt variant="caption" color="onSurfaceVariant">Delivery orders are paid online.</Txt>
          <Button label="Deliver here" size="lg" disabled={!ready} onPress={deliverHere} />
        </View>
      }
    >
      <TopBar title="Where should we deliver?" onBack={goBack} />
      <View style={styles.searchRow}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          onSubmit={search}
          placeholder="Search your estate or area"
          trailingIcon={query ? 'close' : undefined}
          onTrailingPress={() => setQuery('')}
          style={styles.flex}
        />
      </View>

      <View style={styles.mapArea}>
        {hasMap ? (
          <>
            <DeliveryMap ref={mapRef} start={start} dark={resolved === 'dark'} onMoveStart={onMoveStart} onSettled={onSettled} />
            {/* The fixed centre pin: the map moves under it. Its tip sits on the centre. */}
            <View pointerEvents="none" style={styles.pinWrap}>
              <View style={[styles.pin, moving ? styles.pinLifted : null]}>
                <View style={styles.pinHead} />
                <View style={styles.pinStem} />
              </View>
              <View style={styles.pinShadow} />
            </View>
          </>
        ) : (
          <Card variant="outline" padding={spacing.lg} style={styles.noMap}>
            <Txt variant="bodySm" color="onSurfaceVariant">
              The map opens in the Xana Plus phone app. Here, search for your estate and area instead.
            </Txt>
          </Card>
        )}
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Use my location"
          onPress={() => void locateMe()}
          disabled={finding}
          style={styles.locateButton}
        >
          {finding ? <ActivityIndicator size="small" /> : null}
          <Txt variant="label" color="primaryAccent">Use my location</Txt>
        </PressableScale>
      </View>
    </Screen>
  );
}

export default function DeliveryMapRoute() {
  return useFulfilment().deliveryOn ? <DeliveryMapScreen /> : <Redirect href="/checkout" />;
}

const PIN = 28;

const createStyles = (colors: Palette) => StyleSheet.create({
  flex: { flex: 1 },
  searchRow: { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  mapArea: { flex: 1, overflow: 'hidden', backgroundColor: colors.surfaceContainerLow },
  noMap: { margin: spacing.lg },

  pinWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  // Lifted by its own height so the stem's tip is on the map's centre.
  pin: { alignItems: 'center', transform: [{ translateY: -(PIN + 12) / 2 }] },
  pinLifted: { transform: [{ translateY: -(PIN + 12) / 2 - 8 }] },
  pinHead: { width: PIN, height: PIN, borderRadius: PIN / 2, backgroundColor: colors.primary, borderWidth: 4, borderColor: colors.surface, ...elevation.card },
  pinStem: { width: 3, height: 12, backgroundColor: colors.primary },
  pinShadow: { position: 'absolute', width: 8, height: 4, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.25)' },

  locateButton: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    ...elevation.card,
  },

  footer: { gap: spacing.sm },
  cardText: { gap: spacing.xs, alignItems: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
