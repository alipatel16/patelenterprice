import { deriveSaleState, buildEmiDueDocuments, buildReportContributions, deriveComplaintState } from './projections';

const sale = { saleDate: '2026-10-01', paymentType: 'emi', grandTotal: 1000, downPayment: 200,
  totalPaidAmount: 650, customerName: 'Nisha Patel', customerPhone: '9876543210', salesperson: 'Ali',
  items: [{ productId: 'p1', productName: 'Chair', qty: 2, price: 150, subtotal: 300 },
    { productId: 'p2', productName: 'Table', qty: 1, price: 700, subtotal: 700 }],
  emiInstallments: [{ installmentNumber: 1, amount: 400, paidAmount: 400, dueDate: '2026-10-05' },
    { installmentNumber: 2, amount: 400, paidAmount: 50, dueDate: '2026-11-05' }] };

it('keeps only unpaid installments and derives their sum and earliest date without rewriting money', () => {
  const original = JSON.stringify(sale);
  expect(deriveSaleState(sale)).toMatchObject({ hasPendingEmi: true, emiOutstandingAmount: 350,
    emiRemainingInstallmentCount: 1, nextEmiDueDate: '2026-11-05', hasOutstandingPayment: true });
  expect(buildEmiDueDocuments('s1', sale)).toEqual([expect.objectContaining({ id: 's1_2', data: expect.objectContaining({
    saleId: 's1', installmentNumber: 2, amount: 400, paidAmount: 50, remainingAmount: 350,
    dueDate: '2026-11-05', searchTokens: expect.arrayContaining(['pat', '3210']) }) })]);
  expect(JSON.stringify(sale)).toBe(original);
});
it('keeps paid full-payment invoices settled even when historical totalPaidAmount is zero', () => {
  expect(deriveSaleState({ paymentType: 'full_payment', paymentStatus: 'paid', grandTotal: 1000,
    totalPaidAmount: 0 })).toMatchObject({ hasOutstandingPayment: false, outstandingPaymentAmount: 0 });
});
it('keeps mismatched schedules discoverable and flags totals excluding the down payment', () => {
  const mismatch = { ...sale, grandTotal: 2000, totalPaidAmount: 450 };
  expect(deriveSaleState(mismatch)).toMatchObject({ emiOutstandingAmount: 350, financialReconciliationRequired: true,
    financialWarnings: expect.arrayContaining(['emi-principal-mismatch', 'emi-paid-total-mismatch']) });
  expect(buildEmiDueDocuments('s1', mismatch)[0].data).toMatchObject({ remainingAmount: 350,
    financialReconciliationRequired: true });
});
it('keeps malformed unpaid dues in an explicit unresolved queue and never invents dates', () => {
  const malformed = { ...sale, saleDate: '', emiInstallments: [{ installmentNumber: 1, amount: 'oops', dueDate: '2026-02-30' }] };
  expect(deriveSaleState(malformed)).toMatchObject({ hasPendingEmi: true, emiOutstandingAmount: null, nextEmiDueDate: null,
    reconciliationIssues: expect.arrayContaining(['invalid-sale-date', 'installment-1-invalid-amount', 'installment-1-invalid-due-date']) });
  expect(buildEmiDueDocuments('s', malformed)[0].data).toMatchObject({ dueDate: null, remainingAmount: null, needsReconciliation: true });
  expect(buildReportContributions('s', malformed).every(row => row.data.periodType === 'lifetime')).toBe(true);
});
it('builds daily/monthly/lifetime item and employee contributions with stable identities', () => {
  const rows = buildReportContributions('s', sale);
  expect(rows).toHaveLength(9);
  expect(rows.find(row => row.data.productId === 'p1' && row.data.periodType === 'daily').data)
    .toMatchObject({ periodKey: '2026-10-01', quantity: 2, revenue: 300, invoiceCount: 1 });
  const employee = rows.find(row => row.collection === 'reportEmployeePeriods');
  expect(employee.data).toMatchObject({ employeeKey: 'legacy:ali', employeeId: null, quantity: 3, revenue: 1000, invoiceCount: 1 });
  expect(buildReportContributions('s', { ...sale, salespersonId: 'u1' }).find(row => row.collection === 'reportEmployeePeriods').data.employeeKey).toBe('user:u1');
});
it('rejects duplicate installment identities instead of silently overwriting a due', () => {
  expect(() => buildEmiDueDocuments('s', { ...sale, emiInstallments: [sale.emiInstallments[1], sale.emiInstallments[1]] })).toThrow(/installment/i);
});

it('derives complaint due order without overwriting missing or malformed historical dates', () => {
  expect(deriveComplaintState({ expectedResolutionDate: '2026-10-30' })).toMatchObject({ complaintDueDate: '2026-10-30' });
  expect(deriveComplaintState({})).toMatchObject({ complaintDueDate: '9999-12-31', complaintDateIssues: [] });
  expect(deriveComplaintState({ expectedResolutionDate: '2026-02-30' })).toMatchObject({ complaintDueDate: '9999-12-31', complaintDateIssues: ['invalid-expected-resolution-date'] });
});

it.each([0, false, '   '])('flags nonempty malformed complaint dates (%p) without guessing a date', expectedResolutionDate => {
  expect(deriveComplaintState({ expectedResolutionDate })).toEqual({ complaintDueDate: '9999-12-31',
    complaintDateIssues: ['invalid-expected-resolution-date'] });
});

it.each([
  [{ salespersonId: 'u1', salesperson: 'Same Name' }, 'user:u1'],
  [{ salesperson: '  ALI   Patel ' }, 'legacy:ali patel'],
  [{ salesperson: '' }, 'legacy:unmatched'],
])('shares the exact source reporting identity with employee report contributions (%p)', (identity, expected) => {
  const source = { ...sale, ...identity };
  expect(deriveSaleState(source).reportEmployeeKey).toBe(expected);
  expect(buildReportContributions('s', source).filter(row => row.collection === 'reportEmployeePeriods')
    .every(row => row.data.dimensionKey === expected && row.data.employeeKey === expected)).toBe(true);
});

it('projects EMI badge metadata without duplicating receipt or reschedule histories', () => {
  const installment = { ...sale.emiInstallments[1], dueDateChangeCount: 3,
    payments: [{ amount: 50 }], dueDateChanges: [{ from: '2026-10-05', to: '2026-11-05' }] };
  const row = buildEmiDueDocuments('s', { ...sale, emiMonths: 12,
    emiInstallments: [sale.emiInstallments[0], installment] })[0].data;
  expect(row).toMatchObject({ emiMonths: 12, dueDateChangeCount: 3, remainingAmount: 350 });
  expect(row).not.toHaveProperty('payments');
  expect(row).not.toHaveProperty('dueDateChanges');
  expect(buildEmiDueDocuments('s', sale)[0].data).toMatchObject({ emiMonths: 2, dueDateChangeCount: 0 });
});

it('validates a nonnegative legacy paid baseline plus recorded receipts', () => {
  const one = { ...sale, totalPaidAmount: 350, emiInstallments: [{ installmentNumber: 1, amount: 800, paidAmount: 150, paidAmountBaseline: 100, payments: [{ amount: 50 }], dueDate: '2026-11-05' }] };
  expect(deriveSaleState(one).financialReconciliationRequired).toBe(false);
  expect(deriveSaleState({ ...one, emiInstallments: [{ ...one.emiInstallments[0], paidAmountBaseline: -1 }] }).financialReconciliationRequired).toBe(true);
  expect(deriveSaleState({ ...one, emiInstallments: [{ ...one.emiInstallments[0], paidAmountBaseline: 99 }] }).financialReconciliationRequired).toBe(true);
});

it.each([
  [{ payments: [{ amount: 'bad' }] }, 'installment-1-invalid-payment-history'],
  [{ payments: [{ amount: 50 }], paidAmountBaseline: -1 }, 'installment-1-invalid-paid-baseline'],
  [{ payments: [], paidAmountBaseline: -1 }, 'installment-1-invalid-paid-baseline'],
])('keeps an unknown installment balance in the review queue for malformed history or baseline (%p)', (history, warning) => {
  const source = { ...sale, totalPaidAmount: 200, emiInstallments: [{ installmentNumber: 1, amount: 800, dueDate: '2026-11-05', ...history }] };
  expect(deriveSaleState(source)).toMatchObject({ hasPendingEmi: true, emiOutstandingAmount: null,
    financialReconciliationRequired: true, financialWarnings: expect.arrayContaining([warning]) });
  expect(buildEmiDueDocuments('s', source)).toEqual([expect.objectContaining({ data: expect.objectContaining({
    paidAmount: null, remainingAmount: null, needsReconciliation: true, financialWarnings: expect.arrayContaining([warning]) }) })]);
});

it('derives a valid baseline without receipts and zero only when the baseline is also zero', () => {
  const source = { ...sale, totalPaidAmount: 300, emiInstallments: [{ installmentNumber: 1, amount: 800, dueDate: '2026-11-05', paidAmountBaseline: 100, payments: [] }] };
  expect(buildEmiDueDocuments('s', source)[0].data).toMatchObject({ paidAmount: 100, remainingAmount: 700 });
  expect(buildEmiDueDocuments('s', { ...source, emiInstallments: [{ ...source.emiInstallments[0], paidAmountBaseline: 0 }] })[0].data).toMatchObject({ paidAmount: 0, remainingAmount: 800 });
});
