import { Timestamp } from 'firebase/firestore';

export const indiaDate = (date = new Date()) => new Date(date.getTime() + 330 * 60000).toISOString().slice(0, 10);
const plusDays = (day, count) => new Date(Date.parse(`${day}T00:00:00Z`) + count * 86400000).toISOString().slice(0, 10);
export function complaintUrgency(row, today = indiaDate()) {
  if (row.status === 'resolved' || row.status === 'closed') return 'normal';
  const due = row.complaintDueDate || row.expectedResolutionDate || '9999-12-31';
  if (due < today) return 'overdue';
  if (due === today) return 'due_today';
  return due <= plusDays(today, 4) ? 'due_soon' : 'normal';
}
export function complaintFilters(status, assignee = 'all', urgency = 'all', today = indiaDate()) {
  const filters = [['status', status === 'history' ? 'in' : '==', status === 'history' ? ['resolved', 'closed'] : status]];
  if (assignee !== 'all') filters.push(['assigneeType', '==', assignee]);
  if (urgency === 'overdue') filters.push(['complaintDueDate', '<', today]);
  if (urgency === 'due_today') filters.push(['complaintDueDate', '==', today]);
  if (urgency === 'due_soon') filters.push(['complaintDueDate', '>', today], ['complaintDueDate', '<=', plusDays(today, 4)]);
  if (urgency === 'normal') filters.push(['complaintDueDate', '>', plusDays(today, 4)]);
  return filters;
}

// Every predicate is serialized for the common transport, before its page limit.
export function businessListOptions(name, { search = '', month = '', dateFrom = '', dateTo = '', typeFilter = 'all', catFilter = 'all', companyFilter = 'all', invoiceFilter = 'all', paymentFilter = 'all', deliveryFilter = 'all', status = 'open', assigneeFilter = 'all', urgencyFilter = 'all' } = {}) {
  const filters = [];
  let sort = [['createdAt', 'desc']];
  if (name === 'customers' || name === 'products') sort = [['nameLower', 'asc']];
  if (name === 'inventory') sort = [['productName', 'asc']];
  if (name === 'brandHierarchies') sort = [['brandName', 'asc']];
  if (name === 'customers') {
    if (typeFilter !== 'all') filters.push(['customerType', '==', typeFilter]);
    if (catFilter !== 'all') filters.push(['category', '==', catFilter]);
  }
  if (name === 'quotations' || name === 'sales') {
    for (const [field, value] of [['companyId', companyFilter], ['invoiceType', invoiceFilter]]) if (value !== 'all') filters.push([field, '==', value]);
  }
  if (name === 'sales') {
    for (const [field, value] of [['paymentType', paymentFilter], ['deliveryType', deliveryFilter]]) if (value !== 'all') filters.push([field, '==', value]);
    if (dateFrom) filters.push(['saleDate', '>=', dateFrom]);
    if (dateTo) filters.push(['saleDate', '<=', dateTo]);
    if (dateFrom || dateTo) sort = [['saleDate', 'desc']];
  }
  if (month) {
    const [year, number] = month.split('-').map(Number);
    const end = `${month}-${new Date(year, number, 0).getDate()}`;
    const field = name === 'giftInvoices' ? 'date' : name === 'sales' ? 'saleDate' : 'createdAt';
    const startValue = field === 'createdAt' ? Timestamp.fromDate(new Date(`${month}-01T00:00:00+05:30`)) : `${month}-01`;
    const endValue = field === 'createdAt' ? Timestamp.fromDate(new Date(`${end}T23:59:59.999+05:30`)) : end;
    filters.push([field, '>=', startValue], [field, '<=', endValue]);
    sort = [[field, 'desc']];
  }
  if (name === 'complaints') {
    filters.push(...complaintFilters(status, assigneeFilter, urgencyFilter));
    sort = status === 'history' ? [['createdAt', 'desc']] : [['complaintDueDate', 'asc'], ['createdAt', 'desc']];
  }
  return { search, filters, sort, pageSize: 15 };
}
