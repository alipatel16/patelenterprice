import { doc, runTransaction, deleteField, serverTimestamp, FieldValue } from 'firebase/firestore';
import { withSearchFields } from './search';
import { invalidateCollections } from './query';
import { PROJECTION_VERSION, REPORT_METRICS, roundMoney, deriveSaleState, deriveComplaintState,
  buildEmiDueDocuments, buildReportContributions } from './projections';
import { buildEmployeeSummaryChanges } from './employeeSummaries';

export const WRITE_LIMITS = { documents: 450, documentBytes: 800000, transactionBytes: 6000000 };
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const copy = value => Array.isArray(value) ? value.map(copy) : plain(value)
  ? Object.fromEntries(Object.entries(value).map(([key, val]) => [key, copy(val)])) : value;
const fail = (message, code = 'data-access/reconciliation-required') => { const error = new Error(message); error.code = code; throw error; };
const isDelete = value => value instanceof FieldValue && value.isEqual(deleteField());
const isTimestamp = value => value instanceof FieldValue && value.isEqual(serverTimestamp());
let fallbackWriteSequence = 0;
const newWriteToken = () => globalThis.crypto?.randomUUID?.() ||
  `${Date.now().toString(36)}-${(++fallbackWriteSequence).toString(36)}-${Math.random().toString(36).slice(2)}`;

function materialize(value, current, merge = false, inArray = false) {
  if (isDelete(value)) {
    if (inArray) fail('deleteField is not supported inside arrays', 'data-access/invalid-payload');
    return undefined;
  }
  if (value instanceof FieldValue) {
    if (!isTimestamp(value)) fail('Use mutateRecord for arithmetic and array transforms', 'data-access/invalid-payload');
    if (inArray) fail('Server transforms are not supported inside arrays', 'data-access/invalid-payload');
    return value;
  }
  if (value === undefined) fail('Undefined source fields are not supported', 'data-access/invalid-payload');
  if (Array.isArray(value)) return value.map(entry => materialize(entry, undefined, false, true));
  if (!plain(value)) return value;
  // Firestore includes an explicit empty map in a merge's field mask, replacing
  // that map rather than retaining its old descendants.
  if (!Object.keys(value).length) return {};
  const result = merge && plain(current) ? copy(current) : {};
  for (const [key, entry] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('Unsupported field name', 'data-access/invalid-payload');
    const next = materialize(entry, result[key], merge, inArray);
    if (next === undefined) delete result[key]; else result[key] = next;
  }
  return result;
}
function assignPath(target, path, value) {
  const keys = path.split('.');
  if (keys.some(key => !key || ['__proto__', 'constructor', 'prototype'].includes(key))) fail('Unsupported field path', 'data-access/invalid-payload');
  let parent = target;
  keys.slice(0, -1).forEach(key => { if (!plain(parent[key])) parent[key] = {}; parent = parent[key]; });
  const key = keys.at(-1), next = materialize(value, undefined);
  if (next === undefined) delete parent[key]; else parent[key] = next;
}
function effectiveSource(current, payload, mode, options = {}) {
  if (!plain(payload)) fail('Write payload must be an object', 'data-access/invalid-payload');
  if (mode === 'update') {
    const result = copy(current);
    Object.entries(payload).forEach(([key, value]) => assignPath(result, key, value));
    return result;
  }
  if (options.mergeFields) {
    if (options.merge !== undefined || !Array.isArray(options.mergeFields)) fail('Invalid set options', 'data-access/invalid-payload');
    const result = copy(current || {});
    for (const path of options.mergeFields) {
      if (typeof path !== 'string') fail('mergeFields requires string field paths', 'data-access/invalid-payload');
      const value = path.split('.').reduce((node, key) => node?.[key], payload);
      assignPath(result, path, value);
    }
    return result;
  }
  // An empty document-level merge has no field mask and preserves the document.
  if (options.merge === true && !Object.keys(payload).length) return copy(current || {});
  return materialize(payload, current, options.merge === true);
}
function diffRows(before, after) {
  const changes = new Map();
  for (const row of before) changes.set(`${row.collection}/${row.id}`, { ...row, before: row.data, after: null });
  for (const row of after) {
    const path = `${row.collection}/${row.id}`, old = changes.get(path);
    changes.set(path, { ...row, before: old?.before || null, after: row.data });
  }
  return [...changes.values()].filter(change => !same(change.before, change.after));
}
function additiveSummary(existing, change, metrics) {
  if (change.before && !existing) fail(`Missing projected summary ${change.collection}/${change.id}`);
  // A removed contribution owns only its metric subtraction. Retain the stored
  // dimension metadata/tokens instead of restoring a deleted invoice's old label.
  const next = { ...(existing || {}), ...(change.after || {}), schemaVersion: PROJECTION_VERSION,
    _writeRevision: (existing?._writeRevision || 0) + 1 };
  for (const metric of metrics) {
    const prior = existing?.[metric] ?? 0;
    if (typeof prior !== 'number' || !Number.isFinite(prior) || prior < 0) fail('Invalid stored summary metric');
    const before = change.before?.[metric] || 0, after = change.after?.[metric] || 0;
    const value = prior - before + after;
    // Quantity can be fractional beyond cents. Only cancel machine-precision
    // arithmetic residue when reversing contributions; never round source units.
    next[metric] = metric === 'quantity'
      ? (Math.abs(value) <= Number.EPSILON * Math.max(Math.abs(prior), Math.abs(before), Math.abs(after)) * 8 ? 0 : value)
      : roundMoney(value);
    if (next[metric] < 0) fail(`Summary underflow: ${change.collection}/${change.id} ${metric}`);
  }
  if (metrics.every(metric => next[metric] === 0)) return null;
  if (metrics.includes('invoiceCount') && next.invoiceCount === 0) fail('Report metrics remain without any invoices');
  return next;
}
function attendanceSummary(existing, change) {
  if (change.before && !existing) fail('Missing projected attendance month');
  const next = { ...(existing || {}), ...(change.after || change.before),
    _writeRevision: (existing?._writeRevision || 0) + 1, days: { ...(existing?.days || {}) } };
  for (const [date, day] of Object.entries(change.before?.days || {})) {
    if (next.days[date]?.sourceId !== day.sourceId) fail('Attendance day source mismatch');
    delete next.days[date];
  }
  for (const [date, day] of Object.entries(change.after?.days || {})) {
    if (next.days[date] && next.days[date].sourceId !== day.sourceId) fail('Multiple attendance sources for one employee day');
    next.days[date] = day;
  }
  if (Object.keys(next.days).length > 31) fail('Attendance month exceeds 31 days');
  return Object.keys(next.days).length ? next : null;
}
function assertBudget(writes) {
  if (writes.length > WRITE_LIMITS.documents) fail('Transaction document limit exceeded', 'data-access/transaction-too-large');
  let bytes = 0;
  for (const write of writes) {
    // Conservative UTF-8 upper bound; handles SDK sentinels without serialization.
    const size = JSON.stringify(write.data || null).length * 3;
    if (size > WRITE_LIMITS.documentBytes) fail('Transaction document size limit exceeded', 'data-access/transaction-too-large');
    bytes += size;
  }
  if (bytes > WRITE_LIMITS.transactionBytes) fail('Transaction size limit exceeded', 'data-access/transaction-too-large');
}

// An explicit driver boundary keeps production on Firebase and enables offline
// optimistic-transaction tests/migration tooling without another data service.
export function createWriteAdapters(driver = { doc, runTransaction }) {
  async function execute(reference, mode, payload, options = {}) {
    const db = reference.firestore, collection = reference.parent.id, id = reference.id;
    if (!db || reference.path.split('/').length !== 2) fail('Writes require a top-level document reference', 'data-access/invalid-reference');
    if (options.operationId !== undefined && (typeof options.operationId !== 'string' || !options.operationId.trim() || options.operationId.length > 200))
      fail('operationId must be a nonempty string of at most 200 characters', 'data-access/invalid-operation');
    const deletionRef = driver.doc(db, '_deletionOps', encodeURIComponent(reference.path));
    const operationRef = options.operationId ? driver.doc(db, '_writeOps', encodeURIComponent(JSON.stringify([reference.path, options.operationId]))) : null;
    // One action identity survives every SDK retry of this callback. It is not a
    // secret; freshness distinguishes adapters from stale partial-update clients.
    const writeToken = newWriteToken();
    const outcome = await driver.runTransaction(db, async transaction => {
      const sourceSnap = await transaction.get(reference);
      const tombstone = await transaction.get(deletionRef);
      const previous = sourceSnap.exists() ? sourceSnap.data() : null;
      const deletion = tombstone.exists() ? tombstone.data() : null;
      if (operationRef) {
        const operation = await transaction.get(operationRef);
        if (operation.exists()) return { result: { id, data: previous, revision: operation.data().revision,
          applied: false, operationId: options.operationId }, invalidations: [] };
      }
      if (mode === 'update' && !previous) fail('Cannot update a missing record', 'not-found');
      let mutation = payload;
      if (mode === 'mutate') {
        mutation = await payload(copy(previous));
        if (mutation === undefined) return { result: { id, data: previous, revision: previous?._writeRevision || deletion?.revision || 0,
          applied: false, operationId: options.operationId || null }, invalidations: [] };
      }
      const deleting = mode === 'delete' || (mode === 'mutate' && mutation === null);
      if (mode === 'mutate' && !previous && !deleting) fail('Cannot mutate a missing record; use setRecord', 'not-found');
      const priorRevision = Math.max(previous?._writeRevision || 0, deletion?.revision || 0);
      if (!Number.isSafeInteger(priorRevision) || priorRevision < 0) fail('Invalid source revision');
      const revision = priorRevision + 1;
      let next = deleting ? null : effectiveSource(previous, mutation, mode === 'mutate' ? 'update' : mode, options);
      if (next) {
        if (collection === 'sales') next = { ...next, ...deriveSaleState(next) };
        if (collection === 'complaints') next = { ...next, ...deriveComplaintState(next) };
        next = withSearchFields(collection, { ...next, _writeRevision: revision, _projectionVersion: PROJECTION_VERSION,
          _deleteMarkerId: deletionRef.id, _writeToken: writeToken });
      }
      const projectedPrevious = previous?._projectionVersion === PROJECTION_VERSION ? previous : null;
      const reportChanges = collection === 'sales' ? diffRows(buildReportContributions(id, projectedPrevious), buildReportContributions(id, next)) : [];
      const employeeChanges = buildEmployeeSummaryChanges(collection, id, projectedPrevious, next).filter(change => !same(change.before, change.after));
      const dueChanges = collection === 'sales' ? diffRows(buildEmiDueDocuments(id, previous), buildEmiDueDocuments(id, next)) : [];
      const writes = [{ ref: reference, data: next }];
      for (const change of dueChanges) writes.push({ ref: driver.doc(db, change.collection, change.id), data: change.after });
      // Bound the complete plan before reading any supporting documents.
      const plannedCount = writes.length + reportChanges.length + employeeChanges.length + (reportChanges.length ? 1 : 0) + (deleting ? 1 : 0) + (operationRef ? 1 : 0);
      if (plannedCount > WRITE_LIMITS.documents) fail('Transaction document limit exceeded', 'data-access/transaction-too-large');
      for (const change of [...reportChanges, ...employeeChanges]) {
        const ref = driver.doc(db, change.collection, change.id), snap = await transaction.get(ref);
        const existing = snap.exists() ? snap.data() : null;
        const data = change.collection === 'attendanceMonths' ? attendanceSummary(existing, change) :
          additiveSummary(existing, change, change.collection === 'checklistDays' ? ['totalCount', 'completedCount', 'pendingCount'] : REPORT_METRICS);
        writes.push({ ref, data });
      }
      if (reportChanges.length) {
        const ref = driver.doc(db, 'reportState', 'version'), snap = await transaction.get(ref);
        writes.push({ ref, data: { schemaVersion: PROJECTION_VERSION, revision: (snap.exists() ? snap.data().revision || 0 : 0) + 1 } });
      }
      if (deleting) writes.push({ ref: deletionRef, data: { schemaVersion: PROJECTION_VERSION, sourcePath: reference.path,
        previousRevision: priorRevision, revision, operationId: options.operationId || null, _writeToken: writeToken } });
      if (operationRef) writes.push({ ref: operationRef, data: { schemaVersion: PROJECTION_VERSION, sourcePath: reference.path,
        operationId: options.operationId, revision, kind: deleting ? 'delete' : 'update' } });
      assertBudget(writes);
      for (const write of writes) {
        if (write.data === null) transaction.delete(write.ref); else transaction.set(write.ref, write.data);
      }
      return { result: { id, data: next, revision, applied: true, operationId: options.operationId || null },
        invalidations: [...new Set(writes.map(write => write.ref.parent.id))] };
    });
    if (outcome.invalidations.length) invalidateCollections(db, outcome.invalidations);
    return outcome.result;
  }
  return {
    addRecord: async (reference, payload) => { const created = driver.doc(reference); await execute(created, 'set', payload); return created; },
    updateRecord: async (reference, payload) => { await execute(reference, 'update', payload); },
    setRecord: async (reference, payload, options = {}) => { await execute(reference, 'set', payload, options); },
    deleteRecord: async reference => { await execute(reference, 'delete'); },
    mutateRecord: (reference, mutator, options = {}) => execute(reference, 'mutate', mutator, options),
  };
}
export const { addRecord, updateRecord, setRecord, deleteRecord, mutateRecord } = createWriteAdapters();
