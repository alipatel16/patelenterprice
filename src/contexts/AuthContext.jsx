import React, { createContext, useContext, useState, useEffect } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { getDbForCategory, getAuthForCategory } from "../config/firebase";

const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
};

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser]   = useState(null);
  const [userProfile, setUserProfile]   = useState(null);
  const [loading, setLoading]           = useState(true);

  // Derived Firebase instances based on the logged-in user's storeCategory
  const db   = userProfile ? getDbForCategory(userProfile.storeCategory)   : getDbForCategory("electronics");
  const auth = userProfile ? getAuthForCategory(userProfile.storeCategory) : getAuthForCategory("electronics");

  // ── Register ────────────────────────────────────────────────────────────────
  const register = async ({ email, password, name, role, storeCategory, companyId }) => {
    const authInst = getAuthForCategory(storeCategory);
    const dbInst   = getDbForCategory(storeCategory);

    const cred    = await createUserWithEmailAndPassword(authInst, email, password);
    const profile = {
      uid: cred.user.uid,
      name,
      email,
      role,           // "admin" | "employee"
      storeCategory,  // "electronics" | "furniture"
      companyId,
      createdAt: new Date().toISOString(),
    };
    await setDoc(doc(dbInst, "users", cred.user.uid), profile);
    setCurrentUser(cred.user);
    setUserProfile(profile);
    return profile;
  };

  // ── Login ────────────────────────────────────────────────────────────────────
  // storeCategory MUST be passed from the login form so we know which Firebase to use
  const login = async (email, password, storeCategory) => {
    const authInst = getAuthForCategory(storeCategory);
    const dbInst   = getDbForCategory(storeCategory);

    const cred = await signInWithEmailAndPassword(authInst, email, password);
    const snap = await getDoc(doc(dbInst, "users", cred.user.uid));

    if (!snap.exists()) {
      // User authenticated but no profile doc — create a minimal one
      const profile = { uid: cred.user.uid, email, storeCategory, role: "employee" };
      await setDoc(doc(dbInst, "users", cred.user.uid), profile);
      setUserProfile(profile);
      return profile;
    }
    const profile = snap.data();
    setCurrentUser(cred.user);
    setUserProfile(profile);
    return profile;
  };

  // ── Logout ───────────────────────────────────────────────────────────────────
  const logout = async () => {
    if (userProfile?.storeCategory) {
      await signOut(getAuthForCategory(userProfile.storeCategory));
    }
    setCurrentUser(null);
    setUserProfile(null);
  };

  const isAdmin      = () => userProfile?.role === "admin";
  const storeCategory = () => userProfile?.storeCategory;

  // ── Auth state listeners for BOTH projects ────────────────────────────────────
  useEffect(() => {
    const categories = ["electronics", "furniture"];
    const unsubs = categories.map((cat) =>
      onAuthStateChanged(getAuthForCategory(cat), async (user) => {
        if (user) {
          const dbInst = getDbForCategory(cat);
          const snap   = await getDoc(doc(dbInst, "users", user.uid));
          if (snap.exists()) {
            setCurrentUser(user);
            setUserProfile(snap.data());
          }
        }
        setLoading(false);
      })
    );
    return () => unsubs.forEach((u) => u());
  }, []);

  const value = {
    currentUser,
    userProfile,
    loading,
    // Expose the correct db/auth instances so every page can use them via useAuth()
    db,
    auth,
    register,
    login,
    logout,
    isAdmin,
    storeCategory,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
