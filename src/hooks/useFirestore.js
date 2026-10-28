import { useState, useCallback } from 'react';
import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { fetchPage, getKnownDocument } from '../data/query';
import { addRecord, updateRecord, deleteRecord } from '../data/writes';

/** Compatibility adapter. New screens should use usePagedCollection directly. */
export const useFirestoreCollection = (db, collectionName) => {
  const [data, setData] = useState([]), [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0), [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(false), [error, setError] = useState(null);
  const fetchAdministrativePage = useCallback(options => fetchPage(db, collectionName, options), [db, collectionName]);
  const fetchData = useCallback(async ({ filters = [], sortField = 'createdAt', sortDir = 'desc', searchValue = '', page = 0 } = {}) => {
    if (!db) return;
    setLoading(true); setError(null);
    try {
      const result = await fetchPage(db, collectionName, { filters, search: searchValue || '', sort: sortField ? [[sortField, sortDir]] : [], cursor: page > 0 ? lastDoc : null });
      setData(result.rows); setTotal(result.total); setLastDoc(result.lastDoc); setHasMore(result.hasNext);
      return result;
    } catch (failure) { setError(failure); throw failure; }
    finally { setLoading(false); }
  }, [db, collectionName, lastDoc]);
  const add = useCallback(async payload => {
    if (!db) return;
    const ref = await addRecord(collection(db, collectionName), { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return ref.id;
  }, [db, collectionName]);
  const update = useCallback(async (id, payload) => {
    if (!db) return;
    await updateRecord(doc(db, collectionName, id), { ...payload, updatedAt: serverTimestamp() });
  }, [db, collectionName]);
  const remove = useCallback(async id => {
    if (!db) return;
    await deleteRecord(doc(db, collectionName, id));
  }, [db, collectionName]);
  const getById = useCallback(id => db ? getKnownDocument(db, collectionName, id) : Promise.resolve(null), [db, collectionName]);
  /** @deprecated Unbounded scans are prohibited. Page with fetchAdministrativePage. */
  const getAll = useCallback(async () => { throw new Error('Unbounded getAll is deprecated; use fetchAdministrativePage with explicit paging.'); }, []);
  return { data, loading, total, hasMore, error, fetchData, add, update, remove, getById, getAll, fetchAdministrativePage };
};
