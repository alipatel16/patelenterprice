import { buildEmiSchedule, initialSalePaymentState } from './saleCreation';
import { deriveSaleState } from './projections';
import { createWriteAdapters } from './writes';
import { createPaymentActions } from './payments';
import { memoryPaymentStore } from './paymentTestStore';

it('creates a payable EMI invoice with its down payment included and exact principal', async () => {
  const source = { saleDate: '2026-10-28', paymentType: 'emi', grandTotal: 1000, downPayment: 200, emiMonths: 3, emiStartDate: '2026-11-01' };
  const schedule = buildEmiSchedule(source);
  expect(schedule.map(i => i.amount)).toEqual([266.67, 266.67, 266.66]);
  const sale = { ...source, emiInstallments: schedule, ...initialSalePaymentState(source) };
  expect(sale).toMatchObject({ totalPaidAmount: 200, paymentStatus: 'partial', paymentAccountingVersion: 2 });
  expect(deriveSaleState(sale).financialReconciliationRequired).toBe(false);
  const store = memoryPaymentStore(), writes = createWriteAdapters(store.driver);
  await writes.setRecord(store.ref('sales/new'), sale);
  const actions = createPaymentActions({ doc: store.driver.doc, mutateRecord: writes.mutateRecord });
  const paid = await actions.recordEmiPayment(store.db, 'new', 1, { amount: 100, payDate: '2026-10-28' }, 'first');
  expect(paid.totalPaidAmount).toBe(300);
  expect(paid.financialReconciliationRequired).toBe(false);
});

it('distributes pennies without negative installments for small principals', () => {
  expect(buildEmiSchedule({ paymentType: 'emi', grandTotal: .02, downPayment: 0, emiMonths: 4, emiStartDate: '2026-11-01' }).map(i => i.amount)).toEqual([.01, .01, 0, 0]);
});

it('uses each target month for end-of-month due dates', () => {
  expect(buildEmiSchedule({ paymentType: 'emi', grandTotal: 300, emiMonths: 3, emiStartDate: '2026-01-31' }).map(i => i.dueDate)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
});

it('records finance down payments once and keeps a zero-down EMI payable', () => {
  expect(initialSalePaymentState({ paymentType: 'finance', grandTotal: 1000, downPayment: 200, saleDate: '2026-10-28', financerName: 'Bank', paymentRef: 'ref' }, { recordedByName: 'Ali' })).toMatchObject({ totalPaidAmount: 200, salePayments: [{ amount: 200, isDownPayment: true, recordedByName: 'Ali' }] });
  expect(initialSalePaymentState({ paymentType: 'emi', grandTotal: 1000, downPayment: 0 })).toMatchObject({ totalPaidAmount: 0, paymentStatus: 'unpaid', salePayments: [] });
});
