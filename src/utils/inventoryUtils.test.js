import { applyInventoryDeltas } from './inventoryUtils';
import { getDocs, limit } from 'firebase/firestore';
import { updateRecord, addRecord } from '../data/writes';
jest.mock('firebase/firestore', () => ({ collection: (db, name) => ({ db, name }), doc: (db, name, id) => ({ db, name, id }),
  query: jest.fn((...args) => args), where: (...args) => args, limit: jest.fn(n => ({ limit: n })), getDocs: jest.fn(), serverTimestamp: () => 'now' }));
jest.mock('../data/writes', () => ({ addRecord: jest.fn(), updateRecord: jest.fn() }));
beforeEach(() => jest.clearAllMocks());
test('stock mutation detects duplicate mappings with a bounded query before writing', async () => {
  getDocs.mockResolvedValue({ docs: [{ id: 'one', data: () => ({ stock: 10 }) }, { id: 'two', data: () => ({ stock: 20 }) }] });
  await expect(applyInventoryDeltas({}, [], [{ productId: 'p', qty: 2 }], 'sale')).rejects.toThrow(/Multiple inventory mappings/);
  expect(limit).toHaveBeenCalledWith(2);
  expect(updateRecord).not.toHaveBeenCalled();
  expect(addRecord).not.toHaveBeenCalled();
});
test('a purchase edit applies the net quantity delta and preserves stock semantics', async () => {
  getDocs.mockResolvedValue({ empty: false, docs: [{ id: 'one', data: () => ({ stock: 100, purchasedQty: 200 }) }] });
  await applyInventoryDeltas({}, [{ productId: 'p', qty: 200 }], [{ productId: 'p', qty: 300 }], 'purchase');
  expect(updateRecord).toHaveBeenCalledWith(expect.objectContaining({ id: 'one' }), { stock: 200, purchasedQty: 300, updatedAt: 'now' });
});
