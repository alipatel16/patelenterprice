import { dueFilters, deliveryFilters, exchangeFilters, indiaDay } from './salesQueues';
import { fetchPage, fetchAggregate } from './query';
import { getDocs, getDoc, getCountFromServer, getAggregateFromServer } from 'firebase/firestore';
jest.mock('firebase/firestore', () => ({ collection: (db, name) => ({ db, name }), doc: (db, name, id) => ({ db, name, id }),
  query: (ref, ...constraints) => ({ ...ref, constraints }), where: (...args) => ({ type: 'where', args }),
  orderBy: (...args) => ({ type: 'orderBy', args }), limit: n => ({ type: 'limit', n }), startAfter: value => ({ type: 'cursor', value }),
  count: () => ({ op: 'count' }), sum: field => ({ op: 'sum', field }), getDocs: jest.fn(), getDoc: jest.fn(), getCountFromServer: jest.fn(), getAggregateFromServer: jest.fn() }));
const snapshot = rows => ({ docs: rows.map(row => ({ id: row.id, data: () => row })) });
function transport(fixture) {
  const matching = request => request.constraints.filter(c => c.type === 'where').reduce((rows, c) => {
    const [field, op, value] = c.args;
    return rows.filter(r => op === '<' ? r[field] < value : op === '>' ? r[field] > value : op === '<=' ? r[field] <= value : op === 'array-contains' ? r[field].includes(value) : r[field] === value);
  }, fixture);
  getDoc.mockResolvedValue({ exists: () => true, data: () => ({ version: 2, readyCollections: ['sales', 'emiDues'] }) });
  getDocs.mockImplementation(async request => { let rows = matching(request); const cursor = request.constraints.find(c => c.type === 'cursor'); if (cursor) rows = rows.slice(rows.findIndex(r => r.id === cursor.value.id) + 1); return snapshot(rows.slice(0, request.constraints.find(c => c.type === 'limit').n)); });
  getCountFromServer.mockImplementation(async request => ({ data: () => ({ count: matching(request).length }) }));
  getAggregateFromServer.mockImplementation(async (request, descriptors) => ({ data: () => Object.fromEntries(Object.entries(descriptors).map(([key, d]) => [key, d.op === 'sum' ? matching(request).reduce((s, r) => s + r[d.field], 0) : matching(request).length])) }));
}
beforeEach(() => jest.clearAllMocks());
it('returns two-year-old overdue dues and complete totals beyond the first 15 matching installments', async () => {
  const rows = Array.from({ length: 36 }, (_, i) => ({ id: String(i), dueDate: i === 0 ? '2024-01-01' : '2026-10-27', remainingAmount: 100 })); transport([...rows, { id: 'future', dueDate: '2027-01-01', remainingAmount: 999 }]);
  const db = {}, filters = dueFilters('overdue', '2026-10-28');
  const page = await fetchPage(db, 'emiDues', { filters, sort: [['dueDate', 'asc']], requireReady: true });
  const aggregate = await fetchAggregate(db, 'emiDues', { filters, aggregates: { amount: { op: 'sum', field: 'remainingAmount' } }, requireReady: true });
  expect(page.rows).toHaveLength(15); expect(page.rows[0].dueDate).toBe('2024-01-01'); expect(page.total).toBe(36); expect(aggregate.amount).toBe(3600);
});
it('reaches all 224 pending exchanges among 225 records without a capped client queue', async () => {
  transport(Array.from({ length: 225 }, (_, i) => ({ id: String(i), exchangeState: i < 224 ? 'pending' : 'received' })));
  const db = {}, options = { filters: exchangeFilters('pending'), requireReady: true, sort: [['saleDate', 'desc']] };
  let cursor = null, count = 0;
  for (let i = 0; i < 15; i++) { const page = await fetchPage(db, 'sales', { ...options, cursor }); count += page.rows.length; cursor = page.lastDoc; }
  expect(count).toBe(224);
});
it('searches delivered payment-pending invoices by another name word or phone suffix the next day', async () => {
  transport([{ id: 'old', deliveryState: 'delivered', hasOutstandingPayment: true, actualDeliveryDate: '2026-10-27', searchTokens: ['patel', '3210'] }, { id: 'paid', deliveryState: 'delivered', hasOutstandingPayment: false, searchTokens: ['patel'] }]);
  const db = {};
  for (const search of ['patel', '3210']) expect((await fetchPage(db, 'sales', { filters: deliveryFilters('outstanding'), search, requireReady: true })).rows.map(r => r.id)).toEqual(['old']);
  expect((await fetchPage(db, 'sales', { filters: deliveryFilters('delivered'), requireReady: true })).total).toBe(2);
});
it('uses India midnight for date tabs regardless of browser timezone', () => {
  expect(indiaDay(new Date('2026-10-28T18:29:59Z'))).toBe('2026-10-28');
  expect(indiaDay(new Date('2026-10-28T18:30:00Z'))).toBe('2026-10-29');
  expect(dueFilters('upcoming', '2026-12-29')).toEqual([['dueDate', '>', '2026-12-29'], ['dueDate', '<=', '2027-01-05']]);
});
