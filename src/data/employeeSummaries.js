import { PROJECTION_VERSION, projectionId, validDate } from './projections';

function contribution(collection, sourceId, data) {
  if (!data || !['attendanceLogs', 'checklistInstances'].includes(collection)) return null;
  if (!data.userId || !validDate(data.date)) throw new Error('Employee summary requires userId and a valid date');
  const common = { schemaVersion: PROJECTION_VERSION, userId: data.userId, userName: data.userName || '' };
  if (collection === 'attendanceLogs') {
    const month = data.date.slice(0, 7);
    // Copy the complete source day, including breaks and future payroll fields.
    return { collection: 'attendanceMonths', id: projectionId(data.userId, month), data: {
      ...common, month, days: { [data.date]: { ...data, sourceId } },
    } };
  }
  return { collection: 'checklistDays', id: projectionId(data.userId, data.date), data: { ...common, date: data.date,
    totalCount: 1, completedCount: data.completed ? 1 : 0, pendingCount: data.completed ? 0 : 1 } };
}
export function buildEmployeeSummaryChanges(collection, id, oldData, newData) {
  const before = contribution(collection, id, oldData), after = contribution(collection, id, newData);
  if (before && after && before.id === after.id) return [{ collection: before.collection, id: before.id, before: before.data, after: after.data }];
  return [...(before ? [{ collection: before.collection, id: before.id, before: before.data, after: null }] : []),
    ...(after ? [{ collection: after.collection, id: after.id, before: null, after: after.data }] : [])];
}
