import { useEffect, useRef, useState } from 'react';
import {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

/**
 * A quick bounce whenever `value` goes up — the cart count after an add. Still when the
 * phone asks for reduced motion.
 */
export function useBump(value: number) {
  const scale = useSharedValue(1);
  const previous = useRef(value);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (value > previous.current && !reduced) {
      scale.value = withSequence(withTiming(1.3, { duration: 110 }), withSpring(1, { damping: 9, stiffness: 260 }));
    }
    previous.current = value;
  }, [value, reduced, scale]);

  return useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
}

/** Counts from 0 up to `to` over `duration` ms (points earned); jumps straight there with reduced motion. */
export function useCountUp(to: number, duration = 700): number {
  const reduced = useReducedMotion();
  const animate = !reduced && to > 0;
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!animate) return;
    const start = Date.now();
    const timer = setInterval(() => {
      const progress = Math.min(1, (Date.now() - start) / duration);
      // Ease out, so the count slows as it lands.
      setShown(Math.round(to * (1 - (1 - progress) ** 3)));
      if (progress === 1) clearInterval(timer);
    }, 30);
    return () => clearInterval(timer);
  }, [to, duration, animate]);

  return animate ? shown : to;
}
