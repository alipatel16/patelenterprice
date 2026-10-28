const DAY = 86400000, OFFSET = 330 * 60000;
export const indiaDay = (now = new Date()) => new Date(new Date(now).getTime() + OFFSET).toISOString().slice(0, 10);
export const addCalendarDays = (date, days) => new Date(new Date(`${date}T00:00:00Z`).getTime() + days * DAY).toISOString().slice(0, 10);
export const untilIndiaMidnight = (now = new Date()) => new Date(`${addCalendarDays(indiaDay(now), 1)}T00:00:00Z`).getTime() - OFFSET - new Date(now).getTime();
export function dueFilters(tab, today) {
  if (tab === 'review') return [['needsReconciliation', '==', true]];
  if (tab === 'overdue') return [['dueDate', '<', today]];
  if (tab === 'today') return [['dueDate', '==', today]];
  return [['dueDate', '>', today], ['dueDate', '<=', addCalendarDays(today, 7)]];
}
export const deliveryFilters = tab => [['deliveryState', '==', tab === 'pending' ? 'pending' : 'delivered'],
  ...(tab === 'outstanding' ? [['hasOutstandingPayment', '==', true]] : [])];
export const exchangeFilters = state => [['exchangeState', '==', state]];
