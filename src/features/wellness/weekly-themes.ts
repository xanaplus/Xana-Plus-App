import { todayKey } from './store';

/**
 * The month's health theme on the Wellness Today card (Roystone, 19 Nov 2026): one theme a
 * month, following the health calendar (World Malaria Day in April, World Hypertension Day in
 * May, World Mental Health Day in October, World Diabetes Day in November), with a new
 * yes / not-today question and tip each week, and a few real shop items to go with it.
 *
 * Items are never medicines (pharmacy advertising rules): food, water, household and a few
 * health devices. The app hides any that are out of stock at the chosen shop.
 *
 * General, non-medical lifestyle tips. Roystone approved them for the app on 19 Nov 2026;
 * Dr. Mumbi's review copy is docs/health-themes/report.html. Set THEMES_ARE_SAMPLE to true
 * to show the "Sample" tag again.
 */
export type ThemeWeek = { question: string; tip: string };
export type MonthTheme = {
  name: string;
  /** One line under the name on the theme page. */
  intro: string;
  /** Week 1 to 4 of the month; a 5th week repeats week 4. */
  weeks: [ThemeWeek, ThemeWeek, ThemeWeek, ThemeWeek];
  /** BC item numbers, best first. */
  items: string[];
};

export const THEMES_ARE_SAMPLE = false;

/** January (index 0) to December. */
export const MONTH_THEMES: MonthTheme[] = [
  {
    name: 'Water month',
    intro: 'A fresh start: small sips, all day.',
    weeks: [
      { question: 'Did you drink a glass of water with breakfast?', tip: 'Have a glass of water before your morning tea.' },
      { question: 'Did you carry water when you went out?', tip: 'A refillable bottle in your bag makes sipping easy.' },
      { question: 'Did you swap one soda for water today?', tip: 'Add a slice of lemon or orange if plain water feels boring.' },
      { question: 'Did you drink water before you felt thirsty?', tip: 'Small sips through the day are easier than a lot at once.' },
    ],
    items: ['WAT0012', 'WAT0011', 'WAT0002', 'WAT0033', 'WAT0015', 'FV0112'],
  },
  {
    name: 'Love your heart',
    intro: 'February is for hearts: eat well and keep moving.',
    weeks: [
      { question: 'Did you have oats or another whole grain today?', tip: 'Oats for breakfast keep you full until lunch.' },
      { question: 'Did you go easy on fried food today?', tip: 'Try boiling, steaming or roasting instead of deep frying.' },
      { question: 'Did you take a 10-minute walk today?', tip: 'Get off the matatu one stop early and walk the rest.' },
      { question: 'Did you eat a vegetable with lunch and supper?', tip: 'Half the plate vegetables is an easy rule to remember.' },
    ],
    items: ['GC0239', 'MIP0115', 'FP0040', 'FV0093', 'FP0017', 'DEL0032'],
  },
  {
    name: 'Greens month',
    intro: 'More vegetables and fruit, the easy way.',
    weeks: [
      { question: 'Did you eat something green today?', tip: 'Sukuma, spinach or managu all count.' },
      { question: 'Did you add a vegetable to your ugali or rice?', tip: 'Greens fried with onion and tomato take 10 minutes.' },
      { question: 'Did you eat a fruit instead of a snack?', tip: 'Keep fruit where you can see it, and it gets eaten first.' },
      { question: 'Did you try a new vegetable this week?', tip: 'Carrots and cabbage are good value, filling and keep well.' },
    ],
    items: ['FP0040', 'FP0042', 'FP0017', 'FP0021', 'FP0028', 'FV0079'],
  },
  {
    name: 'Rainy season',
    intro: 'World Malaria Day is 25 April. A fever in the rainy season needs a test the same day.',
    weeks: [
      { question: 'Did you sleep under a mosquito net last night?', tip: 'Check your net for holes and tuck it under the mattress.' },
      { question: 'Did you clear standing water around your home?', tip: 'Mosquitoes breed in water left in tins, tyres and buckets.' },
      { question: 'Did you use repellent in the evening?', tip: 'Mosquitoes bite most from dusk to dawn.' },
      { question: 'Did you wash your hands before eating today?', tip: 'Rainy weeks bring more stomach bugs. Soap and water before meals helps.' },
    ],
    items: ['OTC0006', 'OTC0008', 'BP0035', 'BBS0057', 'FV0112'],
  },
  {
    name: 'Blood pressure month',
    intro: 'World Hypertension Day is 17 May. Know your numbers.',
    weeks: [
      { question: 'Did you go easy on salt today?', tip: 'Taste before you add salt. Herbs, lemon and garlic add flavour without it.' },
      { question: 'Did you skip salty snacks today?', tip: 'Crisps and salted nuts add up fast. Fruit is a lighter snack.' },
      { question: 'Did you move for 30 minutes today?', tip: 'Three 10-minute walks count as much as one long one.' },
      { question: 'Have you had your blood pressure checked this year?', tip: 'Ask our pharmacists about a blood pressure check.' },
    ],
    items: ['GC0239', 'FV0093', 'FP0028', 'FP0006', 'MIP0115', 'FV0112'],
  },
  {
    name: 'Move more',
    intro: 'Every bit of movement counts.',
    weeks: [
      { question: 'Did you make time to move today?', tip: 'Dancing, gardening and taking the stairs all count.' },
      { question: 'Did you stretch for 5 minutes today?', tip: 'A short stretch when you wake up loosens a stiff back.' },
      { question: 'Did you walk somewhere you would usually ride?', tip: 'A 20-minute walk is about 2,000 steps.' },
      { question: 'Did you drink water after moving?', tip: 'Have a glass of water before and after exercise.' },
    ],
    items: ['WAT0011', 'WAT0012', 'BBS0003', 'GC0239', 'MIP0089', 'FV0079'],
  },
  {
    name: 'Cold season',
    intro: 'July is the coldest month. Stay warm and keep colds away.',
    weeks: [
      { question: 'Did you wash your hands when you got home?', tip: 'Colds spread on hands. 20 seconds with soap does the job.' },
      { question: 'Did you eat a fruit today?', tip: 'Oranges, pawpaw and guavas are rich in vitamin C.' },
      { question: 'Did you get enough sleep last night?', tip: 'Rest helps your body fight off a cold.' },
      { question: 'Did you have a warm drink instead of a cold one?', tip: 'Warm water with honey and lemon is soothing. No honey for babies under one.' },
    ],
    items: ['BBS0057', 'BBS0056', 'FV0112', 'FV0093', 'BEV0213', 'BP0035'],
  },
  {
    name: 'Family month',
    intro: 'World Breastfeeding Week is 1 to 7 August. Looking after the whole family.',
    weeks: [
      { question: 'Did you share a meal with family today?', tip: 'Shared meals are a good time to slow down and talk.' },
      { question: 'Did the children wash their hands before eating?', tip: 'Make it a song: 20 seconds is two rounds of "Happy Birthday".' },
      { question: 'Are your family’s clinic cards up to date?', tip: 'Keep clinic cards together and note the next visit date.' },
      { question: 'Did you get some rest today?', tip: 'New parents need rest too. Say yes when help is offered.' },
    ],
    items: ['SD0311', 'SD0125', 'BP0035', 'BP0037', 'MIP0089', 'FV0079'],
  },
  {
    name: 'Lunchbox month',
    intro: 'Back to school and work: better snacks and lunches.',
    weeks: [
      { question: 'Did you pack a healthy snack today?', tip: 'Fruit, nuts or a boiled egg keep you going better than sweets.' },
      { question: 'Did you eat breakfast today?', tip: 'Bread with peanut butter and a fruit is quick and filling.' },
      { question: 'Did you drink water instead of a sweet drink with lunch?', tip: 'A small bottle of water fits in any lunchbox.' },
      { question: 'Did you eat a fruit today?', tip: 'Bananas and oranges travel well in a bag.' },
    ],
    items: ['DEL0032', 'BBS0003', 'WAT0013', 'MIP0089', 'FV0079', 'FV0112'],
  },
  {
    name: 'Mind month',
    intro: 'World Mental Health Day is 10 October. If you have felt low for two weeks or more, talk to a doctor or someone you trust.',
    weeks: [
      { question: 'Did you take 10 minutes for yourself today?', tip: 'A short walk or a quiet cup of tea counts.' },
      { question: 'Did you talk to a friend today?', tip: 'A quick call can lift both your days.' },
      { question: 'Did you put the phone down an hour before bed?', tip: 'Screens keep the mind busy. A book or the radio is gentler.' },
      { question: 'Did you write down one good thing from today?', tip: 'A small notebook by the bed makes it a habit.' },
    ],
    items: ['BEV0213', 'STA0047', 'BBS0057', 'FV0079', 'WAT0012'],
  },
  {
    name: 'Diabetes month',
    intro: 'World Diabetes Day is 14 November. Small swaps make a big difference.',
    weeks: [
      { question: 'Did you skip sugary drinks today?', tip: 'Swap one soda for water or unsweetened tea.' },
      { question: 'Did you choose brown over white today?', tip: 'Brown bread, brown rice and whole maize flour release energy slowly.' },
      { question: 'Did you take one spoon less sugar in your tea?', tip: 'Cut down slowly. In two weeks you will stop missing it.' },
      { question: 'Do you know your blood sugar number?', tip: 'Ask our pharmacists about getting your blood sugar checked.' },
    ],
    items: ['DEL0032', 'DEL0033', 'GC0239', 'FP0040', 'WAT0011', 'PGI0859'],
  },
  {
    name: 'Healthy holidays',
    intro: 'Enjoy the season, and look after yourself too.',
    weeks: [
      { question: 'Did you drink water with your festive meals?', tip: 'Festive food is salty. Extra water helps.' },
      { question: 'Did you fill half your plate with vegetables?', tip: 'Enjoy the nyama choma, and add kachumbari and greens.' },
      { question: 'Did you go for a walk after a big meal?', tip: 'A 15-minute walk after eating helps you feel lighter.' },
      { question: 'Did you keep a regular bedtime?', tip: 'Late nights add up. Try to go to bed at the same time.' },
    ],
    items: ['WAT0033', 'WAT0012', 'FV0079', 'FV0112', 'FP0040', 'MIP0089'],
  },
];

/** Week number since 1 Jan 1970 in Nairobi: changes every Monday (Home picks). */
export function weekIndex(now = new Date()) {
  const [y, m, d] = todayKey(now).split('-').map(Number);
  const days = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  // 1 Jan 1970 was a Thursday; shift so weeks start on Monday.
  return Math.floor((days + 3) / 7);
}

export type CurrentTheme = MonthTheme & ThemeWeek & { week: number };

/** This month's theme and this week's question and tip (days 1-7 = week 1, ..., 29-31 = week 4). */
export function themeOfTheWeek(now = new Date()): CurrentTheme {
  const [, month, day] = todayKey(now).split('-').map(Number);
  const theme = MONTH_THEMES[month - 1];
  const week = Math.min(3, Math.floor((day - 1) / 7));
  return { ...theme, ...theme.weeks[week], week };
}
