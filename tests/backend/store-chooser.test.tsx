import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fulfilment: { storeId: 'syokimau', storeChosen: false, setStoreId: vi.fn() },
  rows: [] as { item_no: string; stock_by_location: Record<string, number | null> }[],
}));
vi.mock('@/components/ui', () => ({
  BottomSheet: (props: { visible: boolean; children: React.ReactNode; footer: React.ReactNode }) =>
    props.visible ? React.createElement('BottomSheet', props, props.children, props.footer) : null,
  Button: 'Button',
  SelectableOption: 'SelectableOption',
}));
vi.mock('@/store/fulfilment', () => ({ useFulfilment: () => mocks.fulfilment }));
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ in: async () => ({ data: mocks.rows, error: null }) }) }) },
}));

import { StoreChooser, storeWithAllItems } from '@/features/store/store-chooser';

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.fulfilment = { storeId: 'syokimau', storeChosen: false, setStoreId: vi.fn() };
});

describe('store chooser', () => {
  it('makes a first-time customer pick a store before continuing', async () => {
    const close = vi.fn();
    const chosen = vi.fn();
    let root!: ReturnType<typeof create>;
    await act(async () => { root = create(<StoreChooser visible onClose={close} onChosen={chosen} />); });
    const options = root.root.findAllByType('SelectableOption');
    expect(options.map(node => node.props.title)).toEqual(['Syokimau', 'Ruiru']);
    expect(options.every(node => node.props.selected === false)).toBe(true);
    expect(root.root.findByType('Button').props.disabled).toBe(true);

    await act(async () => options[1].props.onPress());
    expect(root.root.findByType('Button').props.disabled).toBe(false);
    await act(async () => root.root.findByType('Button').props.onPress());
    expect(mocks.fulfilment.setStoreId).toHaveBeenCalledWith('ruiru');
    expect(close).toHaveBeenCalledOnce();
    expect(chosen).toHaveBeenCalledWith('ruiru');
  });

  it('shows the current store ticked once one has been chosen', async () => {
    mocks.fulfilment = { storeId: 'ruiru', storeChosen: true, setStoreId: vi.fn() };
    let root!: ReturnType<typeof create>;
    await act(async () => { root = create(<StoreChooser visible onClose={vi.fn()} />); });
    expect(root.root.findAllByType('SelectableOption').map(node => node.props.selected)).toEqual([false, true]);
  });
});

describe('suggesting another store when items are sold out', () => {
  it('suggests the other store only when it has every item in the quantity asked for', async () => {
    mocks.rows = [
      { item_no: 'A', stock_by_location: { RUIRU: 0, SYOKIMAU: 6 } },
      { item_no: 'B', stock_by_location: { RUIRU: 1, SYOKIMAU: 2 } },
    ];
    expect((await storeWithAllItems(['A', 'B'], { A: 6, B: 2 }, 'ruiru'))?.id).toBe('syokimau');
    expect(await storeWithAllItems(['A', 'B'], { A: 7, B: 2 }, 'ruiru')).toBeNull();
    // Stock not yet synced at that store (null) is not a promise it has the items.
    mocks.rows = [{ item_no: 'A', stock_by_location: { SYOKIMAU: null } }];
    expect(await storeWithAllItems(['A'], { A: 1 }, 'ruiru')).toBeNull();
  });
});
