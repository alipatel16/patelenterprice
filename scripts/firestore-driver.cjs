'use strict';
const { Timestamp, GeoPoint, Bytes } = require('firebase/firestore');
const { loadDataModule } = require('./data-module.cjs');
class StoredReference { constructor(value) { this.value = value; } }
function decodeValue(value) {
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) {
    const number = Number(value.integerValue);
    if (!Number.isSafeInteger(number)) throw Error('Backup number exceeds safe integer precision');
    return number;
  }
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) {
    const text = value.timestampValue, seconds = Math.floor(Date.parse(text) / 1000);
    const nanoseconds = Number((text.match(/\.(\d+)Z$/)?.[1] || '').padEnd(9, '0'));
    return new Timestamp(seconds, nanoseconds);
  }
  if ('bytesValue' in value) return Bytes.fromBase64String(value.bytesValue);
  if ('referenceValue' in value) return new StoredReference(value.referenceValue);
  if ('geoPointValue' in value) return new GeoPoint(value.geoPointValue.latitude, value.geoPointValue.longitude);
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
  throw Error('Unsupported typed Firestore value');
}
function decodeFields(fields = {}) { return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)])); }
function encodeValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw Error('Invalid source number');
    return Number.isSafeInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (value instanceof Timestamp) return { timestampValue: new Date(value.seconds * 1000).toISOString().replace(/\.\d{3}Z$/, `.${String(value.nanoseconds).padStart(9, '0')}Z`) };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (value instanceof Bytes) return { bytesValue: value.toBase64() };
  if (value instanceof GeoPoint) return { geoPointValue: { latitude: value.latitude, longitude: value.longitude } };
  if (value instanceof StoredReference) return { referenceValue: value.value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (value && Object.getPrototypeOf(value) === Object.prototype) return { mapValue: { fields: encodeFields(value) } };
  throw Error('Unsupported source value during encoding');
}
function encodeFields(data) { return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encodeValue(value)])); }
const clone = value => Array.isArray(value) ? value.map(clone) : value && Object.getPrototypeOf(value) === Object.prototype
  ? Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clone(entry)])) : value;
function makeReference(db, path) { return { firestore: db, path, id: path.split('/').at(-1), parent: { id: path.split('/').at(-2) } }; }
function withBackfill(store, driver) {
  const writes = loadDataModule('writes').createWriteAdapters(driver);
  store.backfill = (collection, id, budget) => driver.withBudget(budget, () => writes.mutateRecord(makeReference(store.db, `${collection}/${id}`), current => {
    if (!current || (current._projectionVersion === 2 && current.searchVersion === 2)) return undefined;
    return current;
  }));
  return store;
}
function createMemoryStore(initial = new Map()) {
  const db = {}, records = new Map([...initial].map(([key, value]) => [key, clone(value)]));
  let budget = null;
  const driver = { doc: (_, ...parts) => makeReference(db, parts.join('/')),
    withBudget: async (current, callback) => { budget = current; try { return await callback(); } finally { budget = null; } },
    runTransaction: async (_, callback) => {
      const pending = [];
      const result = await callback({ get: async ref => {
        if (pending.length) throw Error('Read after write');
        budget?.consume('reads', 1);
        return { exists: () => records.has(ref.path), data: () => clone(records.get(ref.path)) };
      }, set: (ref, data) => pending.push([ref.path, clone(data)]), delete: ref => pending.push([ref.path, undefined]) });
      budget?.consume('writes', pending.length);
      for (const [key, value] of pending) if (value === undefined) records.delete(key); else records.set(key, value);
      return result;
    } };
  const store = { db, records, async readPage(collection, cursor, limit) {
    return [...records].filter(([path]) => path.startsWith(`${collection}/`) && path.split('/').length === 2 && (!cursor || path.slice(collection.length + 1) > cursor))
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).slice(0, limit).map(([path, data]) => ({ id: path.slice(collection.length + 1), data: clone(data) }));
  } };
  return withBackfill(store, driver);
}
function createRestStore({ project, origin = 'https://firestore.googleapis.com', token, fetcher = fetch }) {
  if (!/^[a-z0-9][a-z0-9-]+$/.test(project)) throw Error('Invalid project');
  if (origin !== 'https://firestore.googleapis.com' && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) throw Error('Only official Firestore or local emulator endpoints are supported');
  const db = {}, prefix = `projects/${project}/databases/(default)/documents`, base = `${origin}/v1/${prefix}`;
  let budget = null;
  async function request(suffix, body) {
    const response = await fetcher(`${base}${suffix}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    if (!response.ok) {
      const error = new Error('Firestore request failed');
      error.code = response.status === 409 ? 'firestore/aborted' : `firestore/http-${response.status}`;
      throw error;
    }
    return response.json();
  }
  const driver = { doc: (_, ...parts) => makeReference(db, parts.join('/')),
    withBudget: async (current, callback) => { budget = current; try { return await callback(); } finally { budget = null; } },
    runTransaction: async (_, callback) => {
      for (let attempt = 0; attempt < 5; attempt++) {
        const { transaction } = await request(':beginTransaction', { options: { readWrite: {} } });
        const pending = [];
        try {
          const result = await callback({ get: async ref => {
            if (pending.length) throw Error('Read after write');
            budget?.consume('reads', 1);
            const batch = await request(':batchGet', { documents: [`${prefix}/${ref.path}`], transaction });
            const found = batch.find(item => item.found)?.found;
            return { exists: () => Boolean(found), data: () => found ? decodeFields(found.fields) : undefined };
          }, set: (ref, data) => pending.push({ update: { name: `${prefix}/${ref.path}`, fields: encodeFields(data) } }),
          delete: ref => pending.push({ delete: `${prefix}/${ref.path}` }) });
          budget?.consume('writes', pending.length);
          await request(':commit', { transaction, writes: pending });
          return result;
        } catch (error) {
          await request(':rollback', { transaction }).catch(() => {});
          if (error.code === 'firestore/aborted' && attempt < 4) continue;
          throw error;
        }
      }
      throw Error('Transaction retries exhausted');
    } };
  const store = { db, async readPage(collection, cursor, limit) {
    const structuredQuery = { from: [{ collectionId: collection }], orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }], limit };
    if (cursor) structuredQuery.startAt = { values: [{ referenceValue: `${prefix}/${collection}/${cursor}` }], before: false };
    const batch = await request(':runQuery', { structuredQuery });
    return batch.filter(item => item.document).map(({ document }) => ({ id: document.name.split('/').at(-1), data: decodeFields(document.fields) }));
  } };
  return withBackfill(store, driver);
}
module.exports = { decodeFields, encodeFields, createMemoryStore, createRestStore };
