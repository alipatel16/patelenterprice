const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseOptions, readBackup } = require('./migration-cli.cjs');

test('production apply requires allowlisted project, confirmation, budgets and a private output', () => {
  assert.throws(() => parseOptions(['--project', 'unknown', '--apply']), /project/i);
  assert.throws(() => parseOptions(['--project', 'patelfurniture-prod', '--apply', '--output', '/tmp/run.json', '--read-budget', '100', '--write-budget', '100']), /confirm/i);
  assert.throws(() => parseOptions(['--project', 'patelfurniture-prod', '--output', '/tmp/run.json']), /budget/i);
  const options = parseOptions(['--project', 'patelfurniture-prod', '--output', '/tmp/run.json', '--read-budget', '100', '--write-budget', '0']);
  assert.equal(options.apply, false);
  assert.equal(options.budget.writes, 0);
});

test('offline backup requires matching counts and checksums before any derivation', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'firestore-backup-test-'));
  try {
    const text = JSON.stringify({ name: 'projects/patelfurniture-prod/databases/(default)/documents/customers/c1', fields: { name: { stringValue: 'Test Customer' } } }) + '\n';
    fs.writeFileSync(path.join(directory, 'customers.jsonl'), text);
    const manifest = { format: 'firestore-rest-typed-jsonl-v1', status: 'complete', project: 'patelfurniture-prod', documents: 1,
      collections: [{ path: 'customers', file: 'customers.jsonl', documents: 1, sha256: crypto.createHash('sha256').update(text).digest('hex') }] };
    fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
    const backup = await readBackup(directory);
    assert.equal(backup.records.get('customers/c1').name, 'Test Customer');
    fs.appendFileSync(path.join(directory, 'customers.jsonl'), '\n');
    await assert.rejects(readBackup(directory), /checksum/i);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
