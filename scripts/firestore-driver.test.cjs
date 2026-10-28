const { test } = require('node:test');
const assert = require('node:assert/strict');
const { decodeFields, encodeFields, createMemoryStore, createRestStore } = require('./firestore-driver.cjs');
const { makeBudget } = require('./firestore-migrate.cjs');
const { loadDataModule } = require('./data-module.cjs');

test('typed backup values survive source derivation without losing timestamps, bytes or references', () => {
  const typed = { when: { timestampValue: '2026-10-28T01:02:03.123456789Z' }, child: { mapValue: { fields: { paid: { integerValue: '42' } } } },
    ref: { referenceValue: 'projects/demo/databases/(default)/documents/users/u1' }, bytes: { bytesValue: 'AQID' }, list: { arrayValue: { values: [{ nullValue: null }, { booleanValue: true }] } } };
  assert.deepEqual(encodeFields(decodeFields(typed)), typed);
  assert.throws(() => decodeFields({ unsafe: { integerValue: '9223372036854775807' } }), /safe integer/i);
});

test('backfill reads the latest source and resumes idempotently instead of overwriting from a stale backup', async () => {
  const store = createMemoryStore(new Map([['customers/c1', { name: 'Current customer', phone: '9876543210', _writeRevision: 7 }]]));
  const budget = makeBudget({ reads: 100, writes: 100 });
  await store.backfill('customers', 'c1', budget);
  assert.equal(store.records.get('customers/c1').name, 'Current customer');
  assert.equal(store.records.get('customers/c1')._writeRevision, 8);
  const second = await store.backfill('customers', 'c1', budget);
  assert.equal(second.applied, false);
  assert.equal(store.records.get('customers/c1')._writeRevision, 8);
});

test('offline full migration preserves paid legacy invoices and keeps old unpaid installments in the due queue', async () => {
  const sale = { saleDate: '2024-01-01', customerName: 'Test Customer', grandTotal: 500, downPayment: 100, totalPaidAmount: 100, paymentType: 'emi',
    emiInstallments: [{ installmentNumber: 1, dueDate: '2024-02-01', amount: 400, paidAmount: 150, payments: [{ amount: 150 }] }], items: [] };
  const store = createMemoryStore(new Map([['sales/s1', sale], ['sales/s2', { saleDate: '2024-01-01', grandTotal: 100, totalPaidAmount: 0, paymentType: 'full_payment', paymentStatus: 'paid', items: [] }]]));
  const budget = makeBudget({ reads: 100, writes: 100 });
  await store.backfill('sales', 's1', budget); await store.backfill('sales', 's2', budget);
  assert.equal(store.records.get('emiDues/s1_1').remainingAmount, 250);
  assert.equal(store.records.get('emiDues/s1_1').dueDate, '2024-02-01');
  assert.equal(store.records.get('sales/s1').totalPaidAmount, 100);
  assert.equal(store.records.get('sales/s2').hasOutstandingPayment, false);
});

test('REST migration performs no commit if the transaction budget is exhausted', async () => {
  const requests = [];
  const fetcher = async (url, options) => {
    const route = new URL(url).pathname; requests.push(route);
    if (route.endsWith(':beginTransaction')) return { ok: true, json: async () => ({ transaction: 't1' }) };
    if (route.endsWith(':batchGet')) return { ok: true, json: async () => [{ missing: 'customers/c1' }] };
    return { ok: true, json: async () => ({}) };
  };
  const store = createRestStore({ project: 'demo-test', origin: 'http://127.0.0.1:8080', fetcher });
  await assert.rejects(store.backfill('customers', 'c1', makeBudget({ reads: 1, writes: 10 })), error => error.code === 'migration/budget');
  assert.equal(requests.some(route => route.endsWith(':commit')), false);
});
