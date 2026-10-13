import { Image } from 'expo-image';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Txt } from '@/components/ui/text';
import { figmaAsset } from '@/data/images';
import { elevation, layout, radius, spacing } from '@/theme';
import { useTheme } from '@/theme/provider';

export type CategoryTileProps = {
  name: string;
  image: string;
  selected?: boolean;
  onPress?: () => void;
  /** Tile edge length; the Home grid uses 76pt. */
  size?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Square artwork tile with a wrapped caption underneath — the Home
 * "Top Categories" grid and the Categories-tab sub-category grids.
 */
export function CategoryTile({ name, image, selected, onPress, size = layout.categoryTileSize, style }: CategoryTileProps) {
  const { colors } = useTheme();
  const source = figmaAsset(image);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { width: size }, pressed ? { opacity: 0.9 } : null, style]}
    >
      <View
        style={[
          styles.frame,
          { width: size, height: size },
          { backgroundColor: colors.surfaceContainerLow },
          selected ? { borderColor: colors.primaryAccent, borderWidth: 2 } : null,
        ]}
      >
        {source ? <Image source={source} style={styles.image} contentFit="cover" transition={120} /> : null}
      </View>
      <Txt variant="caption" align="center" numberOfLines={3} tint={colors.onSurface} style={styles.label}>
        {name}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { gap: spacing.sm, alignItems: 'center' },
  frame: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...elevation.hairline,
  },
  image: { width: '100%', height: '100%' },
  label: {},
});
