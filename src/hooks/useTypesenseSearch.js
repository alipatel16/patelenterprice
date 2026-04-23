// src/hooks/useTypesenseSearch.js
// ─────────────────────────────────────────────────────────────────────────────
// A generic hook that wraps Typesense search with server-side pagination.
//
// Usage:
//   const { results, total, loading, error } = useTypesenseSearch({
//     collection: 'customers',
//     query: debouncedSearch,
//     queryFields: 'name,phone,email',
//     filterBy: `storeType:=${storeType}`,
//     page,           // 1-indexed for Typesense
//     perPage: 10,
//   });
//
// Returns:
//   results  → array of matched documents (id + all fields)
//   total    → total number of matching docs (for pagination)
//   loading  → boolean
//   error    → string | null
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef } from 'react';
import { typesenseSearchClient } from '../services/typesenseClient';

const useTypesenseSearch = ({
  collection,
  query = '',
  queryFields = '',
  filterBy = '',
  sortBy = '',
  page = 1,
  perPage = 10,
  enabled = true,   // set false when query is empty (fall back to Firestore)
}) => {
  const [results, setResults] = useState([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const abortRef = useRef(false);

  useEffect(() => {
    if (!enabled || !query.trim() || !collection) {
      setResults([]);
      setTotal(0);
      return;
    }

    abortRef.current = false;
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const searchParams = {
          q:                  query.trim(),
          query_by:           queryFields,
          page:               Math.max(1, page),
          per_page:           perPage,
          num_typos:          2,
          typo_tokens_threshold: 1,
        };
        if (filterBy) searchParams.filter_by = filterBy;
        if (sortBy)   searchParams.sort_by   = sortBy;

        const resp = await typesenseSearchClient
          .collections(collection)
          .documents()
          .search(searchParams);

        if (cancelled) return;

        const docs = (resp.hits || []).map(h => ({ id: h.document.id, ...h.document }));
        setResults(docs);
        setTotal(resp.found || 0);
      } catch (err) {
        if (cancelled) return;
        console.warn('[Typesense] Search error:', err.message);
        setError(err.message);
        setResults([]);
        setTotal(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [collection, query, queryFields, filterBy, sortBy, page, perPage, enabled]);

  return { results, total, loading, error };
};

export default useTypesenseSearch;