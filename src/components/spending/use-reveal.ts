import { useEffect, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

/** How long a chart takes to draw in once it scrolls into view. */
const REVEAL_MS = 900;

/**
 * 0 → 1 once `active` turns true, eased out so the chart settles gently; stays at 1.
 * With Reduce Motion on, it jumps straight to 1.
 */
export function useRevealProgress(active: boolean, duration = REVEAL_MS): number {
  const reduceMotion = useReducedMotion();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!active || reduceMotion) return;
    const start = Date.now();
    let frame = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      setProgress(1 - (1 - t) ** 3);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, reduceMotion, duration]);

  // With Reduce Motion on, no animation runs: the chart is simply drawn in full once active.
  return reduceMotion && active ? 1 : progress;
}
