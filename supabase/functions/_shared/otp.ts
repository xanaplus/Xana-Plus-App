import { createClient } from 'jsr:@supabase/supabase-js@2';

/** Database RPCs own OTP limits and the owner-approved aggregate SMS policy.
 * Never key abuse controls on caller-supplied forwarded-IP headers: no verified
 * gateway identity contract is configured for these public endpoints.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** JSON reply with CORS, so the web dev preview can call the functions too. */
export function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function preflight(request: Request): Response | null {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
  return null;
}

/** `0712 345 678`, `254712345678`, `+254 712…` → `+254712345678`; null when not a Kenyan mobile. */
export function normalizePhone(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const digits = input.replace(/\D/g, '');
  const national = digits.startsWith('254') ? digits.slice(3) : digits.startsWith('0') ? digits.slice(1) : digits;
  return /^[17]\d{8}$/.test(national) ? `+254${national}` : null;
}

/** SHA-256 of phone, code and a server-only pepper, so a leaked table reveals no codes. */
export async function hashCode(phone: string, code: string): Promise<string> {
  const pepper = Deno.env.get('OTP_PEPPER') ?? '';
  const bytes = new TextEncoder().encode(`${phone}:${code}:${pepper}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export function newCode(): string {
  const [value] = crypto.getRandomValues(new Uint32Array(1));
  return String(value % 1_000_000).padStart(6, '0');
}

/**
 * The one number that signs in with a fixed code and never sends an SMS — for
 * management demos and app-store reviewers. Both values are Supabase secrets.
 */
export function isDemoPhone(phone: string): boolean {
  const demo = normalizePhone(Deno.env.get('DEMO_PHONE') ?? '');
  return demo !== null && demo === phone;
}

export function adminClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
