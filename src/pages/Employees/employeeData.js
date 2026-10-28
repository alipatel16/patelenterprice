import { getKnownDocument } from '../../data/query';
import { projectionId } from '../../data/projections';

export const employeeQuery = (search = '') => ({ search, filters: [['role', '==', 'employee']], sort: [['nameLower', 'asc']], pageSize: 15, requireReady: true });
async function requireSummary(db, name, known) {
  const readiness = await known(db, 'appSettings', 'dataAccessV2');
  if (readiness?.version !== 2 || !readiness.readyCollections?.includes(name)) {
    const error = new Error('Employee summaries need migration before this view can load'); error.code = 'data-access/not-ready'; throw error;
  }
}
export async function loadAttendanceMonths(db, ids, month, known = getKnownDocument) {
  if (ids.length > 15) throw new Error('Only visible employees may be loaded');
  if (ids.length) await requireSummary(db, 'attendanceMonths', known);
  const records = await Promise.all(ids.map(id => known(db, 'attendanceMonths', projectionId(id, month), { ttlMs: 0 })));
  return Object.fromEntries(ids.map((id, i) => [id, Object.entries(records[i]?.days || {}).map(([date, day]) => ({ ...day, date, userId: id, id: day.sourceId }))]));
}
export async function loadChecklistDays(db, ids, dates, known = getKnownDocument) {
  if (ids.length > 15 || dates.length > 31) throw new Error('Only visible employee days may be loaded');
  if (ids.length && dates.length) await requireSummary(db, 'checklistDays', known);
  return (await Promise.all(ids.flatMap(userId => dates.map(date => known(db, 'checklistDays', projectionId(userId, date), { ttlMs: 0 }))))).filter(Boolean);
}
export function mergePayrollWaivers(computed, saved) {
  const penalties = computed.penalties.map(p => ({ ...p, removed: saved?.penalties?.find(s => s.id === p.id)?.removed ?? p.removed ?? false }));
  const totalPenalties = penalties.filter(p => !p.removed).reduce((sum, p) => sum + p.amount, 0);
  return { ...computed, penalties, totalPenalties, netSalary: Math.max(0, computed.baseSalary - totalPenalties) };
}

export async function getKnownSnapshot(reference) {
  const row = await getKnownDocument(reference.firestore, reference.parent.path, reference.id, { ttlMs: 0 });
  return { id: reference.id, exists: () => row !== null, data: () => row || undefined };
}
