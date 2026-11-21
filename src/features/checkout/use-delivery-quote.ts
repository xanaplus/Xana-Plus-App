import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';
import {
  locateDelivery,
  locateRequestFor,
  quoteIsFresh,
  type DeliveryQuote,
} from '@/lib/delivery-locate';

/**
 * The delivery fee for the address chosen at checkout, by distance (owner, 17 Nov 2026).
 * The typed address is looked up by the shared web-checkout function, as on the website,
 * so no map is needed; a pin or the phone's location set on the map is kept. When the
 * address or the store changes it is measured again, and an expired quote is renewed
 * at the same place. The server charges the fee from the quote, not from the app.
 */
export function useDeliveryQuote({
  enabled,
  address,
  branchCode,
  quote,
  setQuote,
}: {
  enabled: boolean;
  address: { id: string; line: string; area?: string };
  branchCode: string;
  quote: DeliveryQuote | null;
  setQuote: (quote: DeliveryQuote | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [areaOnly, setAreaOnly] = useState(false);
  const [freeOver, setFreeOver] = useState(0);
  const serial = useRef(0);
  /** The address and store the current quote was made for. */
  const measuredFor = useRef<string | null>(null);
  const key = `${address.id}|${address.line}|${branchCode}`;

  useEffect(() => {
    if (!enabled) return;
    void Promise.resolve(supabase.from('public_settings').select('value').eq('key', 'delivery_free_over').maybeSingle())
      .then(({ data }) => {
        const amount = Number(data?.value);
        setFreeOver(Number.isFinite(amount) && amount > 0 ? amount : 0);
      })
      .catch(() => undefined);
  }, [enabled]);

  /** Measures again and returns the new quote (or null when the place can't be priced). */
  const measure = useCallback(async (): Promise<DeliveryQuote | null> => {
    const sameAddress = measuredFor.current === key || (measuredFor.current === null && quote?.branchCode === branchCode);
    const where = locateRequestFor(address, sameAddress ? quote : null);
    const mine = ++serial.current;
    setBusy(true);
    setProblem(null);
    const result = await locateDelivery(where, branchCode);
    if (mine !== serial.current) return null;
    setBusy(false);
    measuredFor.current = key;
    if (!result.ok) {
      setQuote(null);
      setProblem(result.error);
      return null;
    }
    // A point measured again keeps how precise it was the first time.
    setAreaOnly('address' in where ? result.precision === 'area' : result.quote.locationSource === 'address_area');
    setQuote(result.quote);
    return result.quote;
  }, [address, branchCode, key, quote, setQuote]);

  const fresh = quoteIsFresh(quote) && quote.branchCode === branchCode;
  useEffect(() => {
    if (!enabled) return;
    // A pin set on the map for this address and store is kept until it expires.
    if (fresh && (measuredFor.current === key || measuredFor.current === null)) {
      measuredFor.current = key;
      return;
    }
    void measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- measure only when the place, the store or freshness changes
  }, [enabled, key, fresh]);

  return { quote: fresh ? quote : null, busy, problem, areaOnly, freeOver, measure };
}
