import { useState } from 'react';

import { BottomSheet, Button, SelectableOption } from '@/components/ui';
import { stores } from '@/data/catalog';
import { supabase } from '@/lib/supabase';
import { useFulfilment } from '@/store/fulfilment';

type StoreChooserProps = {
  visible: boolean;
  onClose: () => void;
  /** Runs after the customer confirms a store, e.g. to carry on placing the order. */
  onChosen?: (storeId: string) => void;
};

/**
 * "Which store do you shop from?" Asked once on first open and before the first
 * order (owner, 15 Oct 2026): orders are packed at this store and stock is checked
 * there. Changeable any time from the store button on Home and at checkout.
 */
export function StoreChooser({ visible, onClose, onChosen }: StoreChooserProps) {
  const { storeId, storeChosen, setStoreId } = useFulfilment();
  // Nothing is ticked the first time, so the customer makes a real choice.
  const [picked, setPicked] = useState<string | null>(storeChosen ? storeId : null);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setPicked(storeChosen ? storeId : null);
  }

  const confirm = () => {
    if (!picked) return;
    setStoreId(picked);
    onClose();
    onChosen?.(picked);
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Which store do you shop from?"
      description="You can change it any time."
      scrollable
      footer={<Button label="Continue" disabled={!picked} onPress={confirm} />}
    >
      {stores.map(entry => (
        <SelectableOption
          key={entry.id}
          title={entry.name.replace('Xana Plus ', '')}
          description={`${entry.address} · Open ${entry.hours}`}
          icon="store"
          selected={entry.id === picked}
          onPress={() => setPicked(entry.id)}
        />
      ))}
    </BottomSheet>
  );
}

/**
 * After the server says items are sold out at the chosen store: the other store
 * that has every one of them in the quantities asked for, if any.
 */
export async function storeWithAllItems(
  itemNos: string[],
  quantities: Record<string, number>,
  currentStoreId: string,
): Promise<(typeof stores)[number] | null> {
  if (itemNos.length === 0) return null;
  const { data, error } = await supabase.from('catalogue').select('item_no, stock_by_location').in('item_no', itemNos);
  if (error || !data || data.length !== itemNos.length) return null;
  return (
    stores.find(
      entry =>
        entry.id !== currentStoreId &&
        data.every(row => {
          const stock = (row.stock_by_location as Record<string, number | null> | null)?.[entry.id.toUpperCase()];
          return typeof stock === 'number' && stock >= (quantities[row.item_no as string] ?? 1);
        }),
    ) ?? null
  );
}
