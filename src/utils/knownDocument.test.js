import { getKnownSnapshot } from './knownDocument';
import { getKnownDocument } from '../data/query';
jest.mock('../data/query', () => ({ getKnownDocument: jest.fn() }));
test('known document snapshots delegate to the scoped cache and preserve display data', async () => {
  const db = {}; getKnownDocument.mockResolvedValue({ id: 'p', name: 'Product' });
  const snap = await getKnownSnapshot({ firestore: db, parent: { id: 'products' }, id: 'p' });
  expect(getKnownDocument).toHaveBeenCalledWith(db, 'products', 'p', undefined);
  expect(snap.exists()).toBe(true); expect(snap.data().name).toBe('Product');
});
test('missing documents and fresh authoritative reads retain their semantics', async () => {
  const db = {}; getKnownDocument.mockResolvedValue(null);
  const snap = await getKnownSnapshot({ firestore: db, parent: { id: 'sales' }, id: 's' }, { ttlMs: 0 });
  expect(getKnownDocument).toHaveBeenLastCalledWith(db, 'sales', 's', { ttlMs: 0 });
  expect(snap.exists()).toBe(false); expect(snap.data()).toBeUndefined();
});
