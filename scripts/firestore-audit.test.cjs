const { test } = require('node:test');
const assert = require('node:assert/strict');
const { auditSource } = require('./firestore-audit.cjs');

test('census distinguishes bounded pages, known IDs, aggregates and hidden unbounded aliases', () => {
  const code = `import {getDocs as readMany, getDoc, getCountFromServer, query, collection, limit, doc} from 'firebase/firestore';
    const q = query(collection(db,'sales'), limit(15));
    readMany(q); getDoc(doc(db,'customers',id)); getCountFromServer(collection(db,'sales'));
    readMany(collection(db,'sales'));`;
  const rows = auditSource(code, 'fixture.js');
  assert.deepEqual(rows.map(row => row.disposition), ['bounded-page', 'known-id', 'aggregate', 'unbounded']);
});

test('census ignores comments and catches source writes that bypass adapters', () => {
  const rows = auditSource(`import {updateDoc as direct, doc} from 'firebase/firestore';
    // getDocs(collection(db,'sales'))
    direct(doc(db,'sales','s1'), {totalPaidAmount: 0});`, 'fixture.js');
  assert.deepEqual(rows.map(row => [row.kind, row.disposition]), [['write', 'raw-write']]);
});

test('data adapter aliases are not misreported as raw Firestore writes', () => {
  assert.deepEqual(auditSource(`import {updateRecord as updateDoc} from '../data/writes'; updateDoc(ref,patch);`, 'fixture.js'), []);
});

test('SDK calls handed into a driver remain visible in the source census', () => {
  const rows = auditSource(`import {runTransaction} from 'firebase/firestore'; const runner = createRunner({runTransaction});`, 'fixture.js');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].disposition, 'raw-write');
});

test('census includes shared pages, aggregates and known-ID wrappers after screen refactoring', () => {
  const rows = auditSource(`import usePagedCollection from '../hooks/usePagedCollection'; import {fetchAggregate,getKnownDocument} from '../data/query'; usePagedCollection(db,'sales',options); fetchAggregate(db,'sales'); getKnownDocument(db,'sales',id);`, 'fixture.js');
  assert.deepEqual(rows.map(row => row.disposition), ['bounded-shared-query', 'aggregate', 'known-id']);
});

test('the application read/write census has no ordinary unbounded SDK reads or source adapter bypasses', () => {
  const { auditTree } = require('./firestore-audit.cjs');
  const report = auditTree(require('node:path').resolve(__dirname, '..'));
  assert.deepEqual(report.violations, []);
});
