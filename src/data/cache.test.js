import { getOrFetch, getCached, setCached } from '../utils/lookupCache';
import { getInventoryForProducts } from '../utils/inventoryCache';
import { setDataAccessScope } from './query';
import { getDocs } from 'firebase/firestore';
jest.mock('firebase/firestore', () => ({ collection: (db, name) => ({ db, name }), query: (ref, ...constraints) => ({ ...ref, constraints }), where: (...args) => ({ args }), limit: n => ({ n }), getDocs: jest.fn() }));
test('manual lookup values expire and clear on user scope changes', () => {
  const db = {}, now = jest.spyOn(Date, 'now').mockReturnValue(0);
  setCached('employees', ['A'], db); expect(getCached('employees', db)).toEqual(['A']);
  now.mockReturnValue(60001); expect(getCached('employees', db)).toBeNull();
  setCached('employees', ['B'], db); setDataAccessScope(db, 'another-user'); expect(getCached('employees', db)).toBeNull(); now.mockRestore();
});
test('scoped lookup requests deduplicate while legacy callers never share values', async () => {
  const fetcher = jest.fn(async () => ['A']), db = {};
  await Promise.all([getOrFetch('employees', fetcher, db), getOrFetch('employees', fetcher, db)]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await getOrFetch('employees', fetcher); await getOrFetch('employees', fetcher); expect(fetcher).toHaveBeenCalledTimes(3);
});
test('inventory queries are bounded and ambiguous product mappings are visible', async () => {
  getDocs.mockResolvedValue({ docs: [{ data: () => ({ stock: 3 }) }, { data: () => ({ stock: 9 }) }] });
  await expect(getInventoryForProducts({}, ['product'])).rejects.toThrow(/Multiple inventory/);
  expect(getDocs.mock.calls[0][0].constraints.at(-1)).toEqual({ n: 2 });
});
