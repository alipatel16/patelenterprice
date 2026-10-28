// Explicit opt-in: synthetic local emulator only, never a production project.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase/app');
const sdk = require('firebase/firestore');
const { loadDataModule } = require('./data-module.cjs');
const enabled = process.env.RUN_FIRESTORE_EMULATOR_TESTS === '1';

test('real Firestore rules, indexed transport shapes, concurrent payments and deletion stay consistent', { skip: !enabled, timeout: 60000 }, async () => {
  const project = 'demo-patel-refactor';
  const rulesResponse = await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${project}:securityRules`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: require('node:fs').readFileSync(require('node:path').resolve(__dirname, '..', 'firestore.rules'), 'utf8') }] } }) });
  const rulesResult = await rulesResponse.json();
  assert.equal(rulesResponse.ok, true);
  assert.equal((rulesResult.issues || []).some(issue => issue.severity === 'ERROR'), false);
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${project}/databases/(default)/documents`, { method: 'DELETE' });
  const app = initializeApp({ projectId: project }, 'integration-authenticated');
  const anonymousApp = initializeApp({ projectId: project }, 'integration-anonymous');
  const db = sdk.getFirestore(app), anonymous = sdk.getFirestore(anonymousApp);
  sdk.connectFirestoreEmulator(db, '127.0.0.1', 8080, { mockUserToken: { sub: 'synthetic-staff', email: 'staff@example.invalid' } });
  sdk.connectFirestoreEmulator(anonymous, '127.0.0.1', 8080);
  const writes = loadDataModule('writes'), data = loadDataModule('query'), payments = loadDataModule('payments');
  let stage = 'auth guards';
  try {
    await assert.rejects(sdk.getDoc(sdk.doc(anonymous, 'customers', 'c1')), e => e.code === 'permission-denied');
    await assert.rejects(sdk.setDoc(sdk.doc(db, 'customers', 'stale-client'), { name: 'Old Client' }), e => e.code === 'permission-denied');
    stage = 'readiness';
    await writes.setRecord(sdk.doc(db, 'appSettings', 'dataAccessV2'), { version: 2, readyCollections: ['customers', 'sales', 'emiDues', 'reportProductPeriods', 'reportEmployeePeriods'] });
    stage = 'customer setup';
    for (let i = 0; i < 37; i++) await writes.setRecord(sdk.doc(db, 'customers', `c${String(i).padStart(2, '0')}`), {
      name: i === 36 ? 'Historical Unique Customer' : `Ordinary Customer ${i}`, phone: i === 36 ? '9876543210 / 8765432109' : '9999999999', category: 'retail', createdAt: sdk.Timestamp.fromDate(new Date('2026-10-01')),
    });
    stage = 'search';
    const first = await data.fetchPage(db, 'customers', { sort: [['nameLower', 'asc']] });
    assert.equal(first.rows.length, 15); assert.equal(first.total, 37);
    const found = await data.fetchPage(db, 'customers', { search: 'unique', filters: [['category', '==', 'retail']], sort: [['nameLower', 'asc']] });
    assert.equal(found.rows.length, 1); assert.equal(found.rows[0].id, 'c36');
    const phone = await data.fetchPage(db, 'customers', { search: '2109', sort: [['nameLower', 'asc']] });
    assert.equal(phone.rows[0].id, 'c36');
    stage = 'sale setup';
    const saleRef = sdk.doc(db, 'sales', 'historical-emi');
    await writes.setRecord(saleRef, { saleDate: '2024-01-01', createdAt: sdk.Timestamp.fromDate(new Date('2026-10-28T01:00:00Z')),
      invoiceNumber: 'SYNTHETIC-1', customerName: 'Historical EMI Customer', customerPhone: '9876543210', salespersonId: 'u1', salesperson: 'Test Staff',
      grandTotal: 400, downPayment: 100, totalPaidAmount: 100, paymentType: 'emi', paymentStatus: 'partial',
      items: [{ productId: 'p1', productName: 'Synthetic Chair', qty: 1, price: 400 }],
      emiInstallments: [{ installmentNumber: 1, dueDate: '2024-02-01', amount: 150, paidAmount: 0, payments: [] }, { installmentNumber: 2, dueDate: '2030-01-01', amount: 150, paidAmount: 0, payments: [] }] });
    const editSnapshot = (await sdk.getDoc(saleRef)).data();
    const entry = amount => ({ amount, payDate: '2026-10-28', mode: 'Cash', recordedByName: 'Test Staff' });
    stage = 'concurrent payments';
    await Promise.all([payments.recordEmiPayment(db, saleRef.id, 1, entry(20), 'receipt-a'), payments.recordEmiPayment(db, saleRef.id, 1, entry(30), 'receipt-b'), payments.recordEmiPayment(db, saleRef.id, 1, entry(10), 'receipt-c')]);
    await payments.recordEmiPayment(db, saleRef.id, 1, entry(20), 'receipt-a');
    const sale = (await sdk.getDoc(saleRef)).data();
    assert.equal(sale.emiInstallments[0].paidAmount, 60); assert.equal(sale.totalPaidAmount, 160); assert.equal(sale.emiInstallments[0].payments.length, 3);
    stage = 'queue aggregates';
    await assert.rejects(loadDataModule('saleEdit').saveSaleEdit(writes.mutateRecord, saleRef, editSnapshot, { customerName: 'Stale form', emiInstallments: editSnapshot.emiInstallments }), /changed while you were editing/);
    const overdue = await data.fetchPage(db, 'emiDues', { filters: [['dueDate', '<', '2026-10-28']], sort: [['dueDate', 'asc']], requireReady: true });
    assert.equal(overdue.rows.length, 1); assert.equal(overdue.rows[0].remainingAmount, 90);
    const totals = await data.fetchAggregate(db, 'emiDues', { aggregates: { remaining: { op: 'sum', field: 'remainingAmount' } }, requireReady: true });
    assert.equal(totals.remaining, 240);
    stage = 'dashboard';
    const dashboard = await loadDataModule('dashboard').loadDashboard(db, { now: new Date('2026-10-28T10:00:00Z') });
    assert.equal(dashboard.stats.invoiceCount, 1); assert.equal(dashboard.stats.totalSales, 400);
    await assert.rejects(sdk.updateDoc(saleRef, { totalPaidAmount: 999 }), e => e.code === 'permission-denied');
    await assert.rejects(sdk.deleteDoc(saleRef), e => e.code === 'permission-denied');
    stage = 'deletion';
    await writes.deleteRecord(saleRef);
    assert.equal((await sdk.getDoc(saleRef)).exists(), false);
    assert.equal((await sdk.getDoc(sdk.doc(db, 'emiDues', 'historical-emi_1'))).exists(), false);
    stage = 'inventory contention';
    const inventoryRef = sdk.doc(db, 'inventory', 'concurrent-stock');
    await writes.setRecord(inventoryRef, { productId: 'stock-product', productName: 'Synthetic stock', stock: 10, soldQty: 0, purchasedQty: 10 });
    const inventory = require('./data-module.cjs').loadSourceModule('src/utils/inventoryUtils.js');
    const changeStock = type => inventory.applyInventoryDeltas(db, [], [{ productId: 'stock-product', qty: 1 }], type);
    await Promise.all([changeStock('sale'), changeStock('sale')]);
    assert.equal((await sdk.getDoc(inventoryRef)).data().stock, 8);
    assert.equal((await sdk.getDoc(inventoryRef)).data().soldQty, 2);
    await Promise.all([changeStock('purchase'), changeStock('purchase')]);
    assert.equal((await sdk.getDoc(inventoryRef)).data().stock, 10);
    assert.equal((await sdk.getDoc(inventoryRef)).data().purchasedQty, 12);
    stage = 'REST current-source backfill';
    const legacyResponse = await fetch(`http://127.0.0.1:8080/v1/projects/${project}/databases/(default)/documents/customers/legacy-rest`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify({ fields: { name: { stringValue: 'Current Legacy Customer' }, phone: { stringValue: '8765432109' } } }) });
    assert.equal(legacyResponse.ok, true);
    const rest = require('./firestore-driver.cjs').createRestStore({ project, origin: 'http://127.0.0.1:8080', token: 'owner' });
    const budget = require('./firestore-migrate.cjs').makeBudget({ reads: 100, writes: 100 });
    await rest.backfill('customers', 'legacy-rest', budget);
    const legacy = (await sdk.getDoc(sdk.doc(db, 'customers', 'legacy-rest'))).data();
    assert.equal(legacy.name, 'Current Legacy Customer');
    assert.equal(legacy._projectionVersion, 2);
    assert.ok(legacy.searchTokens.includes('2109'));
    assert.equal((await rest.backfill('customers', 'legacy-rest', budget)).applied, false);
    const unicodeRef = sdk.doc(db, 'customers', 'space % ग्राहक');
    await writes.setRecord(unicodeRef, { name: 'Synthetic Unicode Customer' });
    await writes.deleteRecord(unicodeRef);
    assert.equal((await sdk.getDoc(unicodeRef)).exists(), false);
  } catch (error) { throw Object.assign(new Error(`${stage}: ${error.message}`), { code: error.code }); } finally { await sdk.terminate(db); await sdk.terminate(anonymous); await deleteApp(app); await deleteApp(anonymousApp); }
});
