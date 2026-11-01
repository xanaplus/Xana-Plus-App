import { createContext, useContext } from 'react';

/** The page's side padding, so a header inside it can still run edge to edge. */
export const ScreenPadding = createContext(0);
export const useScreenPadding = () => useContext(ScreenPadding);
