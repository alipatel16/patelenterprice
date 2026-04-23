// src/services/typesenseSync.js
// ─────────────────────────────────────────────────────────────────────────────
// Thin sync layer: call these after every Firestore create/update/delete.
// These run client-side (no Cloud Functions needed → stays on Spark free plan).
// All errors are swallowed with a console.warn so they NEVER break existing
// Firestore operations.
// ─────────────────────────────────────────────────────────────────────────────
import { typesenseAdminClient, ensureCollection } from './typesenseClient';

// Convert a Firestore Timestamp / serverTimestamp / ISO string to a Unix epoch
// integer (seconds). Typesense requires int64 for sort fields.
const toEpoch = (val) => {
  if (!val) return Math.floor(Date.now() / 1000);
  if (typeof val === 'number') return val;
  if (val?.seconds) return val.seconds; // Firestore Timestamp
  if (val?.toDate) return Math.floor(val.toDate().getTime() / 1000);
  if (typeof val === 'string') return Math.floor(new Date(val).getTime() / 1000);
  return Math.floor(Date.now() / 1000);
};

// ── Upsert helpers ─────────────────────────────────────────────────────────

export const syncCustomer = async (id, data, storeType) => {
  try {
    await ensureCollection('customers');
    await typesenseAdminClient.collections('customers').documents().upsert({
      id,
      name:         data.name         || '',
      phone:        data.phone        || '',
      email:        data.email        || '',
      customerType: data.customerType || '',
      category:     data.category     || '',
      city:         data.city         || '',
      storeType:    storeType         || '',
      createdAt:    toEpoch(data.createdAt),
    });
  } catch (err) {
    console.warn('[Typesense] syncCustomer failed:', err.message);
  }
};

export const deleteCustomer = async (id) => {
  try {
    await typesenseAdminClient.collections('customers').documents(id).delete();
  } catch (err) {
    console.warn('[Typesense] deleteCustomer failed:', err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────

export const syncProduct = async (id, data, storeType) => {
  try {
    await ensureCollection('products');
    await typesenseAdminClient.collections('products').documents().upsert({
      id,
      name:      data.name      || '',
      maker:     data.maker     || '',
      hsnCode:   data.hsnCode   || '',
      category:  data.category  || '',
      price:     parseFloat(data.price) || 0,
      storeType: storeType      || '',
      createdAt: toEpoch(data.createdAt),
    });
  } catch (err) {
    console.warn('[Typesense] syncProduct failed:', err.message);
  }
};

export const deleteProduct = async (id) => {
  try {
    await typesenseAdminClient.collections('products').documents(id).delete();
  } catch (err) {
    console.warn('[Typesense] deleteProduct failed:', err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────

export const syncSale = async (id, data, storeType) => {
  try {
    await ensureCollection('sales');
    await typesenseAdminClient.collections('sales').documents().upsert({
      id,
      invoiceNumber: data.invoiceNumber || '',
      customerName:  data.customerName  || '',
      customerPhone: data.customerPhone || '',
      saleDate:      data.saleDate      || '',
      totalAmount:   parseFloat(data.totalAmount) || 0,
      paymentType:   data.paymentType   || '',
      invoiceType:   data.invoiceType   || '',
      storeType:     storeType          || '',
      createdAt:     toEpoch(data.createdAt),
    });
  } catch (err) {
    console.warn('[Typesense] syncSale failed:', err.message);
  }
};

export const deleteSale = async (id) => {
  try {
    await typesenseAdminClient.collections('sales').documents(id).delete();
  } catch (err) {
    console.warn('[Typesense] deleteSale failed:', err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────

export const syncPurchase = async (id, data, storeType) => {
  try {
    await ensureCollection('purchases');
    await typesenseAdminClient.collections('purchases').documents().upsert({
      id,
      supplierName:  data.supplierName  || '',
      supplierGst:   data.supplierGst   || '',
      invoiceNumber: data.invoiceNumber || '',
      invoiceDate:   data.invoiceDate   || '',
      grandTotal:    parseFloat(data.grandTotal) || 0,
      storeType:     storeType          || '',
      createdAt:     toEpoch(data.createdAt),
    });
  } catch (err) {
    console.warn('[Typesense] syncPurchase failed:', err.message);
  }
};

export const deletePurchase = async (id) => {
  try {
    await typesenseAdminClient.collections('purchases').documents(id).delete();
  } catch (err) {
    console.warn('[Typesense] deletePurchase failed:', err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────

export const syncInventory = async (id, data, storeType) => {
  try {
    await ensureCollection('inventory');
    await typesenseAdminClient.collections('inventory').documents().upsert({
      id,
      productName:  data.productName  || '',
      productId:    data.productId    || '',
      stock:        parseInt(data.stock)        || 0,
      soldQty:      parseInt(data.soldQty)      || 0,
      purchasedQty: parseInt(data.purchasedQty) || 0,
      storeType:    storeType         || '',
      updatedAt:    toEpoch(data.updatedAt),
    });
  } catch (err) {
    console.warn('[Typesense] syncInventory failed:', err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Bulk backfill helpers — call once from the browser console to seed Typesense
// with existing Firestore data.
// Usage:
//   import { backfillAll } from './services/typesenseSync';
//   backfillAll(db, 'furniture');
// ─────────────────────────────────────────────────────────────────────────────
import {
  collection, getDocs,
} from 'firebase/firestore';

export const backfillCollection = async (db, collectionName, storeType, mapFn) => {
  const snap = await getDocs(collection(db, collectionName));
  const batch = snap.docs.map(d => mapFn(d.id, d.data()));
  if (batch.length === 0) return;
  try {
    await ensureCollection(collectionName);
    // Typesense supports up to 40 MB per import request; chunk into 500
    for (let i = 0; i < batch.length; i += 500) {
      await typesenseAdminClient
        .collections(collectionName)
        .documents()
        .import(batch.slice(i, i + 500), { action: 'upsert' });
    }
    console.log(`[Typesense] Backfilled ${batch.length} ${collectionName}`);
  } catch (err) {
    console.error(`[Typesense] Backfill ${collectionName} failed:`, err);
  }
};

const toEp = (val) => {
  if (!val) return Math.floor(Date.now() / 1000);
  if (val?.seconds) return val.seconds;
  if (typeof val === 'string') return Math.floor(new Date(val).getTime() / 1000);
  return Math.floor(Date.now() / 1000);
};

export const backfillAll = async (db, storeType) => {
  console.log(`[Typesense] Starting backfill for storeType="${storeType}"...`);

  await backfillCollection(db, 'customers', storeType, (id, d) => ({
    id, name: d.name || '', phone: d.phone || '', email: d.email || '',
    customerType: d.customerType || '', category: d.category || '',
    city: d.city || '', storeType, createdAt: toEp(d.createdAt),
  }));

  await backfillCollection(db, 'products', storeType, (id, d) => ({
    id, name: d.name || '', maker: d.maker || '', hsnCode: d.hsnCode || '',
    category: d.category || '', price: parseFloat(d.price) || 0,
    storeType, createdAt: toEp(d.createdAt),
  }));

  await backfillCollection(db, 'sales', storeType, (id, d) => ({
    id, invoiceNumber: d.invoiceNumber || '', customerName: d.customerName || '',
    customerPhone: d.customerPhone || '', saleDate: d.saleDate || '',
    totalAmount: parseFloat(d.totalAmount) || 0,
    paymentType: d.paymentType || '', invoiceType: d.invoiceType || '',
    storeType, createdAt: toEp(d.createdAt),
  }));

  await backfillCollection(db, 'purchases', storeType, (id, d) => ({
    id, supplierName: d.supplierName || '', supplierGst: d.supplierGst || '',
    invoiceNumber: d.invoiceNumber || '', invoiceDate: d.invoiceDate || '',
    grandTotal: parseFloat(d.grandTotal) || 0,
    storeType, createdAt: toEp(d.createdAt),
  }));

  await backfillCollection(db, 'inventory', storeType, (id, d) => ({
    id, productName: d.productName || '', productId: d.productId || '',
    stock: parseInt(d.stock) || 0, soldQty: parseInt(d.soldQty) || 0,
    purchasedQty: parseInt(d.purchasedQty) || 0,
    storeType, updatedAt: toEp(d.updatedAt),
  }));

  console.log('[Typesense] Backfill complete!');
};