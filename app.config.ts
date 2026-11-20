import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * app.json holds the config; this only adds the Google Maps key for Android's
 * delivery map (address/map) from the GOOGLE_MAPS_ANDROID_KEY environment variable
 * (an EAS environment variable, never in the repo). Without it the build has no map
 * on Android and the delivery screen falls back to search. iPhone uses Apple Maps
 * (no key). Maps SDK for Android only: no Places, Geocoding or map ID (they cost money).
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const androidKey = process.env.GOOGLE_MAPS_ANDROID_KEY?.trim() || undefined;
  return {
    ...config,
    name: config.name ?? 'Xana Plus',
    slug: config.slug ?? 'xanaplus',
    plugins: [
      ...(config.plugins ?? []),
      ['react-native-maps', androidKey ? { androidGoogleMapsApiKey: androidKey } : {}],
    ],
    extra: {
      ...config.extra,
      // Read by src/features/delivery/delivery-map.tsx: Google's SDK crashes without a key.
      googleMapsAndroid: Boolean(androidKey),
    },
  };
};
