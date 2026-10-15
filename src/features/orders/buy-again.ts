import { useEffect, useSyncExternalStore } from 'react';

import { productsByIds } from '@/data/catalog';
import { catalogueVersion, fetchProducts, subscribeCatalogue } from '@/data/live-catalogue';
import type { Product } from '@/data/types';
import { useOrders } from '@/store/orders';
import { useSession } from '@/store/session';

/** The demo account keeps the sample picks from the cart frame (Screen 5). */
const DEMO_IDS = ['sukuma-wiki', 'vitamin-c-1000mg', 'acacia-honey-500g'];
const LIMIT = 8;

/**
 * Products from the shopper's past orders, most recent first, for the Home and Cart
 * "Buy it again" rails (as on Amazon and Instacart). Items this phone has not seen
 * yet — a new phone, a cleared cache — are fetched from the catalogue once.
 */
export function useBuyAgain(): Product[] {
  const { isDemo } = useSession();
  const { orders } = useOrders();
  // Re-render when fetched products land in the catalogue cache.
  useSyncExternalStore(subscribeCatalogue, catalogueVersion, catalogueVersion);

  const ids = isDemo
    ? DEMO_IDS
    : [...new Set(orders.filter(order => order.status !== 'cancelled').flatMap(order => order.lines.map(line => line.productId)))].slice(0, LIMIT);
  const products = productsByIds(ids);
  const missing = ids.filter(id => !products.some(product => product.id === id));
  const missingKey = missing.join(',');

  useEffect(() => {
    if (missingKey) void fetchProducts(missingKey.split(',')).catch(() => undefined);
  }, [missingKey]);

  return products;
}
