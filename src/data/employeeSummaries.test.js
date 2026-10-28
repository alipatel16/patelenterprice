import { buildEmployeeSummaryChanges } from './employeeSummaries';

it('moves complete payroll day values between employee months', () => {
  const oldData = { userId: 'u1', date: '2026-10-28', status: 'present', loginTime: '2026-10-28T03:30:00Z',
    logoutTime: '2026-10-28T12:30:00Z', breaks: [{ startTime: '2026-10-28T07:00:00Z', endTime: '2026-10-28T07:30:00Z' }] };
  const changes = buildEmployeeSummaryChanges('attendanceLogs', 'a1', oldData, { ...oldData, date: '2026-11-01' });
  expect(changes).toHaveLength(2);
  expect(changes[0]).toMatchObject({ collection: 'attendanceMonths', before: { days: { '2026-10-28': { sourceId: 'a1', ...oldData } } }, after: null });
  expect(changes[1]).toMatchObject({ before: null, after: { userId: 'u1', month: '2026-11', days: {
    '2026-11-01': { loginTime: oldData.loginTime, logoutTime: oldData.logoutTime, breaks: oldData.breaks } } } });
});
it('emits reversible checklist counts on completion, reassignment, and deletion', () => {
  const item = { userId: 'u1', date: '2026-10-28', completed: false };
  expect(buildEmployeeSummaryChanges('checklistInstances', 'c1', item, { ...item, completed: true })[0])
    .toMatchObject({ before: { totalCount: 1, completedCount: 0, pendingCount: 1 }, after: { totalCount: 1, completedCount: 1, pendingCount: 0 } });
  expect(buildEmployeeSummaryChanges('checklistInstances', 'c1', item, { ...item, userId: 'u2' })).toHaveLength(2);
  expect(buildEmployeeSummaryChanges('checklistInstances', 'c1', item, null)[0].after).toBe(null);
});
it('rejects invalid employee summary dates without creating misleading month keys', () => {
  expect(() => buildEmployeeSummaryChanges('attendanceLogs', 'a', null, { userId: 'u', date: '2026-02-30' })).toThrow(/date/i);
});
