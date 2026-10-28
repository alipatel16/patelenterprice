import { numeric, roundMoney, validDate } from './projections';

export function buildEmiSchedule(sale) {
  if (sale.paymentType !== 'emi') return [];
  const total = numeric(sale.grandTotal), down = numeric(sale.downPayment ?? 0), months = Number(sale.emiMonths);
  if (total === null || down === null || down > total || !Number.isInteger(months) || months < 1 || !validDate(sale.emiStartDate)) {
    throw new Error('Enter a valid EMI amount, down payment, number of months and start date');
  }
  const cents = Math.round(roundMoney(total - down) * 100), base = Math.floor(cents / months), extra = cents % months;
  const start = new Date(`${sale.emiStartDate}T00:00:00Z`);
  return Array.from({ length: months }, (_, index) => {
    const due = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, 1));
    const last = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth() + 1, 0)).getUTCDate();
    due.setUTCDate(Math.min(start.getUTCDate(), last));
    const amount = (base + (index < extra ? 1 : 0)) / 100;
    return { installmentNumber: index + 1, dueDate: due.toISOString().slice(0, 10), amount,
      paidAmount: 0, status: amount === 0 ? 'paid' : 'pending', payments: [], dueDateChanges: [], dueDateChangeCount: 0 };
  });
}

export function initialSalePaymentState(sale, recorder = {}) {
  const isEmi = sale.paymentType === 'emi';
  const isFinance = ['finance', 'bank_transfer'].includes(sale.paymentType);
  const down = numeric(sale.downPayment ?? 0);
  if ((isEmi || isFinance) && (down === null || down > sale.grandTotal)) throw new Error('Down payment must be between zero and the invoice total');
  const paid = isEmi || isFinance ? roundMoney(down) : 0;
  return { totalPaidAmount: paid, paymentAccountingVersion: 2, ...(isEmi ? { emiScheduleVersion: 2 } : {}),
    paymentStatus: sale.paymentType === 'full_payment' || paid >= sale.grandTotal ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
    salePayments: isFinance && paid > 0 ? [{ amount: paid, mode: sale.paymentType === 'finance' ? 'Finance' : 'Bank Transfer',
      payDate: sale.saleDate, notes: `Down payment — ${sale.financerName} (Ref: ${sale.paymentRef})`,
      recordedAt: new Date().toISOString(), isDownPayment: true, recordedByUid: recorder.recordedByUid || '', recordedByName: recorder.recordedByName || 'System' }] : [] };
}
