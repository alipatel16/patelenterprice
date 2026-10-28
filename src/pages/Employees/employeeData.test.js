import { loadAttendanceMonths, loadChecklistDays, employeeQuery, mergePayrollWaivers } from './employeeData';

it('searches users server-side before the 15 row limit', () => {
  expect(employeeQuery('Beyond page one')).toEqual({ search: 'Beyond page one', filters: [['role', '==', 'employee']], sort: [['nameLower', 'asc']], pageSize: 15, requireReady: true });
});
it('reads only visible employee months and preserves every payroll field and source id', async () => {
  const reads = [];
  const known = async (_, collection, id) => { if (collection === 'appSettings') return { version: 2, readyCollections: ['attendanceMonths'] }; reads.push([collection, id]); return { userId: 'u2', days: { '2026-10-01': { sourceId: 'source', date: '2026-10-01', breaks: [1], customPayrollField: 4 } } }; };
  const result = await loadAttendanceMonths({}, ['u2'], '2026-10', known);
  expect(reads).toEqual([['attendanceMonths', 'u2_2026-10']]);
  expect(result.u2[0]).toMatchObject({ id: 'source', customPayrollField: 4, breaks: [1] });
});
it('keeps checklist totals full-scope without reading tasks', async () => {
  const reads = [];
  const result = await loadChecklistDays({}, ['u'], ['2026-10-01'], async (_, collection, id) => { if (collection === 'appSettings') return { version: 2, readyCollections: ['checklistDays'] }; reads.push(collection); return { id, totalCount: 40, completedCount: 16 }; });
  expect(reads).toEqual(['checklistDays']);
  expect(result[0].totalCount).toBe(40);
});
it('preserves waived penalties after recomputing salary from source-equivalent month days', () => {
  expect(mergePayrollWaivers({ baseSalary: 1000, penalties: [{ id: 'late', amount: 50 }, { id: 'leave', amount: 100 }] }, { penalties: [{ id: 'late', removed: true }] })).toMatchObject({ totalPenalties: 100, netSalary: 900 });
});

it('salary computation from monthly summary days equals source logs including breaks, leaves and saved waivers', async () => {
  const { computeSalary } = require('./payroll');
  const employee = { salary: 10000 };
  const logs = [{ sourceId: 'a', userId: 'u', date: '2026-10-01', status: 'present', loginTime: new Date(2026, 9, 1, 10, 30).toISOString(), logoutTime: new Date(2026, 9, 1, 17, 30).toISOString(), breaks: [{ startTime: new Date(2026, 9, 1, 13).toISOString(), endTime: new Date(2026, 9, 1, 14).toISOString() }] }, { sourceId: 'b', userId: 'u', date: '2026-10-02', status: 'leave' }];
  const settings = { expectedDailyHours: 8, freeLeavePerMonth: 0, leavePenaltyAmount: 200, lateArrivalRate: 50, earlyDepartureRate: 50 };
  const monthly = await loadAttendanceMonths({}, ['u'], '2026-10', async (_, collection) => collection === 'appSettings' ? { version: 2, readyCollections: ['attendanceMonths'] } : ({ days: Object.fromEntries(logs.map(log => [log.date, log])) }));
  const source = computeSalary(employee, logs, settings, 2026, 9);
  const summary = computeSalary(employee, monthly.u, settings, 2026, 9);
  expect(summary).toEqual(source);
  expect(source).toMatchObject({ presentDays: 1, leaveCount: 1, totalWorkMinutes: 360, totalPenalties: 400 });
  expect(mergePayrollWaivers(summary, { penalties: [{ id: 'late_arrival', removed: true }] })).toMatchObject({ totalPenalties: 350, netSalary: 9650 });
});

it('does not turn unbackfilled attendance into absent days or salary deductions', async () => {
  await expect(loadAttendanceMonths({}, ['u'], '2026-10', async () => null)).rejects.toMatchObject({ code: 'data-access/not-ready' });
});
