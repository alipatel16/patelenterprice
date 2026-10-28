import { periodQuery, mergeProductPage, reportTotals } from './reports';
import { buildReportContributions } from './projections';

it('ranks period summaries with full-scope aggregates independently of the 15 row page', () => {
  expect(periodQuery('employee', { periodType: 'monthly', periodKey: '2026-10' })).toMatchObject({ collectionName: 'reportEmployeePeriods', options: { pageSize: 15, filters: [['periodType', '==', 'monthly'], ['periodKey', '==', '2026-10']], sort: [['revenue', 'desc']] } });
  expect(reportTotals([{ revenue: 200, quantity: 3, invoiceCount: 2, reconciliationCount: 1 }])).toMatchObject({ revenue: 200, reconciliationCount: 1 });
});
it('keeps zero movement products and legacy salesperson buckets without name matching', () => {
  expect(mergeProductPage([{ id: 'zero', name: 'Unmoved' }, { id: 'p', name: 'Chair' }], [{ productId: 'p', quantity: 2, revenue: 30 }], { zero: { stock: 9 } })).toEqual([expect.objectContaining({ productId: 'zero', quantity: 0, stock: 9 }), expect.objectContaining({ productId: 'p', quantity: 2 })]);
  expect(buildReportContributions('s', { saleDate: '2026-10-01', grandTotal: 30, salesperson: 'Duplicate', items: [] }).find(r => r.collection === 'reportEmployeePeriods').data).toMatchObject({ employeeId: null, employeeKey: 'legacy:duplicate' });
});

it('reverses ranked rows for sale edits, reassignment, date moves and deletion', async () => {
  const { memoryPaymentStore } = require('./paymentTestStore');
  const { createWriteAdapters } = require('./writes');
  const s = memoryPaymentStore(), writes = createWriteAdapters(s.driver);
  const sale = { saleDate: '2026-10-01', paymentType: 'full', grandTotal: 100, salespersonId: 'u1', salesperson: 'First', items: [{ productId: 'p1', productName: 'Chair', qty: 1, price: 100 }] };
  await writes.setRecord(s.ref('sales/one'), sale);
  await writes.setRecord(s.ref('sales/two'), { ...sale, salespersonId: 'u2', salesperson: 'Second', grandTotal: 50 });
  const ranked = month => [...s.records].filter(([path, row]) => path.startsWith('reportEmployeePeriods/') && row.periodType === 'monthly' && row.periodKey === month).map(([, row]) => row).sort((a, b) => b.revenue - a.revenue);
  expect(ranked('2026-10').map(row => row.employeeId)).toEqual(['u1', 'u2']);
  await writes.updateRecord(s.ref('sales/one'), { salespersonId: 'u2', salesperson: 'Second', saleDate: '2026-11-01', grandTotal: 200 });
  expect(ranked('2026-10')).toEqual([expect.objectContaining({ employeeId: 'u2', revenue: 50 })]);
  expect(ranked('2026-11')).toEqual([expect.objectContaining({ employeeId: 'u2', revenue: 200 })]);
  await writes.deleteRecord(s.ref('sales/one'));
  expect(ranked('2026-11')).toEqual([]);
});
