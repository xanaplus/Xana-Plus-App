// Same glyph maps and fonts as the app; only the Expo font-loading boundary is replaced.
import { Text } from 'react-native-web';
import ion from '../../../../../../node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json';
import mci from '../../../../../../node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json';

type Props = { name: string; size: number; color: string };
export function Ionicons({ name, size, color }: Props) {
  return <Text style={{ fontFamily: 'Ionicons', fontWeight: 'normal', fontStyle: 'normal', fontSize: size, color }}>{String.fromCodePoint((ion as Record<string, number>)[name])}</Text>;
}
export function MaterialCommunityIcons({ name, size, color }: Props) {
  return <Text style={{ fontFamily: 'MaterialCommunityIcons', fontWeight: 'normal', fontStyle: 'normal', fontSize: size, color }}>{String.fromCodePoint((mci as Record<string, number>)[name])}</Text>;
}
