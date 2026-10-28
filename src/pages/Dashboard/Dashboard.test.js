import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import Dashboard from './Dashboard';
import { useAuth } from '../../contexts/AuthContext';
import { loadDashboard } from '../../data/dashboard';
import { subscribeInvalidation } from '../../data/query';

jest.mock('../../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../data/dashboard', () => ({ loadDashboard: jest.fn(), dashboardDate: (now = new Date(), days = 0) => new Date(new Date(now).getTime() + 330 * 60000 + days * 86400000).toISOString().slice(0, 10) }));
jest.mock('../../data/query', () => ({ subscribeInvalidation: jest.fn(() => () => {}), invalidateCollections: jest.fn() }));
jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn() }));
jest.mock('recharts', () => ({
  BarChart: () => null, Bar: () => null, XAxis: () => null, YAxis: () => null,
  CartesianGrid: () => null, Tooltip: () => null, ResponsiveContainer: () => null,
}));
let host, root, auth;
const data = { stats: { totalSales: 100, todaySales: 100, invoiceCount: 1, totalCustomers: 2, totalProducts: 3, totalPurchases: 4, pendingSales: 0 }, chartData: [], refreshedAt: new Date('2026-11-01T00:00:00Z') };
const render = async () => { await act(async () => root.render(<Dashboard />)); };
const button = text => [...host.querySelectorAll('button')].find(node => node.textContent === text);
const click = async text => { await act(async () => button(text).click()); };
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true; jest.clearAllMocks();
  auth = { db: {}, storeType: 'electronics', userProfile: { name: 'Ali' } };
  useAuth.mockImplementation(() => auth); loadDashboard.mockResolvedValue(data);
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

test('Today is selected before Load; date controls never automatically read, even after loading', async () => {
  await render();
  expect(button('Today')?.getAttribute('aria-pressed')).toBe('true');
  expect(loadDashboard).not.toHaveBeenCalled();
  await click('Load Dashboard Stats');
  expect(loadDashboard.mock.calls[0][1]).toMatchObject({ range: 'daily' });
  expect(host.textContent).toMatch(/Last refreshed/);
  await click('This Month'); expect(loadDashboard).toHaveBeenCalledTimes(1);
  expect(host.textContent).not.toMatch(/Last refreshed/);
  await click('Load Dashboard Stats');
  expect(loadDashboard.mock.calls[1][1]).toMatchObject({ range: 'monthly' });
  await click('Custom');
  expect(loadDashboard).toHaveBeenCalledTimes(2);
});

test('store changes reset Today and discard an outstanding old-store response', async () => {
  let resolve; loadDashboard.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  await render(); await click('This Month'); await click('Load Dashboard Stats');
  auth = { ...auth, db: {}, storeType: 'furniture' }; await render();
  expect(button('Today').getAttribute('aria-pressed')).toBe('true');
  await act(async () => resolve(data));
  expect(host.textContent).not.toMatch(/Last refreshed/);
  expect(loadDashboard).toHaveBeenCalledTimes(1);
});

test('an aggregate failure is visible and Load permits retry', async () => {
  loadDashboard.mockRejectedValueOnce(new Error('Missing index: create the sales index'));
  await render(); await click('Load Dashboard Stats');
  expect(host.querySelector('[role="alert"]').textContent).toContain('Missing index');
  expect(button('Load Dashboard Stats').disabled).toBe(false);
  await click('Load Dashboard Stats');
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(host.textContent).toMatch(/Last refreshed/);
});

test('relevant invalidation hides loaded statistics and rejects late data without an automatic read', async () => {
  await render(); await click('Load Dashboard Stats');
  const notify = subscribeInvalidation.mock.calls.at(-1)[1];
  await act(async () => notify(['products']));
  expect(host.textContent).not.toMatch(/Last refreshed/); expect(loadDashboard).toHaveBeenCalledTimes(1);
  let resolve; loadDashboard.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  await click('Load Dashboard Stats');
  await act(async () => notify(null));
  await act(async () => resolve(data));
  expect(host.textContent).not.toMatch(/Last refreshed/);
  expect(button('Today').getAttribute('aria-pressed')).toBe('true');
});

test('editing custom dates discards an outstanding response and waits for another Load', async () => {
  let resolve; loadDashboard.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  await render(); await click('Custom'); await click('Load Dashboard Stats');
  const from = host.querySelector('input[type="date"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(from, '2026-10-28');
    from.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => resolve(data));
  expect(host.textContent).not.toMatch(/Last refreshed/);
  expect(loadDashboard).toHaveBeenCalledTimes(1);
  await click('Load Dashboard Stats');
  expect(loadDashboard.mock.calls[1][1]).toMatchObject({ range: 'custom', start: '2026-10-28' });
});

test('an unrelated collection write retains loaded results without extra requests', async () => {
  await render(); await click('Load Dashboard Stats');
  await act(async () => subscribeInvalidation.mock.calls.at(-1)[1](['quotations']));
  expect(host.textContent).toMatch(/Last refreshed/);
  expect(loadDashboard).toHaveBeenCalledTimes(1);
});

test('India midnight expires Today display without automatically reading', async () => {
  jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-31T18:29:59Z'));
  try {
    await render(); await click('Load Dashboard Stats');
    expect(host.textContent).toMatch(/Last refreshed/);
    await act(async () => jest.advanceTimersByTime(1000));
    expect(host.textContent).not.toMatch(/Last refreshed/);
    expect(loadDashboard).toHaveBeenCalledTimes(1);
  } finally { jest.useRealTimers(); }
});
