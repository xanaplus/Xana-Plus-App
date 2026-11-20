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
      { question: 'A glass of water before your morning chai?', tip: 'Drink it while the kettle boils.' },
      { question: 'Water bottle in your bag today?', tip: 'A refillable bottle in your bag makes sipping easy.' },
      { question: 'One soda swapped for water today?', tip: 'Add a slice of lemon or orange if plain water feels boring.' },
      { question: 'Sipping before you feel thirsty?', tip: 'Small sips through the day are easier than a lot at once.' },
    ],
    items: ['WAT0012', 'WAT0011', 'WAT0002', 'WAT0033', 'WAT0015', 'FV0112'],
  },
  {
    name: 'Love your heart',
    intro: 'February is for hearts: eat well and keep moving.',
    weeks: [
      { question: 'Oats, brown bread or another whole grain today?', tip: 'Oats for breakfast keep you full until lunch.' },
      { question: 'Boiled, steamed or roasted instead of deep fried today?', tip: 'Try boiling, steaming or roasting instead of deep frying.' },
      { question: 'Ten minutes of walking today?', tip: 'Get off the matatu one stop early and walk the rest.' },
      { question: 'Half your plate vegetables at supper?', tip: 'Half the plate vegetables is an easy rule to remember.' },
    ],
    items: ['GC0239', 'MIP0115', 'FP0040', 'FV0093', 'FP0017', 'DEL0032'],
  },
  {
    name: 'Greens month',
    intro: 'More vegetables and fruit, the easy way.',
    weeks: [
      { question: 'Sukuma, spinach or managu on your plate today?', tip: 'Any of them count, and they cook in 10 minutes.' },
      { question: 'Greens with your ugali or rice?', tip: 'Fry them with onion and tomato for a quick side.' },
      { question: 'Fruit instead of a packet snack today?', tip: 'Keep fruit where you can see it, and it gets eaten first.' },
      { question: 'A new vegetable this week?', tip: 'Carrots and cabbage are good value, filling and keep well.' },
    ],
    items: ['FP0040', 'FP0042', 'FP0017', 'FP0021', 'FP0028', 'FV0079'],
  },
  {
    name: 'Rainy season',
    intro: 'World Malaria Day is 25 April. A fever in the rainy season needs a test the same day.',
    weeks: [
      { question: 'Under the mosquito net last night?', tip: 'Check your net for holes and tuck it under the mattress.' },
      { question: 'Standing water tipped out around the house?', tip: 'Mosquitoes breed in water left in tins, tyres and buckets.' },
      { question: 'Repellent on before the evening?', tip: 'Mosquitoes bite most from dusk to dawn.' },
      { question: 'Osha mikono: hands washed before eating today?', tip: 'Rainy weeks bring more stomach bugs. Soap and water before meals helps.' },
    ],
    items: ['OTC0006', 'OTC0008', 'BP0035', 'BBS0057', 'FV0112'],
  },
  {
    name: 'Blood pressure month',
    intro: 'World Hypertension Day is 17 May. Know your numbers.',
    weeks: [
      { question: 'Tasted your food before adding salt?', tip: 'Herbs, lemon and garlic add flavour without salt.' },
      { question: 'Fruit or unsalted nuts instead of crisps today?', tip: 'Crisps and salted nuts add up fast.' },
      { question: 'Thirty minutes on your feet today?', tip: 'Three 10-minute walks count as much as one long one.' },
      { question: 'Pima pressure: blood pressure checked this year?', tip: 'Ask our pharmacists about a blood pressure check.' },
    ],
    items: ['GC0239', 'FV0093', 'FP0028', 'FP0006', 'MIP0115', 'FV0112'],
  },
  {
    name: 'Move more',
    intro: 'Every bit of movement counts.',
    weeks: [
      { question: 'Danced, gardened or took the stairs today?', tip: 'It all counts as moving.' },
      { question: 'Five minutes of stretching today?', tip: 'A short stretch when you wake up loosens a stiff back.' },
      { question: 'Walked somewhere you would usually ride?', tip: 'A 20-minute walk is about 2,000 steps.' },
      { question: 'A glass of water after moving?', tip: 'Have a glass of water before and after exercise.' },
    ],
    items: ['WAT0011', 'WAT0012', 'BBS0003', 'GC0239', 'MIP0089', 'FV0079'],
  },
  {
    name: 'Cold season',
    intro: 'July is the coldest month. Stay warm and keep colds away.',
    weeks: [
      { question: 'Hands washed as soon as you got home?', tip: 'Colds spread on hands. 20 seconds with soap does the job.' },
      { question: 'An orange, pawpaw or guava today?', tip: 'All three are rich in vitamin C.' },
      { question: 'A good night’s sleep last night?', tip: 'Rest helps your body fight off a cold.' },
      { question: 'Something warm to drink instead of cold?', tip: 'Warm water with honey and lemon is soothing. No honey for babies under one.' },
    ],
    items: ['BBS0057', 'BBS0056', 'FV0112', 'FV0093', 'BEV0213', 'BP0035'],
  },
  {
    name: 'Family month',
    intro: 'World Breastfeeding Week is 1 to 7 August. Looking after the whole family.',
    weeks: [
      { question: 'A meal together as a family today?', tip: 'Shared meals are a good time to slow down and talk.' },
      { question: 'Kids’ hands washed before eating?', tip: 'Make it a song: 20 seconds is two rounds of "Happy Birthday".' },
      { question: 'Family clinic cards in one place?', tip: 'Keep clinic cards together and note the next visit date.' },
      { question: 'A little rest for you today?', tip: 'New parents need rest too. Say yes when help is offered.' },
    ],
    items: ['SD0311', 'SD0125', 'BP0035', 'BP0037', 'MIP0089', 'FV0079'],
  },
  {
    name: 'Lunchbox month',
    intro: 'Back to school and work: better snacks and lunches.',
    weeks: [
      { question: 'Fruit, nuts or a boiled egg in your bag today?', tip: 'They keep you going better than sweets.' },
      { question: 'Breakfast before you left home?', tip: 'Bread with peanut butter and a fruit is quick and filling.' },
      { question: 'Water with lunch instead of a sweet drink?', tip: 'A small bottle of water fits in any lunchbox.' },
      { question: 'A banana or orange for the road today?', tip: 'Both travel well in a bag.' },
    ],
    items: ['DEL0032', 'BBS0003', 'WAT0013', 'MIP0089', 'FV0079', 'FV0112'],
  },
  {
    name: 'Mind month',
    intro: 'World Mental Health Day is 10 October. If you have felt low for two weeks or more, talk to a doctor or someone you trust.',
    weeks: [
      { question: 'Ten minutes just for you today?', tip: 'A short walk or a quiet cup of chai counts.' },
      { question: 'Called or texted a friend today?', tip: 'A quick call can lift both your days.' },
      { question: 'Phone down an hour before bed?', tip: 'Screens keep the mind busy. A book or the radio is gentler.' },
      { question: 'One good thing from today written down?', tip: 'A small notebook by the bed makes it a habit.' },
    ],
    items: ['BEV0213', 'STA0047', 'BBS0057', 'FV0079', 'WAT0012'],
  },
  {
    name: 'Diabetes month',
    intro: 'World Diabetes Day is 14 November. Small swaps make a big difference.',
    weeks: [
      { question: 'Water or plain chai instead of soda today?', tip: 'Start with one swap a day.' },
      { question: 'Brown ugali, brown bread or brown rice today?', tip: 'Brown or millet ugali, brown bread and brown rice release energy slowly.' },
      { question: 'Chai yako: one spoon less sugar today?', tip: 'Cut down slowly. In two weeks you will stop missing it.' },
      { question: 'Pima sugar: blood sugar checked this year?', tip: 'Ask our pharmacists about getting your blood sugar checked.' },
    ],
    items: ['DEL0032', 'DEL0033', 'GC0239', 'FP0040', 'WAT0011', 'PGI0859'],
  },
  {
    name: 'Healthy holidays',
    intro: 'Enjoy the season, and look after yourself too.',
    weeks: [
      { question: 'Water with the festive meals today?', tip: 'Festive food is salty. Extra water helps.' },
      { question: 'Kachumbari and greens next to the nyama choma?', tip: 'Enjoy the nyama, and fill half the plate with vegetables.' },
      { question: 'A walk after the big meal?', tip: 'A 15-minute walk after eating helps you feel lighter.' },
      { question: 'Bed at your usual time last night?', tip: 'Late nights add up. Try to go to bed at the same time.' },
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
