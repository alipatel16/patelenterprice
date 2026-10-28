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

test('new sales search indexes reflect the filter arguments actually passed by SalesList', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const parser = require('@babel/parser');
  const traverse = require('@babel/traverse').default;
  const source = fs.readFileSync(path.join(__dirname, '../src/pages/Sales/SalesList.js'), 'utf8');
  const ast = parser.parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const calls = [];
  traverse(ast, { CallExpression({ node }) {
    if (node.callee.type === 'Identifier' && node.callee.name === 'businessListOptions' && node.arguments[0]?.value === 'sales') calls.push(node);
  } });
  assert.equal(calls.length, 1);
  const options = calls[0].arguments[1];
  assert.equal(options.type, 'ObjectExpression');
  const filterNames = options.properties.map(property => property.key?.name).filter(name => name?.endsWith('Filter')).sort();
  assert.deepEqual(filterNames, ['deliveryFilter', 'invoiceFilter', 'paymentFilter']);
  const baseline = new Set(require('./firestore-existing-indexes.json').map(index => JSON.stringify(index)));
  const newSearchIndexes = generateIndexes().indexes.filter(index => index.collectionGroup === 'sales' && !baseline.has(JSON.stringify(index)) && index.fields.some(field => field.fieldPath === 'searchTokens'));
  assert.ok(newSearchIndexes.length > 0);
  assert.ok(newSearchIndexes.every(index => index.fields.every(field => field.fieldPath !== 'companyId')), 'unused company filter must not create sales search indexes');
});

test('native aggregate indexes use canonical field order for multiple sums', () => {
  const index=indexForQuery('reportProductPeriods',{filters:[['periodType','==','daily'],['periodKey','==','2026-10-28']],sums:['quantity','revenue','invoiceCount','reconciliationCount','undatedInvoiceCount']});
  assert.deepEqual(index.fields.map(f=>f.fieldPath),['periodKey','periodType','invoiceCount','quantity','reconciliationCount','revenue','undatedInvoiceCount']);
});
test('implicit inequality order inherits the last explicit descending order', () => {
  const index=indexForQuery('complaints',{filters:[['status','in',['resolved','closed']],['complaintDueDate','<','2026-10-28']],sort:[['createdAt','desc']]});
  assert.deepEqual(index.fields,[{fieldPath:'status',order:'ASCENDING'},{fieldPath:'createdAt',order:'DESCENDING'},{fieldPath:'complaintDueDate',order:'DESCENDING'}]);
});
