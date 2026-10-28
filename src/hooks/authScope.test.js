import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { getDoc } from 'firebase/firestore';
import { getKnownDocument, setDataAccessScope } from '../data/query';
jest.mock('../firebase/config', () => ({ getAuthByStore: store => store, getDbByStore: store => mockDatabases[store] }));
const mockDatabases = { a: {}, b: {} };
jest.mock('firebase/auth', () => ({ onAuthStateChanged: jest.fn(), signOut: jest.fn(), createUserWithEmailAndPassword: jest.fn(), signInWithEmailAndPassword: jest.fn(), updateProfile: jest.fn() }));
jest.mock('firebase/firestore', () => ({ doc: jest.fn(), setDoc: jest.fn(), getDoc: jest.fn() }));
jest.mock('../data/query', () => ({ getKnownDocument: jest.fn(), setDataAccessScope: jest.fn() }));
test('logout clears identity scope immediately and a late profile never restores the old user', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true; localStorage.setItem('storeType', 'a');
  let callback, resolve, auth;
  onAuthStateChanged.mockImplementation((_, cb) => { callback = cb; return () => {}; });
  signOut.mockResolvedValue();
  getKnownDocument.mockImplementation(() => new Promise(r => { resolve = r; }));
  getDoc.mockImplementation(() => new Promise(r => { resolve = data => r({ exists: () => true, data: () => data }); }));
  const root = createRoot(document.createElement('div'));
  function Probe() { auth = useAuth(); return null; }
  await act(async () => root.render(<AuthProvider><Probe /></AuthProvider>));
  let pending; await act(async () => { pending = callback({ uid: 'old' }); });
  await act(async () => auth.logout());
  await act(async () => { resolve({ name: 'Old', role: 'admin' }); await pending; });
  expect(auth.user).toBeNull(); expect(auth.userProfile).toBeNull();
  expect(setDataAccessScope).toHaveBeenCalledWith(mockDatabases.a, expect.stringContaining('signed-out'));
  act(() => root.unmount()); localStorage.clear();
});
test('a login profile response arriving after logout cannot restore the old identity', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true; localStorage.clear();
  let auth, resolve;
  const { signInWithEmailAndPassword } = require('firebase/auth');
  signInWithEmailAndPassword.mockResolvedValue({ user: { uid: 'old' } });
  getKnownDocument.mockImplementation(() => new Promise(r => { resolve = r; }));
  signOut.mockResolvedValue(); onAuthStateChanged.mockImplementation(() => () => {});
  const root = createRoot(document.createElement('div'));
  function Probe() { auth = useAuth(); return null; }
  await act(async () => root.render(<AuthProvider><Probe /></AuthProvider>));
  let pending;
  await act(async () => { pending = auth.login({ email: 'synthetic@example.invalid', password: 'synthetic', store: 'a' }).catch(e => e); });
  await act(async () => auth.logout());
  await act(async () => { resolve({ role: 'admin' }); await pending; });
  expect(auth.user).toBeNull(); expect(auth.userProfile).toBeNull();
  act(() => root.unmount()); localStorage.clear();
});
