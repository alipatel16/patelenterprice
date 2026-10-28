import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { usePagedCollection } from './usePagedCollection';
import { fetchPage, subscribeInvalidation } from '../data/query';
jest.mock('../data/query', () => ({ fetchPage: jest.fn(), subscribeInvalidation: jest.fn(() => () => {}), invalidateCollections: jest.fn(), queryKey: value => JSON.stringify(value) }));
let root, host, result;
const db = {};
function Probe({ search = '', database = db, ...options }) { result = usePagedCollection(database, 'customers', { search, ...options }); return <div>{result.rows.map(r => r.name).join(',')}</div>; }
const render = async props => { await act(async () => root.render(<Probe {...props} />)); };
const advance = async ms => { await act(async () => { jest.advanceTimersByTime(ms); }); };
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; jest.useFakeTimers(); jest.clearAllMocks(); host = document.createElement('div'); root = createRoot(host); fetchPage.mockResolvedValue({ rows: [{ id: '1', name: 'Ali' }], total: 1, lastDoc: {}, hasNext: false }); });
afterEach(() => { act(() => root.unmount()); jest.useRealTimers(); });
test('one character makes no request, two characters wait 300ms, and shortening immediately hides old results', async () => {
  await render({ search: 'a' }); await advance(400); expect(fetchPage).not.toHaveBeenCalled();
  await render({ search: 'al' }); await advance(299); expect(fetchPage).not.toHaveBeenCalled();
  await advance(1); expect(host.textContent).toBe('Ali');
  await render({ search: 'a' }); expect(host.textContent).toBe('');
  await render({ search: '' }); expect(fetchPage).toHaveBeenCalledTimes(2);
});
test('an old response during the debounce interval never renders', async () => {
  let resolve;
  fetchPage.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  await render({ search: 'al' }); await advance(300); await render({ search: 'pa' });
  await act(async () => resolve({ rows: [{ id: 'old', name: 'Old' }], total: 1, hasNext: false }));
  expect(host.textContent).toBe(''); await advance(300); expect(host.textContent).toBe('Ali');
});
test('only known adjacent cursor pages can be selected and filters reset paging', async () => {
  fetchPage.mockResolvedValue({ rows: [], total: 100, lastDoc: { id: 'cursor' }, hasNext: true });
  await render({}); act(() => result.setPage(8)); expect(result.page).toBe(0);
  await act(async () => result.next()); expect(result.page).toBe(1);
  await act(async () => result.previous()); expect(result.page).toBe(0);
  await render({ filters: [['status', '==', 'open']] }); expect(result.page).toBe(0);
  expect(fetchPage.mock.calls.at(-1)[2].cursor).toBeNull();
});
test('scope invalidation immediately hides rows and ignores a pending response', async () => {
  let resolve; fetchPage.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  await render({}); const notify = subscribeInvalidation.mock.calls.at(-1)[1];
  await act(async () => notify(null));
  await act(async () => resolve({ rows: [{ id: 'old', name: 'Old' }], total: 1 }));
  expect(host.textContent).not.toBe('Old');
});
test('previously visited forward pages remain reachable without an invented cursor', async () => {
  fetchPage.mockResolvedValue({ rows: [], total: 100, lastDoc: { id: 'cursor' }, hasNext: true });
  await render({});
  await act(async () => result.next()); await act(async () => result.next());
  await act(async () => result.setPage(0)); expect(result.page).toBe(0);
  await act(async () => result.setPage(2)); expect(result.page).toBe(2);
});

test('switching stores hides rows and rejects the prior store response', async () => {
  let resolve;
  fetchPage.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  await render({ search: 'al' }); await advance(300);
  await render({ search: 'al', database: {} });
  await act(async () => resolve({ rows: [{ id: 'old', name: 'Other Store' }], total: 1 }));
  expect(host.textContent).toBe(''); await advance(300); expect(host.textContent).toBe('Ali');
});
test('an explicitly supplied starting cursor is preserved by the query interface', async () => {
  const cursor = { id: 'start' };
  await render({ cursor });
  expect(fetchPage.mock.calls.at(-1)[2].cursor).toBe(cursor);
});
