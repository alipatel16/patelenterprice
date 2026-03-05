import { useState, useCallback } from 'react';
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  query, where, orderBy, limit, startAfter, getDocs,
  getCountFromServer, serverTimestamp, getDoc, setDoc,
} from 'firebase/firestore';

export const useFirestoreCollection = (db, collectionName) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(false);

  const PAGE_SIZE = 10;

  const fetchData = useCallback(async ({
    filters = [], sortField = 'createdAt', sortDir = 'desc',
    searchField = null, searchValue = null, page = 0,
  } = {}) => {
    if (!db) return;
    setLoading(true);
    try {
      let constraints = [...filters];
      if (sortField) constraints.push(orderBy(sortField, sortDir));
      constraints.push(limit(PAGE_SIZE));
      if (page > 0 && lastDoc) constraints.push(startAfter(lastDoc));

      const q = query(collection(db, collectionName), ...constraints);
      const snap = await getDocs(q);
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Get total count
      const countQ = query(collection(db, collectionName), ...filters);
      const countSnap = await getCountFromServer(countQ);
      setTotal(countSnap.data().count);
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === PAGE_SIZE);
      setData(docs);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [db, collectionName, lastDoc]);

  const add = useCallback(async (data) => {
    if (!db) return;
    const ref = await addDoc(collection(db, collectionName), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  }, [db, collectionName]);

  const update = useCallback(async (id, data) => {
    if (!db) return;
    await updateDoc(doc(db, collectionName, id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  }, [db, collectionName]);

  const remove = useCallback(async (id) => {
    if (!db) return;
    await deleteDoc(doc(db, collectionName, id));
  }, [db, collectionName]);

  const getById = useCallback(async (id) => {
    if (!db) return null;
    const snap = await getDoc(doc(db, collectionName, id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  }, [db, collectionName]);

  const getAll = useCallback(async (filters = [], sortField = 'createdAt', sortDir = 'desc') => {
    if (!db) return [];
    const constraints = [...filters];
    if (sortField) constraints.push(orderBy(sortField, sortDir));
    const q = query(collection(db, collectionName), ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }, [db, collectionName]);

  return { data, loading, total, hasMore, fetchData, add, update, remove, getById, getAll };
};
