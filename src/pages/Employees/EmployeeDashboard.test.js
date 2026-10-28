import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import EmployeeDashboard from './EmployeeDashboard';
import { getKnownSnapshot, loadChecklistDays } from './employeeData';
import { setRecord } from '../../data/writes';

let mockToday = '2026-10-28';
const mockDb = {};
const mockAssignments = [{ templateId: 'one', templateTitle: 'First', occurrenceType: 'daily' }, { templateId: 'two', templateTitle: 'Second', occurrenceType: 'daily' }];
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ db: mockDb, user: { uid: 'u1' }, userProfile: { name: 'Employee', assignedChecklists: mockAssignments }, storeType: 'electronics' }) }));
jest.mock('firebase/firestore', () => ({ doc: (_, collection, id) => ({ collection, id }) }));
jest.mock('../../data/writes', () => ({ updateRecord: jest.fn(), setRecord: jest.fn() }));
jest.mock('./employeeData', () => ({ getKnownSnapshot: jest.fn(), loadChecklistDays: jest.fn() }));
jest.mock('./employeeConstants', () => ({ ...jest.requireActual('./employeeConstants'), getTodayStr: () => mockToday }));
jest.mock('../../hooks/usePagedCollection', () => { const rows = []; return { __esModule: true, default: () => ({ rows, total: 0, page: 0, loading: false, error: null, hasNext: false, refresh: () => {} }) }; });

it('starts bounded assigned-task generation again when the employee day changes', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockToday = '2026-10-28';
  const host = document.createElement('div'); document.body.appendChild(host);
  const root = createRoot(host);
  getKnownSnapshot.mockImplementation(async reference => {
    const data = reference.collection === 'attendanceLogs' ? { loginTime: `${mockToday}T09:00:00Z`, status: 'present', breaks: [], date: mockToday } : reference.collection === 'checklistTemplates' ? { title: reference.id } : null;
    return { id: reference.id, exists: () => data !== null, data: () => data };
  });
  loadChecklistDays.mockResolvedValue([]); setRecord.mockResolvedValue(undefined);
  const next = () => [...host.querySelectorAll('button')].find(button => button.textContent === 'Generate next 15 assigned tasks');
  try {
    await act(async () => root.render(<EmployeeDashboard />));
    await act(async () => next().click());
    expect(next()).toBeUndefined();
    expect(setRecord.mock.calls.map(([reference]) => reference.id)).toEqual(['u1_one_2026-10-28', 'u1_two_2026-10-28']);
    mockToday = '2026-10-29';
    await act(async () => root.render(<EmployeeDashboard />));
    expect(next()).toBeTruthy();
    await act(async () => next().click());
    expect(setRecord.mock.calls.map(([reference]) => reference.id)).toEqual(['u1_one_2026-10-28', 'u1_two_2026-10-28', 'u1_one_2026-10-29', 'u1_two_2026-10-29']);
  } finally { act(() => root.unmount()); host.remove(); }
});
