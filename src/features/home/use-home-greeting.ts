import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { todayKey, useWellness } from '@/features/wellness/store';
import { themeOfTheWeek } from '@/features/wellness/weekly-themes';
import { isActiveOrder } from '@/lib/order-status';
import { useOrders } from '@/store/orders';
import { useSession } from '@/store/session';

import { BRAND_LINE, BRAND_TITLE, dayLine, greetingTitle, type DayLine } from './greeting';

/** The day this phone first opened Home (Nairobi, YYYY-MM-DD): the brand line shows on that day. */
const FIRST_DAY_KEY = 'xanaplus.home.firstDay.v1';

/**
 * Home's heading and the line under it. A brand-new, signed-out visitor's first day: the brand line.
 * From the next day on: the greeting for the time of day and today's most useful true line.
 * The clock is read whenever Home comes into view.
 */
export function useHomeGreeting({ offerCount, shopName }: { offerCount: number; shopName: string }): {
  title: string;
  subtitle: string;
  line: DayLine | null;
} {
  const { user, needsName } = useSession();
  const { orders } = useOrders();
  const { today, goal, daysLogged } = useWellness();
  const [now, setNow] = useState(() => new Date());
  useFocusEffect(useCallback(() => setNow(new Date()), []));

  const [firstDay, setFirstDay] = useState(false);
  useEffect(() => {
    void AsyncStorage.getItem(FIRST_DAY_KEY).then(saved => {
      const day = todayKey();
      if (!saved) void AsyncStorage.setItem(FIRST_DAY_KEY, day);
      setFirstDay(!saved || saved === day);
    }, () => undefined);
  }, []);

  // Signed in, or with orders or check-ins on this phone: not new, whatever the first-day record
  // says (it only started on 20 Nov 2026, so existing customers have none).
  const known = Boolean(user) || orders.length > 0 || daysLogged > 0;
  if (firstDay && !known) return { title: BRAND_TITLE, subtitle: BRAND_LINE, line: null };

  const firstName = user && !needsName ? user.name.split(' ')[0] : null;
  const theme = themeOfTheWeek(now);
  const line = dayLine({
    orders: orders.filter(order => isActiveOrder(order.status)),
    offerCount,
    shopName,
    water: today.water,
    waterGoal: goal,
    themeName: theme.name,
    themeQuestion: theme.question,
    themeAnswered: Boolean(today.weekly),
  });
  return { title: greetingTitle(now, firstName), subtitle: line.text, line: line.target ? line : null };
}
