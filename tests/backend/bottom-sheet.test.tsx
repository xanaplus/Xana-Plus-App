import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { BottomSheet } from '@/components/ui/bottom-sheet';

vi.mock('react-native', () => ({
  Modal: 'modal', View: 'view', Pressable: 'button', ScrollView: 'section',
  KeyboardAvoidingView: 'keyboard', Platform: { OS: 'web' },
  StyleSheet: { create: (value: unknown) => value },
}));
vi.mock('react-native-reanimated', () => ({
  default: { View: 'animated' },
  Easing: { in: (value: unknown) => value, cubic: 'cubic' },
  useAnimatedStyle: (factory: () => unknown) => factory(),
  useSharedValue: (value: unknown) => ({ value }),
  withTiming: (value: unknown) => value, withSpring: (value: unknown) => value,
  runOnJS: (fn: unknown) => fn,
}));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 24 }) }));
vi.mock('@/components/ui/icon', () => ({ Icon: 'icon' }));
vi.mock('@/components/ui/text', () => ({ Txt: 'text' }));
vi.mock('@/theme/provider', () => ({ useTheme: () => ({ colors: { surface: 'white' } }) }));
const flat = (value: unknown) => Object.assign({}, ...[value].flat(Infinity).filter(Boolean));

describe('bounded scrolling bottom sheets', () => {
  it('keeps long content in a shrinking scroll region with the header/footer outside it', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const close = vi.fn();
    let root!: ReturnType<typeof create>;
    await act(async () => {
      root = create(
        <BottomSheet visible onClose={close} title="Terms & Privacy" scrollable footer={<button onClick={close}>Back to Profile</button>}>
          {Array.from({ length: 30 }, (_, i) => <span key={i}>Privacy option {i}</span>)}
        </BottomSheet>,
      );
    });
    const scroll = root.root.findByType('section');
    const sheet = scroll.parent!;
    expect(flat(sheet.props.style).maxHeight).toBe('90%');
    expect(flat(scroll.props.style)).toMatchObject({ flexShrink: 1, minHeight: 0 });
    expect(scroll.findAllByType('span')).toHaveLength(30);
    expect(scroll.findAllByType('button')).toHaveLength(0);
    const closeButton = root.root.findByProps({ accessibilityLabel: 'Close' });
    expect(closeButton.props.style).toMatchObject({ width: 44, height: 44 });
    await act(async () => closeButton.props.onPress());
    const back = root.root.findAllByType('button').find(button => button.props.children === 'Back to Profile')!;
    await act(async () => back.props.onClick());
    expect(close).toHaveBeenCalledTimes(2);
    await act(async () => root.unmount());
  });
});
