// Gross profit in dollars for one placement-week.
export function grossProfit(p: { billRate: number; payRate: number; hours: number }): number {
  return p.hours * (p.billRate - p.payRate);
}
