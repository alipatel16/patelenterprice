import { collection, query, where, limit, getDocs } from 'firebase/firestore';
import { cachedRequest, invalidateCollections, invalidateLegacyCollections } from '../data/query';
/** Cached display stock only. Financial writes must use authoritative transactions.
 * Two rows per product detect ambiguous mappings without a collection scan.
 */
export async function getInventoryForProducts(db, productIds) {
  const ids = [...new Set((productIds || []).filter(Boolean))];
  if (ids.length > 100) throw new Error('Request inventory for at most 100 visible/selected products');
  const entries = await Promise.all(ids.map(async id => [id, await cachedRequest(db, 'inventory', `product:${id}`, async () => {
    const snap = await getDocs(query(collection(db, 'inventory'), where('productId', '==', id), limit(2)));
    if (snap.docs.length > 1) throw new Error(`Multiple inventory mappings for product ${id}; administrator review required.`);
    return snap.docs.length ? Number(snap.docs[0].data().stock || 0) : 0;
  })]));
  return Object.fromEntries(entries);
}
export function invalidateInventoryCache(productIds, db) {
  // A collection-wide eviction also refreshes cached inventory pages/totals.
  if (db) invalidateCollections(db, ['inventory']); else invalidateLegacyCollections(['inventory']);
}
export const invalidateAllInventoryCache = db => invalidateInventoryCache([], db);
