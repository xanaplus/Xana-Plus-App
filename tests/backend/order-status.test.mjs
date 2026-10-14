import { describe, expect, it } from 'vitest';

import {
  isActiveOrder,
  isCompleted,
  ORDER_PAYMENT_LABEL,
  ORDER_STAGES,
  paymentNote,
  PICKUP_STAGES,
  stagesFor,
} from '@/lib/order-status';
import { recordedSavings } from '@/lib/order-savings';

// The shared orders table (website + app, 14 Oct 2026) adds pickup statuses and payment states.
describe('order statuses shared with the website', () => {
  it('uses the pickup stepper for pickup orders and the delivery one otherwise', () => {
    expect(stagesFor({ fulfilment: 'pickup' })).toBe(PICKUP_STAGES);
    expect(stagesFor({ fulfilment: 'delivery' })).toBe(ORDER_STAGES);
    // Orders saved before the pipeline have no fulfilment and were all delivery.
    expect(stagesFor({})).toBe(ORDER_STAGES);
    expect(PICKUP_STAGES.map(s => s.status)).toEqual(['received', 'shopping', 'ready', 'collected']);
  });

  it('treats collected like delivered, and awaiting payment and ready as still active', () => {
    expect(isCompleted('collected')).toBe(true);
    expect(isCompleted('delivered')).toBe(true);
    for (const status of ['awaiting-payment', 'received', 'shopping', 'ready', 'out-for-delivery']) {
      expect(isActiveOrder(status)).toBe(true);
    }
    expect(isActiveOrder('cancelled')).toBe(false);
    expect(isActiveOrder('collected')).toBe(false);
  });

  it('labels every payment method the server allows', () => {
    for (const method of ['mpesa', 'cod', 'card', 'dpo', 'counter']) expect(ORDER_PAYMENT_LABEL[method]).toBeTruthy();
  });

  it('explains payment states only when there is something to say', () => {
    expect(paymentNote({ status: 'awaiting-payment', paymentStatus: 'pending' })).toBe('Waiting for your payment.');
    expect(paymentNote({ status: 'received', paymentStatus: 'pending' })).toBeNull(); // pay at pickup
    expect(paymentNote({ status: 'received', paymentStatus: 'paid' })).toBeNull();
    expect(paymentNote({ status: 'delivered', paymentStatus: 'simulated' })).toBeNull();
    expect(paymentNote({ status: 'delivered' })).toBeNull();
    for (const state of ['failed', 'expired', 'refund-due', 'partly-refunded', 'refunded']) {
      expect(paymentNote({ status: 'cancelled', paymentStatus: state })).toBeTruthy();
    }
  });

  it('leaves unpaid orders out of recorded savings', () => {
    const summary = { wholesaleSavings: 30, promoDiscount: 5 };
    const totals = recordedSavings([
      { status: 'collected', summary },
      { status: 'awaiting-payment', summary },
      { status: 'cancelled', summary },
    ]);
    expect(totals.totalSaved).toBe(35);
  });
});
