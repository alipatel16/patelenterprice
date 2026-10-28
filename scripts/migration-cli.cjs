'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PROJECTS, SOURCE_COLLECTIONS, runMigration, makeBudget } = require('./firestore-migrate.cjs');
const { decodeFields, createMemoryStore, createRestStore } = require('./firestore-driver.cjs');
function safeError(message) { return Object.assign(new Error(message), { safeMessage: message, code: 'migration/invalid-options' }); }
function parseOptions(args) {
  const values = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (['--apply', '--simulate'].includes(key)) values[key] = true;
    else if (['--project', '--confirm-project', '--backup', '--output', '--resume', '--read-budget', '--write-budget', '--collections', '--emulator'].includes(key) && args[i + 1] && !args[i + 1].startsWith('--')) values[key] = args[++i];
    else throw safeError('Unknown or missing command option.');
  }
  if (!PROJECTS.includes(values['--project'])) throw safeError('An allowlisted --project is required.');
  const apply = values['--apply'] === true;
  if (apply && values['--confirm-project'] !== values['--project']) throw safeError('Apply requires --confirm-project matching the selected project.');
  if (apply && values['--backup']) throw safeError('Backup input is offline only; apply always reads current live source.');
  if (values['--simulate'] && !values['--backup']) throw safeError('Simulation requires a verified local backup.');
  const budget = { reads: Number(values['--read-budget']), writes: Number(values['--write-budget']) };
  try { makeBudget(budget); } catch (_) { throw safeError('Explicit --read-budget and --write-budget integers are required.'); }
  if (!values['--output']) throw safeError('A private --output path outside the repository is required.');
  const output = path.resolve(values['--output']), repo = path.resolve(__dirname, '..');
  if (output === repo || output.startsWith(`${repo}${path.sep}`)) throw safeError('Reports/checkpoints may contain record IDs; choose an output outside the repository.');
  const collections = values['--collections'] ? values['--collections'].split(',') : SOURCE_COLLECTIONS;
  if (collections.some(name => !SOURCE_COLLECTIONS.includes(name))) throw safeError('Unsupported collection.');
  const emulator = values['--emulator'];
  if (emulator && !/^(127\.0\.0\.1|localhost):\d+$/.test(emulator)) throw safeError('Emulator must be a local host:port.');
  return { project: values['--project'], apply, simulate: values['--simulate'], budget, output, collections,
    backup: values['--backup'], resume: values['--resume'], emulator };
}
async function readBackup(directory) {
  const root = fs.realpathSync(directory), manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  if (manifest.format !== 'firestore-rest-typed-jsonl-v1' || manifest.status !== 'complete') throw safeError('Backup is not a complete supported snapshot.');
  const records = new Map();
  for (const collection of manifest.collections) {
    const file = fs.realpathSync(path.resolve(root, collection.file));
    if (!file.startsWith(`${root}${path.sep}`)) throw safeError('Backup file is outside its verified root.');
    const buffer = fs.readFileSync(file);
    if (crypto.createHash('sha256').update(buffer).digest('hex') !== collection.sha256) throw safeError('Backup checksum mismatch.');
    let count = 0;
    for (const line of buffer.toString('utf8').split('\n').filter(Boolean)) {
      const document = JSON.parse(line), marker = `/documents/${collection.path}/`;
      if (!document.name.includes(marker)) throw safeError('Backup document does not match collection.');
      const id = document.name.slice(document.name.indexOf(marker) + marker.length);
      if (!id || id.includes('/') || records.has(`${collection.path}/${id}`)) throw safeError('Duplicate or unsupported backup document.');
      records.set(`${collection.path}/${id}`, decodeFields(document.fields)); count++;
    }
    if (count !== collection.documents) throw safeError('Backup collection count mismatch.');
  }
  if (records.size !== manifest.documents) throw safeError('Backup total count mismatch.');
  return { manifest, records };
}
function writePrivate(output, result) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const temporary = `${output}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(temporary, 0o600); fs.renameSync(temporary, output);
}
async function simulateBackup(backup) {
  const store = createMemoryStore(backup.records), budget = makeBudget({ reads: 10000000, writes: 10000000 });
  const errors = [];
  for (const [sourcePath] of backup.records) {
    const [collection, id] = sourcePath.split('/');
    if (!SOURCE_COLLECTIONS.includes(collection) || sourcePath === 'appSettings/dataAccessV2') continue;
    try { await store.backfill(collection, id, budget); }
    catch (error) { errors.push({ collection, id, code: error.code || 'migration/invalid-source' }); }
  }
  const counts = {}, totals = { emiRemainingAmount: 0, productLifetimeQuantity: 0, productLifetimeRevenue: 0, employeeLifetimeRevenue: 0 };
  for (const [sourcePath, data] of store.records) {
    const collection = sourcePath.split('/')[0]; counts[collection] = (counts[collection] || 0) + 1;
    if (collection === 'emiDues') totals.emiRemainingAmount += data.remainingAmount || 0;
    if (collection === 'reportProductPeriods' && data.periodType === 'lifetime') {
      totals.productLifetimeQuantity += data.quantity; totals.productLifetimeRevenue += data.revenue;
    }
    if (collection === 'reportEmployeePeriods' && data.periodType === 'lifetime') totals.employeeLifetimeRevenue += data.revenue;
  }
  for (const key of Object.keys(totals)) totals[key] = Math.round(totals[key] * 100) / 100;
  return { errors, counts, totals, simulatedTransactionUsage: budget.used, productionWrites: 0 };
}
async function main(args) {
  const options = parseOptions(args);
  let store, backup;
  if (options.backup) {
    backup = await readBackup(options.backup);
    if (backup.manifest.project !== options.project) throw safeError('Backup project does not match selected project.');
    store = createMemoryStore(backup.records);
  } else {
    if (!options.emulator && !process.env.FIRESTORE_ACCESS_TOKEN) throw safeError('A Firestore OAuth access token is required in FIRESTORE_ACCESS_TOKEN.');
    store = createRestStore({ project: options.project, ...(options.emulator ? { origin: `http://${options.emulator}` } : {}), token: process.env.FIRESTORE_ACCESS_TOKEN });
  }
  const checkpoint = options.resume ? JSON.parse(fs.readFileSync(options.resume, 'utf8')) : null;
  const result = await runMigration({ source: store, target: store, project: options.project, collections: options.collections,
    checkpoint, budget: options.budget, apply: options.apply, onCheckpoint: state => writePrivate(options.output, state) });
  if (backup) result.backup = { readTime: backup.manifest.readTime, documents: backup.manifest.documents };
  if (options.simulate && result.complete) result.simulation = await simulateBackup(backup);
  // Readiness here is a candidate list only. Never publish app readiness automatically:
  // index creation, coordinated client refresh, rules, and reconciliation are separate gates.
  result.readinessPublished = false;
  writePrivate(options.output, result);
  process.stdout.write(`${JSON.stringify({ project: result.project, mode: result.mode, complete: result.complete, processed: result.processed,
    errors: result.errors.length, issues: result.issues.length, usage: result.usage, simulationErrors: result.simulation?.errors.length, readinessPublished: false })}\n`);
  return result;
}
module.exports = { parseOptions, readBackup, simulateBackup, writePrivate, main };
