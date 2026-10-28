const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateIndexes, indexForQuery, runtimeQueryShapes } = require('./firestore-indexes.cjs');
test('query index keeps all equality, array-search and sort fields with no duplicate range field', () => {
  assert.deepEqual(indexForQuery('sales', { filters: [['companyId', '==', 'c1'], ['saleDate', '>=', '2026-10-01'], ['searchTokens', 'array-contains', 'pa']], sort: [['saleDate', 'desc']] }), {
    collectionGroup: 'sales', queryScope: 'COLLECTION', fields: [{ fieldPath: 'companyId', order: 'ASCENDING' }, { fieldPath: 'searchTokens', arrayConfig: 'CONTAINS' }, { fieldPath: 'saleDate', order: 'DESCENDING' }],
  });
});
test('generated complete runtime index family remains within the Spark composite-index allowance', () => {
  const config = generateIndexes();
  assert.ok(config.indexes.length > 50);
  assert.ok(config.indexes.length <= 200);
  assert.equal(new Set(config.indexes.map(index => JSON.stringify(index))).size, config.indexes.length);
  for (const index of config.indexes) assert.equal(new Set(index.fields.map(field => field.fieldPath)).size, index.fields.length);
  assert.ok(runtimeQueryShapes().some(shape => shape.collection === 'sales' && shape.options.filters.some(([name]) => name === 'reportEmployeeKey')));
});

test('all deployed index shapes are retained so setup does not remove existing indexes', () => {
  const baseline = require('./firestore-existing-indexes.json');
  const keys = new Set(generateIndexes().indexes.map(index => JSON.stringify(index)));
  for (const index of baseline) assert.ok(keys.has(JSON.stringify(index)));
});

test('searched EMI aggregates have indexes covering the amount fields as well as search and date filters', () => {
  const config = generateIndexes();
  assert.ok(config.indexes.some(index => index.collectionGroup === 'emiDues' && ['dueDate', 'remainingAmount', 'searchTokens'].every(field => index.fields.some(f => f.fieldPath === field))));
  assert.ok(config.indexes.some(index => index.collectionGroup === 'sales' && ['paymentType', 'hasPendingEmi', 'searchTokens', 'emiOutstandingAmount', 'grandTotal'].every(field => index.fields.some(f => f.fieldPath === field))));
});

test('on-demand selectors use their actual default normalized-name sort', () => {
  for (const collection of ['users', 'brandHierarchies', 'giftSets', 'checklistTemplates']) {
    assert.ok(generateIndexes().indexes.some(index => index.collectionGroup === collection && index.fields.some(field => field.fieldPath === 'searchTokens') && index.fields.some(field => field.fieldPath === 'nameLower' && field.order === 'ASCENDING')));
  }
});
