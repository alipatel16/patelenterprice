const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runMigration, SOURCE_COLLECTIONS, makeBudget } = require('./firestore-migrate.cjs');

function fixture(size = 33) {
  const records = Array.from({ length: size }, (_, i) => ({ id: `c${String(i).padStart(3, '0')}`, data: { name: `Customer ${i}` } }));
  const applied = [], reads = [];
  const source = { async readPage(collection, cursor, limit) { reads.push({ collection, cursor, limit }); return records.filter(r => !cursor || r.id > cursor).slice(0, limit); } };
  const target = { async backfill(collection, id, budget) { budget.consume('reads', 2); budget.consume('writes', 1); applied.push(id); return { applied: true }; } };
  return { source, target, applied, reads };
}

test('default dry run reads bounded pages and never invokes a live write', async () => {
  const f = fixture();
  const result = await runMigration({ ...f, collections: ['customers'], budget: { reads: 100, writes: 100 } });
  assert.equal(f.applied.length, 0);
  assert.equal(result.complete, true);
  assert.equal(result.processed, 33);
  assert.equal(result.proposedSourceWrites, 33);
  assert.ok(f.reads.every(read => read.limit <= 15));
});

test('a checkpoint stops before budget exhaustion and resumes without omitting or duplicating documents', async () => {
  const f = fixture();
  const first = await runMigration({ ...f, apply: true, collections: ['customers'], budget: { reads: 100, writes: 10 } });
  assert.equal(first.complete, false);
  assert.equal(first.processed, 10);
  assert.equal(first.reason, 'budget');
  assert.equal(f.applied.length, 10);
  const second = await runMigration({ ...f, apply: true, collections: ['customers'], checkpoint: first, budget: { reads: 150, writes: 100 } });
  assert.equal(second.complete, true);
  assert.equal(second.processed, 33);
  assert.equal(new Set(f.applied).size, 33);
  assert.equal(f.applied.length, 33);
});

test('failed documents block readiness while later documents and checkpoints remain accessible', async () => {
  const f = fixture(4);
  f.target.backfill = async (collection, id) => { if (id === 'c001') throw Object.assign(new Error('Invalid source'), { code: 'data-access/invalid-source' }); return { applied: true }; };
  const result = await runMigration({ ...f, apply: true, collections: ['customers'], budget: { reads: 100, writes: 100 } });
  assert.equal(result.complete, true);
  assert.equal(result.processed, 4);
  assert.deepEqual(result.readyCollections, []);
  assert.deepEqual(result.errors.map(error => error.id), ['c001']);
});

test('resume rejects checkpoints from another project, schema or mode', async () => {
  for (const checkpoint of [{ project: 'other', version: 2, mode: 'dry-run' }, { project: 'offline', version: 1, mode: 'dry-run' }, { project: 'offline', version: 2, mode: 'apply' }]) {
    await assert.rejects(runMigration({ ...fixture(1), collections: ['customers'], checkpoint, budget: { reads: 100, writes: 100 } }), /checkpoint/i);
  }
});

test('budget refuses a request before the operation occurs, including retry reads', () => {
  const budget = makeBudget({ reads: 2, writes: 1 });
  budget.consume('reads', 2);
  assert.throws(() => budget.consume('reads', 1), error => error.code === 'migration/budget');
  assert.equal(budget.used.reads, 2);
  assert.throws(() => budget.consume('writes', 2), error => error.code === 'migration/budget');
  assert.equal(budget.used.writes, 0);
  assert.ok(SOURCE_COLLECTIONS.includes('checklistInstances'));
});

test('completed source migration proposes its dependent queues and summaries for readiness', async () => {
  const source = { async readPage() { return []; } };
  const result = await runMigration({ source, collections: ['sales', 'attendanceLogs', 'checklistInstances'], budget: { reads: 100, writes: 0 } });
  assert.ok(result.readyCollections.includes('emiDues'));
  assert.ok(result.readyCollections.includes('reportProductPeriods'));
  assert.ok(result.readyCollections.includes('reportEmployeePeriods'));
  assert.ok(result.readyCollections.includes('reportJobRows'));
  assert.ok(result.readyCollections.includes('attendanceMonths'));
  assert.ok(result.readyCollections.includes('checklistDays'));
});
