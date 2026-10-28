import { applyInventoryDeltas } from './inventoryUtils';
import { getDocs, limit } from 'firebase/firestore';
import { updateRecord, mutateRecord, addRecord, createWriteAdapters } from '../data/writes';
import { memoryPaymentStore } from '../data/paymentTestStore';
let mockStore;
jest.mock('firebase/firestore', () => ({ ...jest.requireActual('firebase/firestore'), collection: (db, name) => ({ db, name }), doc: (db, name, id) => mockStore.ref(`${name}/${id}`),
  query: jest.fn((...args) => args), where: (...args) => args, limit: jest.fn(n => ({ limit: n })), getDocs: jest.fn(), serverTimestamp: () => 'now' }));
jest.mock('../data/writes', () => { const actual = jest.requireActual('../data/writes'); return { ...actual, addRecord: jest.fn(), updateRecord: jest.fn(), mutateRecord: jest.fn() }; });
beforeEach(() => { jest.clearAllMocks(); mockStore = memoryPaymentStore(); const writes = createWriteAdapters(mockStore.driver); mutateRecord.mockImplementation(writes.mutateRecord); updateRecord.mockImplementation(writes.updateRecord); });
test('stock mutation detects duplicate mappings with a bounded query before writing', async () => {
  getDocs.mockResolvedValue({ docs: [{ id: 'one' }, { id: 'two' }] });
  await expect(applyInventoryDeltas({}, [], [{ productId: 'p', qty: 2 }], 'sale')).rejects.toThrow(/Multiple inventory mappings/);
  expect(limit).toHaveBeenCalledWith(2); expect(mutateRecord).not.toHaveBeenCalled(); expect(addRecord).not.toHaveBeenCalled();
});
test.each(['sale', 'purchase'])('concurrent %s deltas use fresh stock on transaction retries', async type => {
  mockStore.records.set('inventory/one', { productId: 'p', stock: 10, soldQty: 0, purchasedQty: 0 });
  getDocs.mockResolvedValue({ docs: [{ id: 'one', data: () => ({ stock: 10, soldQty: 0, purchasedQty: 0 }) }] });
  await Promise.all([1, 2].map(() => applyInventoryDeltas(mockStore.db, [], [{ productId: 'p', qty: 1 }], type)));
  expect(mockStore.retries).toBeGreaterThan(0);
  expect(mockStore.records.get('inventory/one')).toMatchObject(type === 'sale' ? { stock: 8, soldQty: 2 } : { stock: 12, purchasedQty: 2 });
});
