import { collection, doc, query, where, orderBy, limit, startAfter, getDocs,
  getDoc, getCountFromServer, getAggregateFromServer, count, sum } from 'firebase/firestore';
import { normalizeSearch, searchState } from './search';

const stores = new WeakMap();
const registered = new Set();
const MAX_ENTRIES = 200;
function staleScopeError() {
  const error = new Error('Data access identity changed; request discarded.');
  error.code = 'data-access/stale-scope'; return error;
}
function requestStamp(state, names) {
  return { scope: state.scopeGeneration, collections: names.map(name => {
    if (!state.collectionEpochs.has(name)) state.collectionEpochs.set(name, 0);
    return [name, state.collectionEpochs.get(name)];
  }) };
}
function assertCurrent(state, stamp) {
  if (stamp.scope !== state.scopeGeneration) throw staleScopeError();
  if (stamp.collections.some(([name, epoch]) => state.collectionEpochs.get(name) !== epoch)) {
    const error = new Error('Requested collection changed; refresh the request.');
    error.code = 'data-access/invalidated'; throw error;
  }
}
function stateFor(db) {
  if (!db) throw new Error('A Firestore database is required');
  if (!stores.has(db)) {
    const state = { scope: 'anonymous', scopeGeneration: 0, collectionEpochs: new Map(), cache: new Map(), pending: new Map(), listeners: new Set() };
    stores.set(db, state); registered.add(state);
  }
  return stores.get(db);
}
// Canonical keys include types (dates/timestamps/references are valid filters).
function canonical(value) {
  if (value instanceof Date) return { date: value.toISOString() };
  if (value?.toMillis) return { timestamp: value.toMillis() };
  if (value?.path && value?.firestore) return { reference: value.path };
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
export const queryKey = value => JSON.stringify(canonical(value));
export function cachedRequest(db, collectionName, key, fetcher, { ttlMs = 60000 } = {}) {
  const state = stateFor(db);
  const cacheKey = `${collectionName}:${key}`;
  const stamp = requestStamp(state, [collectionName]);
  const hit = state.cache.get(cacheKey);
  if (ttlMs > 0 && hit && Date.now() < hit.expires) {
    state.cache.delete(cacheKey); state.cache.set(cacheKey, hit);
    return Promise.resolve().then(() => { assertCurrent(state, stamp); return hit.value; });
  }
  state.cache.delete(cacheKey);
  if (ttlMs > 0 && state.pending.has(cacheKey)) return state.pending.get(cacheKey);
  const pending = Promise.resolve().then(() => {
    assertCurrent(state, stamp);
    return fetcher();
  }).then(value => {
    assertCurrent(state, stamp);
    if (ttlMs > 0) {
      state.cache.set(cacheKey, { value, expires: Date.now() + ttlMs });
      while (state.cache.size > MAX_ENTRIES) state.cache.delete(state.cache.keys().next().value);
    }
    return value;
  }).finally(() => { if (state.pending.get(cacheKey) === pending) state.pending.delete(cacheKey); });
  state.pending.set(cacheKey, pending);
  while (state.pending.size > MAX_ENTRIES) state.pending.delete(state.pending.keys().next().value);
  return pending;
}
function clearState(state, names = null) {
  for (const name of names || state.collectionEpochs.keys()) {
    state.collectionEpochs.set(name, (state.collectionEpochs.get(name) || 0) + 1);
  }
  for (const map of [state.cache, state.pending]) {
    for (const key of map.keys()) if (!names || names.some(name => key.startsWith(`${name}:`))) map.delete(key);
  }
  state.listeners.forEach(listener => listener(names));
}
export function setDataAccessScope(db, scopeKey) {
  const state = stateFor(db);
  if (state.scope !== scopeKey) { state.scope = scopeKey; state.scopeGeneration++; clearState(state); }
}
export function subscribeInvalidation(db, callback) {
  if (!db) return () => {};
  const state = stateFor(db); state.listeners.add(callback);
  return () => state.listeners.delete(callback);
}
export function invalidateCollections(db, names) {
  clearState(stateFor(db), names);
}
// Legacy save callers omit db; evict conservatively, never return cross-store data.
export function invalidateLegacyCollections(names) { registered.forEach(state => clearState(state, names)); }
export function getKnownDocument(db, collectionName, id, { ttlMs = 60000 } = {}) {
  if (!id) return Promise.resolve(null);
  return cachedRequest(db, collectionName, `id:${id}`, async () => {
    const snap = await getDoc(doc(db, collectionName, id));
    return snap.exists() ? { ...snap.data(), id: snap.id } : null;
  }, { ttlMs });
}
async function ensureReady(db, collectionName) {
  const setting = await getKnownDocument(db, 'appSettings', 'dataAccessV2');
  if (setting?.version !== 2 || !setting?.readyCollections?.includes(collectionName)) {
    const error = new Error(`Search data for ${collectionName} is not ready. Contact an administrator to complete data access setup.`);
    error.code = 'data-access/not-ready'; throw error;
  }
}
const predicates = filters => filters.map(filter => {
  if (!Array.isArray(filter) || filter.length !== 3) throw new Error('Filters must be [field, operator, value] triples');
  return where(...filter);
});
export async function fetchPage(db, collectionName, { search = '', filters = [], sort = [['createdAt', 'desc']], cursor = null, pageSize = 15, includeTotal = true, requireReady = false } = {}) {
  if (searchState(search) === 'short') return { rows: [], total: includeTotal ? 0 : null, lastDoc: null, hasNext: false };
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error('Page size must be between 1 and 100');
  const term = normalizeSearch(search);
  const state = stateFor(db), stamp = requestStamp(state, term || requireReady ? [collectionName, 'appSettings'] : [collectionName]);
  if (term || requireReady) await ensureReady(db, collectionName);
  assertCurrent(state, stamp);
  const scopedFilters = term ? [...filters, ['searchTokens', 'array-contains', term]] : filters;
  const cursorKey = cursor ? { id: cursor.id, path: cursor.ref?.path, values: sort.map(([field]) => cursor.get ? cursor.get(field) : cursor.data?.()?.[field]) } : null;
  const result = await cachedRequest(db, collectionName, `page:${queryKey({ version: 2, scopedFilters, sort, cursorKey, pageSize, includeTotal })}`, async () => {
    const constraints = [...predicates(scopedFilters), ...sort.map(pair => orderBy(...pair))];
    if (cursor) constraints.push(startAfter(cursor));
    constraints.push(limit(pageSize));
    const [snap, total] = await Promise.all([
      getDocs(query(collection(db, collectionName), ...constraints)),
      includeTotal ? cachedRequest(db, collectionName, `total:${queryKey(scopedFilters)}`, async () => {
        const result = await getCountFromServer(query(collection(db, collectionName), ...predicates(scopedFilters)));
        return result.data().count;
      }) : Promise.resolve(null),
    ]);
    return { rows: snap.docs.map(d => ({ ...d.data(), id: d.id })), total,
      lastDoc: snap.docs.at(-1) || null, hasNext: snap.docs.length === pageSize };
  });
  assertCurrent(state, stamp);
  return result;
}
export async function fetchAggregate(db, collectionName, { filters = [], aggregates = { count: { op: 'count' } }, requireReady = false } = {}) {
  const state = stateFor(db), stamp = requestStamp(state, requireReady ? [collectionName, 'appSettings'] : [collectionName]);
  if (requireReady) await ensureReady(db, collectionName);
  assertCurrent(state, stamp);
  const result = await cachedRequest(db, collectionName, `aggregate:${queryKey({ filters, aggregates })}`, async () => {
    const specs = Object.fromEntries(Object.entries(aggregates).map(([key, descriptor]) => {
      if (descriptor.op === 'count') return [key, count()];
      if (descriptor.op === 'sum' && descriptor.field) return [key, sum(descriptor.field)];
      throw new Error(`Unsupported aggregate ${key}`);
    }));
    const result = await getAggregateFromServer(query(collection(db, collectionName), ...predicates(filters)), specs);
    return result.data();
  });
  assertCurrent(state, stamp);
  return result;
}
