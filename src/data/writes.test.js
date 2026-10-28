import { deleteField, serverTimestamp } from 'firebase/firestore';
import { createWriteAdapters } from './writes';

// Deterministic optimistic transaction store: reads capture versions, writes commit
// atomically, conflicts re-run the real adapter callback against fresh state.
function memoryStore() {
  const db = {}, records = new Map(), versions = new Map();
  let retries = 0, nextId = 0;
  const reads = [];
  const reference = path => ({ path, id: path.split('/').at(-1), firestore: db,
    parent: { id: path.split('/').at(-2) } });
  const driver = { doc: (first, ...parts) => reference(parts.length ? parts.join('/') : `${first.path}/auto${++nextId}`),
    runTransaction: async (_, callback) => {
      for (let attempt = 0; attempt < 20; attempt++) {
        const readVersions = new Map(), pending = [];
        const transaction = {
          get: async ref => {
            if (pending.length) throw Error('Read after write');
            reads.push(ref.path);
            readVersions.set(ref.path, versions.get(ref.path) || 0);
            const value = records.get(ref.path);
            return { exists: () => value !== undefined, data: () => value === undefined ? undefined : clone(value) };
          },
          set: (ref, data) => pending.push([ref.path, clone(data)]),
          delete: ref => pending.push([ref.path, undefined]),
        };
        const result = await callback(transaction);
        if ([...readVersions].some(([path, version]) => (versions.get(path) || 0) !== version)) { retries++; continue; }
        for (const [path, data] of pending) {
          if (data === undefined) records.delete(path); else records.set(path, data);
          versions.set(path, (versions.get(path) || 0) + 1);
        }
        return result;
      }
      throw Error('Retry limit');
    },
  };
  return { db, reference, records, driver, reads, get retries() { return retries; } };
}
const clone = value => {
  if (value === null || typeof value !== 'object' || value.isEqual) return value;
  if (Array.isArray(value)) return value.map(clone);
  return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, clone(val)]));
};
const fixture = { saleDate: '2026-10-01', grandTotal: 1000, paymentType: 'emi', downPayment: 200, totalPaidAmount: 200,
  salespersonId: 'u1', salesperson: 'Ali', items: [{ productId: 'p1', productName: 'Chair', qty: 2, price: 500, subtotal: 1000 }],
  emiInstallments: [{ installmentNumber: 1, amount: 800, paidAmount: 0, dueDate: '2026-11-01', payments: [] }] };
function setup() { const store = memoryStore(); return { ...store, store, writes: createWriteAdapters(store.driver), ref: store.reference('sales/s1') }; }

it('retries concurrent payments from fresh state, preserving both receipts and money exactly once', async () => {
  const { store, writes, ref } = setup();
  await writes.setRecord(ref, fixture);
  const pay = amount => current => ({ totalPaidAmount: current.totalPaidAmount + amount,
    emiInstallments: current.emiInstallments.map(inst => ({ ...inst, paidAmount: inst.paidAmount + amount,
      payments: [...inst.payments, { amount }] })) });
  await Promise.all([writes.mutateRecord(ref, pay(100), { operationId: 'payment-a' }), writes.mutateRecord(ref, pay(150), { operationId: 'payment-b' })]);
  const repeated = await writes.mutateRecord(ref, pay(100), { operationId: 'payment-a' });
  const result = store.records.get('sales/s1');
  expect(store.retries).toBeGreaterThan(0);
  expect(result.totalPaidAmount).toBe(450);
  expect(result.emiInstallments[0].payments).toHaveLength(2);
  expect(result.emiInstallments[0].paidAmount).toBe(250);
  expect(result._writeRevision).toBe(3);
  expect(store.records.get('emiDues/s1_1').remainingAmount).toBe(550);
  expect(repeated.applied).toBe(false);
  expect([...store.records].filter(([key]) => key.startsWith('reportProductPeriods/')).every(([, value]) => value.quantity === 2 && value.revenue === 1000)).toBe(true);
});
it('reverses create/edit/date-change/delete contributions including two products without touching stock', async () => {
  const { store, writes, ref } = setup();
  store.records.set('inventory/p1', { stock: 18 });
  await writes.setRecord(ref, { ...fixture, items: [...fixture.items, { productId: 'p2', productName: 'Table', qty: 1, price: 50, subtotal: 50 }] });
  await writes.updateRecord(ref, { saleDate: '2026-11-01', items: [{ productId: 'p2', productName: 'Table', qty: 3, price: 50, subtotal: 150 }] });
  let rows = [...store.records].filter(([key]) => key.startsWith('reportProductPeriods/')).map(([, value]) => value);
  expect(rows.filter(row => row.periodType === 'daily')).toEqual([expect.objectContaining({ periodKey: '2026-11-01', quantity: 3, revenue: 150 })]);
  await writes.deleteRecord(ref);
  expect([...store.records.keys()].some(key => /^(emiDues|reportProductPeriods|reportEmployeePeriods)\//.test(key))).toBe(false);
  expect(store.records.get('inventory/p1')).toEqual({ stock: 18 });
  expect(store.records.get('_deletionOps/sales%2Fs1')).toMatchObject({ sourcePath: 'sales/s1', revision: 3, previousRevision: 2 });
  await writes.setRecord(ref, fixture);
  expect(store.records.get('sales/s1')._writeRevision).toBe(4);
});
it('materializes actual Firebase deleteField before deriving delivery and handles merge semantics', async () => {
  const { store, writes, ref } = setup();
  await writes.setRecord(ref, { ...fixture, deliveryType: 'scheduled', actualDeliveryDate: '2026-10-20', nested: { a: 1, b: 2 } });
  await writes.updateRecord(ref, { actualDeliveryDate: deleteField(), 'nested.a': 3, updatedAt: serverTimestamp() });
  expect(store.records.get('sales/s1')).toMatchObject({ deliveryState: 'pending', nested: { a: 3, b: 2 } });
  expect(store.records.get('sales/s1')).not.toHaveProperty('actualDeliveryDate');
  await writes.setRecord(ref, { nested: { b: deleteField(), c: 4 } }, { merge: true });
  expect(store.records.get('sales/s1').nested).toEqual({ a: 3, c: 4 });
});
it('updates complete attendance days and checklist totals atomically through edits and deletion', async () => {
  const { store, writes } = setup();
  const a = store.reference('attendanceLogs/a'), c = store.reference('checklistInstances/c');
  await writes.setRecord(a, { userId: 'u1', date: '2026-10-01', status: 'present', breaks: [{ startTime: 'x', endTime: 'y' }] });
  await writes.updateRecord(a, { date: '2026-11-01', status: 'leave' });
  expect(store.records.has('attendanceMonths/u1_2026-10')).toBe(false);
  expect(store.records.get('attendanceMonths/u1_2026-11').days['2026-11-01']).toMatchObject({ sourceId: 'a', status: 'leave', breaks: [{ startTime: 'x', endTime: 'y' }] });
  await writes.setRecord(c, { userId: 'u1', date: '2026-11-01', completed: false });
  await writes.updateRecord(c, { completed: true });
  expect(store.records.get('checklistDays/u1_2026-11-01')).toMatchObject({ totalCount: 1, pendingCount: 0, completedCount: 1 });
  await writes.deleteRecord(c);
  expect(store.records.has('checklistDays/u1_2026-11-01')).toBe(false);
});
it('rejects oversized transactions before any commit', async () => {
  const { store, writes, ref } = setup();
  await expect(writes.setRecord(ref, { ...fixture, emiInstallments: Array.from({ length: 501 }, (_, i) => ({ installmentNumber: i + 1, dueDate: '2026-11-01', amount: 1, paidAmount: 0 })) })).rejects.toThrow(/transaction/i);
  expect(store.records.size).toBe(0);
});
it('bootstraps legacy summaries once and rejects missing summaries after projection instead of underflow', async () => {
  const { store, writes, ref } = setup();
  store.records.set('sales/s1', fixture);
  await writes.updateRecord(ref, { notes: 'legacy' });
  const key = [...store.records.keys()].find(key => key.startsWith('reportProductPeriods/'));
  store.records.delete(key);
  await expect(writes.deleteRecord(ref)).rejects.toMatchObject({ code: 'data-access/reconciliation-required' });
  expect(store.records.get('sales/s1').notes).toBe('legacy');
});

it('preserves fractional product quantities and reverses their full contribution on deletion', async () => {
  const { store, writes, ref } = setup();
  await writes.setRecord(ref, { ...fixture, items: [{ productId: 'p1', productName: 'Fabric', qty: 0.125, price: 8000 }] });
  const row = [...store.records].find(([key]) => key.startsWith('reportProductPeriods/'))[1];
  expect(row).toMatchObject({ quantity: 0.125, revenue: 1000, invoiceCount: 1 });
  await writes.deleteRecord(ref);
  expect([...store.records.keys()].some(key => key.startsWith('reportProductPeriods/'))).toBe(false);
});

it('does not read unchanged report summaries for payment-only edits', async () => {
  const { store, writes, ref } = setup();
  await writes.setRecord(ref, fixture);
  const revision = store.records.get('reportState/version').revision;
  store.reads.length = 0;
  await writes.mutateRecord(ref, current => ({ totalPaidAmount: 300,
    emiInstallments: [{ ...current.emiInstallments[0], paidAmount: 100, payments: [{ amount: 100 }] }] }));
  expect(store.reads.some(path => /^(reportProductPeriods|reportEmployeePeriods|reportState)\//.test(path))).toBe(false);
  expect(store.records.get('reportState/version').revision).toBe(revision);
  expect(store.records.get('emiDues/s1_1').remainingAmount).toBe(700);
});

it('reverses shared legacy and unmatched employee rows without guessing a user or losing other invoices', async () => {
  const { store, writes, ref } = setup(), other = store.reference('sales/s2');
  const legacy = { ...fixture, salespersonId: null, salesperson: '  Ali  ' };
  await writes.setRecord(ref, legacy);
  await writes.setRecord(other, legacy);
  await writes.updateRecord(ref, { salesperson: '', items: [{ productId: 'p1', productName: 'Chair', qty: 0.1, price: 10 }] });
  const lifetime = () => [...store.records].filter(([key, value]) => key.startsWith('reportEmployeePeriods/') && value.periodType === 'lifetime').map(([, value]) => value);
  expect(lifetime()).toEqual(expect.arrayContaining([
    expect.objectContaining({ employeeKey: 'legacy:ali', employeeId: null, quantity: 2, invoiceCount: 1, revenue: 1000 }),
    expect.objectContaining({ employeeKey: 'legacy:unmatched', employeeId: null, quantity: 0.1, invoiceCount: 1, revenue: 1000 }),
  ]));
  await writes.deleteRecord(ref);
  expect(lifetime()).toEqual([expect.objectContaining({ employeeKey: 'legacy:ali', invoiceCount: 1 })]);
  await writes.deleteRecord(other);
  expect(lifetime()).toEqual([]);
});

it('retains other attendance days and checklist instances through reassignment and deletion', async () => {
  const { store, writes } = setup();
  const a = store.reference('attendanceLogs/a'), b = store.reference('attendanceLogs/b');
  await writes.setRecord(a, { userId: 'u1', date: '2026-10-01', hoursWorked: 8 });
  await writes.setRecord(b, { userId: 'u1', date: '2026-10-02', hoursWorked: 7 });
  await expect(writes.updateRecord(b, { date: '2026-10-01' })).rejects.toMatchObject({ code: 'data-access/reconciliation-required' });
  expect(store.records.get('attendanceLogs/b').date).toBe('2026-10-02');
  await writes.deleteRecord(a);
  expect(store.records.get('attendanceMonths/u1_2026-10').days).toEqual({
    '2026-10-02': expect.objectContaining({ sourceId: 'b', hoursWorked: 7 }),
  });
  const c = store.reference('checklistInstances/c'), d = store.reference('checklistInstances/d');
  await writes.setRecord(c, { userId: 'u1', date: '2026-10-02', completed: false });
  await writes.setRecord(d, { userId: 'u1', date: '2026-10-02', completed: true });
  await writes.updateRecord(c, { userId: 'u2' });
  expect(store.records.get('checklistDays/u1_2026-10-02')).toMatchObject({ totalCount: 1, completedCount: 1, pendingCount: 0 });
  expect(store.records.get('checklistDays/u2_2026-10-02')).toMatchObject({ totalCount: 1, completedCount: 0, pendingCount: 1 });
});

it('keeps all-history reports for blank sale dates and rejects corrupt summary underflows atomically', async () => {
  const { store, writes, ref } = setup();
  await writes.setRecord(ref, { ...fixture, saleDate: '' });
  const rows = [...store.records].filter(([path]) => /^report(Product|Employee)Periods\//.test(path));
  expect(rows).toHaveLength(2);
  expect(rows.every(([, value]) => value.periodType === 'lifetime' && value.undatedInvoiceCount === 1)).toBe(true);
  const [key, row] = rows.find(([path]) => path.startsWith('reportProductPeriods/'));
  store.records.set(key, { ...row, quantity: 0 });
  await expect(writes.deleteRecord(ref)).rejects.toMatchObject({ code: 'data-access/reconciliation-required' });
  expect(store.records.has(ref.path)).toBe(true);
  expect(store.records.has('emiDues/s1_1')).toBe(true);
});

it('accepts collection/payload adds and exact mergeFields while retaining authoritative financial history', async () => {
  const { store, writes } = setup();
  const ref = await writes.addRecord({ firestore: store.db, path: 'sales' }, fixture);
  await writes.setRecord(ref, { saleDate: '2026-12-01', totalPaidAmount: 999, notes: 'ignored' }, { mergeFields: ['saleDate'] });
  expect(store.records.get(ref.path)).toMatchObject({ saleDate: '2026-12-01', totalPaidAmount: 200,
    emiInstallments: [{ installmentNumber: 1, paidAmount: 0, payments: [] }] });
  expect(store.records.get(ref.path)).not.toHaveProperty('notes');
  await expect(writes.updateRecord(ref, { totalPaidAmount: undefined })).rejects.toMatchObject({ code: 'data-access/invalid-payload' });
});

it('cancels floating point quantity residue when deleting invoices in a different order', async () => {
  const { store, writes, ref } = setup(), other = store.reference('sales/s2');
  const fractional = qty => ({ ...fixture, items: [{ productId: 'p1', productName: 'Fabric', qty, price: 10 }] });
  await writes.setRecord(ref, fractional(0.1));
  await writes.setRecord(other, fractional(0.2));
  await writes.deleteRecord(ref);
  await writes.deleteRecord(other);
  expect([...store.records.keys()].some(key => /^report(Product|Employee)Periods\//.test(key))).toBe(false);
});
