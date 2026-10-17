import { useNavigation } from 'expo-router';
import { useEffect, useRef } from 'react';
import type { ScrollView } from 'react-native';

type TabNavigation = {
  addListener: (event: 'tabPress', callback: () => void) => () => void;
  isFocused: () => boolean;
};

/**
 * Tapping the tab you are already on scrolls it back to the top, as in Instagram,
 * Jumia and Amazon. Pass the returned ref to the tab's main ScrollView.
 */
export function useTabScrollTop() {
  const ref = useRef<ScrollView>(null);
  const navigation = useNavigation() as unknown as TabNavigation;

  useEffect(
    () =>
      navigation.addListener('tabPress', () => {
        // The bar emits tabPress before switching, so a tab that isn't showing yet is left alone.
        if (navigation.isFocused()) ref.current?.scrollTo({ y: 0, animated: true });
      }),
    [navigation],
  );

  return ref;
}
