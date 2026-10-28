import { fetchPage, fetchAggregate } from './query';

export const REPORT_METRICS = ['quantity', 'revenue', 'invoiceCount', 'reconciliationCount', 'undatedInvoiceCount'];
export const reportTotals = rows => Object.fromEntries(REPORT_METRICS.map(key => [key, rows.reduce((n, row) => n + (Number(row[key]) || 0), 0)]));
export function periodQuery(dimension, { periodType, periodKey, search = '', metric = 'revenue' }) {
  if (!['employee', 'product'].includes(dimension) || !['daily', 'monthly', 'lifetime'].includes(periodType) || !['revenue', 'quantity', 'invoiceCount'].includes(metric)) throw new Error('Invalid report period');
  return { collectionName: dimension === 'employee' ? 'reportEmployeePeriods' : 'reportProductPeriods', options: { search, filters: [['periodType', '==', periodType], ['periodKey', '==', periodKey]], sort: [[metric, 'desc']], pageSize: 15, requireReady: true } };
}
export function fetchPeriodReport(db, dimension, period, cursor = null) {
  const { collectionName, options } = periodQuery(dimension, period);
  return fetchPage(db, collectionName, { ...options, cursor });
}
export function fetchReportTotals(db, collectionName, filters, requireReady = true) {
  return fetchAggregate(db, collectionName, { filters, requireReady, aggregates: Object.fromEntries(REPORT_METRICS.map(field => [field, { op: 'sum', field }])) });
}
export function mergeProductPage(products, movements, inventory = {}) {
  return products.map(product => {
    const movement = movements.find(row => row.productId === product.id);
    return { ...Object.fromEntries(REPORT_METRICS.map(k => [k, 0])), ...movement, productId: product.id, productName: product.name || movement?.productName || '—', stock: (typeof inventory[product.id] === 'number' ? inventory[product.id] : inventory[product.id]?.stock) ?? 0, purchasedQty: inventory[product.id]?.purchasedQty ?? 0 };
  });
}
