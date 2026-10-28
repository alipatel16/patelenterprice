import { doc } from 'firebase/firestore';
import { mutateRecord } from './writes';
import { deriveSaleState, numeric, roundMoney, validDate } from './projections';

export const installmentPaid = inst => numeric(inst.paidAmount ?? (inst.payments || []).reduce((sum, p) => sum + Number(p.amount), 0));
const fail = (message, code = 'data-access/invalid-payment') => { const error = new Error(message); error.code = code; throw error; };
export const newPaymentOperationId = () => globalThis.crypto?.randomUUID?.() || `receipt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
function operation(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) fail('A stable payment operation ID is required');
  return value;
}
function validateSale(sale) {
  if (!sale) fail('Sale not found', 'not-found');
  const state = deriveSaleState(sale);
  if (state.financialReconciliationRequired) fail('Invoice financial history needs reconciliation before accepting payments', 'data-access/reconciliation-required');
  return state;
}
function validatePayment(payment, operationId, now) {
  const amount = numeric(payment?.amount);
  if (amount === null || roundMoney(amount) <= 0 || Math.abs(amount - roundMoney(amount)) > 0.000001) fail('Enter a positive amount with at most two decimal places');
  if (!validDate(payment.payDate)) fail('Select a valid payment date');
  return { amount: roundMoney(amount), mode: payment.mode || 'Cash', payDate: payment.payDate,
    notes: payment.notes || '', recordedByName: payment.recordedByName || '', recordedAt: now(), operationId: operation(operationId) };
}
export function createPaymentActions({ doc: reference = doc, mutateRecord: mutate = mutateRecord, now = () => new Date().toISOString() } = {}) {
  const acknowledge = async (db, saleId, mutator, operationId) => {
    const result = await mutate(reference(db, 'sales', saleId), mutator, { operationId: operation(operationId) });
    if (!result.data) fail('Sale no longer exists', 'not-found');
    return { ...result.data, id: result.id };
  };
  return {
    recordEmiPayment: async (db, saleId, installmentNumber, payment, operationId) => {
      const receipt = validatePayment(payment, operationId, now);
      return acknowledge(db, saleId, current => {
        validateSale(current);
        if (current.paymentType !== 'emi') fail('This invoice does not use EMI');
        const target = current.emiInstallments?.find(inst => inst.installmentNumber === installmentNumber);
        if (!target) fail('Installment not found', 'not-found');
        const priorPaid = installmentPaid(target), amount = numeric(target.amount);
        if (receipt.amount > roundMoney(amount - priorPaid)) fail('Payment exceeds the current installment balance');
        const emiInstallments = current.emiInstallments.map(inst => inst !== target ? inst : {
          ...inst, ...(!(inst.payments || []).length && inst.paidAmountBaseline === undefined && priorPaid > 0 ? { paidAmountBaseline: priorPaid } : {}),
          paidAmount: roundMoney(priorPaid + receipt.amount),
          status: roundMoney(priorPaid + receipt.amount) >= amount ? 'paid' : 'partial', payments: [...(inst.payments || []), receipt],
        });
        const totalPaidAmount = roundMoney(numeric(current.totalPaidAmount ?? 0) + receipt.amount);
        return { emiInstallments, totalPaidAmount,
          paymentStatus: emiInstallments.every(inst => installmentPaid(inst) >= Number(inst.amount)) ? 'paid' : 'partial', updatedAt: now() };
      }, operationId);
    },
    recordSalePayment: async (db, saleId, payment, operationId) => {
      const receipt = validatePayment(payment, operationId, now);
      return acknowledge(db, saleId, current => {
        const state = validateSale(current);
        if (current.paymentType === 'emi') fail('Record this payment against an EMI installment');
        if (!state.hasOutstandingPayment) fail('This invoice is already paid');
        if (state.outstandingPaymentAmount === null) fail('Invoice balance needs reconciliation', 'data-access/reconciliation-required');
        const history = current.salePayments || [];
        if (!Array.isArray(history) || history.some(p => numeric(p.amount) === null)) fail('Payment history needs reconciliation', 'data-access/reconciliation-required');
        const prior = numeric(current.totalPaidAmount ?? 0);
        if (roundMoney(history.reduce((sum, p) => sum + Number(p.amount), 0)) > prior) fail('Payment history exceeds the stored paid amount', 'data-access/reconciliation-required');
        if (receipt.amount > state.outstandingPaymentAmount) fail('Payment exceeds the current invoice balance');
        const totalPaidAmount = roundMoney(prior + receipt.amount);
        return { salePayments: [...history, receipt], totalPaidAmount,
          paymentStatus: totalPaidAmount >= Number(current.grandTotal) ? 'paid' : 'partial', updatedAt: now() };
      }, operationId);
    },
    rescheduleEmi: async (db, saleId, installmentNumber, newDate, reason, operationId = newPaymentOperationId()) => {
      if (!validDate(newDate)) fail('Select a valid due date');
      if (!reason?.trim()) fail('Reason is required');
      const changedAt = now();
      return acknowledge(db, saleId, current => {
        if (!current) fail('Sale not found', 'not-found');
        const target = current.paymentType === 'emi' && current.emiInstallments?.find(inst => inst.installmentNumber === installmentNumber);
        if (!target) fail('Installment not found', 'not-found');
        if (target.dueDate === newDate) return undefined;
        return { emiInstallments: current.emiInstallments.map(inst => inst !== target ? inst : {
          ...inst, dueDate: newDate, dueDateChangeCount: (inst.dueDateChangeCount || 0) + 1,
          dueDateChanges: [...(inst.dueDateChanges || []), { from: inst.dueDate, to: newDate, reason: reason.trim(), changedAt, operationId }],
        }), updatedAt: changedAt };
      }, operationId);
    },
  };
}
export const { recordEmiPayment, recordSalePayment, rescheduleEmi } = createPaymentActions();
