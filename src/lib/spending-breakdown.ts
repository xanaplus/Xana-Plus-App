/** Monetary shares use recorded item totals, not inferred allocations of order discounts or fees. */
export type SpendingMember = { id: string; label: string; total: number };
export type SpendingSegment = SpendingMember & { share: number; members?: SpendingMember[] };
export type SpendingBreakdown = { total: number; segments: SpendingSegment[] };

export function spendingBreakdown(items: readonly SpendingMember[]): SpendingBreakdown {
  const members = items.map(item => {
    if (!Number.isFinite(item.total) || item.total < 0) {
      throw new Error('Spending breakdown requires non-negative recorded amounts');
    }
    return { ...item, total: Math.round(item.total * 100) / 100 };
  }).filter(item => item.total > 0).sort((a, b) => b.total - a.total || a.id.localeCompare(b.id));
  const sum = (values: readonly SpendingMember[]) =>
    values.reduce((cents, item) => cents + Math.round(item.total * 100), 0) / 100;
  const total = sum(members);
  if (total === 0) return { total: 0, segments: [] };
  const visible: (SpendingMember & { members?: SpendingMember[] })[] = members.length <= 5
    ? members
    : [...members.slice(0, 4), {
      id: 'other', label: 'Other departments', total: sum(members.slice(4)), members: members.slice(4),
    }];
  return { total, segments: visible.map(item => ({ ...item, share: item.total / total })) };
}
