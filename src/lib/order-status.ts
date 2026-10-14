import type { PaymentMethodId } from '@/data/types';

/**
 * Delivery orders (the app) go received → shopping → out-for-delivery → delivered.
 * Pickup orders (the website, and the app later) go awaiting-payment → received →
 * shopping → ready → collected. Both share one `orders` table with the website.
 */
export type OrderStatus =
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

/** The stepper for this order: pickup or delivery. */
export const stagesFor = (order: { fulfilment?: Fulfilment }) =>
  order.fulfilment === 'pickup' ? PICKUP_STAGES : ORDER_STAGES;

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
