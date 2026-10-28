import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from 'firebase/auth';
import { doc } from 'firebase/firestore';
import { setRecord as setDoc } from '../data/writes';
import { getAuthByStore, getDbByStore } from '../firebase/config';
import { getKnownDocument, setDataAccessScope } from '../data/query';

const AuthContext = createContext();
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null), [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(null);
  const [storeType, setStoreType] = useState(() => localStorage.getItem('storeType') || null);
  const revision = useRef(0), actions = useRef(0), pendingStore = useRef(null);
  const checkAction = action => {
    if (action !== actions.current) {
      const failure = new Error('Authentication action was superseded.');
      failure.code = 'auth/stale-action'; throw failure;
    }
  };
  useEffect(() => {
    if (!storeType) { setLoading(false); return undefined; }
    const auth = getAuthByStore(storeType), db = getDbByStore(storeType);
    let active = true;
    const unsub = onAuthStateChanged(auth, async firebaseUser => {
      const token = ++revision.current;
      setUser(null); setUserProfile(null); setError(null);
      setDataAccessScope(db, `${storeType}:${firebaseUser?.uid || 'signed-out'}`);
      if (!firebaseUser) { setLoading(false); return; }
      setLoading(true);
      try {
        const profile = await getKnownDocument(db, 'users', firebaseUser.uid, { ttlMs: 300000 });
        if (!active || token !== revision.current) return;
        if (!profile) throw new Error('User profile not found');
        if (profile.disabled === true) {
          setDataAccessScope(db, `${storeType}:signed-out`);
          await signOut(auth);
          if (!active || token !== revision.current) return;
          localStorage.removeItem('storeType'); setStoreType(null); return;
        }
        setDataAccessScope(db, `${storeType}:${firebaseUser.uid}:${profile.role || ''}`);
        setUser(firebaseUser); setUserProfile(profile);
      } catch (failure) {
        if (active && token === revision.current) { setUser(null); setUserProfile(null); setError(failure); }
      } finally { if (active && token === revision.current) setLoading(false); }
    });
    return () => { active = false; revision.current++; unsub(); setDataAccessScope(db, `${storeType}:signed-out`); };
  }, [storeType]);

  const register = async ({ email, password, name, role, store, companyId }) => {
    const action = ++actions.current; pendingStore.current = store;
    const auth = getAuthByStore(store), db = getDbByStore(store);
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    checkAction(action);
    await updateProfile(cred.user, { displayName: name });
    checkAction(action);
    const profile = { uid: cred.user.uid, name, email, role, storeType: store, companyId, createdAt: new Date().toISOString() };
    await setDoc(doc(db, 'users', cred.user.uid), profile);
    checkAction(action);
    revision.current++;
    setDataAccessScope(db, `${store}:${cred.user.uid}:${role || ''}`);
    localStorage.setItem('storeType', store); setStoreType(store); setUser(cred.user); setUserProfile(profile);
    return cred.user;
  };
  const login = async ({ email, password, store }) => {
    const action = ++actions.current; pendingStore.current = store;
    const auth = getAuthByStore(store), db = getDbByStore(store);
    const cred = await signInWithEmailAndPassword(auth, email, password);
    checkAction(action);
    setDataAccessScope(db, `${store}:${cred.user.uid}`);
    const profile = await getKnownDocument(db, 'users', cred.user.uid, { ttlMs: 300000 });
    checkAction(action);
    if (!profile) throw new Error('User profile not found');
    if (profile.disabled === true) {
      setDataAccessScope(db, `${store}:signed-out`); await signOut(auth);
      throw new Error('This account has been disabled. Please contact your administrator.');
    }
    revision.current++;
    setDataAccessScope(db, `${store}:${cred.user.uid}:${profile.role || ''}`);
    localStorage.setItem('storeType', store); setStoreType(store); setUser(cred.user); setUserProfile(profile);
    return { user: cred.user, profile };
  };
  const logout = async () => {
    revision.current++; actions.current++;
    const store = storeType;
    for (const target of new Set([store, pendingStore.current].filter(Boolean))) {
      setDataAccessScope(getDbByStore(target), `${target}:signed-out`);
    }
    pendingStore.current = null;
    localStorage.removeItem('storeType'); setStoreType(null); setUser(null); setUserProfile(null);
    if (store) await signOut(getAuthByStore(store));
  };
  const db = storeType ? getDbByStore(storeType) : null;
  return <AuthContext.Provider value={{ user, userProfile, loading, error, storeType, db,
    isAdmin: userProfile?.role === 'admin', register, login, logout }}>{children}</AuthContext.Provider>;
};
