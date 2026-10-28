import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { useFirestoreCollection } from './useFirestore';
import { addDoc } from 'firebase/firestore';
import { invalidateCollections } from '../data/query';
jest.mock('firebase/firestore', () => ({ collection: (db, name) => ({ db, name }), addDoc: jest.fn(async () => ({ id: 'new' })), serverTimestamp: () => 'timestamp' }));
jest.mock('../data/query', () => ({ invalidateCollections: jest.fn(), fetchPage: jest.fn(), getKnownDocument: jest.fn() }));
test('generic writes add search tokens and invalidate; unbounded getAll is replaced with explicit pages', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true; addDoc.mockResolvedValue({ id: 'new' }); let api;
  const db = {}, root = createRoot(document.createElement('div'));
  function Probe() { api = useFirestoreCollection(db, 'customers'); return null; }
  await act(async () => root.render(<Probe />));
  await act(async () => api.add({ name: 'Ali Patel' }));
  expect(addDoc.mock.calls[0][1].searchTokens).toContain('pa'); expect(invalidateCollections).toHaveBeenCalledWith(db, ['customers']);
  await expect(api.getAll()).rejects.toThrow(/administrative|paging|bounded/i);
  expect(typeof api.fetchAdministrativePage).toBe('function');
  act(() => root.unmount());
});
