import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import MonthSearchBar from './MonthSearchBar';
test('search is enabled with no month and changing the optional date keeps search independent', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'), root = createRoot(host), search = jest.fn(), month = jest.fn();
  await act(async () => root.render(<MonthSearchBar selectedMonth="" search="historic" onSearchChange={search} onMonthChange={month} />));
  const input = host.querySelector('input:not([type="month"])');
  expect(input.disabled).toBe(false);
  act(() => Simulate.change(input, { target: { value: '4321' } }));
  expect(search).toHaveBeenCalledWith('4321');
  search.mockClear();
  act(() => Simulate.change(host.querySelector('input[type="month"]'), { target: { value: '2026-10' } }));
  expect(month).toHaveBeenCalledWith('2026-10'); expect(search).not.toHaveBeenCalled();
  act(() => root.unmount());
});
