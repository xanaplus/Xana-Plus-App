import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

/**
 * "Version 1.0.0 · updated 19 Nov, 13:51" for the foot of Profile, so testers can see
 * whether a quick update has loaded. The built-in code (no quick update yet) says "original build".
 */
export function appVersionLabel(): string {
  const version = Constants.expoConfig?.version ?? '';
  if (!Updates.isEnabled) return `Version ${version} · development`;
  if (Updates.isEmbeddedLaunch || !Updates.createdAt) return `Version ${version} · original build`;
  const when = Updates.createdAt.toLocaleString('en-GB', {
    timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  return `Version ${version} · updated ${when}`;
}
