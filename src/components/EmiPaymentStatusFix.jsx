import React from 'react';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { deriveSaleState } from '../data/projections';
import { formatCurrency } from '../utils';
import AdminDataPreview from './AdminDataPreview';
export function computeEmiPaymentStatus(installments = [], downPayment = 0) {
  if (installments.length && installments.every(inst => Number(inst.paidAmount || 0) >= Number(inst.amount))) return 'paid';
  return downPayment > 0 || installments.some(inst => Number(inst.paidAmount || 0) > 0) ? 'partial' : 'unpaid';
}
export const computeEmiTotalPaid = (installments = []) => installments.reduce((sum, inst) => sum + Number(inst.paidAmount || 0), 0);
export default function EmiPaymentStatusFix() {
  const { db, isAdmin } = useAuth();
  if (!isAdmin) return <Alert severity="error">Admin access required.</Alert>;
  return <Box sx={{ p: 3, maxWidth: 760, mx: 'auto' }}><Stack spacing={2}>
    <Typography variant="h5">EMI payment review</Typography>
    <Alert severity="info">Review 15 EMI invoices at a time. Historical payment differences need individual review; this page preserves stored amounts and receipt histories.</Alert>
    <AdminDataPreview db={db} collectionName="sales" filters={[["paymentType", "==", "emi"]]} renderRow={row => {
      let warnings;
      try { warnings = deriveSaleState(row).financialWarnings; } catch (_) { warnings = ['invalid-installment-schedule']; }
      return <><Typography>{row.customerName || row.invoiceNumber || row.id}</Typography>
        <Typography variant="body2">Stored paid amount: {formatCurrency(row.totalPaidAmount || 0)}</Typography>
        <Typography variant="body2">{warnings.length ? `Review: ${warnings.join(', ')}` : 'No financial warning found.'}</Typography>
        <Button href={`/sales/${row.id}`} size="small">Open invoice</Button></>;
    }} />
  </Stack></Box>;
}
