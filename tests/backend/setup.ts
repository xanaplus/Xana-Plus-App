/**
 * Shared set-up for the backend/UI unit tests (7 Nov 2026). The 1 Nov polish pass put
 * react-native-reanimated (PressableScale, entering animations) into many components;
 * its real module needs a native runtime, so tests get this stand-in unless a file
 * mocks it itself. Expo's __DEV__ global is defined as in a production build.
 */
import { vi } from 'vitest';

(globalThis as { __DEV__?: boolean }).__DEV__ = false;

vi.mock('react-native-reanimated', () => {
  /** Layout animations (FadeIn.duration(140).delay(20)…) chain freely and do nothing. */
  const chain: object = new Proxy(() => chain, { get: (_target, key) => (key === 'then' ? undefined : chain), apply: () => chain });
  const identity = <T,>(value: T) => value;
  const api = {
    View: 'div',
    Text: 'span',
    ScrollView: 'div',
    Image: 'img',
    createAnimatedComponent: identity,
    useSharedValue: <T,>(value: T) => ({ value }),
    useAnimatedStyle: () => ({}),
    useDerivedValue: (factory: () => unknown) => ({ value: factory() }),
    useReducedMotion: () => true,
    withTiming: identity,
    withSpring: identity,
    withDelay: (_ms: number, value: unknown) => value,
    withSequence: (...values: unknown[]) => values[values.length - 1],
    withRepeat: identity,
    cancelAnimation: () => undefined,
    runOnJS: identity,
    interpolate: (_value: number, _input: number[], output: number[]) => output[0],
    Easing: chain,
    FadeIn: chain, FadeOut: chain, FadeInUp: chain, FadeInDown: chain, FadeOutUp: chain, FadeOutDown: chain,
    ZoomIn: chain, ZoomOut: chain, SlideInDown: chain, SlideOutDown: chain, SlideInRight: chain, SlideOutRight: chain,
    LinearTransition: chain, Layout: chain,
  };
  return { ...api, default: api };
});
