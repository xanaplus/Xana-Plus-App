import { createContext, useContext } from 'react';
import { colors, darkColors } from './_tokens';

export const NavTheme = createContext(false);
export const useTheme = () => ({ colors: useContext(NavTheme) ? darkColors : colors });
export const useCart = () => ({ itemCount: 0 });
export const useSafeAreaInsets = () => ({ top: 0, right: 0, bottom: 0, left: 0 });
