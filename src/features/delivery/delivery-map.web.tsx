import type { Ref } from 'react';

export type LatLng = { lat: number; lng: number };
export type DeliveryMapHandle = { moveTo: (point: LatLng, close?: boolean) => void };

export type DeliveryMapProps = {
  ref?: Ref<DeliveryMapHandle>;
  start: LatLng;
  dark: boolean;
  onMoveStart?: () => void;
  onSettled: (point: LatLng) => void;
};

/** The web preview has no native map (react-native-maps is phone-only): the screen shows search alone. */
export const deliveryMapAvailable = () => false;

export function DeliveryMap(_props: DeliveryMapProps) {
  return null;
}
