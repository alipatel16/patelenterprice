// src/services/typesenseClient.js
// ─────────────────────────────────────────────────────────────────────────────
// Typesense client — reads credentials from .env
// Add these to your .env file:
//   REACT_APP_TYPESENSE_HOST=xxx.typesense.net
//   REACT_APP_TYPESENSE_PORT=443
//   REACT_APP_TYPESENSE_PROTOCOL=https
//   REACT_APP_TYPESENSE_SEARCH_KEY=your_search_only_api_key
//   REACT_APP_TYPESENSE_ADMIN_KEY=your_admin_api_key
// ─────────────────────────────────────────────────────────────────────────────
import Typesense from 'typesense';

// Search-only client (safe to use in frontend)
export const typesenseSearchClient = new Typesense.Client({
  nodes: [
    {
      host: process.env.REACT_APP_TYPESENSE_HOST || '',
      port: parseInt(process.env.REACT_APP_TYPESENSE_PORT || '443'),
      protocol: process.env.REACT_APP_TYPESENSE_PROTOCOL || 'https',
    },
  ],
  apiKey: process.env.REACT_APP_TYPESENSE_SEARCH_KEY || '',
  connectionTimeoutSeconds: 5,
  retryIntervalSeconds: 0.1,
  numRetries: 2,
});

// Admin client (for indexing/syncing)
export const typesenseAdminClient = new Typesense.Client({
  nodes: [
    {
      host: process.env.REACT_APP_TYPESENSE_HOST || '',
      port: parseInt(process.env.REACT_APP_TYPESENSE_PORT || '443'),
      protocol: process.env.REACT_APP_TYPESENSE_PROTOCOL || 'https',
    },
  ],
  apiKey: process.env.REACT_APP_TYPESENSE_ADMIN_KEY || '',
  connectionTimeoutSeconds: 5,
  retryIntervalSeconds: 0.1,
  numRetries: 2,
});

// ── Collection Schemas ────────────────────────────────────────────────────────
// Each collection includes a `storeType` field so furniture and electronics
// data can coexist in the same Typesense instance.

export const COLLECTION_SCHEMAS = {
  customers: {
    name: 'customers',
    fields: [
      { name: 'id',           type: 'string' },
      { name: 'name',         type: 'string' },
      { name: 'phone',        type: 'string', optional: true },
      { name: 'email',        type: 'string', optional: true },
      { name: 'customerType', type: 'string', facet: true, optional: true },
      { name: 'category',     type: 'string', facet: true, optional: true },
      { name: 'city',         type: 'string', optional: true },
      { name: 'storeType',    type: 'string', facet: true },
      { name: 'createdAt',    type: 'int64',  optional: true },
    ],
    default_sorting_field: 'createdAt',
  },

  products: {
    name: 'products',
    fields: [
      { name: 'id',        type: 'string' },
      { name: 'name',      type: 'string' },
      { name: 'maker',     type: 'string', optional: true },
      { name: 'hsnCode',   type: 'string', optional: true },
      { name: 'category',  type: 'string', facet: true, optional: true },
      { name: 'price',     type: 'float',  optional: true },
      { name: 'storeType', type: 'string', facet: true },
      { name: 'createdAt', type: 'int64',  optional: true },
    ],
    default_sorting_field: 'createdAt',
  },

  sales: {
    name: 'sales',
    fields: [
      { name: 'id',            type: 'string' },
      { name: 'invoiceNumber', type: 'string', optional: true },
      { name: 'customerName',  type: 'string', optional: true },
      { name: 'customerPhone', type: 'string', optional: true },
      { name: 'saleDate',      type: 'string', optional: true },
      { name: 'totalAmount',   type: 'float',  optional: true },
      { name: 'paymentType',   type: 'string', facet: true, optional: true },
      { name: 'invoiceType',   type: 'string', facet: true, optional: true },
      { name: 'storeType',     type: 'string', facet: true },
      { name: 'createdAt',     type: 'int64',  optional: true },
    ],
    default_sorting_field: 'createdAt',
  },

  purchases: {
    name: 'purchases',
    fields: [
      { name: 'id',            type: 'string' },
      { name: 'supplierName',  type: 'string', optional: true },
      { name: 'supplierGst',   type: 'string', optional: true },
      { name: 'invoiceNumber', type: 'string', optional: true },
      { name: 'invoiceDate',   type: 'string', optional: true },
      { name: 'grandTotal',    type: 'float',  optional: true },
      { name: 'storeType',     type: 'string', facet: true },
      { name: 'createdAt',     type: 'int64',  optional: true },
    ],
    default_sorting_field: 'createdAt',
  },

  inventory: {
    name: 'inventory',
    fields: [
      { name: 'id',          type: 'string' },
      { name: 'productName', type: 'string' },
      { name: 'productId',   type: 'string', optional: true },
      { name: 'stock',       type: 'int32',  optional: true },
      { name: 'soldQty',     type: 'int32',  optional: true },
      { name: 'purchasedQty',type: 'int32',  optional: true },
      { name: 'storeType',   type: 'string', facet: true },
      { name: 'updatedAt',   type: 'int64',  optional: true },
    ],
    default_sorting_field: 'updatedAt',
  },
};

// ── Helper: ensure a collection exists (idempotent) ──────────────────────────
export const ensureCollection = async (collectionName) => {
  try {
    await typesenseAdminClient.collections(collectionName).retrieve();
  } catch {
    // Collection doesn't exist yet — create it
    await typesenseAdminClient.collections().create(COLLECTION_SCHEMAS[collectionName]);
  }
};