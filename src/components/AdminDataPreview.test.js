import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import DataMigrationUtil from './DataMigrationUtil';
import EmiPaymentStatusFix from './EmiPaymentStatusFix';
import { fetchPage } from '../data/query';
const mockDb = {};
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ db: mockDb, isAdmin: true }) }));
jest.mock('../data/query', () => ({ fetchPage: jest.fn() }));
for (const [label, Component, collection] of [['search preview', DataMigrationUtil, 'customers'], ['EMI review', EmiPaymentStatusFix, 'sales']]) {
  test(`${label} waits for an explicit action and fetches only the next 15 records`, async () => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
    fetchPage.mockResolvedValue({ rows: [{ id: 'test1', name: 'Test Customer', customerName: 'Test Customer', saleDate: '2026-10-01', grandTotal: 100, paymentType: 'emi', totalPaidAmount: 0, emiInstallments: [] }], lastDoc: { id: 'test1' }, hasNext: true });
    const host = document.createElement('div'), root = createRoot(host);
    await act(async () => root.render(<Component />));
    expect(fetchPage).not.toHaveBeenCalled();
    const preview = [...host.querySelectorAll('button')].find(button => button.textContent.includes('Preview next 15'));
    expect(preview).toBeDefined();
    await act(async () => preview.click());
    expect(fetchPage).toHaveBeenCalledWith(mockDb, collection, expect.objectContaining({ pageSize: 15, includeTotal: false, cursor: null }));
    expect(host.textContent).toContain('Test Customer');
    expect(host.textContent).toContain('Records on this page: 1');
    act(() => root.unmount());
  });
}
