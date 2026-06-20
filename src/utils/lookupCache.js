// src/utils/lookupCache.js
//
// ─── WHY THIS EXISTS ──────────────────────────────────────────────────────────
//
//  CreateSale / CreateQuotation / CreateGiftInvoice / PurchaseList each call
//  getDocs on the FULL customers (~600 docs), products (~200 docs), users
//  (~20 docs), and inventory (~200 docs) collections on EVERY mount —
//  with zero caching. That burns ≈ 1 020 Firestore reads per form open.
//
//  With 30–35 invoices in a day: 35 × 1 020 = 35 700 reads just from
//  lookup fetches, exhausting the Spark 50 k/day quota in ~2 hours.
//
//  This module provides a lightweight module-level (per-tab session) cache
//  that survives React unmount/remount but resets on page refresh.
//  Default TTL is 5 minutes — stale enough to be cheap, fresh enough to
//  reflect new customers/products added in the same session.
//
// ─── USAGE ───────────────────────────────────────────────────────────────────
//
//   import { getOrFetch, invalidateKey, invalidateAll } from '../../utils/lookupCache';
//
//   // In loadLookups:
//   const customers = await getOrFetch('customers', () =>
//     getDocs(query(collection(db, 'customers'), orderBy('name')))
//       .then(s => s.docs.map(d => ({ id: d.id, ...d.data() })))
//   );
//
//   // After adding a new customer inline — keep the cache consistent:
//   invalidateKey('customers');
//
//   // On logout — clear everything:
//   invalidateAll();
//
// ─────────────────────────────────────────────────────────────────────────────

const _store = {};
const TTL_MS = 50 * 60 * 1000; // 5 minutes

/** Return cached value, or null if missing / expired. */
export function getCached(key) {
  const entry = _store[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL_MS) { delete _store[key]; return null; }
  return entry.data;
}

/** Write a value with a freshness timestamp. */
export function setCached(key, data) {
  _store[key] = { data, ts: Date.now() };
}

/** Evict a specific key so the next consumer re-fetches from Firestore. */
export function invalidateKey(key) {
  delete _store[key];
}

/** Evict all cached data (call on logout). */
export function invalidateAll() {
  Object.keys(_store).forEach(k => delete _store[k]);
}

/**
 * Core helper — returns cached data when fresh, otherwise calls fetcher,
 * stores the result, and returns it. Multiple concurrent callers for the
 * same key all await the same in-flight promise (de-duplication).
 *
 * @param {string}   key     Cache key (e.g. 'customers', 'products')
 * @param {Function} fetcher Async fn () → data  (called only on cache miss)
 * @returns {Promise<any>}
 */
const _inflight = {};

export async function getOrFetch(key, fetcher) {
  // 1. Fresh cache hit — return immediately, 0 Firestore reads
  const hit = getCached(key);
  if (hit !== null) return hit;

  // 2. Deduplicate: if the same key is already being fetched, await it
  if (_inflight[key]) return _inflight[key];

  // 3. Cache miss — fetch, store, return
  _inflight[key] = (async () => {
    try {
      const data = await fetcher();
      setCached(key, data);
      return data;
    } finally {
      delete _inflight[key];
    }
  })();

  return _inflight[key];
}