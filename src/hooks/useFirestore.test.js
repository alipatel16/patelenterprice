import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { useFirestoreCollection } from './useFirestore';
import { addRecord, updateRecord, deleteRecord } from '../data/writes';
import { getKnownDocument } from '../data/query';
jest.mock('firebase/firestore', () => ({ collection: (db, name) => ({ db, name }), doc: (db, name, id) => ({ db, name, id }), serverTimestamp: () => 'timestamp' }));
jest.mock('../data/writes', () => ({ addRecord: jest.fn(async () => ({ id: 'new' })), updateRecord: jest.fn(), deleteRecord: jest.fn() }));
jest.mock('../data/query', () => ({ invalidateCollections: jest.fn(), fetchPage: jest.fn(), getKnownDocument: jest.fn() }));
test('compatibility writes use the atomic adapter without constructing a patch from a stale cached record', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true; addRecord.mockResolvedValue({ id: 'new' }); let api;
  const db = {}, root = createRoot(document.createElement('div'));
  function Probe() { api = useFirestoreCollection(db, 'sales'); return null; }
  await act(async () => root.render(<Probe />));
  await act(async () => { expect(await api.add({ customerName: 'Test Customer' })).toBe('new'); await api.update('s1', { notes: 'Updated' }); await api.remove('s2'); });
  expect(addRecord).toHaveBeenCalledWith({ db, name: 'sales' }, { customerName: 'Test Customer', createdAt: 'timestamp', updatedAt: 'timestamp' });
  expect(updateRecord).toHaveBeenCalledWith({ db, name: 'sales', id: 's1' }, { notes: 'Updated', updatedAt: 'timestamp' });
  expect(deleteRecord).toHaveBeenCalledWith({ db, name: 'sales', id: 's2' });
  expect(getKnownDocument).not.toHaveBeenCalled();
  await expect(api.getAll()).rejects.toThrow(/administrative|paging|bounded/i);
  act(() => root.unmount());
});
