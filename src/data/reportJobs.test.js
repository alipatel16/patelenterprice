import { createReportJobRunner } from './reportJobs';

function store() {
  let revision = 7, checkpoint = null;
  const source = Array.from({ length: 37 }, (_, i) => ({ id: `d${i}`, dimensionKey: `user:${i % 4}`, employeeName: `Employee ${i % 4}`, periodKey: '2026-10-01', revenue: i + 1, quantity: 1, invoiceCount: 1, reconciliationCount: 0, undatedInvoiceCount: 0 }));
  const rows = new Map();
  const transport = {
    revision: async () => revision,
    load: async () => checkpoint,
    page: async (_, options, cursor, size) => { const offset = cursor || 0; return { rows: source.slice(offset, offset + size), cursor: offset + size, hasNext: offset + size < source.length }; },
    commit: async (_, job, page, expectedCursor) => {
      if (job.asOfRevision !== revision) return { ...job, status: 'invalidated', complete: false };
      if ((checkpoint?.cursor || null) !== expectedCursor) return checkpoint;
      for (const row of page.rows) { const old = rows.get(row.dimensionKey) || { revenue: 0, quantity: 0, invoiceCount: 0, reconciliationCount: 0, undatedInvoiceCount: 0 }; rows.set(row.dimensionKey, { ...row, ...Object.fromEntries(Object.keys(old).filter(k => typeof old[k] === 'number').map(k => [k, old[k] + row[k]])) }); }
      checkpoint = job; return checkpoint;
    },
  };
  return { transport, rows, revise: () => revision++ };
}
it('bounds each invocation, persists its cursor, resumes without duplicates, and exposes no partial ranking', async () => {
  const s = store(), run = createReportJobRunner(s.transport), options = { dimension: 'employee', start: '2026-10-01', end: '2026-10-31' };
  const partial = await run({}, options, { budget: 1, maxPageSize: 15 });
  expect(partial).toMatchObject({ complete: false, processed: 15, asOfRevision: 7 });
  expect(partial.rows).toBeUndefined();
  const { fetchCustomReportPage } = require('./reportJobs');
  await expect(fetchCustomReportPage({}, partial)).rejects.toThrow('incomplete');
  const resumed = await run({}, options, { budget: 3, maxPageSize: 15 });
  expect(resumed).toMatchObject({ complete: true, processed: 37 });
  expect([...s.rows.values()].reduce((n, row) => n + row.revenue, 0)).toBe(703);
  expect(s.rows.size).toBe(4);
  await run({}, options, { budget: 1 });
  expect([...s.rows.values()].reduce((n, row) => n + row.revenue, 0)).toBe(703);
});
it.each([15, 100])('invalidates completed and incomplete jobs when the source revision changes (page size %s)', async maxPageSize => {
  const s = store(), run = createReportJobRunner(s.transport), options = { dimension: 'employee', start: '2026-10-01', end: '2026-10-31' };
  await run({}, options, { budget: 1, maxPageSize }); s.revise();
  expect(await run({}, options)).toMatchObject({ status: 'invalidated', complete: false });
});

it('commits a checkpoint and all accumulated dimensions atomically and ignores duplicate page commits', async () => {
  const { createReportJobCommit } = require('./reportJobs');
  const { memoryPaymentStore } = require('./paymentTestStore');
  const s = memoryPaymentStore();
  s.records.set('reportState/version', { revision: 7 });
  const commit = createReportJobCommit(s.driver);
  const job = { jobId: 'employee_2026-10-01_2026-10-31', dimension: 'employee', asOfRevision: 7, cursor: { id: 'b', periodKey: '2026-10-01' }, processed: 2, complete: false, status: 'incomplete' };
  const page = { rows: [{ dimensionKey: 'user:u', revenue: 10, quantity: 1, invoiceCount: 1, reconciliationCount: 0, undatedInvoiceCount: 0 }, { dimensionKey: 'user:u', revenue: 20, quantity: 2, invoiceCount: 1, reconciliationCount: 0, undatedInvoiceCount: 0 }] };
  await Promise.all([commit(s.db, job, page, null), commit(s.db, job, page, null)]);
  expect(s.records.get('reportJobs/' + job.jobId)).toEqual(job);
  const rows = [...s.records].filter(([path]) => path.startsWith('reportJobRows/')).map(([, row]) => row);
  expect(rows).toEqual([expect.objectContaining({ revenue: 30, quantity: 3, invoiceCount: 2 })]);
  s.records.set('reportState/version', { revision: 8 });
  expect(await commit(s.db, { ...job, complete: true }, page, job.cursor)).toMatchObject({ status: 'invalidated', complete: false });
});

it('rejects impossible custom calendar dates before starting any report reads', () => {
  const { reportJobId } = require('./reportJobs');
  expect(() => reportJobId({ dimension: 'employee', start: '2026-02-31', end: '2026-03-03' })).toThrow('valid');
});
it('rejects a page when the source changes after its read and before checkpoint commit', async () => {
  const s = store();
  const read = s.transport.page;
  s.transport.page = async (...args) => { const result = await read(...args); s.revise(); return result; };
  const result = await createReportJobRunner(s.transport)({}, { dimension: 'employee', start: '2026-10-01', end: '2026-10-31' }, { budget: 1, maxPageSize: 15 });
  expect(result).toMatchObject({ complete: false, status: 'invalidated' });
  expect(s.rows.size).toBe(0);
});
