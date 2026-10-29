import type { PaymentMethodId } from '@/data/types';

/**
 * Delivery orders (the app) go received → shopping → out-for-delivery → delivered.
 * Pickup orders (the website, and the app later) go awaiting-payment → received →
 * shopping → ready → collected. Both share one `orders` table with the website.
 * An order with prescription medicines first waits for the pharmacist
 * (awaiting-approval), then for the customer to confirm what was approved
 * (approved, 48 hours), before it goes on as usual (owner, 29 Oct 2026).
 */
export type OrderStatus =
  | 'awaiting-approval'
  | 'approved'
  | 'awaiting-payment'
  | 'received'
  | 'shopping'
  | 'ready'
  | 'collected'
  | 'out-for-delivery'
  | 'delivered'
  | 'cancelled';

/** Where the money is: set by the server, never by the app. */
export type PaymentStatus =
  | 'simulated'
  | 'pending'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'refund-due'
  | 'refunded'
  | 'partly-refunded';

export type Fulfilment = 'delivery' | 'pickup';

/** How an order was paid: the app's choices, plus online (DPO) and at the counter for pickup. */
export type OrderPaymentMethod = PaymentMethodId | 'dpo' | 'counter';

export const ORDER_STAGES: { status: OrderStatus; label: string }[] = [
  { status: 'received', label: 'Received' },
  { status: 'shopping', label: 'Shopping' },
  { status: 'out-for-delivery', label: 'Out for delivery' },
  { status: 'delivered', label: 'Delivered' },
];

export const PICKUP_STAGES: { status: OrderStatus; label: string }[] = [
  { status: 'received', label: 'Received' },
  { status: 'shopping', label: 'Being picked' },
  { status: 'ready', label: 'Ready to collect' },
  { status: 'collected', label: 'Collected' },
];

/** The pharmacist's step and the customer's, ahead of the usual stages. */
const RX_STAGES: { status: OrderStatus; label: string }[] = [
  { status: 'awaiting-approval', label: 'Pharmacist' },
  { status: 'approved', label: 'You confirm' },
];

/** The stepper for this order: pickup or delivery, with the prescription steps first when it has one. */
export const stagesFor = (order: { fulfilment?: Fulfilment; prescription?: boolean }) => {
  const stages = order.fulfilment === 'pickup' ? PICKUP_STAGES : ORDER_STAGES;
  return order.prescription ? [...RX_STAGES, ...stages] : stages;
};

/** Waiting on the pharmacist or the customer: not yet an order the branch works on. */
export const isRxPending = (status: OrderStatus) => status === 'awaiting-approval' || status === 'approved';

/** Why a cancelled order was cancelled, for the customer; null when there's nothing particular to say. */
export const cancelNote = (order: { cancelledReason?: string; pharmacistNote?: string }): string | null => {
  switch (order.cancelledReason) {
    case 'rx_rejected':
      return order.pharmacistNote
        ? `The pharmacist could not approve your prescription: ${order.pharmacistNote}`
        : 'The pharmacist could not approve your prescription.';
    case 'not_confirmed':
      return 'This order was not confirmed within 48 hours of the pharmacist approving it, so it was cancelled.';
    default:
      return null;
  }
};

/** The customer has the goods. */
export const isCompleted = (status: OrderStatus) => status === 'delivered' || status === 'collected';
/** Still moving: not finished and not cancelled. */
export const isActiveOrder = (status: OrderStatus) => !isCompleted(status) && status !== 'cancelled';

export const ORDER_PAYMENT_LABEL: Record<OrderPaymentMethod, string> = {
  mpesa: 'M-Pesa',
  cod: 'Cash on delivery',
  card: 'Card',
  dpo: 'Paid online',
  counter: 'Pay at pickup',
};

/** A line for the customer when the payment needs a word; null when there's nothing to say. */
export const paymentNote = (order: { paymentStatus?: PaymentStatus; status: OrderStatus }): string | null => {
  switch (order.paymentStatus) {
    case 'pending':
      return order.status === 'awaiting-payment' ? 'Waiting for your payment.' : null;
    case 'failed':
      return 'Your payment did not go through.';
    case 'expired':
      return 'The time to pay ran out, so this order was not charged.';
    case 'refund-due':
      return 'A refund is due to you. We will send it shortly.';
    case 'partly-refunded':
      return 'Part of this order has been refunded to you.';
    case 'refunded':
      return 'This order has been refunded.';
    default:
      return null;
  }
};
