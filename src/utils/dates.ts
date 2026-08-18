export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]!;
}

export function getToday(): string {
  return formatDate(new Date());
}

export function get30DaysAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return formatDate(d);
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}
