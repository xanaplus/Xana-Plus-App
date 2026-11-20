import type { OrderStatus } from '@/lib/order-status';

/**
 * Home's heading and the line under it (Roystone, 20 Nov 2026: "a customer comes in every
 * day and sees the same text"). The heading greets the person for the time of day in
 * Nairobi, or for a Kenyan holiday; the line under it is the most useful true thing for
 * them today. First-time visitors still see the brand line, "Good for you, good for home."
 */

export const BRAND_TITLE = 'Good for you,\ngood for home.';
export const BRAND_LINE = 'Everyday health and fresh groceries, together.';

/** Kenyan public holidays on fixed dates (MM-DD): their own greeting replaces the time of day. */
const HOLIDAYS: Record<string, string> = {
  '01-01': 'Heri ya Mwaka Mpya',
  '06-01': 'Heri ya Siku ya Madaraka',
  '10-20': 'Heri ya Siku ya Mashujaa',
  '12-12': 'Heri ya Siku ya Jamhuri',
  '12-25': 'Heri ya Krismasi',
  '12-26': 'Heri ya Krismasi',
};

/** Nairobi date and hour for `now`: { day: 'MM-DD', hour: 0-23 }. */
export function nairobiClock(now: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  }).formatToParts(now);
  const part = (type: string) => parts.find(entry => entry.type === type)?.value ?? '00';
  return { day: `${part('month')}-${part('day')}`, hour: Number(part('hour')) % 24 };
}

/** "Habari ya asubuhi" (5 am to noon), "ya mchana" (to 4 pm), "ya jioni" (evening and night), or the holiday's. */
export function greetingWords(now: Date): string {
  const { day, hour } = nairobiClock(now);
  if (HOLIDAYS[day]) return HOLIDAYS[day];
  if (hour >= 5 && hour < 12) return 'Habari ya asubuhi';
  if (hour >= 12 && hour < 16) return 'Habari ya mchana';
  return 'Habari ya jioni';
}

/** The heading: the greeting and the first name on two lines, or the greeting alone. */
export function greetingTitle(now: Date, firstName: string | null): string {
  const words = greetingWords(now);
  return firstName ? `${words},\n${firstName}.` : `${words}.`;
}

export type HomeOrder = { id: string; status: OrderStatus };
export type DayLineInput = {
  orders: HomeOrder[];
  /** This shop's live POS offers. */
  offerCount: number;
  shopName: string;
  water: number;
  waterGoal: number;
  /** This week's theme name and question, e.g. "Diabetes month" / "Chai yako: one spoon less sugar today?". */
  themeName: string;
  themeQuestion: string;
  /** Already answered this week's question today. */
  themeAnswered: boolean;
};
export type DayLine = { text: string; target: 'order' | 'offers' | 'wellness' | null; orderId?: string };

/** An order the customer should hear about first, most advanced first. */
const ORDER_LINES: [OrderStatus, (id: string) => string][] = [
  ['ready', id => `Your order ${id} is ready to collect`],
  ['out-for-delivery', id => `Your order ${id} is on its way`],
  ['shopping', id => `We’re packing your order ${id}`],
  ['received', id => `We’re packing your order ${id}`],
  ['approved', id => `We’re packing your order ${id}`],
  ['awaiting-approval', id => `A pharmacist is checking your order ${id}`],
  ['awaiting-payment', id => `Your order ${id} is waiting for payment`],
];

/** The line under the heading: the first of these that is true today. */
export function dayLine(input: DayLineInput): DayLine {
  for (const [status, words] of ORDER_LINES) {
    const order = input.orders.find(entry => entry.status === status);
    if (order) return { text: words(order.id), target: 'order', orderId: order.id };
  }
  if (input.offerCount > 0) {
    return { text: `${input.offerCount} ${input.offerCount === 1 ? 'offer' : 'offers'} at ${input.shopName} today`, target: 'offers' };
  }
  if (input.water > 0 && input.water < input.waterGoal) {
    return { text: `${input.water} of ${input.waterGoal} glasses so far today`, target: 'wellness' };
  }
  if (!input.themeAnswered && input.themeQuestion) {
    // The question alone: many already lead with a Swahili hook ("Chai yako: …").
    return { text: input.themeQuestion, target: 'wellness' };
  }
  return { text: BRAND_LINE, target: null };
}
