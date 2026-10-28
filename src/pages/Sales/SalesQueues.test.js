import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { recordSalePayment, rescheduleEmi } from '../../data/payments';
import EmiList from './EmiList';
import EmiDues from './EmiDues';
import DeliveryTracking from './DeliveryTracking';
import ExchangeTracking from './ExchangeTracking';
import SaleDetail from './SaleDetail';
import usePagedCollection from '../../hooks/usePagedCollection';
import { getKnownDocument } from '../../data/query';
import { updateRecord } from '../../data/writes';
jest.mock('../../contexts/AuthContext', () => { const db = {}; return { useAuth: () => ({ db, isAdmin: true, user: { email: 'staff@example.test' } }) }; });
jest.mock('react-router-dom', () => { const navigate = jest.fn(); return { useNavigate: () => navigate, useParams: () => ({ id: 's1' }) }; });
jest.mock('../../hooks/usePagedCollection', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../hooks/useSalesQueue', () => ({ useIndiaDay: () => '2026-10-28', useQueueTotals: () => ({ data: { all: { count: 100, amount: 10000 }, overdue: { count: 36, amount: 3600 }, today: { count: 20, amount: 2000 }, upcoming: { count: 18, amount: 1800 }, sales: { count: 40, pending: 8000, grand: 40000 } } }) }));
jest.mock('../../data/query', () => ({ getKnownDocument: jest.fn() }));
jest.mock('../../data/writes', () => ({ updateRecord: jest.fn() }));
jest.mock('../../data/payments', () => ({ ...jest.requireActual('../../data/payments'), recordSalePayment: jest.fn(), rescheduleEmi: jest.fn() }));
let root, host;
const view = () => ({ rows: [], total: 40, loading: false, error: null, page: 0, hasNext: true, setPage: jest.fn(), next: jest.fn(), previous: jest.fn(), refresh: jest.fn() });
const render = async element => act(async () => root.render(element));
const click = async text => { const element = [...host.querySelectorAll('button')].find(node => node.textContent === text); expect(element).toBeTruthy(); await act(async () => element.click()); };
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; jest.clearAllMocks(); host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); usePagedCollection.mockImplementation(view); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
it('loads only the active direct EMI dues tab with complete aggregate counts', async () => {
  await render(<EmiDues />);
  expect(usePagedCollection.mock.calls.every(([, name, options]) => name === 'emiDues' && options.filters[0][1] === '<' && options.requireReady && options.pageSize === 15)).toBe(true);
  expect(host.textContent).toContain('10,000'); expect(host.textContent).toContain('36'); expect(host.textContent).toContain('20'); expect(host.textContent).toContain('18');
  usePagedCollection.mockClear(); await click('Due Today');
  expect(usePagedCollection.mock.calls.every(([, name, options]) => name === 'emiDues' && options.filters[0][1] === '==')).toBe(true);
});
it('switches EMI active and all filters before requesting server pages', async () => {
  await render(<EmiList />); expect(usePagedCollection.mock.calls.at(-1)[2].sort).toEqual([['nextEmiDueDate', 'asc']]); expect(usePagedCollection.mock.calls.at(-1)[2].filters).toContainEqual(['hasPendingEmi', '==', true]);
  await click('All EMI'); expect(usePagedCollection.mock.calls.at(-1)[2].sort).toEqual([['saleDate', 'desc']]); expect(usePagedCollection.mock.calls.at(-1)[2].filters).toEqual([['paymentType', '==', 'emi']]);
});
it('mounts delivery history and outstanding payment queues only on demand', async () => {
  await render(<DeliveryTracking />); expect(usePagedCollection.mock.calls.at(-1)[2].filters).toEqual([['deliveryState', '==', 'pending']]);
  usePagedCollection.mockClear(); await click('Delivered · Payment Pending');
  expect(usePagedCollection.mock.calls.every(([, , options]) => options.filters.some(f => f[0] === 'hasOutstandingPayment' && f[2] === true))).toBe(true);
  usePagedCollection.mockClear(); await click('Delivered'); expect(usePagedCollection.mock.calls.at(-1)[2].filters).toEqual([['deliveryState', '==', 'delivered']]);
});
it('mounts only the active exchange state without a client record cap', async () => {
  await render(<ExchangeTracking />); expect(usePagedCollection.mock.calls.at(-1)[2]).toMatchObject({ filters: [['exchangeState', '==', 'pending']], pageSize: 15, requireReady: true });
  usePagedCollection.mockClear(); await click('Received'); expect(usePagedCollection.mock.calls.every(([, , options]) => options.filters[0][2] === 'received')).toBe(true);
});
it('opens legacy EMI detail without write-on-read migration', async () => {
  getKnownDocument.mockResolvedValue({ id: 's1', invoiceNumber: 'OLD-1', paymentType: 'emi', grandTotal: 1000, saleDate: '2024-01-01', items: [] });
  await render(<SaleDetail />);
  expect(host.textContent).toContain('OLD-1'); expect(updateRecord).not.toHaveBeenCalled();
  expect(getKnownDocument.mock.calls.map(([, name]) => name)).toEqual(['sales']);
});

it('retains the submitted receipt identity after an acknowledgement failure and reuses loaded customer data', async () => {
  const sale = { id: 's1', invoiceNumber: 'LATER-1', customerId: 'c1', paymentType: 'pending_payment', grandTotal: 1000, totalPaidAmount: 0, saleDate: '2026-10-27', items: [] };
  getKnownDocument.mockImplementation(async (_, name) => name === 'sales' ? sale : { id: 'c1', name: 'Mina Patel', address: 'Test address' });
  recordSalePayment.mockRejectedValueOnce(new Error('Acknowledgement unavailable')).mockResolvedValueOnce({ ...sale, totalPaidAmount: 100, salePayments: [{ amount: 100, payDate: '2026-10-28', mode: 'Cash' }] });
  await render(<SaleDetail />); await click('Payment Info'); await click('Record Payment');
  const input = document.body.querySelector('input[type="number"]');
  await act(async () => Simulate.change(input, { target: { value: '100' } }));
  const submit = () => [...document.body.querySelectorAll('[role="dialog"] button')].find(node => node.textContent === 'Record Payment');
  await act(async () => submit().click());
  expect(document.body.textContent).toContain('Acknowledgement unavailable');
  const operationId = recordSalePayment.mock.calls[0][3]; expect(operationId).toBeTruthy();
  await act(async () => submit().click());
  expect(recordSalePayment.mock.calls[1][3]).toBe(operationId);
  expect(getKnownDocument.mock.calls.map(([, name]) => name)).toEqual(['sales', 'customers']);
});

it('renders a populated pending exchange queue', async () => {
  usePagedCollection.mockImplementation(() => ({ ...view(), rows: [{ id: 'x1', invoiceNumber: 'EX-1', exchangeItem: 'Chair', saleDate: '2026-10-01' }] }));
  await render(<ExchangeTracking />);
  expect(host.textContent).toContain('EX-1'); expect(host.textContent).toContain('Chair');
});

it('reschedules separate installments with distinct action identities and retains failed retry identity', async () => {
  const sale = { id: 's1', invoiceNumber: 'EMI-1', paymentType: 'emi', grandTotal: 800, totalPaidAmount: 0, saleDate: '2026-10-01', items: [], emiInstallments: [1, 2].map(installmentNumber => ({ installmentNumber, amount: 400, paidAmount: 0, dueDate: '2026-11-01', payments: [] })) };
  getKnownDocument.mockResolvedValue(sale);
  rescheduleEmi.mockRejectedValueOnce(new Error('Retry needed')).mockResolvedValue(sale);
  await render(<SaleDetail />); await click('Payment & EMI');
  const open = async index => { const buttons = [...host.querySelectorAll('button')].filter(b => b.querySelector('[data-testid="CalendarMonthIcon"]')); await act(async () => buttons[index].click()); };
  const fillAndSubmit = async () => { const dialog = document.body.querySelector('[role="dialog"]'); await act(async () => { Simulate.change(dialog.querySelector('input[type="date"]'), { target: { value: '2026-12-01' } }); Simulate.change(dialog.querySelector('textarea'), { target: { value: 'Customer request' } }); }); await act(async () => [...dialog.querySelectorAll('button')].find(b => b.textContent === 'Change Date').click()); };
  await open(0); await fillAndSubmit(); expect(document.body.textContent).toContain('Retry needed');
  const firstId = rescheduleEmi.mock.calls[0][5];
  await act(async () => [...document.body.querySelectorAll('[role="dialog"] button')].find(b => b.textContent === 'Change Date').click());
  expect(rescheduleEmi.mock.calls[1][5]).toBe(firstId);
  await open(1); await fillAndSubmit();
  expect(rescheduleEmi.mock.calls[2][2]).toBe(2); expect(rescheduleEmi.mock.calls[2][5]).not.toBe(firstId);
});
