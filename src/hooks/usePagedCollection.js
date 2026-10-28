import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchPage, queryKey, subscribeInvalidation, invalidateCollections } from '../data/query';
import { normalizeSearch, searchState } from '../data/search';

export function usePagedCollection(db, collectionName, options = {}) {
  const { search = '', filters = [], sort = [['createdAt', 'desc']], pageSize = 15, includeTotal = true, requireReady = false, cursor = null } = options;
  const term = normalizeSearch(search);
  const cursorIdentity = cursor ? { id: cursor.id, path: cursor.ref?.path, values: sort.map(([field]) => cursor.get ? cursor.get(field) : cursor.data?.()?.[field]) } : null;
  const key = queryKey({ term, filters, sort, pageSize, includeTotal, requireReady, cursorIdentity });
  const generation = useRef(0), identity = useRef({ db, collectionName, key });
  const changed = identity.current.db !== db || identity.current.collectionName !== collectionName || identity.current.key !== key;
  if (changed) { generation.current++; identity.current = { db, collectionName, key }; }
  const cursors = useRef([cursor]);
  const visited = useRef(new Set([0]));
  const [state, setState] = useState({ rows: [], total: null, loading: false, error: null, page: 0, hasNext: false });
  const [refreshKey, bump] = useState(0);
  const loadedIdentity = useRef(null);
  const [page, selectPage] = useState(0);
  const reset = useCallback(() => {
    generation.current++; cursors.current = [cursor]; visited.current = new Set([0]); selectPage(0);
    loadedIdentity.current = null;
    setState({ rows: [], total: null, loading: false, error: null, page: 0, hasNext: false });
    bump(n => n + 1);
  }, [cursor]);
  useEffect(() => subscribeInvalidation(db, names => {
    if (!names || names.includes(collectionName) || names.includes('appSettings')) reset();
  }), [db, collectionName, reset]);
  useEffect(() => {
    cursors.current = [cursor]; visited.current = new Set([0]); selectPage(0);
  }, [db, collectionName, key]);
  useEffect(() => {
    const token = ++generation.current;
    const sameIdentity = loadedIdentity.current === identity.current;
    const currentPage = sameIdentity ? page : 0;
    if (!sameIdentity) { cursors.current = [cursor]; visited.current = new Set([0]); }
    loadedIdentity.current = identity.current;
    if (!db || searchState(term) === 'short') {
      setState({ rows: [], total: null, loading: false, error: null, page: 0, hasNext: false }); return undefined;
    }
    setState({ rows: [], total: null, loading: true, error: null, page: currentPage, hasNext: false });
    const load = async () => {
      try {
        const result = await fetchPage(db, collectionName, { search: term, filters, sort, pageSize, includeTotal, requireReady, cursor: cursors.current[currentPage] });
        if (token !== generation.current) return;
        visited.current.add(currentPage);
        if (result.hasNext && result.lastDoc) cursors.current[currentPage + 1] = result.lastDoc;
        setState({ ...result, loading: false, error: null, page: currentPage });
      } catch (error) {
        if (token === generation.current) setState({ rows: [], total: null, loading: false, error, page: currentPage, hasNext: false });
      }
    };
    const timer = term ? setTimeout(load, 300) : null;
    if (!term) load();
    return () => { clearTimeout(timer); generation.current++; };
    // key is the canonical representation of all query options.
  }, [db, collectionName, key, page, refreshKey]);
  const visible = changed || loadedIdentity.current !== identity.current ? { rows: [], total: null, loading: !!db && searchState(term) !== 'short', error: null, page: 0, hasNext: false } : state;
  const setPage = useCallback(target => {
    if (!Number.isInteger(target) || target < 0 || !(target in cursors.current)) return;
    if (!visited.current.has(target) && !(target === state.page + 1 && state.hasNext)) return;
    selectPage(target);
  }, [state.page, state.hasNext]);
  const refresh = useCallback(() => { if (db) invalidateCollections(db, [collectionName]); }, [db, collectionName]);
  return { ...visible, setPage, next: () => setPage(state.page + 1), previous: () => setPage(state.page - 1), refresh };
}
export default usePagedCollection;
