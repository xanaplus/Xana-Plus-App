import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { SignInDetails } from '@/features/account/sign-in-details';

vi.mock('react-native', () => ({ View: 'div', StyleSheet: { create: (styles: unknown) => styles } }));
vi.mock('@/components/ui/button', () => ({ Button: 'button' }));
vi.mock('@/components/ui/text', () => ({ Txt: 'span' }));

describe('responsive sign-in details', () => {
  it('keeps the masked number, allows wrapping and preserves the change-number action', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const change = vi.fn();
    let root!: ReturnType<typeof create>;
    await act(async () => { root = create(<SignInDetails maskedPhone="+254 700 ••• •00" onChangeNumber={change} />); });
    expect(root.root.findAllByType('span').map(node => node.props.children)).toEqual([
      '+254 700 ••• •00',
      'Used to sign in and receive the M-Pesa prompt',
    ]);
    const rows = root.root.findAllByType('div');
    expect(rows[0].props.style.flexWrap).toBe('wrap');
    expect(rows[1].props.style).toMatchObject({ flexShrink: 1, minWidth: 160 });
    const button = root.root.findByType('button');
    expect(button.props.label).toBe('Change number');
    expect(button.props.style).toMatchObject({ flexShrink: 0, minHeight: 44 });
    await act(async () => button.props.onPress());
    expect(change).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });
});
