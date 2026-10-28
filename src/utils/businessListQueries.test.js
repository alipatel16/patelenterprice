import fs from 'fs';
import path from 'path';
import { businessListOptions, complaintFilters, indiaDate } from './businessListQueries';
import { fetchPage } from '../data/query';
import { buildSearchTokens, normalizeSearch } from '../data/search';
import { getDocs, getDoc, getCountFromServer, query } from 'firebase/firestore';
jest.mock('firebase/firestore', () => ({
  collection: (db, name) => ({ db, name }), doc: (db, name, id) => ({ db, name, id }),
  query: jest.fn((ref, ...constraints) => ({ ...ref, constraints })), where: (...args) => ({ type: 'where', args }),
  orderBy: (...args) => ({ type: 'orderBy', args }), limit: n => ({ type: 'limit', n }), startAfter: value => ({ type: 'cursor', value }),
  Timestamp: { fromDate: date => date.getTime() }, getDocs: jest.fn(), getDoc: jest.fn(), getCountFromServer: jest.fn(),
}));
const names = ['customers', 'products', 'purchases', 'inventory', 'sales', 'quotations', 'giftInvoices', 'giftSets', 'brandHierarchies', 'complaints'];
beforeEach(() => {
  jest.clearAllMocks();
  query.mockImplementation((ref, ...constraints) => ({ ...ref, constraints }));
  getDoc.mockResolvedValue({ exists: () => true, data: () => ({ version: 2, readyCollections: names }) });
  getCountFromServer.mockResolvedValue({ data: () => ({ count: 1 }) });
  getDocs.mockImplementation(async request => {
    let rows = Array.from({ length: 400 }, (_, i) => ({ id: String(i), createdAt: Date.parse('2026-10-10'), saleDate: '2026-10-10', date: '2026-10-10', companyId: i === 399 ? 'selected' : 'other', invoiceType: 'gst', searchTokens: i === 399 ? ['historic', '4321'] : ['recent'] }));
    for (const c of request.constraints) {
      if (c.type === 'where') { const [f, op, v] = c.args; rows = rows.filter(r => op === 'array-contains' ? r[f].includes(v) : op === '>=' ? r[f] >= v : op === '<=' ? r[f] <= v : r[f] === v); }
      if (c.type === 'limit') rows = rows.slice(0, c.n);
    }
    return { docs: rows.map(r => ({ id: r.id, data: () => r })) };
  });
});
test.each(names.filter(n => n !== 'complaints'))('%s finds historical records before limiting and never returns a month bulk array', async name => {
  const options = businessListOptions(name, { search: 'historic', month: '2026-10', companyFilter: 'selected', invoiceFilter: 'gst' });
  const result = await fetchPage({}, name, options);
  expect(result.rows.map(r => r.id)).toEqual(['399']);
  const constraints = getDocs.mock.calls[0][0].constraints;
  expect(constraints.at(-1)).toEqual({ type: 'limit', n: 15 });
  expect(constraints.filter(c => c.type === 'where').map(c => c.args)).toContainEqual(['searchTokens', 'array-contains', 'historic']);
  const browse = await fetchPage({}, name, businessListOptions(name, { month: '2026-10' }));
  expect(browse.rows).toHaveLength(15);
});
test('one character makes no transport and sales date/company/payment predicates are preserved', async () => {
  await fetchPage({}, 'sales', businessListOptions('sales', { search: 'x' }));
  expect(getDocs).not.toHaveBeenCalled();
  const options = businessListOptions('sales', { search: '4321', dateFrom: '2026-10-01', dateTo: '2026-10-31', paymentFilter: 'emi', deliveryFilter: 'scheduled', invoiceFilter: 'gst' });
  expect(options.filters).toEqual(expect.arrayContaining([['saleDate', '>=', '2026-10-01'], ['saleDate', '<=', '2026-10-31'], ['paymentType', '==', 'emi'], ['deliveryType', '==', 'scheduled'], ['invoiceType', '==', 'gst']]));
});
test('complaint urgency uses India day boundaries and normalized due date server predicates', () => {
  const today = indiaDate(new Date('2026-10-27T19:00:00Z'));
  expect(today).toBe('2026-10-28');
  expect(complaintFilters('open', 'internal', 'due_soon', today)).toEqual([['status', '==', 'open'], ['assigneeType', '==', 'internal'], ['complaintDueDate', '>', '2026-10-28'], ['complaintDueDate', '<=', '2026-11-01']]);
  expect(complaintFilters('in_progress', 'all', 'normal', today)).toContainEqual(['complaintDueDate', '>', '2026-11-01']);
});
test.each(['Customers/CustomerList.js','Products/ProductList.js','Purchase/PurchaseList.js','Inventory/Inventory.js','Sales/SalesList.js','Quotations/QuotationsList.js','Gifts/GiftInvoiceList.js','Gifts/GiftSetList.js','Complaints/BrandHierarchyList.js','Complaints/ComplaintList.js'])('%s delegates list reads to bounded shared hook', file => {
  const source = fs.readFileSync(path.join(__dirname, '../pages', file), 'utf8');
  expect(source).toContain('usePagedCollection');
  expect(source).not.toMatch(/getDocs\s*\(/);
});
test.each(['Sales/CreateSale.js', 'Complaints/CreateComplaint.js', 'Gifts/CreateGiftInvoice.js'])('%s uses bounded selectors without eager lookup scans', file => {
  const source = fs.readFileSync(path.join(__dirname, '../pages', file), 'utf8');
  expect(source).not.toMatch(/getDocs\s*\(/);
  expect(source).not.toContain('getOrFetch');
});
test('complaint display urgency uses the same India date and normalized missing-date sentinel as its query', () => {
  const { complaintUrgency } = require('./businessListQueries');
  expect(complaintUrgency({ status: 'open', complaintDueDate: '2026-10-27' }, '2026-10-28')).toBe('overdue');
  expect(complaintUrgency({ status: 'open', complaintDueDate: '2026-10-28' }, '2026-10-28')).toBe('due_today');
  expect(complaintUrgency({ status: 'open', complaintDueDate: '2026-11-01' }, '2026-10-28')).toBe('due_soon');
  expect(complaintUrgency({ status: 'open', complaintDueDate: '9999-12-31' }, '2026-10-28')).toBe('normal');
  expect(complaintUrgency({ status: 'closed', complaintDueDate: '2026-10-27' }, '2026-10-28')).toBe('normal');
});

test.each([
  ['customers', {}], ['products', {}],
  ['complaints', { status: 'open' }], ['complaints', { status: 'in_progress' }],
])('%s browse rejects unready migration fields before constructing a collection query', async (name, state) => {
  getDoc.mockResolvedValue({ exists: () => true, data: () => ({ version: 2, readyCollections: [] }) });
  await expect(fetchPage({}, name, businessListOptions(name, state))).rejects.toMatchObject({ code: 'data-access/not-ready' });
  expect(query).not.toHaveBeenCalled();
  expect(getDocs).not.toHaveBeenCalled();
  expect(getCountFromServer).not.toHaveBeenCalled();
});
test('quotation search finds the actual saved quoteNumber schema beyond the first synthetic page', async () => {
  const term = normalizeSearch('QT-PE-2026-0042');
  getDocs.mockImplementation(async request => {
    let rows = Array.from({ length: 400 }, (_, i) => {
      const source = { quoteNumber: i === 399 ? 'QT-PE-2026-0042' : `QT-OTHER-${i}`, customerName: 'Synthetic Customer', createdAt: i };
      return { id: String(i), ...source, searchTokens: buildSearchTokens('quotations', source) };
    });
    for (const constraint of request.constraints) {
      if (constraint.type === 'where') {
        const [field, operator, value] = constraint.args;
        if (operator === 'array-contains') rows = rows.filter(row => row[field].includes(value));
      }
      if (constraint.type === 'limit') rows = rows.slice(0, constraint.n);
    }
    return { docs: rows.map(row => ({ id: row.id, data: () => row })) };
  });
  const result = await fetchPage({}, 'quotations', businessListOptions('quotations', { search: term }));
  expect(result.rows.map(row => row.id)).toEqual(['399']);
});
