// src/utils/normalizeDoc.js
//
// ─── DOCUMENT NORMALIZATION ───────────────────────────────────────────────────
//
// Adds search-indexing fields before saving to Firestore.
// Call normalizeCustomer / normalizeProduct before every addDoc / updateDoc.
//
// Why: Firestore prefix-range queries are case-sensitive, so we store a
//      pre-lowercased 'nameLower' field to enable case-insensitive search.
//      Phone is already case-neutral (digits) so no transform is needed.
//
// USAGE:
//   import { normalizeCustomer, normalizeProduct } from '../../utils/normalizeDoc';
//
//   // In CustomerList handleSave:
//   await addDoc(collection(db, 'customers'), {
//     ...normalizeCustomer(form),
//     createdAt: serverTimestamp(),
//   });
//
//   // In CreateSale handleAddNewCustomer:
//   await addDoc(collection(db, 'customers'), {
//     ...normalizeCustomer(form),
//     createdAt: serverTimestamp(),
//   });
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Adds search fields to a customer document before saving.
 * @param {Object} form   Raw form data
 * @returns {Object}      Form data + computed search fields
 */
export const normalizeCustomer = (form) => ({
  ...form,
  nameLower: (form.name || '').toLowerCase().trim(),
});

/**
 * Adds search fields to a product document before saving.
 * @param {Object} form   Raw form data
 * @returns {Object}      Form data + computed search fields
 */
export const normalizeProduct = (form) => ({
  ...form,
  nameLower: (form.name || '').toLowerCase().trim(),
  // Also index maker for "search by brand" queries
  makerLower: (form.maker || '').toLowerCase().trim(),
});

/**
 * Generic normalizer — just adds nameLower.
 */
export const normalizeDoc = (form) => ({
  ...form,
  nameLower: (form.name || '').toLowerCase().trim(),
});