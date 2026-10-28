import { fetchPage, fetchAggregate, getKnownDocument, invalidateCollections, setDataAccessScope, subscribeInvalidation } from './query';
import { getDocs, getDoc, getCountFromServer, getAggregateFromServer } from 'firebase/firestore';
jest.mock('firebase/firestore', () => ({
  collection: (db, name) => ({ db, name }), doc: (db, name, id) => ({ db, name, id }),
  query: (ref, ...constraints) => ({ ...ref, constraints }),
  where: (...args) => ({ type: 'where', args }), orderBy: (...args) => ({ type: 'orderBy', args }),
  limit: n => ({ type: 'limit', n }), startAfter: value => ({ type: 'cursor', value }),
  count: () => ({ op: 'count' }), sum: field => ({ op: 'sum', field }),
  getDocs: jest.fn(), getDoc: jest.fn(), getCountFromServer: jest.fn(), getAggregateFromServer: jest.fn(),
}));
const snap = rows => ({ docs: rows.map(([id, data]) => ({ id, data: () => data })) });
beforeEach(() => {
  jest.clearAllMocks();
  getDoc.mockResolvedValue({ exists: () => true, id: 'same', data: () => ({ version: 2, readyCollections: ['customers'] }) });
  getDocs.mockResolvedValue(snap([['1', { name: 'Ali' }]]));
  getCountFromServer.mockResolvedValue({ data: () => ({ count: 31 }) });
});
test('short input never issues document or aggregate transport', async () => {
  const db = {};
  expect(await fetchPage(db, 'customers', { search: 'a' })).toMatchObject({ rows: [], total: 0 });
  expect(getDocs).not.toHaveBeenCalled(); expect(getDoc).not.toHaveBeenCalled(); expect(getCountFromServer).not.toHaveBeenCalled();
});
test('filters and search precede limit; total omits cursor/limit and page revisits are cached', async () => {
  const db = {};
  const options = { search: ' PA ', filters: [['companyId', '==', 'store']], pageSize: 15 };
  const page = await fetchPage(db, 'customers', options);
  expect(page).toMatchObject({ rows: [{ id: '1', name: 'Ali' }], total: 31, hasNext: false });
  const constraints = getDocs.mock.calls[0][0].constraints;
  expect(constraints.filter(c => c.type === 'where').map(c => c.args)).toEqual([['companyId', '==', 'store'], ['searchTokens', 'array-contains', 'pa']]);
  expect(constraints.at(-1)).toEqual({ type: 'limit', n: 15 });
  expect(getCountFromServer.mock.calls[0][0].constraints.every(c => c.type === 'where')).toBe(true);
  await fetchPage(db, 'customers', options); expect(getDocs).toHaveBeenCalledTimes(1);
  await fetchPage(db, 'customers', { ...options, cursor: page.lastDoc });
  expect(getCountFromServer).toHaveBeenCalledTimes(1);
});
test('search readiness failures remain visible and never fall back to a scan', async () => {
  getDoc.mockResolvedValue({ exists: () => false });
  await expect(fetchPage({}, 'customers', { search: 'pa' })).rejects.toMatchObject({ code: 'data-access/not-ready' });
  expect(getDocs).not.toHaveBeenCalled();
});
test('known-ID cache deduplicates and isolates databases/users; invalidation rejects late caching', async () => {
  const a = {}, b = {};
  getDoc.mockResolvedValue({ exists: () => true, id: 'same', data: () => ({ name: 'First' }) });
  await Promise.all([getKnownDocument(a, 'customers', 'same'), getKnownDocument(a, 'customers', 'same')]);
  expect(getDoc).toHaveBeenCalledTimes(1);
  await getKnownDocument(b, 'customers', 'same'); expect(getDoc).toHaveBeenCalledTimes(2);
  setDataAccessScope(a, 'user2:admin');
  await getKnownDocument(a, 'customers', 'same'); expect(getDoc).toHaveBeenCalledTimes(3);
  const notify = jest.fn(), off = subscribeInvalidation(a, notify);
  invalidateCollections(a, ['customers']);
  expect(notify).toHaveBeenCalledWith(['customers']); off();
  await getKnownDocument(a, 'customers', 'same'); expect(getDoc).toHaveBeenCalledTimes(4);
  let resolve; getDoc.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  invalidateCollections(a, ['customers']);
  const pending = getKnownDocument(a, 'customers', 'late'); await Promise.resolve(); invalidateCollections(a, ['customers']);
  const rejected = expect(pending).rejects.toMatchObject({ code: 'data-access/invalidated' });
  resolve({ exists: () => true, id: 'late', data: () => ({ name: 'Old' }) }); await rejected;
  await getKnownDocument(a, 'customers', 'late'); expect(getDoc).toHaveBeenCalledTimes(6);
});
test('aggregate descriptors use server aggregates without page limits', async () => {
  getAggregateFromServer.mockResolvedValue({ data: () => ({ count: 42, amount: 123 }) });
  expect(await fetchAggregate({}, 'sales', { filters: [['status', '==', 'paid']], aggregates: { count: { op: 'count' }, amount: { op: 'sum', field: 'grandTotal' } } })).toEqual({ count: 42, amount: 123 });
  expect(getAggregateFromServer.mock.calls[0][0].constraints).toEqual([{ type: 'where', args: ['status', '==', 'paid'] }]);
});
test('bounded cache expires after 60 seconds and evicts older known IDs', async () => {
  const db = {}, now = jest.spyOn(Date, 'now').mockReturnValue(1000);
  await getKnownDocument(db, 'customers', 'same'); now.mockReturnValue(61001);
  await getKnownDocument(db, 'customers', 'same'); expect(getDoc).toHaveBeenCalledTimes(2);
  for (let i = 0; i < 220; i++) await getKnownDocument(db, 'customers', String(i));
  await getKnownDocument(db, 'customers', 'same'); expect(getDoc).toHaveBeenCalledTimes(223); now.mockRestore();
});
test('equal sort values page without skipping and server filters find historical matches beyond recent rows', async () => {
  const fixture = Array.from({ length: 40 }, (_, i) => ({ id: String(i).padStart(2, '0'), name: `Person ${i}`, companyId: i < 25 ? 'other' : 'store', searchTokens: ['pa'], createdAt: 1 }));
  getDocs.mockImplementation(async request => {
    let rows = fixture;
    for (const c of request.constraints) {
      if (c.type === 'where') {
        const [field, op, value] = c.args;
        rows = rows.filter(row => op === 'array-contains' ? row[field].includes(value) : row[field] === value);
      }
      if (c.type === 'cursor') rows = rows.filter(row => row.id > c.value.id);
      if (c.type === 'limit') rows = rows.slice(0, c.n);
    }
    return snap(rows.map(row => [row.id, row]));
  });
  const db = {}, options = { search: 'pa', filters: [['companyId', '==', 'store']], pageSize: 10, includeTotal: false };
  const first = await fetchPage(db, 'customers', options), second = await fetchPage(db, 'customers', { ...options, cursor: first.lastDoc });
  expect(first.rows.map(r => r.id)).toEqual(['25', '26', '27', '28', '29', '30', '31', '32', '33', '34']);
  expect(second.rows.map(r => r.id)).toEqual(['35', '36', '37', '38', '39']);
});
test('a readiness response from the prior identity cannot start transport in the new identity', async () => {
  const db = {}; let resolve;
  getDoc.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const pending = fetchPage(db, 'customers', { search: 'pa' }); await Promise.resolve();
  setDataAccessScope(db, 'next-user');
  resolve({ exists: () => true, id: 'dataAccessV2', data: () => ({ version: 2, readyCollections: ['customers'] }) });
  await expect(pending).rejects.toMatchObject({ code: 'data-access/stale-scope' });
  expect(getDocs).not.toHaveBeenCalled();
});
test('readiness invalidation forces verification even when a page itself is cached', async () => {
  const db = {};
  await fetchPage(db, 'customers', { search: 'pa' });
  invalidateCollections(db, ['appSettings']);
  getDoc.mockResolvedValue({ exists: () => true, id: 'dataAccessV2', data: () => ({ version: 2, readyCollections: [] }) });
  await expect(fetchPage(db, 'customers', { search: 'pa' })).rejects.toMatchObject({ code: 'data-access/not-ready' });
});

test('unrelated sales invalidation leaves a customer search waiting on readiness valid', async () => {
  const db = {}; let resolveReady;
  getDoc.mockImplementationOnce(() => new Promise(resolve => { resolveReady = resolve; }));
  const pending = fetchPage(db, 'customers', { search: 'pa' });
  await Promise.resolve();
  invalidateCollections(db, ['sales']);
  resolveReady({ exists: () => true, id: 'dataAccessV2', data: () => ({ version: 2, readyCollections: ['customers'] }) });
  await expect(pending).resolves.toMatchObject({ rows: [{ id: '1', name: 'Ali' }] });
  expect(getDocs).toHaveBeenCalledTimes(1);
});

test('customer invalidation rejects its pending readiness search and a new request succeeds', async () => {
  const db = {}; let resolveReady;
  getDoc.mockImplementationOnce(() => new Promise(resolve => { resolveReady = resolve; }));
  const pending = fetchPage(db, 'customers', { search: 'pa' });
  await Promise.resolve();
  invalidateCollections(db, ['customers']);
  const rejected = expect(pending).rejects.toMatchObject({ code: 'data-access/invalidated' });
  resolveReady({ exists: () => true, id: 'dataAccessV2', data: () => ({ version: 2, readyCollections: ['customers'] }) });
  await rejected;
  expect(getDocs).not.toHaveBeenCalled();
  await expect(fetchPage(db, 'customers', { search: 'pa' })).resolves.toMatchObject({ rows: [{ id: '1', name: 'Ali' }] });
});

test('unrelated invalidation permits an already pending customer document to populate its cache', async () => {
  const db = {}; let resolveDocument;
  getDoc.mockImplementationOnce(() => new Promise(resolve => { resolveDocument = resolve; }));
  const pending = getKnownDocument(db, 'customers', 'pending');
  await Promise.resolve(); invalidateCollections(db, ['sales']);
  resolveDocument({ exists: () => true, id: 'pending', data: () => ({ name: 'Current Customer' }) });
  await expect(pending).resolves.toMatchObject({ name: 'Current Customer' });
  await expect(getKnownDocument(db, 'customers', 'pending')).resolves.toMatchObject({ name: 'Current Customer' });
  expect(getDoc).toHaveBeenCalledTimes(1);
});

test('affected invalidation rejects an already pending page and prevents its cache reinsertion', async () => {
  const db = {}; let resolvePage;
  getDocs.mockImplementationOnce(() => new Promise(resolve => { resolvePage = resolve; }));
  const pending = fetchPage(db, 'customers', { includeTotal: false });
  await Promise.resolve(); invalidateCollections(db, ['customers']);
  const rejected = expect(pending).rejects.toMatchObject({ code: 'data-access/invalidated' });
  resolvePage(snap([['old', { name: 'Old Customer' }]]));
  await rejected;
  await expect(fetchPage(db, 'customers', { includeTotal: false })).resolves.toMatchObject({ rows: [{ id: '1', name: 'Ali' }] });
  expect(getDocs).toHaveBeenCalledTimes(2);
});
