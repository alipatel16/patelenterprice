import { createPaymentActions, installmentPaid } from './payments';
import { createWriteAdapters } from './writes';
import { memoryPaymentStore } from './paymentTestStore';

const emi = { saleDate: '2024-01-01', grandTotal: 1000, paymentType: 'emi', downPayment: 200, totalPaidAmount: 200,
  emiInstallments: [{ installmentNumber: 1, amount: 800, paidAmount: 0, dueDate: '2024-02-01', payments: [] }] };
const receipt = amount => ({ amount, mode: 'Cash', payDate: '2026-10-28', notes: '' });
function setup(sale = emi) {
  const store = memoryPaymentStore();
  const writes = createWriteAdapters(store.driver);
  const actions = createPaymentActions({ doc: store.driver.doc, mutateRecord: writes.mutateRecord, now: () => '2026-10-28T10:00:00Z' });
  return { store, writes, actions, seed: () => writes.setRecord(store.ref('sales/s1'), sale) };
}
it('keeps concurrent partial payments and retry receipts exactly once with exact due balance', async () => {
  const { store, actions, seed } = setup(); await seed();
  await Promise.all([actions.recordEmiPayment(store.db, 's1', 1, receipt(100), 'a'), actions.recordEmiPayment(store.db, 's1', 1, receipt(150), 'b')]);
  const sale = await actions.recordEmiPayment(store.db, 's1', 1, receipt(100), 'a');
  expect(store.retries).toBeGreaterThan(0);
  expect(sale.totalPaidAmount).toBe(450);
  expect(sale.emiInstallments[0].payments).toHaveLength(2);
  expect(store.records.get('emiDues/s1_1').remainingAmount).toBe(550);
  await actions.recordEmiPayment(store.db, 's1', 1, receipt(550), 'c');
  expect(store.records.has('emiDues/s1_1')).toBe(false);
  expect(store.records.get('sales/s1')).toMatchObject({ paymentStatus: 'paid', hasPendingEmi: false });
});
it('reschedules the exact installment atomically without losing concurrent receipt history', async () => {
  const { store, actions, seed } = setup(); await seed();
  await Promise.all([actions.recordEmiPayment(store.db, 's1', 1, receipt(100), 'a'), actions.rescheduleEmi(store.db, 's1', 1, '2026-11-01', 'Customer request', 'schedule')]);
  await actions.rescheduleEmi(store.db, 's1', 1, '2026-11-01', 'Customer request', 'schedule');
  expect(store.records.get('emiDues/s1_1')).toMatchObject({ dueDate: '2026-11-01', remainingAmount: 700 });
  expect(store.records.get('sales/s1')).toMatchObject({ nextEmiDueDate: '2026-11-01', totalPaidAmount: 300 });
  expect(store.records.get('sales/s1').emiInstallments[0].dueDateChanges).toHaveLength(1);
});
it('rejects overpayment using fresh transaction balance', async () => {
  const { store, actions, seed } = setup(); await seed();
  const results = await Promise.allSettled([actions.recordEmiPayment(store.db, 's1', 1, receipt(600), 'a'), actions.recordEmiPayment(store.db, 's1', 1, receipt(600), 'b')]);
  expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
  expect(store.records.get('sales/s1').totalPaidAmount).toBe(800);
});
it('rejects EMI reconciliation mismatches without rewriting history', async () => {
  const { store, actions, seed } = setup({ ...emi, totalPaidAmount: 500 }); await seed();
  await expect(actions.recordEmiPayment(store.db, 's1', 1, receipt(100), 'a')).rejects.toMatchObject({ code: 'data-access/reconciliation-required' });
  expect(store.records.get('sales/s1').totalPaidAmount).toBe(500);
  expect(store.records.get('sales/s1').emiInstallments[0].payments).toEqual([]);
});
it('preserves delivered history while later partial and final payments clear only outstanding state', async () => {
  const { store, writes, actions, seed } = setup({ saleDate: '2026-10-27', grandTotal: 1000, paymentType: 'pending_payment', totalPaidAmount: 0, deliveryType: 'scheduled', isDelivered: false, customerName: 'Mina Patel', customerPhone: '9876543210' }); await seed();
  await writes.updateRecord(store.ref('sales/s1'), { isDelivered: true, deliveryStatus: 'delivered', actualDeliveryDate: '2026-10-27' });
  expect(store.records.get('sales/s1')).toMatchObject({ deliveryState: 'delivered', hasOutstandingPayment: true });
  await actions.recordSalePayment(store.db, 's1', receipt(400), 'first');
  const sale = await actions.recordSalePayment(store.db, 's1', receipt(600), 'final');
  expect(sale).toMatchObject({ deliveryState: 'delivered', hasOutstandingPayment: false, actualDeliveryDate: '2026-10-27' });
  expect(sale.searchTokens).toEqual(expect.arrayContaining(['patel', '3210']));
  expect(sale.salePayments).toHaveLength(2);
});
it('keeps legacy full-payment invoices with zero stored paid total fully paid', async () => {
  const { store, actions, seed } = setup({ saleDate: '2026-10-27', grandTotal: 1000, paymentType: 'full_payment', totalPaidAmount: 0 }); await seed();
  await expect(actions.recordSalePayment(store.db, 's1', receipt(100), 'a')).rejects.toThrow(/paid/i);
  expect(store.records.get('sales/s1').hasOutstandingPayment).toBe(false);
});
it('preserves an existing collected baseline when appending later receipts', async () => {
  const { store, actions, seed } = setup({ saleDate: '2026-10-27', grandTotal: 1000, paymentType: 'pending_payment', totalPaidAmount: 200 }); await seed();
  expect((await actions.recordSalePayment(store.db, 's1', receipt(300), 'a')).totalPaidAmount).toBe(500);
});
it('adds to a legacy receipt-derived paid amount when the scalar is absent', async () => {
  const { store, actions, seed } = setup({ ...emi, totalPaidAmount: 300, emiInstallments: [{ installmentNumber: 1, amount: 800, dueDate: '2024-02-01', payments: [{ amount: 100 }] }] }); await seed();
  const sale = await actions.recordEmiPayment(store.db, 's1', 1, receipt(50), 'legacy');
  expect(sale.emiInstallments[0].paidAmount).toBe(150);
  expect(sale.totalPaidAmount).toBe(350);
  expect(store.records.get('emiDues/s1_1').remainingAmount).toBe(650);
});
it('recognizes other receipt-derived paid installments when finalizing an EMI invoice', async () => {
  const { store, actions, seed } = setup({ ...emi, totalPaidAmount: 600, emiInstallments: [{ installmentNumber: 1, amount: 400, dueDate: '2024-02-01', payments: [{ amount: 400 }] }, { installmentNumber: 2, amount: 400, paidAmount: 0, dueDate: '2024-03-01', payments: [] }] }); await seed();
  const sale = await actions.recordEmiPayment(store.db, 's1', 2, receipt(400), 'legacy-final');
  expect(sale.paymentStatus).toBe('paid'); expect(sale.hasPendingEmi).toBe(false);
});

it('preserves scalar-only legacy paid amounts through concurrent payments and replay', async () => {
  const { store, actions, seed } = setup({ ...emi, totalPaidAmount: 300, emiInstallments: [{ ...emi.emiInstallments[0], paidAmount: 100, legacyField: 'keep' }] }); await seed();
  await Promise.all([actions.recordEmiPayment(store.db, 's1', 1, receipt(50), 'a'), actions.recordEmiPayment(store.db, 's1', 1, receipt(75), 'b')]);
  const sale = await actions.recordEmiPayment(store.db, 's1', 1, receipt(50), 'a');
  expect(store.retries).toBeGreaterThan(0);
  expect(sale.emiInstallments[0]).toMatchObject({ paidAmountBaseline: 100, paidAmount: 225, legacyField: 'keep' });
  expect(sale.emiInstallments[0].payments.map(p => p.amount).sort((a,b) => a-b)).toEqual([50,75]);
  expect(sale.financialReconciliationRequired).toBe(false);
  expect(store.records.get('emiDues/s1_1').remainingAmount).toBe(575);
});


it.each([
  [[], 100],
  [[{ amount: 40 }], 140],
])('uses the baseline and receipts for payment entry when the scalar is absent (%p)', async (history, initialPaid) => {
  const source = { ...emi, totalPaidAmount: 200 + initialPaid, emiInstallments: [{ installmentNumber: 1, amount: 800, dueDate: '2024-02-01', paidAmountBaseline: 100, payments: history }] };
  const { store, actions, seed } = setup(source); await seed();
  expect(installmentPaid(source.emiInstallments[0])).toBe(initialPaid);
  await expect(actions.recordEmiPayment(store.db, 's1', 1, receipt(801 - initialPaid), 'over')).rejects.toThrow(/exceeds/);
  const first = await actions.recordEmiPayment(store.db, 's1', 1, receipt(50), 'first');
  expect(first.emiInstallments[0].paidAmount).toBe(initialPaid + 50);
  const second = await actions.recordEmiPayment(store.db, 's1', 1, receipt(25), 'second');
  const replay = await actions.recordEmiPayment(store.db, 's1', 1, receipt(50), 'first');
  expect(replay.emiInstallments[0]).toMatchObject({ paidAmountBaseline: 100, paidAmount: initialPaid + 75 });
  expect(replay.emiInstallments[0].payments).toHaveLength(history.length + 2);
  expect(second.financialReconciliationRequired).toBe(false);
  expect(store.records.get('emiDues/s1_1').remainingAmount).toBe(800 - initialPaid - 75);
});

it.each([
  { paidAmountBaseline: -1, payments: [] },
  { paidAmountBaseline: 100, payments: [{ amount: 'bad' }] },
])('does not guess installment paid amount from invalid history or baseline (%p)', installment => {
  expect(installmentPaid(installment)).toBeNull();
});

it('accepts legacy installment-only totals and includes the existing down payment once', async () => {
  const source = { ...emi, totalPaidAmount: 100, emiInstallments: [{ ...emi.emiInstallments[0], paidAmount: 100, payments: [{ amount: 100 }] }] };
  const { store, actions, seed } = setup(source); await seed();
  const first = await actions.recordEmiPayment(store.db, 's1', 1, receipt(50), 'legacy-down');
  expect(first.totalPaidAmount).toBe(350);
  expect(first.emiInstallments[0].payments.map(p => p.amount)).toEqual([100, 50]);
  const second = await actions.recordEmiPayment(store.db, 's1', 1, receipt(25), 'next');
  expect(second.totalPaidAmount).toBe(375);
  expect(second.financialReconciliationRequired).toBe(false);
  const replay = await actions.recordEmiPayment(store.db, 's1', 1, receipt(50), 'legacy-down');
  expect(replay.totalPaidAmount).toBe(375);
});

it('refreshes stored reconciliation flags and report contributions without changing historical money', async () => {
  const source = { ...emi, totalPaidAmount: 0 };
  const { store, writes, seed } = setup(source); await seed();
  const ref = store.ref('sales/s1');
  const legacy = { ...store.records.get(ref.path), financialReconciliationRequired: true, needsReconciliation: true,
    financialWarnings: ['emi-paid-total-mismatch'], reconciliationIssues: ['emi-paid-total-mismatch'] };
  store.records.set(ref.path, legacy);
  for (const [path, row] of store.records) {
    if (path.startsWith('reportEmployeePeriods/')) store.records.set(path, { ...row, reconciliationCount: 1 });
    if (path.startsWith('emiDues/')) store.records.set(path, { ...row, financialReconciliationRequired: true, needsReconciliation: true, financialWarnings: legacy.financialWarnings, reconciliationIssues: legacy.reconciliationIssues });
  }
  await writes.updateRecord(ref, {});
  expect(store.records.get(ref.path)).toMatchObject({ totalPaidAmount: 0, downPayment: 200, emiInstallments: source.emiInstallments, financialReconciliationRequired: false });
  expect(store.records.get('emiDues/s1_1')).toMatchObject({ financialReconciliationRequired: false, needsReconciliation: false });
  const reports = [...store.records].filter(([path]) => path.startsWith('reportEmployeePeriods/'));
  expect(reports.map(([,row]) => row.reconciliationCount)).toEqual([0,0,0]);
  await writes.updateRecord(ref, {});
  expect(reports.every(([path]) => store.records.get(path).reconciliationCount === 0)).toBe(true);
});

it.each([undefined, null])('preserves receipt-derived non-EMI paid totals when the scalar is %p', async totalPaidAmount => {
  const source = { saleDate: '2026-10-28', grandTotal: 1000, paymentType: 'finance', salePayments: [{ amount: 300 }], ...(totalPaidAmount === undefined ? {} : { totalPaidAmount }) };
  const { actions, seed, store } = setup(source); await seed();
  expect(store.records.get('sales/s1').outstandingPaymentAmount).toBe(700);
  const result = await actions.recordSalePayment(store.db, 's1', receipt(50), 'next');
  expect(result).toMatchObject({ totalPaidAmount: 350, outstandingPaymentAmount: 650 });
  expect(result.salePayments.map(p => p.amount)).toEqual([300,50]);
});
