import { describe, expect, it } from 'vitest';

import { BRAND_LINE, dayLine, greetingTitle, greetingWords } from '@/features/home/greeting';

/** A moment in Nairobi (UTC+3), e.g. at('2026-11-20', 9) is 9 am in Nairobi. */
const at = (day, hour) => new Date(`${day}T${String(hour).padStart(2, '0')}:30:00+03:00`);

const base = {
  orders: [], offerCount: 0, shopName: 'Syokimau', water: 0, waterGoal: 8,
  themeName: 'Diabetes month', themeQuestion: 'Chai yako: one spoon less sugar today?', themeAnswered: false,
};

describe('Home greeting', () => {
  it('greets for the time of day in Nairobi', () => {
    expect(greetingWords(at('2026-11-20', 4))).toBe('Habari ya jioni');
    expect(greetingWords(at('2026-11-20', 5))).toBe('Habari ya asubuhi');
    expect(greetingWords(at('2026-11-20', 11))).toBe('Habari ya asubuhi');
    expect(greetingWords(at('2026-11-20', 12))).toBe('Habari ya mchana');
    expect(greetingWords(at('2026-11-20', 15))).toBe('Habari ya mchana');
    expect(greetingWords(at('2026-11-20', 16))).toBe('Habari ya jioni');
    expect(greetingWords(at('2026-11-20', 23))).toBe('Habari ya jioni');
  });
  it('uses the holiday greeting on Kenyan holidays', () => {
    expect(greetingWords(at('2026-12-25', 9))).toBe('Heri ya Krismasi');
    expect(greetingWords(at('2026-12-12', 18))).toBe('Heri ya Siku ya Jamhuri');
    expect(greetingWords(at('2027-01-01', 10))).toBe('Heri ya Mwaka Mpya');
    expect(greetingWords(at('2026-10-20', 10))).toBe('Heri ya Siku ya Mashujaa');
    expect(greetingWords(at('2027-06-01', 10))).toBe('Heri ya Siku ya Madaraka');
  });
  it('adds the first name on its own line, or leaves it out', () => {
    expect(greetingTitle(at('2026-11-20', 9), 'Amina')).toBe('Habari ya asubuhi,\nAmina.');
    expect(greetingTitle(at('2026-11-20', 9), null)).toBe('Habari ya asubuhi.');
  });
});

describe('Home line about today', () => {
  it('puts an order first, the most advanced one', () => {
    const line = dayLine({ ...base, offerCount: 12, orders: [{ id: 'XN-1', status: 'shopping' }, { id: 'XN-2', status: 'ready' }] });
    expect(line).toEqual({ text: 'Your order XN-2 is ready to collect', target: 'order', orderId: 'XN-2' });
  });
  it('then this shop’s real offers', () => {
    expect(dayLine({ ...base, offerCount: 12 })).toEqual({ text: '12 offers at Syokimau today', target: 'offers' });
    expect(dayLine({ ...base, offerCount: 1 }).text).toBe('1 offer at Syokimau today');
  });
  it('then water in progress, then this week’s question', () => {
    expect(dayLine({ ...base, water: 3 }).text).toBe('3 of 8 glasses so far today');
    expect(dayLine({ ...base, water: 8 }).text).toBe('Chai yako: one spoon less sugar today?');
  });
  it('falls back to the brand line, with nothing to open', () => {
    expect(dayLine({ ...base, themeAnswered: true })).toEqual({ text: BRAND_LINE, target: null });
  });
});
