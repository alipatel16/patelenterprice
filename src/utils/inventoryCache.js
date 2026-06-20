// src/utils/inventoryCache.js
//
// ─── ON-DEMAND INVENTORY LOOKUP ────────────────────────────────────────────
//
// Unlike lookupCache.js (5 min TTL — customers/products/employees rarely
// change), this cache is for STOCK COUNTS, which change after every sale or
// purchase. TTL is short (60 seconds) and is explicitly invalidated right
// after a sale/purchase is saved, so stock numbers stay accurate.
//
// WHY THIS EXISTS:
// CreateSale used to call getDocs(collection(db,'inventory')) on every form
// open — reading EVERY inventory document regardless of which products were
// actually used in this sale. As inventory grows (more products), this read
// cost grows too, even though a typical sale only touches 1–5 products.
//
// This module fetches stock ONLY for the specific productIds you ask for —
// either the products currently shown in a search dropdown, or the specific
// products already on an existing sale being edited.
//
// ─── USAGE ───────────────────────────────────────────────────────────────
//
//   import { getInventoryForProducts, invalidateInventoryCache } from '../../utils/inventoryCache';
//
//   // Fetch stock for a batch of productIds (e.g. visible search results):
//   const stockMap = await getInventoryForProducts(db, ['p1', 'p2', 'p3']);
//   // stockMap = { p1: 12, p2: 0, p3: 5 }
//
//   // After a sale changes stock for these products, evict so the next
//   // lookup is fresh instead of serving the pre-sale cached value:
//   invalidateInventoryCache(['p1', 'p2']);
//
// ─────────────────────────────────────────────────────────────────────────

import { collection, query, where, getDocs } from 'firebase/firestore';

const _cache = {};          // { [productId]: { stock, ts } }
const TTL_MS = 60 * 1000;   // 60 seconds — short, because stock changes often

const isFresh = (entry) => Boolean(entry) && (Date.now() - entry.ts < TTL_MS);

/**
 * Fetch stock for a list of productIds. Cached entries (<60s old) are
 * returned instantly with zero Firestore reads. Anything stale or missing
 * is fetched in batches of 30 (Firestore 'in' query limit) using a single-
 * field query on `productId` — no composite index required.
 *
 * Products with no inventory doc at all (never purchased) resolve to 0 and
 * are cached as such, so repeated searches for them don't keep re-querying.
 *
 * @param {object} db - Firestore instance
 * @param {string[]} productIds
 * @returns {Promise<Record<string, number>>} map of productId -> stock
 */
export async function getInventoryForProducts(db, productIds) {
  const uniqueIds = [...new Set((productIds || []).filter(Boolean))];
  if (uniqueIds.length === 0) return {};

  const result = {};
  const toFetch = [];

  for (const id of uniqueIds) {
    if (isFresh(_cache[id])) {
      result[id] = _cache[id].stock;
    } else {
      toFetch.push(id);
    }
  }

  if (toFetch.length === 0) return result;

  // Firestore 'in' queries accept up to 30 values — chunk accordingly.
  const chunks = [];
  for (let i = 0; i < toFetch.length; i += 30) {
    chunks.push(toFetch.slice(i, i + 30));
  }

  const snaps = await Promise.all(
    chunks.map(chunk =>
      getDocs(query(collection(db, 'inventory'), where('productId', 'in', chunk)))
    )
  );

  const found = new Set();
  snaps.forEach(snap => {
    snap.docs.forEach(d => {
      const data = d.data();
      const stock = data.stock || 0;
      _cache[data.productId] = { stock, ts: Date.now() };
      result[data.productId] = stock;
      found.add(data.productId);
    });
  });

  // No inventory doc yet for this product = treat as 0 stock, cache it so
  // we don't re-query for it every time it shows up in a search.
  toFetch.forEach(id => {
    if (!found.has(id)) {
      _cache[id] = { stock: 0, ts: Date.now() };
      result[id] = 0;
    }
  });

  return result;
}

/** Evict cached stock for specific products — call right after a sale or
 *  purchase changes their stock, so the next lookup is fresh. */
export function invalidateInventoryCache(productIds) {
  (productIds || []).forEach(id => delete _cache[id]);
}

/** Clear everything — call on logout. */
export function invalidateAllInventoryCache() {
  Object.keys(_cache).forEach(k => delete _cache[k]);
}