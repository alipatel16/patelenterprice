import { loadDashboard } from './dashboard';
import { invalidateCollections, setDataAccessScope } from './query';
import { getDocs, getDoc, getAggregateFromServer } from 'firebase/firestore';

// The transport double models Firestore's aggregate field-existence rule. A
// combined count/sum would lose invoices which have no grandTotal field.
jest.mock('firebase/firestore', () => ({
  collection: (db, name) => ({ db, name }),
  query: (ref, ...constraints) => ({ ...ref, constraints }),
  where: (...args) => ({ type: 'where', args }),
  count: () => ({ op: 'count' }), sum: field => ({ op: 'sum', field }),
  getDocs: jest.fn(() => { throw new Error('Dashboard cannot read documents'); }),
  getDoc: jest.fn(() => { throw new Error('Dashboard cannot read documents'); }),
  getAggregateFromServer: jest.fn(),
}));

const now = new Date('2026-10-31T18:45:00Z'); // 1 Nov, 00:15 in India
const sales = [
  { createdAt: new Date('2026-10-31T18:29:59.999Z'), grandTotal: 50, paymentStatus: 'paid' },
  { createdAt: new Date('2026-10-31T18:30:00Z'), saleDate: '2025-01-01', grandTotal: 100, paymentStatus: 'unpaid' },
  { createdAt: new Date('2026-11-01T10:00:00Z'), paymentType: 'pending_payment', paymentStatus: 'paid' },
  { createdAt: new Date('2026-11-01T18:29:59.999Z'), grandTotal: 'legacy text', paymentStatus: 'partial' },
  { createdAt: new Date('2026-11-01T18:30:00Z'), grandTotal: 900, paymentStatus: 'paid' },
  { createdAt: new Date('2026-10-25T18:30:00Z'), grandTotal: 20, paymentStatus: 'unpaid' },
  { grandTotal: 300, paymentStatus: 'partial' },
];
const fixture = { sales, customers: [{}, {}, {}], products: [{}], purchases: [{}, {}] };
function aggregateTransport(request, specs) {
  let rows = (request.db.fixture || fixture)[request.name];
  for (const constraint of request.constraints) {
    if (constraint.type !== 'where') throw new Error('Dashboard aggregates must not have page limits');
    const [field, op, value] = constraint.args;
    rows = rows.filter(row => {
      if (!(field in row)) return false;
      if (op === '>=') return row[field] >= value;
      if (op === '<') return row[field] < value;
      if (op === 'in') return value.includes(row[field]);
      throw new Error(`Unexpected predicate: ${op}`);
    });
  }
  const sums = Object.values(specs).filter(spec => spec.op === 'sum');
  rows = rows.filter(row => sums.every(spec => spec.field in row));
  return Promise.resolve({ data: () => Object.fromEntries(Object.entries(specs).map(([key, spec]) => [key,
    spec.op === 'count' ? rows.length : rows.reduce((total, row) => total + (typeof row[spec.field] === 'number' ? row[spec.field] : 0), 0),
  ])) });
}
beforeEach(() => { jest.clearAllMocks(); getAggregateFromServer.mockImplementation(aggregateTransport); });

test('Today uses India midnight and createdAt; aggregates retain missing-total invoice counts without document reads', async () => {
  const result = await loadDashboard({}, { now });
  expect(result.stats).toEqual({ totalSales: 100, invoiceCount: 3, todaySales: 100, totalCustomers: 3, totalProducts: 1, totalPurchases: 2, pendingSales: 4 });
  expect(result.chartData).toEqual([
    { day: '26 Oct', sales: 20 }, { day: '27 Oct', sales: 0 },
    { day: '28 Oct', sales: 0 }, { day: '29 Oct', sales: 0 },
    { day: '30 Oct', sales: 0 }, { day: '31 Oct', sales: 50 },
    { day: '01 Nov', sales: 100 },
  ]);
  expect(result.refreshedAt).toEqual(now);
  expect(getDocs).not.toHaveBeenCalled(); expect(getDoc).not.toHaveBeenCalled();
  // The displayed invoice count remains exact while the unused daily chart
  // counts must not cost additional server queries. Today reuses its sum.
  expect(getAggregateFromServer.mock.calls.length).toBeLessThanOrEqual(12);
});

test('monthly and custom date ranges include the final India calendar day and use a separate date cache', async () => {
  const db = {};
  const monthly = await loadDashboard(db, { range: 'monthly', now });
  expect(monthly.stats).toMatchObject({ totalSales: 1000, invoiceCount: 4, todaySales: 100 });
  const custom = await loadDashboard(db, { range: 'custom', start: '2026-10-31', end: '2026-10-31', now });
  expect(custom.stats).toMatchObject({ totalSales: 50, invoiceCount: 1, todaySales: 100 });
  await expect(loadDashboard(db, { range: 'custom', start: '2026-11-02', end: '2026-11-01', now })).rejects.toThrow(/date|range/i);
  await expect(loadDashboard(db, { range: 'custom', start: '2026-02-30', end: '2026-03-01', now })).rejects.toThrow(/date|range/i);
});

test('date/store/identity caches are isolated and relevant writes invalidate sales aggregates', async () => {
  const a = { fixture: { ...fixture, sales: [...sales] } }, b = { fixture: { ...fixture, sales: [] } };
  await loadDashboard(a, { now }); const first = getAggregateFromServer.mock.calls.length;
  await loadDashboard(a, { now }); expect(getAggregateFromServer).toHaveBeenCalledTimes(first);
  expect((await loadDashboard(b, { now })).stats.totalSales).toBe(0);
  a.fixture.sales[1] = { ...sales[1], grandTotal: 125 };
  expect((await loadDashboard(a, { now })).stats.totalSales).toBe(100);
  invalidateCollections(a, ['sales']);
  expect((await loadDashboard(a, { now })).stats.totalSales).toBe(125);
  a.fixture.sales[1] = { ...sales[1], grandTotal: 150 };
  setDataAccessScope(a, 'new-user');
  expect((await loadDashboard(a, { now })).stats.totalSales).toBe(150);
});

test('server/index errors reject visibly instead of returning zero totals or scanning sales', async () => {
  getAggregateFromServer.mockRejectedValue(new Error('Index required'));
  await expect(loadDashboard({}, { now })).rejects.toThrow('Index required');
  expect(getDocs).not.toHaveBeenCalled();
});
