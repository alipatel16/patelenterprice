import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useIndiaDay, useQueueTotals } from './useSalesQueue';
import { fetchAggregate, subscribeInvalidation } from '../data/query';
jest.mock('../data/query', () => ({ fetchAggregate: jest.fn(), queryKey: value => JSON.stringify(value), subscribeInvalidation: jest.fn(() => () => {}) }));
let host, root, observed;
const db = {}, plans = [{ name: 'overdue', filters: [['dueDate', '<', '2026-10-28']], sums: { amount: 'remainingAmount' } }];
function Probe({ search = '' }) { const day = useIndiaDay(); observed = useQueueTotals(db, 'emiDues', plans, search); return <div>{day}:{observed.data?.overdue.amount ?? ''}</div>; }
const render = async props => act(async () => root.render(<Probe {...props} />));
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-28T18:29:59Z')); jest.clearAllMocks(); host = document.createElement('div'); root = createRoot(host); fetchAggregate.mockImplementation(async (_, __, options) => options.aggregates ? { amount: 3600 } : { count: 36 }); });
afterEach(() => { act(() => root.unmount()); jest.useRealTimers(); });
it('refreshes India day at midnight and on app resume', async () => {
  await render(); expect(host.textContent).toContain('2026-10-28');
  await act(async () => jest.advanceTimersByTime(1100)); expect(host.textContent).toContain('2026-10-29');
  jest.setSystemTime(new Date('2026-11-02T05:00:00Z'));
  await act(async () => window.dispatchEvent(new Event('focus'))); expect(host.textContent).toContain('2026-11-02');
  jest.setSystemTime(new Date('2026-11-03T05:00:00Z'));
  await act(async () => document.dispatchEvent(new Event('visibilitychange'))); expect(host.textContent).toContain('2026-11-03');
});
it('aggregates every match independently of rows and applies shared search debounce', async () => {
  await render({ search: 'p' }); await act(async () => jest.advanceTimersByTime(400)); expect(fetchAggregate).not.toHaveBeenCalled();
  await render({ search: 'pa' }); await act(async () => jest.advanceTimersByTime(299)); expect(fetchAggregate).not.toHaveBeenCalled();
  await act(async () => jest.advanceTimersByTime(1));
  expect(observed.data.overdue).toEqual({ count: 36, amount: 3600 });
  expect(fetchAggregate.mock.calls.every(([, , options]) => options.requireReady && options.filters.some(f => f[0] === 'searchTokens' && f[2] === 'pa'))).toBe(true);
  await render({ search: 'p' }); expect(observed.data).toBeNull();
});
it('ignores an old aggregate response after a search changes and refreshes after invalidation', async () => {
  let resolve; fetchAggregate.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  await render(); await render({ search: 'pa' });
  await act(async () => resolve({ count: 900 })); expect(observed.data).toBeNull();
  await act(async () => jest.advanceTimersByTime(300)); expect(observed.data.overdue.count).toBe(36);
  fetchAggregate.mockImplementation(async (_, __, options) => options.aggregates ? { amount: 5000 } : { count: 50 });
  await act(async () => subscribeInvalidation.mock.calls.at(-1)[1](['emiDues']));
  expect(observed.data).toBeNull();
  await act(async () => jest.advanceTimersByTime(300)); expect(observed.data.overdue).toEqual({ count: 50, amount: 5000 });
});
