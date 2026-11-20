import Constants from 'expo-constants';
import { useImperativeHandle, useRef, type Ref } from 'react';
import { Platform, StyleSheet } from 'react-native';
import type MapViewType from 'react-native-maps';
import type { Details, Region } from 'react-native-maps';

export type LatLng = { lat: number; lng: number };
export type DeliveryMapHandle = { moveTo: (point: LatLng, close?: boolean) => void };

export type DeliveryMapProps = {
  ref?: Ref<DeliveryMapHandle>;
  /** Where the map opens. */
  start: LatLng;
  dark: boolean;
  /** The customer started dragging the map (the pin lifts). */
  onMoveStart?: () => void;
  /** The map stopped after the customer moved it: the point under the centre pin. */
  onSettled: (point: LatLng) => void;
};

// Close up for a found house or pin; wider when only the area is known.
const CLOSE = 0.004;
const WIDE = 0.02;

type MapsModule = typeof import('react-native-maps');
let maps: MapsModule | null | undefined;

/**
 * react-native-maps is loaded on first use, never at import: a phone running an
 * older build without the map module (an over-the-air update) must not crash
 * while door delivery is switched off.
 */
function loadMaps(): MapsModule | null {
  if (maps !== undefined) return maps;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    maps = require('react-native-maps') as MapsModule;
  } catch {
    maps = null;
  }
  return maps;
}

/**
 * True when this phone can draw the map. Android needs the Google Maps key in the
 * build (GOOGLE_MAPS_ANDROID_KEY, see app.config.ts); without it Google's SDK crashes.
 */
export function deliveryMapAvailable(): boolean {
  if (Platform.OS === 'android' && !(Constants.expoConfig?.extra as { googleMapsAndroid?: boolean } | undefined)?.googleMapsAndroid) return false;
  return loadMaps() != null;
}

/** The map under the fixed centre pin: Google Maps on Android, Apple Maps on iPhone. No map ID, no paid APIs. */
export function DeliveryMap({ ref, start, dark, onMoveStart, onSettled }: DeliveryMapProps) {
  const mapRef = useRef<MapViewType>(null);
  const moving = useRef(false);
  const touched = useRef(false);
  const mapsModule = loadMaps();

  useImperativeHandle(ref, () => ({
    moveTo: (point, close = true) => {
      const delta = close ? CLOSE : WIDE;
      mapRef.current?.animateToRegion({ latitude: point.lat, longitude: point.lng, latitudeDelta: delta, longitudeDelta: delta }, 400);
    },
  }), []);

  if (!mapsModule) return null;
  const MapView = mapsModule.default;
  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      provider={Platform.OS === 'android' ? mapsModule.PROVIDER_GOOGLE : undefined}
      initialRegion={{ latitude: start.lat, longitude: start.lng, latitudeDelta: WIDE, longitudeDelta: WIDE }}
      userInterfaceStyle={dark ? 'dark' : 'light'}
      showsUserLocation
      showsMyLocationButton={false}
      toolbarEnabled={false}
      rotateEnabled={false}
      pitchEnabled={false}
      // Only the customer's own drags move the pin; the app's own moves (search, location,
      // first load) don't. isGesture is Google-only, so a touch on the map marks a drag too.
      onTouchStart={() => {
        touched.current = true;
      }}
      onRegionChange={(_region: Region, details?: Details) => {
        if (details?.isGesture === false || !touched.current || moving.current) return;
        moving.current = true;
        onMoveStart?.();
      }}
      onRegionChangeComplete={(region: Region, details?: Details) => {
        const wasMoving = moving.current;
        moving.current = false;
        if (!wasMoving || details?.isGesture === false) return;
        touched.current = false;
        onSettled({ lat: region.latitude, lng: region.longitude });
      }}
    />
  );
}
