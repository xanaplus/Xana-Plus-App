import type { ReactNode } from 'react';

/** Stand-in for expo-router in Storybook: navigation calls are logged, not followed. */
export const navigationLog: string[] = [];

const push = (to: unknown) => {
  navigationLog.push(typeof to === 'string' ? to : JSON.stringify(to));
};

export const router = { push, replace: push, navigate: push, back: () => navigationLog.push('back'), canGoBack: () => true, setParams: () => {} };
export const useRouter = () => router;
export const useLocalSearchParams = () => ({});
export const useGlobalSearchParams = () => ({});
export const usePathname = () => '/';
export const useSegments = () => [];
export const useFocusEffect = () => {};
export const Link = ({ children }: { children: ReactNode }) => <>{children}</>;
export const Redirect = () => null;
const Screen = () => null;
export const Stack = Object.assign(({ children }: { children?: ReactNode }) => <>{children}</>, { Screen });
export const Tabs = Object.assign(({ children }: { children?: ReactNode }) => <>{children}</>, { Screen });
