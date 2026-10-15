import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { SearchBar } from '@/components/ui/search-bar';

vi.mock('react-native', () => ({
  View: 'div', Pressable: 'button', TextInput: 'input',
  Platform: { OS: 'web' }, StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock('@/components/ui/icon', () => ({ Icon: 'i' }));
vi.mock('@/components/ui/text', () => ({ Txt: 'span' }));
vi.mock('@/theme/provider', () => ({ useTheme: () => ({ colors: {} }) }));

describe('mobile web search input', () => {
  it('uses iOS-safe text sizing without losing typing or submit handlers', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const change = vi.fn(), submit = vi.fn();
    let root!: ReturnType<typeof create>;
    await act(async () => { root = create(<SearchBar value="Milk" onChangeText={change} onSubmit={submit} />); });
    const input = root.root.findByType('input');
    expect(Object.assign({}, ...input.props.style.filter(Boolean))).toMatchObject({ fontSize: 16, minWidth: 0 });
    expect(input.props.returnKeyType).toBe('search');
    await act(async () => { input.props.onChangeText('Bread'); input.props.onSubmitEditing(); });
    expect(change).toHaveBeenCalledWith('Bread');
    expect(submit).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });
});
