import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Small touches of feedback on the phone. Web (the dev preview) has no
 * vibration motor, and a failed haptic must never break the action it decorates.
 */
const enabled = Platform.OS === 'ios' || Platform.OS === 'android';

/** A light tap: adding to cart, picking an option. */
export function tapFeedback(): void {
  if (enabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** A success buzz: order placed, booking or return sent. */
export function successFeedback(): void {
  if (enabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
