import { useRouter } from 'expo-router';

/**
 * Back arrow for the Categories, Pharmacy, Cart and Profile tabs: returns to wherever the
 * shopper came from (a product, another tab), or to Home when there is nothing behind.
 */
export function useTabBack(): () => void {
  const router = useRouter();
  return () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));
}
