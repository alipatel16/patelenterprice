import { createPaymentActions } from './payments';
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
