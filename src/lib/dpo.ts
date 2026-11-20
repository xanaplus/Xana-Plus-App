import * as WebBrowser from 'expo-web-browser';

import { supabase } from '@/lib/supabase';
import type { OrderStatus, PaymentStatus } from '@/lib/order-status';

/**
 * Paying online through the shared `dpo` function (William's, website repo
 * docs/upstream/dpo-integration.md §8). The app holds no DPO secret: it asks the
 * function for DPO's page, opens it in the in-app browser, then asks the function
 * whether the order is paid. Never trust what DPO puts in the return link.
 */

/** Where DPO sends the customer back to: the app's own order screen (`/orders/[id]`). */
export const APP_RETURN_PREFIX = 'xanaplus://orders/';
/** DPO's payment pages; anything else is not opened. */
const DPO_HOST = 'https://secure.3gdirectpay.com/';

export type DpoCheck = {
  orderNo: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  amountDue: number;
  expiresAt: string | null;
  collectionCode: string | null;
};

type Reply<T> = { ok: true; data: T } | { ok: false; error: string };

async function call<T>(route: 'start' | 'check' | 'mobile', body: Record<string, unknown>): Promise<Reply<T>> {
  const { data, error } = await supabase.functions.invoke<T>(`dpo/${route}`, { body });
  if (!error && data) return { ok: true, data };
  const context = (error as { context?: Response } | null)?.context;
  const reply = context ? await context.json().catch(() => null) : null;
  return { ok: false, error: reply?.error ?? (context ? 'server_error' : 'network') };
}

/** Asks DPO, through the function, where the payment is. Safe to call often (the function asks DPO at most every 10 s). */
export const checkPayment = (orderNo: string) => call<DpoCheck>('check', { orderNo });

export type MobilePrompt = { sent?: boolean; paid?: boolean; instructions?: string | null; redirectUrl?: string | null; promptsLeft?: number };

/**
 * Sends the M-Pesa PIN prompt straight to the customer's phone, without DPO's page
 * (§8a, `ChargeTokenMobile`, allowed for the app only). A sent prompt is NOT a payment:
 * keep asking checkPayment() until it says paid.
 */
export async function sendMpesaPrompt(orderNo: string, phone: string): Promise<Reply<MobilePrompt>> {
  const reply = await call<MobilePrompt>('mobile', { orderNo, phone: phone.replace(/[^\d+]/g, ''), operator: 'mpesa' });
  // DPO sets no follow-up page for Kenya today; if it ever does, show it.
  const next = reply.ok ? reply.data.redirectUrl : null;
  if (next && next.startsWith('https://')) await WebBrowser.openBrowserAsync(next).catch(() => null);
  return reply;
}

/**
 * Opens DPO's page for this order and waits until the customer comes back
 * (or closes it). Returns null when the page was shown, or an error code for payMessage().
 */
export async function payOnline(orderNo: string): Promise<string | null> {
  // DPO breaks `xanaplus://` return links (it opens http://xanaplus://…), so it gets our
  // https `app-return` function, which sends the phone on to xanaplus://orders/<no>.
  const returnTo = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/app-return/${orderNo}`;
  type Start = { payUrl?: string; paid?: boolean };
  let started = await call<Start>('start', { orderNo, returnTo });
  // Until the function allows the app's link (APP_RETURN_PREFIXES), DPO returns to the
  // website's order page instead: the customer closes it and the app checks as usual.
  if (!started.ok && started.error === 'invalid_return') started = await call<Start>('start', { orderNo });
  if (!started.ok) return started.error;
  if (started.data.paid) return null;
  const payUrl = started.data.payUrl;
  if (!payUrl || !payUrl.startsWith(DPO_HOST)) return 'bad_pay_url';
  // An auth session closes by itself when DPO opens the app's link.
  await WebBrowser.openAuthSessionAsync(payUrl, APP_RETURN_PREFIX).catch(() => null);
  return null;
}

/** The website's words for a payment refusal (assets/order-rules.js, payMessage()). */
export function payMessage(code: string): string {
  switch (code) {
    case 'online_payment_off':
    case 'payments_not_configured':
    case 'not_online_payment':
      return 'Online payment is not available right now. Try again later, or cancel this order and order again with cash.';
    case 'payment_unavailable':
      return 'We could not open the payment page. Try again in a moment.';
    case 'payment_starting':
      return 'Your payment page is being prepared. Try again in a few seconds.';
    case 'payment_time_up':
    case 'order_closed':
      return 'The time to pay for this order has passed. Place a new order if you still need the items.';
    case 'nothing_to_pay':
      return 'This order is already paid.';
    case 'no_order':
      return 'We could not find this order.';
    case 'bad_pay_url':
      return 'The payment page could not be opened. Try again, or call the branch if this keeps happening.';
    case 'invalid_phone':
      return 'That phone number does not look right. Check it and try again.';
    case 'prompt_too_soon':
      return 'Wait 30 seconds before sending another M-Pesa prompt.';
    case 'too_many_prompts':
      return 'Too many M-Pesa prompts for now. Pay by card instead, or use the PayBill details above.';
    case 'prompt_failed':
      return 'We could not send the M-Pesa prompt. Try again, pay by card, or use the PayBill details if shown.';
    case 'operator_unavailable':
    case 'method_mismatch':
    case 'app_only':
      return 'M-Pesa prompts are not available for this order. Pay by card or Airtel Money instead.';
    case 'network':
      return 'We could not reach the server. Check your connection and try again.';
    case 'signed_out':
      return 'Your session has ended. Sign in again.';
    default:
      return 'Something went wrong. Try again.';
  }
}
