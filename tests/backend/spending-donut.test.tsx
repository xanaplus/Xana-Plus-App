import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { colors, darkColors } from '@/theme/tokens';
import type { Palette } from '@/theme/tokens';
import DepartmentDonut from '@/components/spending/department-donut';
import { spendingBreakdown } from '@/lib/spending-breakdown';

const state = vi.hoisted(() => ({ dark: false }));
vi.mock('react-native', () => ({
  View: 'view', Pressable: 'pressable',
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
  useWindowDimensions: () => ({ width: 320, height: 874 }),
}));
vi.mock('react-native-svg', () => ({ default: 'svg', Circle: 'circle' }));
vi.mock('@/components/spending/use-reveal', () => ({ useRevealProgress: () => 1 }));
vi.mock('@/components/ui', () => ({ Txt: 'text' }));
vi.mock('@/theme/provider', () => ({
  useTheme: () => ({ colors: state.dark ? darkColors : colors, resolved: state.dark ? 'dark' : 'light' }),
  useThemeStyles: (factory: (palette: Palette) => unknown) => factory(state.dark ? darkColors : colors),
}));

const member = (id: string, total: number) => ({ id, label: id, total });
beforeEach(() => {
  state.dark = false;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
async function mount(values: ReturnType<typeof member>[], callback = vi.fn()) {
  let root!: ReturnType<typeof create>;
  await act(async () => {
    root = create(<DepartmentDonut breakdown={spendingBreakdown(values)} onDepartmentPress={callback} />);
  });
  return { root, callback };
}
describe('department donut presentation', () => {
  it('renders one full ring and exposes monetary and percentage labels', async () => {
    const { root } = await mount([member('deli', 230)]);
    const circles = root.root.findAllByType('circle');
    expect(circles).toHaveLength(2);
    expect(circles[1].props.strokeDasharray.split(' ')[1]).toBe('0');
    const summary = root.root.find(node => node.props.accessibilityRole === 'image').props.accessibilityLabel;
    expect(summary).toContain('KES 230');
    expect(summary).toContain('100%');
    await act(async () => root.unmount());
  });
  it('keeps exactly five departments separate', async () => {
    const { root } = await mount(['groceries', 'deli', 'pharmacy', 'liquor', 'household'].map(id => member(id, 20)));
    expect(root.root.findAllByType('circle')).toHaveLength(6);
    expect(root.root.findAll(node => node.props['aria-expanded'] !== undefined)).toHaveLength(0);
    await act(async () => root.unmount());
  });
  it('preserves grouped members even when Other is the largest slice, and expands them', async () => {
    const { root } = await mount(['groceries', 'deli', 'pharmacy', 'liquor', 'household', 'beauty', 'retail', 'wholesale'].map(id => member(id, 20)));
    const expand = root.root.findByProps({ accessibilityLabel: 'Show other department amounts' });
    expect(expand.props['aria-expanded']).toBe(false);
    await act(async () => expand.props.onPress());
    expect(root.root.findAll(node => node.props.accessibilityLabel === 'Hide other department amounts')).toHaveLength(1);
    expect(root.root.findAll(node => node.props.accessibilityLabel?.startsWith('wholesale, KES 20'))).not.toHaveLength(0);
    await act(async () => root.unmount());
  });
  it('updates colours in dark mode while preserving financial values', async () => {
    const values = [member('groceries', 100), member('deli', 50)];
    const { root } = await mount(values);
    const originalStroke = root.root.findAllByType('circle')[1].props.stroke;
    state.dark = true;
    await act(async () => root.update(<DepartmentDonut breakdown={spendingBreakdown(values)} />));
    expect(root.root.findAllByType('circle')[1].props.stroke).not.toBe(originalStroke);
    expect(root.root.find(node => node.props.accessibilityRole === 'image').props.accessibilityLabel).toContain('KES 150');
    await act(async () => root.unmount());
  });
  it('navigates departments without turning unknown amounts into fake links', async () => {
    const { root, callback } = await mount([member('beauty', 100), member('unclassified', 10)]);
    const link = root.root.find(node => String(node.type) === 'pressable' && node.props.accessibilityLabel?.startsWith('beauty,'));
    await act(async () => link.props.onPress());
    expect(callback).toHaveBeenCalledWith('beauty');
    expect(root.root.findAll(node => String(node.type) === 'pressable' && node.props.accessibilityLabel?.startsWith('unclassified,'))).toHaveLength(0);
    await act(async () => root.unmount());
  });
  it('shows an explicit empty state rather than invalid SVG geometry', async () => {
    const { root } = await mount([]);
    expect(root.root.findAllByType('circle')).toHaveLength(0);
    expect(root.root.findAllByType('text').map(node => node.props.children).flat().join('')).toContain('No spending\nto show');
    await act(async () => root.unmount());
  });
});
