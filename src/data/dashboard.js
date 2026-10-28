import { fetchAggregate } from './query';

const DAY = 86400000;
const INDIA_OFFSET = 330 * 60000;

// India has a fixed UTC+05:30 offset. UTC calendar arithmetic makes these
// bounds independent of the browser timezone (including DST elsewhere).
export function dashboardDate(now = new Date(), days = 0) {
  return new Date(new Date(now).getTime() + INDIA_OFFSET + days * DAY).toISOString().slice(0, 10);
}
function midnight(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('Choose valid dashboard dates.');
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('Choose valid dashboard dates.');
  }
  return new Date(parsed.getTime() - INDIA_OFFSET);
}
function dateBounds(range, start, end, now) {
  const today = dashboardDate(now);
  if (range === 'daily') {
    const from = midnight(today);
    return [from, new Date(from.getTime() + DAY)];
  }
  if (range === 'monthly') {
    const from = midnight(`${today.slice(0, 7)}-01`);
    const nextMonth = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    return [from, new Date(nextMonth.getTime() - INDIA_OFFSET)];
  }
  if (range !== 'custom') throw new Error('Choose a valid dashboard range.');
  const from = midnight(start), through = midnight(end);
  if (from > through) throw new Error('Dashboard date range must start before it ends.');
  return [from, new Date(through.getTime() + DAY)];
}

export async function loadDashboard(db, { range = 'daily', start, end, now = new Date() } = {}) {
  const [from, until] = dateBounds(range, start, end, now);
  const filtersFor = (begin, finish) => [['createdAt', '>=', begin], ['createdAt', '<', finish]];
  const sumSales = (begin, finish) => fetchAggregate(db, 'sales', {
    filters: filtersFor(begin, finish),
    aggregates: { sales: { op: 'sum', field: 'grandTotal' } },
  });
  const days = Array.from({ length: 7 }, (_, index) => midnight(dashboardDate(now, index - 6)));
  const buckets = days.map(day => sumSales(day, new Date(day.getTime() + DAY)));
  // Reuse a matching chart sum, including a custom single-day selection.
  const matchingDay = days.findIndex(day => day.getTime() === from.getTime() && until.getTime() - from.getTime() === DAY);
  const selectedSales = matchingDay >= 0 ? buckets[matchingDay] : sumSales(from, until);
  // Keep the displayed count independent: combining count/sum would omit
  // invoices with no grandTotal. Non-numeric legacy totals do not affect sum.
  const selected = Promise.all([
    fetchAggregate(db, 'sales', { filters: filtersFor(from, until) }), selectedSales,
  ]).then(([count, amount]) => ({ count: count.count, sales: amount.sales }));
  const [period, daily, customers, products, purchases, pending] = await Promise.all([
    selected, Promise.all(buckets),
    fetchAggregate(db, 'customers'), fetchAggregate(db, 'products'), fetchAggregate(db, 'purchases'),
    fetchAggregate(db, 'sales', { filters: [['paymentStatus', 'in', ['unpaid', 'partial']]] }),
  ]);
  return {
    stats: {
      totalSales: period.sales, invoiceCount: period.count, todaySales: daily[6].sales,
      totalCustomers: customers.count, totalProducts: products.count,
      totalPurchases: purchases.count, pendingSales: pending.count,
    },
    chartData: daily.map((bucket, index) => ({
      day: new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' }).format(days[index]),
      sales: bucket.sales,
    })),
    refreshedAt: new Date(now),
  };
}
