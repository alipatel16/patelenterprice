/**
 * Inventory Delta Utilities
 *
 * These helpers use a PURE DELTA approach:
 *   1. Build a productId → qty map for old items and new items.
 *   2. Compute delta = newQty − oldQty per product.
 *   3. Apply that single net number to Firestore — never reverse-then-apply.
 *
 * Why delta-only?
 *   Reverse-then-apply breaks whenever Math.max(0, …) floors a negative
 *   intermediate value (e.g. stock 100 − reversed 200 → clamped to 0, then
 *   +300 = 300 instead of the correct 200).
 */

import {
  collection, query, where, getDocs,
  addDoc, updateDoc, doc, serverTimestamp,
} from 'firebase/firestore';

// ── Build productId → totalQty map from an item array ─────────────────────
export const buildQtyMap = (items = []) => {
  const map = {};
  for (const it of items) {
    if (!it.productId) continue;
    map[it.productId] = (map[it.productId] || 0) + (parseFloat(it.qty) || 0);
  }
  return map;
};

// ── Build productId → productName map (falls back to oldItems) ────────────
const buildNameMap = (newItems = [], oldItems = []) => {
  const map = {};
  for (const it of [...oldItems, ...newItems]) {
    if (it.productId && it.productName) map[it.productId] = it.productName;
  }
  return map;
};

/**
 * applyInventoryDeltas
 *
 * @param {Firestore} db
 * @param {Array}  oldItems  - items BEFORE the edit (from saved doc)
 * @param {Array}  newItems  - items AFTER the edit (being saved now)
 * @param {'sale'|'purchase'} type
 *
 * For SALE edits:
 *   delta > 0 → more sold → stock ↓, soldQty ↑
 *   delta < 0 → fewer sold → stock ↑, soldQty ↓
 *
 * For PURCHASE edits:
 *   delta > 0 → more purchased → stock ↑, purchasedQty ↑
 *   delta < 0 → fewer purchased → stock ↓, purchasedQty ↓
 */
export const applyInventoryDeltas = async (db, oldItems, newItems, type) => {
  const oldMap  = buildQtyMap(oldItems);
  const newMap  = buildQtyMap(newItems);
  const nameMap = buildNameMap(newItems, oldItems);

  const allProductIds = new Set([...Object.keys(oldMap), ...Object.keys(newMap)]);

  for (const productId of allProductIds) {
    const oldQty = oldMap[productId] || 0;
    const newQty = newMap[productId] || 0;
    const delta  = newQty - oldQty;

    if (delta === 0) continue; // nothing changed for this product

    const invQ    = query(collection(db, 'inventory'), where('productId', '==', productId));
    const invSnap = await getDocs(invQ);

    if (invSnap.empty) {
      // Only auto-create an inventory record for a brand-new purchase
      if (type === 'purchase' && delta > 0) {
        await addDoc(collection(db, 'inventory'), {
          productId,
          productName: nameMap[productId] || '',
          stock:        delta,
          purchasedQty: delta,
          soldQty:      0,
          createdAt:    serverTimestamp(),
          updatedAt:    serverTimestamp(),
        });
      }
      continue;
    }

    const invDoc = invSnap.docs[0];
    const data   = invDoc.data();

    if (type === 'sale') {
      // More sold → less stock; fewer sold → more stock
      await updateDoc(doc(db, 'inventory', invDoc.id), {
        stock:   Math.max(0, (data.stock   || 0) - delta),
        soldQty: Math.max(0, (data.soldQty || 0) + delta),
        updatedAt: serverTimestamp(),
      });
    } else {
      // More purchased → more stock; fewer purchased → less stock
      await updateDoc(doc(db, 'inventory', invDoc.id), {
        stock:        Math.max(0, (data.stock        || 0) + delta),
        purchasedQty: Math.max(0, (data.purchasedQty || 0) + delta),
        updatedAt:    serverTimestamp(),
      });
    }
  }
};

/**
 * applyNewSaleInventory  – for brand-new sales (deduct stock)
 */
export const applyNewSaleInventory = async (db, items) => {
  await applyInventoryDeltas(db, [], items, 'sale');
};

/**
 * applyNewPurchaseInventory  – for brand-new purchases (add stock)
 */
export const applyNewPurchaseInventory = async (db, items) => {
  await applyInventoryDeltas(db, [], items, 'purchase');
};

/**
 * reverseSaleInventory  – restore stock when a sale is deleted
 */
export const reverseSaleInventory = async (db, items) => {
  await applyInventoryDeltas(db, items, [], 'sale');
};

/**
 * reversePurchaseInventory  – remove stock when a purchase is deleted
 */
export const reversePurchaseInventory = async (db, items) => {
  await applyInventoryDeltas(db, items, [], 'purchase');
};