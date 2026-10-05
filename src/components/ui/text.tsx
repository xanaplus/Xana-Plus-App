import { Text, type TextProps, type TextStyle } from 'react-native';

import { colors, type as typeScale, type ColorToken, type TypeToken } from '@/theme';

export type TxtProps = TextProps & {
  /** Type ramp role. */
  variant?: TypeToken;
  /** Palette token name. */
  color?: ColorToken;
  /** Escape hatch for one-off colours (gradients, alpha tints). */
  tint?: string;
  align?: TextStyle['textAlign'];
  transform?: TextStyle['textTransform'];
};

/**
 * Themed text. Every string in the app goes through this so the type ramp and
 * palette stay in one place.
 */
export function Txt({ variant = 'body', color = 'onSurface', tint, align, transform, style, ...rest }: TxtProps) {
  return (
    <Text
      {...rest}
      style={[typeScale[variant], { color: tint ?? colors[color] }, align ? { textAlign: align } : null, transform ? { textTransform: transform } : null, style]}
    />
  );
}
