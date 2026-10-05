import type { ReactNode } from 'react';
import { Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Quick press-in, soft settle back: reads as "pressed" without feeling bouncy. */
const PRESS_SPRING = { damping: 18, stiffness: 320, mass: 0.6 };

export type PressableScaleProps = Omit<PressableProps, 'style' | 'children'> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** How far the control shrinks while held; 0.97 for buttons, closer to 1 for big cards. */
  pressedScale?: number;
};

/**
 * The same press feel for layouts where the tap target is an overlay rather
 * than the whole card: spread the handlers on the overlay, the style on the card.
 */
export function usePressScale(pressedScale = 0.98) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return {
    style,
    onPressIn: () => scale.set(withSpring(pressedScale, PRESS_SPRING)),
    onPressOut: () => scale.set(withSpring(1, PRESS_SPRING)),
  };
}

/** A Pressable that eases down slightly while held, the app's shared press feel. */
export function PressableScale({ children, style, pressedScale = 0.97, onPressIn, onPressOut, disabled, ...rest }: PressableScaleProps) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(event: GestureResponderEvent) => {
        if (!disabled) scale.set(withSpring(pressedScale, PRESS_SPRING));
        onPressIn?.(event);
      }}
      onPressOut={(event: GestureResponderEvent) => {
        scale.set(withSpring(1, PRESS_SPRING));
        onPressOut?.(event);
      }}
      style={[style, animated]}
    >
      {children}
    </AnimatedPressable>
  );
}
