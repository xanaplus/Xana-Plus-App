import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { colors, darkColors } from '@/theme/tokens';
import type { Palette } from '@/theme/tokens';
import { ProductCard, ProductRow } from '@/components/ui/product-card';
import type { Product } from '@/data/types';

const state = vi.hoisted(() => ({ dark: false }));
vi.mock('react-native', () => ({
  View: 'div', Pressable: 'button',
  StyleSheet: {
    create: (value: unknown) => value, hairlineWidth: 1,
    flatten: (value: unknown[]) => Object.assign({}, ...[value].flat(Infinity).filter(Boolean)),
  },
}));
vi.mock('react-native-reanimated', () => ({ default: { View: 'div' }, ZoomIn: { duration: () => undefined } }));
vi.mock('@/components/ui/pressable-scale', () => ({ usePressScale: () => ({ style: {}, onPressIn: vi.fn(), onPressOut: vi.fn() }) }));
vi.mock('@/components/ui/badge', () => ({ Badge: 'badge' }));
vi.mock('@/components/ui/icon', () => ({ Icon: 'icon' }));
vi.mock('@/components/ui/product-photo', () => ({ ProductPhoto: 'photo' }));
vi.mock('@/components/ui/quantity-stepper', () => ({ QuantityStepper: 'stepper' }));
const cart = vi.hoisted(() => ({ setQuantity: vi.fn() }));
vi.mock('@/store/cart', () => ({ useCart: () => cart }));
vi.mock('@/components/ui/text', () => ({ Txt: 'text' }));
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('expo-router', () => ({ router }));
vi.mock('@/data/images', () => ({ figmaAsset: () => undefined }));
vi.mock('@/theme/provider', () => ({
  useTheme: () => ({ colors: state.dark ? darkColors : colors }),
  useThemeStyles: (factory: (palette: Palette) => unknown) => factory(state.dark ? darkColors : colors),
}));
const product: Product = { id: 'test-onions', name: 'Red Onions Per Kg', pack: '', category: 'fresh-produce', price: 139, image: '', inStock: true };
beforeEach(() => {
  state.dark = false;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
async function mount(component: React.ReactElement) {
  let root!: ReturnType<typeof create>;
  await act(async () => { root = create(component); });
  return root;
}
describe('product card add pills', () => {
  it('adds without invoking the separate product navigation target', async () => {
    const add = vi.fn(), open = vi.fn();
    const root = await mount(<ProductCard product={product} onAdd={add} onPress={open} />);
    const button = root.root.findByProps({ accessibilityLabel: `Add ${product.name} to cart` });
    expect(button.findByType('icon').props.name).toBe('plus');
    await act(async () => button.props.onPress());
    expect(add).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
    expect(root.root.findByProps({ accessibilityLabel: product.name })).not.toBe(button);
    await act(async () => root.unmount());
  });
  it('keeps the quantity replacement and recorded current/previous prices', async () => {
    const root = await mount(<ProductCard product={{ ...product, wasPrice: 160 }} quantity={2} onAdd={vi.fn()} />);
    expect(root.root.findAllByProps({ accessibilityLabel: `Add ${product.name} to cart` })).toHaveLength(0);
    const stepper = root.root.findByType('stepper');
    expect(stepper.props.quantity).toBe(2);
    await act(async () => stepper.props.onDecrement());
    expect(cart.setQuantity).toHaveBeenCalledWith(product.id, 1);
    const text = root.root.findAllByType('text').flatMap(node => [node.props.children].flat(Infinity));
    expect(text).toContain('KES 139');
    expect(text).toContain('KES 160');
    await act(async () => root.unmount());
  });
  it('sends prescription-only items to the upload flow instead of the cart', async () => {
    const add = vi.fn();
    const root = await mount(<ProductCard product={{ ...product, rxRequired: true }} onAdd={add} />);
    expect(root.root.findAllByProps({ accessibilityLabel: `Add ${product.name} to cart` })).toHaveLength(0);
    const button = root.root.findByProps({ accessibilityLabel: `Prescription needed for ${product.name}. Upload a prescription` });
    expect(button.findByType('icon').props.name).toBe('prescription');
    await act(async () => button.props.onPress());
    expect(add).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith({ pathname: '/pharmacy/upload', params: { item: product.name } });
    await act(async () => root.unmount());
  });
  it('does not expose an add action for sold-out cards', async () => {
    const root = await mount(<ProductCard product={{ ...product, inStock: false }} onAdd={vi.fn()} />);
    expect(root.root.findAllByProps({ accessibilityLabel: `Add ${product.name} to cart` })).toHaveLength(0);
    await act(async () => root.unmount());
  });
  it('preserves custom trailing controls in product rows', async () => {
    const root = await mount(<ProductRow product={product} trailing={<span>Custom quantity control</span>} onAdd={vi.fn()} />);
    expect(root.root.findAllByProps({ accessibilityLabel: `Add ${product.name} to cart` })).toHaveLength(0);
    expect(root.root.findByType('span').props.children).toBe('Custom quantity control');
    await act(async () => root.unmount());
  });
  it('keeps add controls as siblings, not nested within the card navigation button', async () => {
    const root = await mount(<ProductRow product={product} onAdd={vi.fn()} onPress={vi.fn()} />);
    const open = root.root.findByProps({ accessibilityLabel: product.name });
    expect(open.findAllByType('button')).toHaveLength(1);
    expect(open.findAllByProps({ accessibilityLabel: `Add ${product.name} to cart` })).toHaveLength(0);
    await act(async () => root.unmount());
  });
  it('keeps a 44px target and semantic text/background contrast in dark and pressed states', async () => {
    state.dark = true;
    const root = await mount(<ProductCard product={product} onAdd={vi.fn()} />);
    const button = root.root.findByProps({ accessibilityLabel: `Add ${product.name} to cart` });
    const normal = Object.assign({}, ...button.props.style({ pressed: false }).filter(Boolean));
    const pressed = Object.assign({}, ...button.props.style({ pressed: true }).filter(Boolean));
    // A 36pt circle plus hitSlop on every side still gives a 44pt touch target.
    expect(normal.height + button.props.hitSlop * 2).toBeGreaterThanOrEqual(44);
    expect(normal.width + button.props.hitSlop * 2).toBeGreaterThanOrEqual(44);
    expect(normal.backgroundColor).toBe(darkColors.primary);
    expect(pressed.backgroundColor).toBe(darkColors.primary);
    await act(async () => root.unmount());
  });
});
