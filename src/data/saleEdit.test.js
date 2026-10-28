import { createWriteAdapters } from './writes';
import { memoryPaymentStore } from './paymentTestStore';
import { saveSaleEdit } from './saleEdit';

it('rejects an edit when payment, reschedule, or delivery changed after its snapshot', async () => {
  const store = memoryPaymentStore(), writes = createWriteAdapters(store.driver), ref = store.ref('sales/s1');
  await writes.setRecord(ref, { paymentType: 'emi', grandTotal: 100, totalPaidAmount: 0, emiInstallments: [{ installmentNumber: 1, amount: 100, paidAmount: 0, dueDate: '2026-11-01', payments: [] }] });
  const snapshot = store.records.get(ref.path);
  await writes.mutateRecord(ref, current => ({ totalPaidAmount: 25, isDelivered: true, actualDeliveryDate: '2026-10-28', emiInstallments: current.emiInstallments.map(row => ({ ...row, dueDate: '2026-12-01', paidAmount: 25, payments: [{ amount: 25 }] })) }));
  await expect(saveSaleEdit(writes.mutateRecord, ref, snapshot, { customerName: 'Edited', emiInstallments: snapshot.emiInstallments })).rejects.toThrow(/changed.*reload/i);
  expect(store.records.get(ref.path)).toMatchObject({ totalPaidAmount: 25, isDelivered: true, emiInstallments: [{ dueDate: '2026-12-01', paidAmount: 25, payments: [{ amount: 25 }] }] });
});
