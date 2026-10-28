import { validDate } from './projections';
import { collection, doc, getDocs, query, where, orderBy, documentId, limit, startAfter, runTransaction } from 'firebase/firestore';
import { getKnownDocument, invalidateCollections, fetchPage } from './query';
import { REPORT_METRICS } from './reports';

const failure = message => { throw new Error(message); };
export function reportJobId({ dimension, start, end }) {
  if (!['employee', 'product'].includes(dimension) || !validDate(start) || !validDate(end) || start > end) failure('Choose a valid inclusive report date range');
  return `${dimension}_${start}_${end}`;
}
export function createReportJobRunner(transport) {
  return async function generate(db, options, { onProgress = () => {}, budget = 3, maxPageSize = 100 } = {}) {
    const jobId = reportJobId(options);
    if (!Number.isInteger(budget) || budget < 1 || budget > 20 || !Number.isInteger(maxPageSize) || maxPageSize < 1 || maxPageSize > 100) failure('Report budget must be 1–20 pages of 1–100 rows');
    const revision = await transport.revision(db);
    let job = await transport.load(db, jobId);
    if (job && job.asOfRevision !== revision) {
      if (options.restart) job = null; else return transport.commit(db, { ...job, complete: false, status: 'invalidated' }, { rows: [] }, job.cursor);
    }
    job = job || { jobId, ...options, asOfRevision: revision, asOf: new Date().toISOString(), cursor: null, processed: 0, complete: false, status: 'incomplete' };
    for (let i = 0; i < budget && !job.complete && job.status !== 'invalidated'; i++) {
      const page = await transport.page(db, options, job.cursor, maxPageSize);
      const previousCursor = job.cursor;
      const candidate = { ...job, cursor: page.cursor, processed: job.processed + page.rows.length, complete: !page.hasNext, status: page.hasNext ? 'incomplete' : 'complete' };
      job = await transport.commit(db, candidate, page, previousCursor);
      onProgress(job);
    }
    if (await transport.revision(db) !== job.asOfRevision) return transport.commit(db, { ...job, complete: false, status: 'invalidated' }, { rows: [] }, job.cursor);
    return job;
  };
}
const sourceCollection = dimension => dimension === 'employee' ? 'reportEmployeePeriods' : 'reportProductPeriods';
export function createReportJobCommit(driver = { doc, runTransaction }) {
  return (db, candidate, page, expectedCursor) => driver.runTransaction(db, async tx => {
    const jobRef = driver.doc(db, 'reportJobs', candidate.jobId);
    const [versionSnap, jobSnap] = await Promise.all([tx.get(driver.doc(db, 'reportState', 'version')), tx.get(jobRef)]);
    const revision = versionSnap.data()?.revision || 0;
    const existing = jobSnap.exists() ? jobSnap.data() : null;
    // A delayed reader from an earlier source revision cannot replace the
    // newer checkpoint, including through the invalidation branch.
    if (existing && existing.asOfRevision > candidate.asOfRevision) return existing;
    if (revision !== candidate.asOfRevision) {
      const invalidated = { ...(existing?.asOfRevision === candidate.asOfRevision ? existing : candidate), complete: false, status: 'invalidated' };
      tx.set(jobRef, invalidated); return invalidated;
    }
    if (existing && existing.asOfRevision === candidate.asOfRevision && JSON.stringify(existing.cursor) !== JSON.stringify(expectedCursor)) return existing;
    const grouped = new Map();
    page.rows.forEach(row => {
      const current = grouped.get(row.dimensionKey);
      grouped.set(row.dimensionKey, { ...row, ...Object.fromEntries(REPORT_METRICS.map(k => [k, (current?.[k] || 0) + (row[k] || 0)])) });
    });
    const refs = [...grouped.keys()].map(key => driver.doc(db, 'reportJobRows', `${candidate.jobId}_${candidate.asOfRevision}_${encodeURIComponent(key)}`));
    const previous = await Promise.all(refs.map(ref => tx.get(ref)));
    [...grouped.values()].forEach((row, i) => {
      const old = previous[i].data() || {};
      const { id, ...data } = row;
      tx.set(refs[i], { ...data, jobId: candidate.jobId, asOfRevision: candidate.asOfRevision, ...Object.fromEntries(REPORT_METRICS.map(k => [k, (old[k] || 0) + row[k]])) });
    });
    tx.set(jobRef, candidate);
    return candidate;
  });
}

const firebaseTransport = {
  revision: async db => (await getKnownDocument(db, 'reportState', 'version', { ttlMs: 0 }))?.revision || 0,
  load: (db, id) => getKnownDocument(db, 'reportJobs', id, { ttlMs: 0 }),
  page: async (db, options, cursor, size) => {
    // Readiness is checked before starting a job. This scan is explicit, bounded,
    // and reads daily summaries rather than source invoices.
    const constraints = [where('periodType', '==', 'daily'), where('periodKey', '>=', options.start), where('periodKey', '<=', options.end), orderBy('periodKey'), orderBy(documentId())];
    if (cursor) constraints.push(startAfter(cursor.periodKey, cursor.id));
    const snap = await getDocs(query(collection(db, sourceCollection(options.dimension)), ...constraints, limit(size)));
    const last = snap.docs.at(-1);
    return { rows: snap.docs.map(d => ({ ...d.data(), id: d.id })), cursor: last ? { id: last.id, periodKey: last.data().periodKey } : cursor, hasNext: snap.size === size };
  },
  commit: createReportJobCommit(),
};
const runner = createReportJobRunner(firebaseTransport);
export async function generateCustomReport(db, options, controls) {
  const readiness = await getKnownDocument(db, 'appSettings', 'dataAccessV2', { ttlMs: 0 });
  if (readiness?.version !== 2 || ![sourceCollection(options.dimension), 'reportJobRows'].every(name => readiness.readyCollections?.includes(name))) {
    const error = new Error('Report summaries and job output need migration before generation'); error.code = 'data-access/not-ready'; throw error;
  }
  const result = await runner(db, options, controls);
  invalidateCollections(db, ['reportJobs', 'reportJobRows']);
  return result;
}
export async function validateReportJob(db, job) {
  if (!job?.complete || job.status !== 'complete' || (await firebaseTransport.revision(db)) !== job.asOfRevision) throw new Error('Report is incomplete or changed; regenerate before viewing rankings');
  return [['jobId', '==', job.jobId], ['asOfRevision', '==', job.asOfRevision]];
}
export async function fetchCustomReportPage(db, job, { cursor = null, metric = 'revenue', search = '' } = {}) {
  if (!['revenue', 'quantity', 'invoiceCount'].includes(metric)) failure('Invalid ranking metric');
  const filters = await validateReportJob(db, job);
  const result = await fetchPage(db, 'reportJobRows', { search, filters, sort: [[metric, 'desc']], cursor, pageSize: 15, requireReady: true });
  await validateReportJob(db, job);
  return result;
}
