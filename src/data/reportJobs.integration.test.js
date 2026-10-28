import { generateCustomReport, fetchCustomReportPage } from './reportJobs';
import { withSearchFields } from './search';
import { invalidateCollections } from './query';
import { memoryPaymentStore } from './paymentTestStore';
import { getDoc, getDocs, getCountFromServer, runTransaction } from 'firebase/firestore';

let mockStore;
jest.mock('firebase/firestore', () => ({
  collection: (db, name) => ({ db, name }), doc: (_, name, id) => mockStore.ref(`${name}/${id}`),
  query: (ref, ...constraints) => ({ ...ref, constraints }), where: (...args) => ({ type: 'where', args }), orderBy: (...args) => ({ type: 'orderBy', args }), documentId: () => '__name__', limit: n => ({ type: 'limit', n }), startAfter: (...values) => ({ type: 'cursor', values }),
  getDoc: jest.fn(), getDocs: jest.fn(), getCountFromServer: jest.fn(), runTransaction: jest.fn(), getAggregateFromServer: jest.fn(), count: () => ({}), sum: () => ({}),
}));
function setup() {
  mockStore = memoryPaymentStore();
  const snapshot = (id, value) => ({ id, ref: mockStore.ref(id), exists: () => value !== undefined, data: () => value });
  getDoc.mockImplementation(async reference => snapshot(reference.id, mockStore.records.get(reference.path)));
  runTransaction.mockImplementation((db, callback) => mockStore.driver.runTransaction(db, callback));
  const select = request => {
    let rows = [...mockStore.records].filter(([path]) => path.startsWith(request.name + '/')).map(([path, value]) => ({ ...value, id: path.split('/').at(-1) }));
    for (const condition of request.constraints.filter(c => c.type === 'where')) {
      const [field, op, value] = condition.args;
      rows = rows.filter(row => op === 'array-contains' ? row[field]?.includes(value) : op === '>=' ? row[field] >= value : op === '<=' ? row[field] <= value : row[field] === value);
    }
    const sorts = request.constraints.filter(c => c.type === 'orderBy');
    rows.sort((a, b) => { for (const { args: [field, direction] } of sorts) { const key = field === '__name__' ? 'id' : field; if (a[key] !== b[key]) return (a[key] > b[key] ? 1 : -1) * (direction === 'desc' ? -1 : 1); } return a.id.localeCompare(b.id); });
    const cursor = request.constraints.find(c => c.type === 'cursor');
    if (cursor) { const previous = cursor.values[0]; const index = rows.findIndex(row => row.id === previous.id); rows = rows.slice(index + 1); }
    const cap = request.constraints.find(c => c.type === 'limit');
    return cap ? rows.slice(0, cap.n) : rows;
  };
  getDocs.mockImplementation(async request => { const rows = select(request); return { size: rows.length, docs: rows.map(row => snapshot(row.id, row)) }; });
  getCountFromServer.mockImplementation(async request => ({ data: () => ({ count: select(request).length }) }));
  mockStore.records.set('reportState/version', { schemaVersion: 2, revision: 7 });
  for (let i = 0; i < 37; i++) {
    mockStore.records.set(`reportEmployeePeriods/d${String(i).padStart(2, '0')}`, withSearchFields('reportEmployeePeriods', { periodType: 'daily', periodKey: '2026-10-01', dimensionKey: `user:u${i}`, employeeKey: `user:u${i}`, employeeId: `u${i}`, employeeName: i === 0 ? 'Zoya Faraway' : `Employee ${i}`, revenue: i + 1, quantity: 1, invoiceCount: 1, reconciliationCount: 0, undatedInvoiceCount: 0 }));
  }
  return mockStore;
}
it('requires migrated job-output readiness, then generates searchable output with a match beyond the first ranking page', async () => {
  const s = setup(), options = { dimension: 'employee', start: '2026-10-01', end: '2026-10-31' };
  s.records.set('appSettings/dataAccessV2', { version: 2, readyCollections: ['reportEmployeePeriods'] });
  await expect(generateCustomReport(s.db, options, { budget: 1 })).rejects.toMatchObject({ code: 'data-access/not-ready' });
  expect([...s.records.keys()].some(path => path.startsWith('reportJobs/'))).toBe(false);
  // The migration workflow, rather than the generator, publishes this flag.
  s.records.set('appSettings/dataAccessV2', { version: 2, readyCollections: ['reportEmployeePeriods', 'reportJobRows'] });
  invalidateCollections(s.db, ['appSettings']);
  const job = await generateCustomReport(s.db, options, { budget: 1, maxPageSize: 100 });
  expect(job).toMatchObject({ complete: true, processed: 37 });
  const first = await fetchCustomReportPage(s.db, job);
  expect(first.rows).toHaveLength(15);
  expect(first.rows.some(row => row.employeeName === 'Zoya Faraway')).toBe(false);
  const searched = await fetchCustomReportPage(s.db, job, { search: 'zoya' });
  expect(searched.rows).toEqual([expect.objectContaining({ employeeName: 'Zoya Faraway', revenue: 1 })]);
  expect(searched.total).toBe(1);
});

it.each(['search', 'metric'])('hides populated custom ranking after remote revision change and same-page %s', async change => {
  const React = require('react');
  const { act } = React;
  const { createRoot } = require('react-dom/client');
  const usePagedCollection = require('../hooks/usePagedCollection').default;
  const s = setup();
  s.records.set('appSettings/dataAccessV2', { version: 2, readyCollections: ['reportJobRows'] });
  const job = { jobId: 'j', asOfRevision: 7, complete: true, status: 'complete' };
  s.records.set('reportJobRows/j_7_a', withSearchFields('reportJobRows', { jobId: 'j', asOfRevision: 7, employeeName: 'Zoya', revenue: 10, quantity: 1 }));
  const host = document.createElement('div'), root = createRoot(host);
  global.IS_REACT_ACT_ENVIRONMENT = true;
  function View({ search, metric }) {
    const result = usePagedCollection(s.db, 'reportJobRows', { search, sort: [[metric, 'desc']], filters: [['jobId', '==', 'j'], ['asOfRevision', '==', 7]], loadPage: (db, _, options) => fetchCustomReportPage(db, job, { cursor: options.cursor, search: options.search, metric }) });
    return React.createElement('div', null, result.rows.map(row => row.employeeName), result.error?.message);
  }
  jest.useFakeTimers();
  try {
    await act(async () => root.render(React.createElement(View, { search: '', metric: 'revenue' })));
    expect(host.textContent).toBe('Zoya');
    s.records.set('reportState/version', { revision: 8 });
    await act(async () => root.render(React.createElement(View, { search: change === 'search' ? 'zo' : '', metric: change === 'metric' ? 'quantity' : 'revenue' })));
    expect(host.textContent).not.toContain('Zoya');
    if (change === 'search') await act(async () => { jest.advanceTimersByTime(300); });
    expect(host.textContent).toContain('changed');
    expect(host.textContent).not.toContain('Zoya');
  } finally { act(() => root.unmount()); jest.useRealTimers(); }
});

it('rejects a ranking page when the source revision changes during its query', async () => {
  const s = setup();
  s.records.set('appSettings/dataAccessV2', { version: 2, readyCollections: ['reportJobRows'] });
  const job = { jobId: 'j', asOfRevision: 7, complete: true, status: 'complete' };
  s.records.set('reportJobRows/j_7_a', withSearchFields('reportJobRows', { jobId: 'j', asOfRevision: 7, employeeName: 'Zoya', revenue: 10 }));
  const originalGetDocs = getDocs.getMockImplementation();
  getDocs.mockImplementation(async request => { const result = await originalGetDocs(request); s.records.set('reportState/version', { revision: 8 }); return result; });
  await expect(fetchCustomReportPage(s.db, job)).rejects.toThrow(/changed/);
});
