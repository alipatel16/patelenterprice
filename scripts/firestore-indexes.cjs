#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { loadDataModule, loadSourceModule } = require('./data-module.cjs');
function indexForQuery(collection, { filters = [], sort = [], sums = [] }) {
  const fields = [], seen = new Set();
  const add = (fieldPath, mode) => { if (!seen.has(fieldPath) && fieldPath !== '__name__') { fields.push({ fieldPath, ...mode }); seen.add(fieldPath); } };
  const ordered = new Set(sort.map(([field]) => field));
  filters.filter(([field, op]) => ['==', 'in'].includes(op) && !ordered.has(field)).sort(([a], [b]) => a.localeCompare(b)).forEach(([field]) => add(field, { order: 'ASCENDING' }));
  filters.filter(([, op]) => op === 'array-contains').forEach(([field]) => add(field, { arrayConfig: 'CONTAINS' }));
  sort.forEach(([field, direction]) => add(field, { order: direction === 'desc' ? 'DESCENDING' : 'ASCENDING' }));
  filters.filter(([, op]) => !['==', 'in', 'array-contains'].includes(op)).forEach(([field]) => add(field, { order: sort.at(-1)?.[1] === 'desc' ? 'DESCENDING' : 'ASCENDING' }));
  [...sums].sort().forEach(field => add(field, { order: 'ASCENDING' }));
  return { collectionGroup: collection, queryScope: 'COLLECTION', fields };
}
function choices(fields) {
  return fields.reduce((rows, [key, value]) => rows.flatMap(row => [row, { ...row, [key]: value }]), [{}]);
}
function runtimeQueryShapes() {
  const { businessListOptions } = loadSourceModule('src/utils/businessListQueries.js');
  const { dueFilters, deliveryFilters, exchangeFilters } = loadDataModule('salesQueues');
  const shapes = [];
  function add(collection, options) {
    for (const search of [false, true]) {
      const filters = [...(options.filters || []), ...(search ? [['searchTokens', 'array-contains', 'te']] : [])];
      shapes.push({ collection, options: { ...options, filters } });
    }
  }
  for (const collection of ['customers', 'products', 'inventory', 'purchases', 'sales', 'quotations', 'giftInvoices', 'giftSets', 'brandHierarchies']) {
    const variants = choices(collection === 'customers' ? [['typeFilter', 'retail'], ['catFilter', 'a']] : collection === 'sales'
      ? [['invoiceFilter', 'gst'], ['paymentFilter', 'emi'], ['deliveryFilter', 'scheduled']]
      : collection === 'quotations' ? [['companyFilter', 'c1'], ['invoiceFilter', 'gst']] : []);
    const months = ['giftSets', 'brandHierarchies'].includes(collection) ? [''] : ['', '2026-10'];
    for (const selected of variants) for (const month of months) add(collection, businessListOptions(collection, { ...selected, month }));
  }
  for (const status of ['open', 'in_progress', 'history']) for (const assigneeFilter of ['all', 'employee']) for (const urgencyFilter of ['all', 'overdue', 'due_today']) {
    add('complaints', businessListOptions('complaints', { status, assigneeFilter, urgencyFilter }));
  }
  for (const active of [false, true]) add('sales', { filters: [['paymentType', '==', 'emi'], ...(active ? [['hasPendingEmi', '==', true]] : [])], sort: [[active ? 'nextEmiDueDate' : 'saleDate', active ? 'asc' : 'desc']] });
  for (const tab of ['pending', 'delivered', 'outstanding']) add('sales', { filters: deliveryFilters(tab), sort: [[tab === 'pending' ? 'deliveryDate' : 'actualDeliveryDate', tab === 'pending' ? 'asc' : 'desc']] });
  for (const state of ['pending', 'received']) add('sales', { filters: exchangeFilters(state), sort: [['saleDate', 'desc']] });
  for (const tab of ['overdue', 'today', 'upcoming', 'review']) {
    const filters = dueFilters(tab, '2026-10-28'); add('emiDues', { filters, sort: [['dueDate', 'asc']] });
    add('emiDues', { filters, sums: ['remainingAmount'] });
  }
  add('emiDues', { sums: ['remainingAmount'] });
  add('sales', { filters: [['paymentType', '==', 'emi'], ['hasPendingEmi', '==', true]], sums: ['emiOutstandingAmount', 'grandTotal'] });
  add('sales', { filters: [['paymentType', '==', 'emi']], sums: ['emiOutstandingAmount', 'grandTotal'] });
  shapes.push({ collection: 'sales', options: { filters: [['createdAt', '>=', '2026-10-28']], sums: ['grandTotal'] } });
  add('users', { filters: [['role', '==', 'employee']], sort: [['nameLower', 'asc']] });
  for (const collection of ['customers', 'products', 'users', 'brandHierarchies', 'giftSets', 'checklistTemplates']) {
    add(collection, { sort: [['nameLower', 'asc']] });
  }
  add('checklistTemplates', { sort: [['title', 'asc']] });
  for (const completed of [false, null]) add('checklistInstances', { filters: [['userId', '==', 'u1'], ['date', '==', '2026-10-28'], ...(completed === null ? [] : [['completed', '==', completed]])], sort: [['createdAt', 'asc']] });
  for (const collection of ['reportEmployeePeriods', 'reportProductPeriods']) {
    for (const metric of ['revenue', 'quantity', 'invoiceCount']) add(collection, { filters: [['periodType', '==', 'daily'], ['periodKey', '==', '2026-10-28']], sort: [[metric, 'desc']] });
    shapes.push({ collection, options: { filters: [['periodType', '==', 'daily'], ['periodKey', '>=', '2026-10-01'], ['periodKey', '<=', '2026-10-28']], sort: [['periodKey', 'asc']] } });
    shapes.push({ collection, options: { filters: [['periodType', '==', 'daily'], ['periodKey', '==', '2026-10-28']], sums: ['quantity', 'revenue', 'invoiceCount', 'reconciliationCount', 'undatedInvoiceCount'] } });
  }
  for (const metric of ['revenue', 'quantity', 'invoiceCount']) add('reportJobRows', { filters: [['jobId', '==', 'j1'], ['asOfRevision', '==', 1]], sort: [[metric, 'desc']] });
  shapes.push({ collection: 'reportJobRows', options: { filters: [['jobId', '==', 'j1'], ['asOfRevision', '==', 1]], sums: ['quantity', 'revenue', 'invoiceCount', 'reconciliationCount', 'undatedInvoiceCount'] } });
  for (const dated of [false, true]) add('sales', { filters: [['reportEmployeeKey', '==', 'legacy:test'], ...(dated ? [['saleDate', '>=', '2026-10-01'], ['saleDate', '<=', '2026-10-28']] : [])], sort: [['saleDate', 'desc']] });
  return shapes;
}
function generateIndexes() {
  const indexes = new Map();
  for (const index of [...require('./firestore-existing-indexes.json'), ...require('./firestore-deployed-indexes.json')]) indexes.set(JSON.stringify(index), index);
  for (const { collection, options } of runtimeQueryShapes()) {
    const index = indexForQuery(collection, options);
    if (index.fields.length > 1) indexes.set(JSON.stringify(index), index);
  }
  const values = [...indexes.values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (values.length > 200) throw Error(`Generated ${values.length} indexes exceeds Spark allowance`);
  // Embedded source histories/day maps are never queried by child value.
  const fieldOverrides = [['sales', 'emiInstallments'], ['sales', 'paymentHistory'], ['sales', 'items'], ['attendanceMonths', 'days']]
    .map(([collectionGroup, fieldPath]) => ({ collectionGroup, fieldPath, indexes: [] }));
  return { indexes: values, fieldOverrides };
}
module.exports = { indexForQuery, runtimeQueryShapes, generateIndexes };
if (require.main === module) {
  const config = generateIndexes();
  fs.writeFileSync(path.resolve(__dirname, '..', 'firestore.indexes.json'), `${JSON.stringify(config, null, 2)}\n`);
  process.stdout.write(`Prepared ${config.indexes.length} composite indexes; no deployment performed.\n`);
}
