# XanaPlus on Replit

## Run

- Keep the imported Expo SDK 57 / Expo Router / React Native structure.
- Use Node.js 22 or newer; the existing Supabase SDK requires it.
- Dependencies are installed with npm using the existing package manifest and lockfile.
- Click **Run** to start the **XanaPlus web** workflow.
- The workflow runs `EXPO_UNSTABLE_HEADLESS=1 npm run web -- --port 5000 --host lan`.
- Expo/Metro serves the web preview on port 5000, exposed through Replit's proxy. Headless mode avoids launching the native desktop debugger in this container; hot reload remains enabled.
- For native development, the original `npm start`, `npm run android`, and `npm run ios` scripts remain unchanged.

## Backend settings

The existing Supabase backend is used; no database was created, replaced, or migrated.
Set these through Replit Secrets and restart the workflow after changes:

- `EXPO_PUBLIC_SUPABASE_URL`: existing Supabase project URL.
- `EXPO_PUBLIC_SUPABASE_KEY`: publishable (or anon) client key, never a service-role key.

These are public client configuration values and are included in Expo's client bundle despite being stored in Secrets. Backend-only credentials must remain in Supabase Edge Function secrets.

Sign-in, the live catalogue, saved orders, and account data depend on that project's schema and Edge Functions. See `DEVELOPER_GUIDE.md` for current backend details; the README's statement that there is no backend is outdated.

## Checks and limitations

- `npm run typecheck` checks TypeScript.
- `npm run lint` runs Expo's ESLint configuration.
- M-Pesa payment confirmation is simulated in the imported app; it does not capture real payments.
- The user has deferred real M-Pesa integration until they have Daraja API access. Leave the simulated flow unchanged unless they ask to resume that work.
- Web preview does not verify native camera, push notifications, or Android/iOS builds.
- No Supabase migrations or Edge Function deployments are performed as part of environment setup.
