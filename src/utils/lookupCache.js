import { cachedRequest, invalidateCollections, invalidateLegacyCollections, setDataAccessScope, subscribeInvalidation } from '../data/query';
// Explicit database required for caching. Legacy callers still work uncached,
// preventing module-global employee/customer data from crossing store or user.
const local = new WeakMap();
export function getCached(key, db) {
  const entry = db ? local.get(db)?.get(key) : null;
  if (!entry || Date.now() >= entry.expires) { if (db) local.get(db)?.delete(key); return null; }
  return entry.data;
}
export function setCached(key, data, db) {
  if (!db) return;
  if (!local.has(db)) {
    local.set(db, new Map());
    subscribeInvalidation(db, names => {
      const cache = local.get(db);
      if (!cache) return;
      if (!names) cache.clear(); else names.forEach(name => cache.delete(name));
    });
  }
  const cache = local.get(db);
  cache.set(key, { data, expires: Date.now() + 60000 });
  while (cache.size > 100) cache.delete(cache.keys().next().value);
}
export function invalidateKey(key, db) {
  if (db) { local.get(db)?.delete(key); invalidateCollections(db, [key]); }
  else invalidateLegacyCollections([key]);
}
export function invalidateAll(db) {
  if (db) { local.delete(db); setDataAccessScope(db, Symbol('cleared')); }
  else invalidateLegacyCollections(null);
}
export async function getOrFetch(key, fetcher, db) {
  const fetchBounded = async () => {
    const data = await fetcher();
    if (Array.isArray(data) && data.length > 100) throw new Error('Lookup exceeds 100 rows; use indexed search or explicit administrative paging.');
    return data;
  };
  return db ? cachedRequest(db, key, 'lookup', fetchBounded) : fetchBounded();
}
