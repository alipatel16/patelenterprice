import { normalizeSearch, withSearchFields } from './search';

export const PROJECTION_VERSION = 2;
export const REPORT_METRICS = ['quantity', 'revenue', 'invoiceCount', 'reconciliationCount', 'undatedInvoiceCount'];
export const roundMoney = value => Math.round((value + Number.EPSILON) * 100) / 100;
export function numeric(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export const projectionId = (...parts) => parts.map(part => encodeURIComponent(String(part))).join('_');
const money = value => { const result = numeric(value); return result === null ? null : roundMoney(result); };
const sum = values => roundMoney(values.reduce((total, value) => total + value, 0));
const employeeReportingKey = sale => sale.salespersonId ? `user:${sale.salespersonId}`
  : `legacy:${normalizeSearch(sale.salesperson) || 'unmatched'}`;

function analyzeSale(sale) {
  const issues = [], financialWarnings = [];
  const warn = issue => { financialWarnings.push(issue); issues.push(issue); };
  const total = money(sale.grandTotal), down = money(sale.downPayment ?? 0), storedPaid = money(sale.totalPaidAmount ?? 0);
  if (!validDate(sale.saleDate)) issues.push('invalid-sale-date');
  if (total === null) warn('invalid-grand-total');
  if (down === null) warn('invalid-down-payment');
  if (storedPaid === null) warn('invalid-paid-total');
  const isEmi = sale.paymentType === 'emi';
  const installments = isEmi && Array.isArray(sale.emiInstallments) ? sale.emiInstallments : [];
  const seen = new Set();
  const rows = installments.map(inst => {
    const number = inst.installmentNumber;
    if (!Number.isInteger(number) || number < 1 || seen.has(number)) throw new Error('Every installment needs a unique positive installmentNumber');
    seen.add(number);
    const prefix = `installment-${number}`;
    const amount = money(inst.amount);
    const receipts = Array.isArray(inst.payments) ? inst.payments.map(payment => money(payment.amount)) : [];
    const historyPaid = receipts.some(value => value === null) ? null : sum(receipts);
    const baseline = inst.paidAmountBaseline === undefined ? 0 : money(inst.paidAmountBaseline);
    const paid = money(inst.paidAmount ?? (historyPaid !== null && baseline !== null ? sum([baseline, historyPaid]) : null));
    if (amount === null) warn(`${prefix}-invalid-amount`);
    if (paid === null) warn(`${prefix}-invalid-paid-amount`);
    if (historyPaid === null) warn(`${prefix}-invalid-payment-history`);
    if (baseline === null) warn(`${prefix}-invalid-paid-baseline`);
    if ((receipts.length || inst.paidAmountBaseline !== undefined) && paid !== null && historyPaid !== null && baseline !== null && Math.abs(paid - sum([baseline, historyPaid])) > 0.009) warn(`${prefix}-payment-history-mismatch`);
    if (amount !== null && paid !== null && paid > amount) warn(`${prefix}-overpaid`);
    if (inst.status === 'paid' && amount !== null && paid !== null && paid < amount) warn(`${prefix}-paid-status-mismatch`);
    const dueDate = validDate(inst.dueDate) ? inst.dueDate : null;
    if (!dueDate) issues.push(`${prefix}-invalid-due-date`);
    return { installmentNumber: number, dueDate, amount, paidAmount: paid, dueDateChangeCount: inst.dueDateChangeCount ?? 0,
      remainingAmount: amount === null || paid === null ? null : roundMoney(Math.max(0, amount - paid)) };
  });
  if (isEmi) {
    if (!rows.length) warn('missing-emi-schedule');
    if (total !== null && down !== null && rows.every(row => row.amount !== null) &&
      Math.abs(sum(rows.map(row => row.amount)) + down - total) > 0.009) warn('emi-principal-mismatch');
    if (storedPaid !== null && down !== null && rows.every(row => row.paidAmount !== null) &&
      Math.abs(sum(rows.map(row => row.paidAmount)) + down - storedPaid) > 0.009) warn('emi-paid-total-mismatch');
  }
  const unpaid = rows.filter(row => row.remainingAmount === null || row.remainingAmount > 0);
  const emiOutstanding = unpaid.some(row => row.remainingAmount === null) ? null : sum(unpaid.map(row => row.remainingAmount));
  const isPaid = normalizeSearch(sale.paymentStatus) === 'paid' ||
    (sale.paymentType === 'full_payment' && !['unpaid', 'partial'].includes(normalizeSearch(sale.paymentStatus)));
  const outstanding = isEmi ? (rows.length ? emiOutstanding : null) : isPaid ? 0 :
    total === null || storedPaid === null ? null : roundMoney(Math.max(0, total - storedPaid));
  const deliveredStatus = normalizeSearch(sale.deliveryStatus);
  const delivered = sale.isDelivered === true || sale.isDelivered === 'true' ||
    ['delivered', 'completed'].includes(deliveredStatus) || (deliveredStatus !== 'pending' && Boolean(sale.actualDeliveryDate));
  const state = {
    reportEmployeeKey: employeeReportingKey(sale),
    hasPendingEmi: isEmi && (unpaid.length > 0 || !rows.length),
    emiOutstandingAmount: isEmi ? (rows.length ? emiOutstanding : null) : 0,
    emiRemainingInstallmentCount: unpaid.length,
    nextEmiDueDate: unpaid.map(row => row.dueDate).filter(Boolean).sort()[0] || null,
    hasOutstandingPayment: outstanding === null || outstanding > 0,
    outstandingPaymentAmount: outstanding,
    deliveryState: sale.deliveryType === 'scheduled' ? (delivered ? 'delivered' : 'pending') : 'immediate',
    exchangeState: !sale.hasExchange ? 'none' : sale.exchangeReceived === true ? 'received' : 'pending',
    financialWarnings: [...new Set(financialWarnings)], financialReconciliationRequired: financialWarnings.length > 0,
    reconciliationIssues: [...new Set(issues)], needsReconciliation: issues.length > 0,
  };
  return { state, unpaid };
}
export function deriveSaleState(sale = {}) { return analyzeSale(sale).state; }
export function deriveComplaintState(complaint = {}) {
  const valid = validDate(complaint.expectedResolutionDate);
  const missing = complaint.expectedResolutionDate === undefined || complaint.expectedResolutionDate === null || complaint.expectedResolutionDate === '';
  return { complaintDueDate: valid ? complaint.expectedResolutionDate : '9999-12-31',
    complaintDateIssues: !valid && !missing ? ['invalid-expected-resolution-date'] : [] };
}
export function buildEmiDueDocuments(saleId, sale) {
  if (!sale) return [];
  const { state, unpaid } = analyzeSale(sale);
  return unpaid.map(row => ({ collection: 'emiDues', id: projectionId(saleId, row.installmentNumber),
    data: withSearchFields('emiDues', { ...row, saleId, schemaVersion: PROJECTION_VERSION,
      emiMonths: sale.emiMonths ?? sale.emiInstallments.length,
      sourceRevision: sale._writeRevision || 0, invoiceNumber: sale.invoiceNumber || '', companyId: sale.companyId || '',
      companyName: sale.companyName || '', customerId: sale.customerId || '', customerName: sale.customerName || '',
      customerPhone: sale.customerPhone || '', saleDate: validDate(sale.saleDate) ? sale.saleDate : null,
      financialWarnings: state.financialWarnings, financialReconciliationRequired: state.financialReconciliationRequired,
      reconciliationIssues: state.reconciliationIssues, needsReconciliation: state.needsReconciliation }) }));
}

export function buildReportContributions(saleId, sale) {
  if (!sale) return [];
  const state = deriveSaleState(sale);
  const dated = validDate(sale.saleDate);
  const periods = [...(dated ? [['daily', sale.saleDate], ['monthly', sale.saleDate.slice(0, 7)]] : []), ['lifetime', 'all']];
  const groups = new Map();
  let totalQuantity = 0, invalidItems = false;
  for (const item of sale.items || []) {
    const quantity = numeric(item.qty), price = money(item.price);
    const invalid = quantity === null || price === null || !item.productId;
    invalidItems = invalidItems || invalid;
    totalQuantity += quantity ?? 0;
    const key = item.productId ? `product:${item.productId}` : `legacy:${normalizeSearch(item.productName) || 'unmatched'}`;
    const group = groups.get(key) || { dimensionKey: key, productId: item.productId || null,
      productName: item.productName || 'Unmatched product', quantity: 0, revenue: 0, invalid: false };
    group.quantity += quantity ?? 0;
    group.revenue = roundMoney(group.revenue + (quantity !== null && price !== null ? quantity * price : 0));
    group.invalid = group.invalid || invalid;
    groups.set(key, group);
  }
  const employeeKey = state.reportEmployeeKey;
  const dimensions = [...groups.values()].map(group => ({ collection: 'reportProductPeriods', ...group }));
  dimensions.push({ collection: 'reportEmployeePeriods', dimensionKey: employeeKey, employeeKey,
    employeeId: sale.salespersonId || null, employeeName: sale.salesperson || 'Other / Direct',
    quantity: totalQuantity, revenue: money(sale.grandTotal) ?? 0, invalid: invalidItems || money(sale.grandTotal) === null });
  return dimensions.flatMap(({ collection, invalid, ...dimension }) => periods.map(([periodType, periodKey]) => ({
    collection, id: projectionId(periodType, periodKey, dimension.dimensionKey), data: withSearchFields(collection, {
      ...dimension, periodType, periodKey, schemaVersion: PROJECTION_VERSION, invoiceCount: 1,
      reconciliationCount: invalid || state.needsReconciliation ? 1 : 0, undatedInvoiceCount: dated ? 0 : 1,
    }),
  })));
}
