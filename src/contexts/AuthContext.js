import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { getAuthByStore, getDbByStore } from '../firebase/config';

const AuthContext = createContext();

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [storeType, setStoreType] = useState(() => localStorage.getItem('storeType') || null);

  useEffect(() => {
    if (!storeType) { setLoading(false); return; }
    const auth = getAuthByStore(storeType);
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        const db = getDbByStore(storeType);
        const profileDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (profileDoc.exists()) setUserProfile(profileDoc.data());
      } else {
        setUser(null);
        setUserProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, [storeType]);

  const register = async ({ email, password, name, role, store, companyId }) => {
    const auth = getAuthByStore(store);
    const db = getDbByStore(store);
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    const profile = {
      uid: cred.user.uid,
      name,
      email,
      role,
      storeType: store,
      companyId,
      createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, 'users', cred.user.uid), profile);
    localStorage.setItem('storeType', store);
    setStoreType(store);
    setUser(cred.user);
    setUserProfile(profile);
    return cred.user;
  };

  const login = async ({ email, password, store }) => {
    const auth = getAuthByStore(store);
    const db = getDbByStore(store);
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const profileDoc = await getDoc(doc(db, 'users', cred.user.uid));
    if (!profileDoc.exists()) throw new Error('User profile not found');
    const profile = profileDoc.data();
    localStorage.setItem('storeType', store);
    setStoreType(store);
    setUser(cred.user);
    setUserProfile(profile);
    return { user: cred.user, profile };
  };

  const logout = async () => {
    if (storeType) {
      const auth = getAuthByStore(storeType);
      await signOut(auth);
    }
    localStorage.removeItem('storeType');
    setStoreType(null);
    setUser(null);
    setUserProfile(null);
  };

  const db = storeType ? getDbByStore(storeType) : null;
  const isAdmin = userProfile?.role === 'admin';

  return (
    <AuthContext.Provider value={{
      user, userProfile, loading, storeType, db, isAdmin,
      register, login, logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
