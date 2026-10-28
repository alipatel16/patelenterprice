export function memoryPaymentStore() {
  const db = {}, records = new Map(), versions = new Map();
  let retries = 0, nextId = 0;
  const reference = path => ({ path, id: path.split('/').at(-1), firestore: db,
    parent: { id: path.split('/').at(-2) } });
  const driver = { doc: (first, ...parts) => reference(parts.length ? parts.join('/') : `${first.path}/auto${++nextId}`),
    runTransaction: async (_, callback) => {
      for (let attempt = 0; attempt < 20; attempt++) {
        const readVersions = new Map(), pending = [];
        const transaction = {
          get: async ref => {
            if (pending.length) throw Error('Read after write');
            readVersions.set(ref.path, versions.get(ref.path) || 0);
            const value = records.get(ref.path);
            return { exists: () => value !== undefined, data: () => value === undefined ? undefined : clone(value) };
          },
          set: (ref, data) => pending.push([ref.path, clone(data)]),
          delete: ref => pending.push([ref.path, undefined]),
        };
        const result = await callback(transaction);
        if ([...readVersions].some(([path, version]) => (versions.get(path) || 0) !== version)) { retries++; continue; }
        for (const [path, data] of pending) {
          if (data === undefined) records.delete(path); else records.set(path, data);
          versions.set(path, (versions.get(path) || 0) + 1);
        }
        return result;
      }
      throw Error('Retry limit');
    },
  };
  return { db, ref: reference, records, driver, get retries() { return retries; } };
}
const clone = value => {
  if (value === null || typeof value !== 'object' || value.isEqual) return value;
  if (Array.isArray(value)) return value.map(clone);
  return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, clone(val)]));
};
