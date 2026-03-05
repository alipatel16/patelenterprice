import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Card, CardContent, Grid, Chip, Divider,
  Tab, Tabs, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, IconButton, Tooltip, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Alert, CircularProgress, Stack,
  LinearProgress, Paper, Badge,
} from '@mui/material';
import {
  ArrowBack, Edit, Payment, CalendarMonth, CheckCircle,
  AccessTime, Warning, History, AttachMoney, Print, Receipt,
} from '@mui/icons-material';
import {
  collection, query, where, orderBy, getDocs, updateDoc,
  doc, getDoc, serverTimestamp,
} from 'firebase/firestore';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';
import { COMPANIES, PAYMENT_LABELS, PAYMENT_TYPES } from '../../constants';
import { formatCurrency, formatDate, getPaymentStatusColor } from '../../utils';
import { useMediaQuery, useTheme } from '@mui/material';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getInstallmentStatus = (inst) => {
  const today = new Date().toISOString().split('T')[0];
  if ((inst.paidAmount || 0) >= inst.amount) return 'paid';
  if ((inst.paidAmount || 0) > 0) return 'partial';
  if (inst.dueDate < today) return 'overdue';
  return 'pending';
};

const StatusChip = ({ status }) => {
  const map = {
    paid:    { label: 'Paid',     color: 'success', icon: <CheckCircle sx={{ fontSize: 14 }} /> },
    partial: { label: 'Partial',  color: 'warning', icon: <AttachMoney sx={{ fontSize: 14 }} /> },
    overdue: { label: 'Overdue',  color: 'error',   icon: <Warning sx={{ fontSize: 14 }} /> },
    pending: { label: 'Pending',  color: 'default', icon: <AccessTime sx={{ fontSize: 14 }} /> },
  };
  const s = map[status] || map.pending;
  return <Chip icon={s.icon} label={s.label} color={s.color} size="small" sx={{ fontSize: 10 }} />;
};

const PAYMENT_MODES = ['Cash', 'UPI', 'Cheque', 'NEFT / RTGS', 'Other'];

// ─── Print Invoice ────────────────────────────────────────────────────────────

const generateInvoiceHTML = (sale, installments, company) => {
  const items = sale.items || [];
  const salePayments = sale.salePayments || [];
  const isGST = sale.invoiceType === 'gst';
  const isEMI = sale.paymentType === PAYMENT_TYPES.EMI;

  const fmt = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(n || 0);
  const fmtD = d => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

  const totalSalePaid = sale.totalPaidAmount || salePayments.reduce((s, p) => s + (p.amount || 0), 0);
  const payStatusHtml = () => {
    if (sale.paymentType === PAYMENT_TYPES.FULL) return '<span style="color:#16a34a;font-weight:700">PAID IN FULL</span>';
    if (totalSalePaid >= sale.grandTotal) return '<span style="color:#16a34a;font-weight:700">PAID IN FULL</span>';
    if (totalSalePaid > 0) return `<span style="color:#d97706;font-weight:700">PARTIAL — ${fmt(totalSalePaid)} PAID</span>`;
    return '<span style="color:#dc2626;font-weight:700">PAYMENT PENDING</span>';
  };

  const emiRows = isEMI ? installments.map(inst => {
    const paidAmt = inst.paidAmount || 0;
    const status = paidAmt >= inst.amount ? 'Paid' : paidAmt > 0 ? 'Partial' : new Date(inst.dueDate) < new Date() ? 'Overdue' : 'Pending';
    const color = status === 'Paid' ? '#16a34a' : status === 'Partial' ? '#d97706' : status === 'Overdue' ? '#dc2626' : '#6b7280';
    return `<tr>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;">#${inst.installmentNumber}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;">${fmtD(inst.dueDate)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;text-align:right;">${fmt(inst.amount)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;text-align:right;">${fmt(paidAmt)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-weight:600;color:${color}">${status}</td>
    </tr>`;
  }).join('') : '';

  const paymentRows = salePayments.map(p => `<tr>
    <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;">${fmtD(p.payDate)}</td>
    <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;">${p.mode}</td>
    <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;text-align:right;color:#16a34a;font-weight:600;">${fmt(p.amount)}</td>
    <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;">${p.notes || '-'}</td>
  </tr>`).join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>Invoice ${sale.invoiceNumber}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Inter',sans-serif;font-size:13px;color:#1a1a1a;background:#fff}
  .page{max-width:800px;margin:0 auto;padding:32px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:20px;border-bottom:2px solid #1e40af}
  .co h1{font-size:20px;font-weight:700;color:#1e40af}
  .co p{font-size:12px;color:#6b7280;margin-top:2px}
  .meta{text-align:right}
  .meta .num{font-size:22px;font-weight:800;color:#1e40af}
  .meta .dt{font-size:12px;color:#6b7280;margin-top:4px}
  .badge{display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600;background:${isGST?'#dbeafe':'#f3f4f6'};color:${isGST?'#1e40af':'#6b7280'};margin-top:6px}
  .parties{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px}
  .pbox{background:#f8fafc;border-radius:8px;padding:14px}
  .pbox .lbl{font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}
  .pbox h3{font-size:15px;font-weight:700;color:#111}
  .pbox p{font-size:12px;color:#6b7280;margin-top:2px}
  .sec-title{font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px}
  table{width:100%;border-collapse:collapse}
  thead tr{background:#1e40af;color:white}
  thead th{padding:10px 8px;text-align:left;font-size:12px;font-weight:600}
  thead th.r{text-align:right}
  .tbl{margin-bottom:20px;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb}
  .totals{display:flex;justify-content:flex-end;margin-bottom:24px}
  .tbox{width:280px}
  .trow{display:flex;justify-content:space-between;padding:5px 0;font-size:13px}
  .trow.big{border-top:2px solid #1e40af;margin-top:6px;padding-top:8px;font-size:16px;font-weight:800;color:#1e40af}
  .igrid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
  .ibox{background:#f8fafc;border-radius:8px;padding:12px}
  .ibox .il{font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
  .ibox .iv{font-size:13px;font-weight:600;color:#111}
  .sec{margin-bottom:24px}
  .footer{margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center}
  .footer p{font-size:11px;color:#9ca3af}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{padding:16px}.np{display:none!important}}
</style></head><body>
<div class="page">
  <div class="np" style="text-align:center;margin-bottom:20px">
    <button onclick="window.print()" style="background:#1e40af;color:white;border:none;padding:10px 24px;border-radius:6px;font-size:14px;cursor:pointer;font-weight:600">🖨️ Print Invoice</button>
    <button onclick="window.close()" style="background:#f3f4f6;color:#333;border:none;padding:10px 24px;border-radius:6px;font-size:14px;cursor:pointer;font-weight:600;margin-left:10px">✕ Close</button>
  </div>
  <div class="header">
    <div class="co">
      <h1>${company?.name || ''}</h1>
      <p>${company?.address || ''}</p>
      <p>${company?.phone || ''} | ${company?.email || ''}</p>
      ${isGST ? `<p>GSTIN: <strong>${company?.gstNumber || ''}</strong></p>` : ''}
    </div>
    <div class="meta">
      <div class="num">${sale.invoiceNumber}</div>
      <div class="dt">Date: ${fmtD(sale.saleDate)}</div>
      <div><span class="badge">${isGST ? 'GST Invoice' : 'Non-GST Invoice'}</span></div>
      <div style="margin-top:8px">${payStatusHtml()}</div>
    </div>
  </div>
  <div class="parties">
    <div class="pbox"><div class="lbl">Bill To</div><h3>${sale.customerName}</h3><p>${sale.customerPhone}</p></div>
    <div class="pbox"><div class="lbl">Salesperson</div><h3>${sale.salesperson || '—'}</h3>${sale.notes ? `<p>Note: ${sale.notes}</p>` : ''}</div>
  </div>
  <div class="sec">
    <div class="sec-title">Items${sale.bulkPrice > 0 ? ' <span style=\"background:#7c3aed;color:#fff;font-size:11px;padding:2px 8px;border-radius:10px;margin-left:8px\">Bulk Price</span>' : ''}</div>
    <div class="tbl"><table>
      <thead><tr>
        <th>#</th><th>Product</th><th class="r">Qty</th>
        ${!sale.bulkPrice ? `<th class="r">Rate</th>${isGST ? '<th class="r">GST%</th><th class="r">GST Amt</th>' : ''}<th class="r">Amount</th>` : ''}
      </tr></thead>
      <tbody>${items.map((it, i) => `<tr style="background:${i%2===0?'#fff':'#f9fafb'}">
        <td style="padding:8px">${i + 1}</td>
        <td style="padding:8px;font-weight:600">${it.productName}<br><span style="font-size:11px;color:#9ca3af">${it.unit || ''}</span></td>
        <td style="padding:8px;text-align:right">${it.qty}</td>
        ${!sale.bulkPrice ? `<td style="padding:8px;text-align:right">${fmt(it.price)}</td>${isGST ? `<td style="padding:8px;text-align:right">${it.gstRate}%</td><td style="padding:8px;text-align:right;color:#2563eb">${fmt(it.totalTax)}</td>` : ''}<td style="padding:8px;text-align:right;font-weight:600">${fmt(it.subtotal)}</td>` : ''}
      </tr>`).join('')}</tbody>
    </table>
    ${sale.bulkPrice > 0 ? `<div style="margin-top:10px;padding:12px 16px;background:#f5f3ff;border:1.5px dashed #7c3aed;border-radius:8px;display:flex;justify-content:space-between;align-items:center"><span style="color:#6b7280;font-size:13px">${items.length} items · Bulk total</span><span style="font-size:18px;font-weight:800;color:#7c3aed">${fmt(sale.bulkPrice)}</span></div>` : ''}
    </div>
  </div>
  <div class="totals"><div class="tbox">
    ${!sale.bulkPrice ? `<div class="trow"><span>Subtotal</span><span>${fmt(sale.subtotal)}</span></div>${isGST ? `<div class="trow" style="color:#2563eb"><span>Total GST</span><span>${fmt(sale.totalTax)}</span></div>` : ''}` : ''}
    ${sale.hasExchange && sale.exchangeValue > 0 ? `<div class="trow" style="color:#dc2626"><span>Exchange (${sale.exchangeItem})</span><span>− ${fmt(sale.exchangeValue)}</span></div>` : ''}
    <div class="trow big"><span>GRAND TOTAL</span><span>${fmt(sale.grandTotal)}</span></div>
    ${sale.downPayment > 0 ? `<div class="trow" style="color:#16a34a"><span>Down Payment</span><span>${fmt(sale.downPayment)}</span></div>` : ''}
    ${sale.balanceDue > 0 ? `<div class="trow" style="color:#dc2626;font-weight:600"><span>Balance Due</span><span>${fmt(sale.balanceDue)}</span></div>` : ''}
  </div></div>
  <div class="igrid">
    <div class="ibox"><div class="il">Payment Method</div><div class="iv">${PAYMENT_LABELS[sale.paymentType] || sale.paymentType}</div>
      ${sale.financerName ? `<div style="font-size:12px;color:#6b7280;margin-top:2px">Financer: ${sale.financerName}</div>` : ''}
      ${sale.paymentRef ? `<div style="font-size:12px;color:#6b7280">Ref: ${sale.paymentRef}</div>` : ''}
    </div>
    <div class="ibox"><div class="il">Delivery Status</div>
      <div class="iv" style="color:${sale.deliveryType==='immediate'||sale.isDelivered?'#16a34a':'#d97706'}">
        ${sale.deliveryType==='immediate'?'Delivered at Sale':sale.isDelivered?`Delivered ${fmtD(sale.actualDeliveryDate)}`:`Scheduled: ${fmtD(sale.deliveryDate)}`}
      </div>
    </div>
    ${sale.hasExchange ? `<div class="ibox" style="grid-column:1/-1"><div class="il">Exchange Item</div>
      <div class="iv">${sale.exchangeItem} — ${fmt(sale.exchangeValue)}</div>
      <div style="font-size:12px;color:${sale.exchangeReceived?'#16a34a':'#d97706'};margin-top:2px;font-weight:600">${sale.exchangeReceived?'✓ Exchange item received':'⏳ Exchange item pending'}</div>
    </div>` : ''}
  </div>
  ${isEMI && installments.length > 0 ? `<div class="sec">
    <div class="sec-title">EMI Schedule</div>
    <div class="tbl"><table>
      <thead><tr><th>#</th><th>Due Date</th><th class="r">Amount</th><th class="r">Paid</th><th class="r">Status</th></tr></thead>
      <tbody>${emiRows}</tbody>
    </table></div>
  </div>` : ''}
  ${!isEMI && salePayments.length > 0 ? `<div class="sec">
    <div class="sec-title">Payment History</div>
    <div class="tbl"><table>
      <thead><tr><th>Date</th><th>Mode</th><th class="r">Amount</th><th>Notes</th></tr></thead>
      <tbody>${paymentRows}</tbody>
    </table></div>
    <div style="text-align:right;margin-top:10px;font-weight:700;color:#16a34a">Total Paid: ${fmt(totalSalePaid)}</div>
  </div>` : ''}
  <div class="footer">
    <p>Thank you for your business!</p>
    <p>Generated on ${new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</p>
  </div>
</div></body></html>`;
};

const printInvoice = (sale, installments, company) => {
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) { toast.error('Popup blocked. Please allow popups.'); return; }
  win.document.write(generateInvoiceHTML(sale, installments, company));
  win.document.close();
};

const printReceipt = (sale, payment, company) => {
  const fmt = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(n || 0);
  const fmtD = d => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
  const totalPaid = (sale.salePayments || []).reduce((s, p) => s + p.amount, 0);
  const balance = (sale.grandTotal || 0) - totalPaid;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Payment Receipt</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Inter',sans-serif;font-size:13px;color:#1a1a1a;background:#fff}
  .r{max-width:380px;margin:20px auto;padding:24px;border:2px solid #1e40af;border-radius:12px}
  .hdr{text-align:center;margin-bottom:20px;padding-bottom:16px;border-bottom:1px dashed #ccc}
  .hdr h1{font-size:18px;font-weight:800;color:#1e40af}
  .hdr p{font-size:12px;color:#6b7280;margin-top:3px}
  .title{text-align:center;font-size:16px;font-weight:700;color:#16a34a;letter-spacing:1px;text-transform:uppercase;margin-bottom:16px}
  .row{display:flex;justify-content:space-between;padding:5px 0;font-size:13px}
  hr{border:none;border-top:1px dashed #ccc;margin:10px 0}
  .amt{background:#f0fdf4;border:2px solid #16a34a;border-radius:8px;padding:12px;text-align:center;margin:16px 0}
  .amt .lbl{font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase}
  .amt .val{font-size:26px;font-weight:800;color:#16a34a}
  .bal{background:${balance>0?'#fff7ed':'#f0fdf4'};border:1px solid ${balance>0?'#fed7aa':'#bbf7d0'};border-radius:6px;padding:8px 12px;margin-top:12px;text-align:center}
  .bal .bl{font-size:11px;color:#6b7280}
  .bal .bv{font-size:16px;font-weight:700;color:${balance>0?'#d97706':'#16a34a'}}
  .foot{margin-top:16px;padding-top:12px;border-top:1px dashed #ccc;text-align:center;font-size:11px;color:#9ca3af}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.np{display:none!important}}
</style></head><body>
<div class="np" style="text-align:center;padding:10px;margin-bottom:10px">
  <button onclick="window.print()" style="background:#1e40af;color:white;border:none;padding:8px 20px;border-radius:6px;font-size:13px;cursor:pointer;font-weight:600">🖨️ Print</button>
  <button onclick="window.close()" style="background:#f3f4f6;color:#333;border:none;padding:8px 20px;border-radius:6px;font-size:13px;cursor:pointer;font-weight:600;margin-left:8px">✕ Close</button>
</div>
<div class="r">
  <div class="hdr"><h1>${company?.name || 'Store'}</h1><p>${company?.address || ''}</p><p>${company?.phone || ''}</p></div>
  <div class="title">Payment Receipt</div>
  <div class="row"><span>Receipt Date</span><span>${fmtD(payment.payDate)}</span></div>
  <div class="row"><span>Invoice No.</span><span><strong>${sale.invoiceNumber}</strong></span></div>
  <div class="row"><span>Customer</span><span>${sale.customerName}</span></div>
  <div class="row"><span>Phone</span><span>${sale.customerPhone}</span></div>
  <hr>
  <div class="amt"><div class="lbl">Amount Received</div><div class="val">${fmt(payment.amount)}</div></div>
  <div class="row"><span>Payment Mode</span><span><strong>${payment.mode}</strong></span></div>
  ${payment.notes ? `<div class="row"><span>Notes</span><span>${payment.notes}</span></div>` : ''}
  <hr>
  <div class="row"><span>Invoice Total</span><span>${fmt(sale.grandTotal)}</span></div>
  <div class="row"><span>Total Paid (incl. this)</span><span style="color:#16a34a;font-weight:600">${fmt(totalPaid)}</span></div>
  <div class="bal"><div class="bl">${balance>0?'Outstanding Balance':'Payment Complete'}</div><div class="bv">${balance>0?fmt(balance):'✓ Fully Paid'}</div></div>
  <div class="foot"><p>Thank you for your payment!</p><p style="margin-top:4px">Computer-generated receipt.</p></div>
</div></body></html>`;
  const win = window.open('', '_blank', 'width=500,height=700');
  if (!win) { toast.error('Popup blocked.'); return; }
  win.document.write(html);
  win.document.close();
};

// ─── Record EMI Payment Dialog ────────────────────────────────────────────────

const RecordPaymentDialog = ({ open, onClose, installment, onSave }) => {
  const remaining = installment ? installment.amount - (installment.paidAmount || 0) : 0;
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('Cash');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setAmount(''); setMode('Cash'); setPayDate(new Date().toISOString().split('T')[0]); setNotes(''); setError(''); }
  }, [open]);

  const handleSave = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return; }
    if (amt > remaining + 0.01) { setError(`Max: ${formatCurrency(remaining)}`); return; }
    if (!payDate) { setError('Select payment date'); return; }
    setLoading(true);
    try { await onSave({ amount: amt, mode, payDate, notes }); onClose(); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  if (!installment) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Record Payment — EMI #{installment.installmentNumber}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box sx={{ mb: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 2 }}>
          <Typography variant="body2">Remaining: <strong style={{ color: remaining > 0 ? '#d32f2f' : '#388e3c' }}>{formatCurrency(remaining)}</strong></Typography>
        </Box>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <TextField fullWidth label="Amount Paid (₹) *" type="number" value={amount}
              onChange={e => setAmount(e.target.value)} size="small" helperText={`Max: ${formatCurrency(remaining)}`} />
          </Grid>
          <Grid item xs={12}>
            <TextField fullWidth label="Payment Date *" type="date" value={payDate}
              onChange={e => setPayDate(e.target.value)} size="small" InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={12}>
            <TextField fullWidth label="Payment Mode" value={mode} onChange={e => setMode(e.target.value)} size="small" select>
              {PAYMENT_MODES.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12}>
            <TextField fullWidth label="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} size="small" multiline rows={2} />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="outlined">Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={loading}
          startIcon={loading ? <CircularProgress size={16} /> : <Payment />}>
          Record Payment
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Record Sale Payment Dialog (non-EMI) ────────────────────────────────────

const RecordSalePaymentDialog = ({ open, onClose, sale, onSave }) => {
  const existingTotal = (sale?.salePayments || []).reduce((s, p) => s + (p.amount || 0), 0);
  const remaining = sale ? (sale.grandTotal || 0) - existingTotal : 0;
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('Cash');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setAmount(''); setMode('Cash'); setPayDate(new Date().toISOString().split('T')[0]); setNotes(''); setError(''); }
  }, [open]);

  const handleSave = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return; }
    if (amt > remaining + 0.01) { setError(`Max: ${formatCurrency(remaining)}`); return; }
    if (!payDate) { setError('Select date'); return; }
    setLoading(true);
    try { await onSave({ amount: amt, mode, payDate, notes }); onClose(); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  if (!sale) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Record Payment</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box sx={{ mb: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 2 }}>
          <Typography variant="body2">Invoice Total: <strong>{formatCurrency(sale.grandTotal)}</strong></Typography>
          <Typography variant="body2">Already Paid: <strong style={{ color: '#388e3c' }}>{formatCurrency(existingTotal)}</strong></Typography>
          <Typography variant="body2">Remaining: <strong style={{ color: remaining > 0 ? '#d32f2f' : '#388e3c' }}>{formatCurrency(remaining)}</strong></Typography>
        </Box>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <TextField fullWidth label="Amount Paid (₹) *" type="number" value={amount}
              onChange={e => setAmount(e.target.value)} size="small" helperText={`Max: ${formatCurrency(remaining)}`} />
          </Grid>
          <Grid item xs={12}>
            <TextField fullWidth label="Payment Date *" type="date" value={payDate}
              onChange={e => setPayDate(e.target.value)} size="small" InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={12}>
            <TextField fullWidth label="Payment Mode" value={mode} onChange={e => setMode(e.target.value)} size="small" select>
              {PAYMENT_MODES.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12}>
            <TextField fullWidth label="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} size="small" multiline rows={2} />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="outlined">Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={loading}
          startIcon={loading ? <CircularProgress size={16} /> : <Payment />}>
          Record Payment
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Change Due Date Dialog ───────────────────────────────────────────────────

const ChangeDueDateDialog = ({ open, onClose, installment, onSave }) => {
  const [newDate, setNewDate] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && installment) { setNewDate(installment.dueDate || ''); setReason(''); setError(''); }
  }, [open, installment]);

  const handleSave = async () => {
    if (!newDate) { setError('Select a new date'); return; }
    if (!reason.trim()) { setError('Reason is required'); return; }
    if (newDate === installment.dueDate) { setError('New date is same as current'); return; }
    setLoading(true);
    try { await onSave({ newDate, reason }); onClose(); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  if (!installment) return null;
  const changeCount = installment.dueDateChangeCount || 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Change Due Date — EMI #{installment.installmentNumber}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {changeCount > 0 && (
          <Alert severity="warning" sx={{ mb: 2 }} icon={<History />}>
            Changed <strong>{changeCount}</strong> time{changeCount > 1 ? 's' : ''} already.
          </Alert>
        )}
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <TextField fullWidth label="Current Due Date" value={formatDate(installment.dueDate)} size="small" disabled />
          </Grid>
          <Grid item xs={12}>
            <TextField fullWidth label="New Due Date *" type="date" value={newDate}
              onChange={e => setNewDate(e.target.value)} size="small" InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={12}>
            <TextField fullWidth label="Reason *" value={reason}
              onChange={e => setReason(e.target.value)} size="small" multiline rows={2}
              placeholder="e.g. Customer requested extension..." />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="outlined">Cancel</Button>
        <Button onClick={handleSave} variant="contained" color="warning" disabled={loading}
          startIcon={loading ? <CircularProgress size={16} /> : <CalendarMonth />}>
          Change Date
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const TabPanel = ({ children, value, index }) =>
  value === index ? <Box sx={{ pt: 2 }}>{children}</Box> : null;

// ─── Main Component ───────────────────────────────────────────────────────────

const SaleDetail = () => {
  const { db } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [sale, setSale] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);
  const [payDialog, setPayDialog] = useState(null);       // EMI installment
  const [dateDialog, setDateDialog] = useState(null);     // Change due date
  const [salePayDialog, setSalePayDialog] = useState(false); // Non-EMI payment

  const loadSale = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'sales', id));
      if (!snap.exists()) { toast.error('Sale not found'); navigate('/sales'); return; }
      let saleData = { id: snap.id, ...snap.data() };

      // ── Backward compatibility: migrate old emi_installments collection ──
      // If this sale has EMI but no emiInstallments array, try loading from old collection
      if (saleData.paymentType === PAYMENT_TYPES.EMI && !saleData.emiInstallments?.length) {
        try {
          const oldSnap = await getDocs(
            query(collection(db, 'emi_installments'), where('saleId', '==', id), orderBy('installmentNumber'))
          );
          if (!oldSnap.empty) {
            const oldInstallments = oldSnap.docs.map(d => {
              const data = d.data();
              // Strip Firestore-specific fields and keep only the data
              const { saleId, invoiceNumber: _inv, customerName: _cn, customerPhone: _cp,
                createdAt: _ca, updatedAt: _ua, ...rest } = data;
              return rest;
            });
            saleData = { ...saleData, emiInstallments: oldInstallments };
            // Optionally migrate: write them back to sale doc
            await updateDoc(doc(db, 'sales', id), {
              emiInstallments: oldInstallments,
              updatedAt: serverTimestamp(),
            });
          }
        } catch (e) {
          // Old collection may not exist or index missing — ignore silently
          console.warn('[SaleDetail] Could not migrate old emi_installments:', e.message);
        }
      }

      setSale(saleData);
    } catch (e) {
      toast.error('Failed to load sale: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [db, id]);

  useEffect(() => {
    if (db && id) loadSale();
  }, [db, id]);

  // ── EMI payment recorded → update installment inside sale.emiInstallments ──
  const handleRecordEmiPayment = async ({ amount, mode, payDate, notes }) => {
    const inst = payDialog;
    const instIdx = (sale.emiInstallments || []).findIndex(i => i.installmentNumber === inst.installmentNumber);
    if (instIdx === -1) { toast.error('Installment not found'); return; }

    const updatedInstallments = [...(sale.emiInstallments || [])];
    const existing = updatedInstallments[instIdx];
    const newPaid = (existing.paidAmount || 0) + amount;
    const newStatus = newPaid >= existing.amount ? 'paid' : 'partial';
    updatedInstallments[instIdx] = {
      ...existing,
      paidAmount: newPaid,
      status: newStatus,
      payments: [...(existing.payments || []), { amount, mode, payDate, notes, recordedAt: new Date().toISOString() }],
    };

    try {
      await updateDoc(doc(db, 'sales', id), {
        emiInstallments: updatedInstallments,
        updatedAt: serverTimestamp(),
      });
      toast.success(`Payment of ${formatCurrency(amount)} recorded`);
      await loadSale();
    } catch (e) {
      toast.error('Failed: ' + e.message);
    }
  };

  // ── Due date change → update installment inside sale.emiInstallments ──
  const handleChangeDueDate = async ({ newDate, reason }) => {
    const inst = dateDialog;
    const instIdx = (sale.emiInstallments || []).findIndex(i => i.installmentNumber === inst.installmentNumber);
    if (instIdx === -1) { toast.error('Installment not found'); return; }

    const updatedInstallments = [...(sale.emiInstallments || [])];
    const existing = updatedInstallments[instIdx];
    updatedInstallments[instIdx] = {
      ...existing,
      dueDate: newDate,
      dueDateChanges: [...(existing.dueDateChanges || []), {
        from: existing.dueDate, to: newDate, reason, changedAt: new Date().toISOString(),
      }],
      dueDateChangeCount: (existing.dueDateChangeCount || 0) + 1,
    };

    try {
      await updateDoc(doc(db, 'sales', id), {
        emiInstallments: updatedInstallments,
        updatedAt: serverTimestamp(),
      });
      toast.success('Due date updated');
      await loadSale();
    } catch (e) {
      toast.error('Failed: ' + e.message);
    }
  };

  // ── Non-EMI partial payment ──
  const handleRecordSalePayment = async ({ amount, mode, payDate, notes }) => {
    const newPayment = { amount, mode, payDate, notes, recordedAt: new Date().toISOString() };
    const newPayments = [...(sale.salePayments || []), newPayment];
    const newTotal = newPayments.reduce((s, p) => s + p.amount, 0);
    const newStatus = newTotal >= sale.grandTotal ? 'paid' : 'partial';

    try {
      await updateDoc(doc(db, 'sales', id), {
        salePayments: newPayments,
        totalPaidAmount: newTotal,
        paymentStatus: newStatus,
        updatedAt: serverTimestamp(),
      });
      toast.success(`Payment of ${formatCurrency(amount)} recorded`);
      await loadSale();
    } catch (e) {
      toast.error('Failed: ' + e.message);
    }
  };

  if (loading) return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
      <CircularProgress />
    </Box>
  );
  if (!sale) return null;

  const company = COMPANIES[sale.companyId];
  const isEMI = sale.paymentType === PAYMENT_TYPES.EMI;
  const canRecordPayment = [PAYMENT_TYPES.PENDING, PAYMENT_TYPES.FINANCE, PAYMENT_TYPES.BANK_TRANSFER].includes(sale.paymentType);

  // EMI stats — read from sale.emiInstallments
  const installments = sale.emiInstallments || [];
  const totalInstAmt = installments.reduce((s, i) => s + i.amount, 0);
  const totalPaid = installments.reduce((s, i) => s + (i.paidAmount || 0), 0);
  const totalRemaining = totalInstAmt - totalPaid;
  const paidCount = installments.filter(i => getInstallmentStatus(i) === 'paid').length;
  const overdueCount = installments.filter(i => getInstallmentStatus(i) === 'overdue').length;

  // Non-EMI payment stats
  const salePayments = sale.salePayments || [];
  const totalSalePaid = sale.totalPaidAmount || salePayments.reduce((s, p) => s + p.amount, 0);
  const saleBalance = (sale.grandTotal || 0) - totalSalePaid;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1000, mx: 'auto' }}>
      {/* Header */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3} flexWrap="wrap" gap={1}>
        <Box display="flex" alignItems="center" gap={1}>
          <IconButton onClick={() => navigate('/sales')}><ArrowBack /></IconButton>
          <Box>
            <Typography variant="h5" fontWeight={700}>{sale.invoiceNumber}</Typography>
            <Typography variant="body2" color="text.secondary">{formatDate(sale.saleDate)} · {sale.companyName}</Typography>
          </Box>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Button variant="outlined" startIcon={<Print />}
            onClick={() => printInvoice(sale, installments, company)}
            size={isMobile ? 'small' : 'medium'}>
            {isMobile ? 'Invoice' : 'Print Invoice'}
          </Button>
          <Button variant="outlined" startIcon={<Edit />}
            onClick={() => navigate(`/sales/edit/${id}`)}
            size={isMobile ? 'small' : 'medium'}>
            {isMobile ? 'Edit' : 'Edit Sale'}
          </Button>
        </Stack>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant={isMobile ? 'fullWidth' : 'standard'}>
          <Tab label="Invoice Details" />
          <Tab label={
            isEMI
              ? <Badge badgeContent={overdueCount > 0 ? overdueCount : null} color="error">
                  Payment &amp; EMI
                </Badge>
              : 'Payment Info'
          } />
        </Tabs>
      </Box>

      {/* ── Tab 0: Invoice Details ── */}
      <TabPanel value={tab} index={0}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <Card><CardContent>
              <Typography variant="subtitle2" fontWeight={700} color="text.secondary" gutterBottom>COMPANY</Typography>
              <Typography fontWeight={700}>{company?.name}</Typography>
              <Typography variant="body2" color="text.secondary">{company?.address}</Typography>
              <Typography variant="body2" color="text.secondary">GST: {company?.gstNumber}</Typography>
              <Typography variant="body2" color="text.secondary">{company?.phone}</Typography>
            </CardContent></Card>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Card><CardContent>
              <Typography variant="subtitle2" fontWeight={700} color="text.secondary" gutterBottom>CUSTOMER</Typography>
              <Typography fontWeight={700}>{sale.customerName}</Typography>
              <Typography variant="body2" color="text.secondary">{sale.customerPhone}</Typography>
              <Chip label={sale.invoiceType === 'gst' ? 'GST Invoice' : 'Non-GST Invoice'}
                size="small" color={sale.invoiceType === 'gst' ? 'info' : 'default'} sx={{ mt: 1 }} />
            </CardContent></Card>
          </Grid>

          <Grid item xs={12}>
            <Card><CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                <Typography variant="subtitle2" fontWeight={700}>ITEMS</Typography>
                {sale.bulkPrice > 0 && (
                  <Chip
                    label={`Bulk: ${formatCurrency(sale.bulkPrice)}`}
                    color="secondary"
                    size="small"
                  />
                )}
              </Box>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Product</TableCell>
                      <TableCell align="center">Qty</TableCell>
                      {!sale.bulkPrice && <TableCell align="right">Price</TableCell>}
                      {!sale.bulkPrice && sale.invoiceType === 'gst' && <TableCell align="right">GST</TableCell>}
                      {!sale.bulkPrice && <TableCell align="right">Amount</TableCell>}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sale.items?.map((it, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>{it.productName}</Typography>
                          <Typography variant="caption" color="text.secondary">{it.unit}</Typography>
                        </TableCell>
                        <TableCell align="center">{it.qty}</TableCell>
                        {!sale.bulkPrice && (
                          <TableCell align="right">{formatCurrency(it.price)}</TableCell>
                        )}
                        {!sale.bulkPrice && sale.invoiceType === 'gst' && (
                          <TableCell align="right">
                            <Typography variant="caption">{it.gstRate}%</Typography><br />
                            <Typography variant="caption" color="info.main">{formatCurrency(it.totalTax)}</Typography>
                          </TableCell>
                        )}
                        {!sale.bulkPrice && (
                          <TableCell align="right"><Typography fontWeight={600}>{formatCurrency(it.subtotal)}</Typography></TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Bulk total row */}
              {sale.bulkPrice > 0 && (
                <Box sx={{
                  mt: 1.5, px: 2, py: 1.5,
                  bgcolor: 'secondary.50', border: '1px dashed', borderColor: 'secondary.main',
                  borderRadius: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <Typography variant="body2" color="text.secondary">
                    {sale.items?.length} item{sale.items?.length > 1 ? 's' : ''} · Bulk total
                  </Typography>
                  <Typography variant="subtitle1" fontWeight={800} color="secondary.main">
                    {formatCurrency(sale.bulkPrice)}
                  </Typography>
                </Box>
              )}

              <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 0.5, alignItems: 'flex-end' }}>
                {!sale.bulkPrice && [
                  { label: 'Subtotal', value: formatCurrency(sale.subtotal) },
                  ...(sale.invoiceType === 'gst' ? [{ label: 'GST', value: formatCurrency(sale.totalTax), color: 'info.main' }] : []),
                ].map(({ label, value, color }) => (
                  <Box key={label} display="flex" justifyContent="space-between" width={{ xs: '100%', sm: 280 }}>
                    <Typography variant="body2" color="text.secondary">{label}</Typography>
                    <Typography variant="body2" color={color}>{value}</Typography>
                  </Box>
                ))}
                {sale.hasExchange && sale.exchangeValue > 0 && (
                  <Box display="flex" justifyContent="space-between" width={{ xs: '100%', sm: 280 }}>
                    <Typography variant="body2" color="text.secondary">Exchange</Typography>
                    <Typography variant="body2" color="error.main">− {formatCurrency(sale.exchangeValue)}</Typography>
                  </Box>
                )}
                <Divider sx={{ width: { xs: '100%', sm: 280 } }} />
                <Box display="flex" justifyContent="space-between" width={{ xs: '100%', sm: 280 }}>
                  <Typography variant="subtitle2" fontWeight={700}>Grand Total</Typography>
                  <Typography variant="subtitle2" fontWeight={700} color="primary">{formatCurrency(sale.grandTotal)}</Typography>
                </Box>
              </Box>
            </CardContent></Card>
          </Grid>

          {sale.hasExchange && (
            <Grid item xs={12} sm={6}>
              <Card><CardContent>
                <Typography variant="subtitle2" fontWeight={700} color="text.secondary" gutterBottom>EXCHANGE</Typography>
                <Typography fontWeight={600}>{sale.exchangeItem}</Typography>
                <Typography variant="body2" color="text.secondary">Value: {formatCurrency(sale.exchangeValue)}</Typography>
                {sale.exchangeReceived
                  ? <Chip label="Item Received" color="success" size="small" sx={{ mt: 1 }} />
                  : <Chip label="Pending Receipt" color="warning" size="small" sx={{ mt: 1 }} />
                }
              </CardContent></Card>
            </Grid>
          )}

          <Grid item xs={12} sm={6}>
            <Card><CardContent>
              <Typography variant="subtitle2" fontWeight={700} color="text.secondary" gutterBottom>DELIVERY</Typography>
              {sale.deliveryType === 'immediate' || sale.isDelivered
                ? <Chip label={sale.isDelivered && sale.actualDeliveryDate ? `Delivered ${formatDate(sale.actualDeliveryDate)}` : 'Delivered at sale'} color="success" size="small" />
                : <Box>
                    <Chip label="Scheduled" color="warning" size="small" />
                    {sale.deliveryDate && <Typography variant="body2" mt={0.5}>Expected: {formatDate(sale.deliveryDate)}</Typography>}
                  </Box>
              }
            </CardContent></Card>
          </Grid>

          <Grid item xs={12} sm={6}>
            <Card><CardContent>
              <Typography variant="subtitle2" fontWeight={700} color="text.secondary" gutterBottom>SALESPERSON</Typography>
              <Typography>{sale.salesperson || '—'}</Typography>
              {sale.notes && <>
                <Typography variant="subtitle2" fontWeight={700} color="text.secondary" mt={1}>NOTES</Typography>
                <Typography variant="body2">{sale.notes}</Typography>
              </>}
            </CardContent></Card>
          </Grid>
        </Grid>
      </TabPanel>

      {/* ── Tab 1: Payment & EMI / Payment Info ── */}
      <TabPanel value={tab} index={1}>

        {/* Payment summary card */}
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={4}>
                <Typography variant="subtitle2" color="text.secondary">Payment Type</Typography>
                <Chip label={PAYMENT_LABELS[sale.paymentType]} color={getPaymentStatusColor(sale.paymentType)} size="small" sx={{ mt: 0.5 }} />
              </Grid>
              {sale.financerName && (
                <Grid item xs={12} sm={4}>
                  <Typography variant="subtitle2" color="text.secondary">Financer / Bank</Typography>
                  <Typography fontWeight={600}>{sale.financerName}</Typography>
                  {sale.paymentRef && <Typography variant="caption" color="text.secondary">Ref: {sale.paymentRef}</Typography>}
                </Grid>
              )}
              {sale.downPayment > 0 && (
                <Grid item xs={6} sm={4}>
                  <Typography variant="subtitle2" color="text.secondary">Down Payment</Typography>
                  <Typography fontWeight={700} color="success.main">{formatCurrency(sale.downPayment)}</Typography>
                </Grid>
              )}
              {isEMI && (
                <>
                  <Grid item xs={6} sm={4}>
                    <Typography variant="subtitle2" color="text.secondary">EMI</Typography>
                    <Typography fontWeight={600}>{formatCurrency(sale.emiAmount)} × {sale.emiMonths} months</Typography>
                  </Grid>
                  <Grid item xs={6} sm={4}>
                    <Typography variant="subtitle2" color="text.secondary">Total Paid</Typography>
                    <Typography fontWeight={700} color="success.main">{formatCurrency(totalPaid)}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={4}>
                    <Typography variant="subtitle2" color="text.secondary">Remaining</Typography>
                    <Typography fontWeight={700} color={totalRemaining > 0 ? 'error.main' : 'success.main'}>{formatCurrency(totalRemaining)}</Typography>
                  </Grid>
                </>
              )}
            </Grid>
          </CardContent>
        </Card>

        {/* ── EMI installments ── */}
        {isEMI && (
          <>
            {installments.length > 0 ? (
              <>
                <Box sx={{ mb: 2 }}>
                  <Box display="flex" justifyContent="space-between" mb={0.5}>
                    <Typography variant="body2" color="text.secondary">{paidCount} of {installments.length} installments paid</Typography>
                    {overdueCount > 0 && <Typography variant="body2" color="error">{overdueCount} overdue</Typography>}
                  </Box>
                  <LinearProgress variant="determinate"
                    value={installments.length > 0 ? (paidCount / installments.length) * 100 : 0}
                    sx={{ height: 8, borderRadius: 4 }} color={overdueCount > 0 ? 'error' : 'success'} />
                </Box>

                <Card sx={{ mb: 2 }}>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>#</TableCell>
                          <TableCell>Due Date</TableCell>
                          {!isMobile && <TableCell align="right">Amount</TableCell>}
                          {!isMobile && <TableCell align="right">Paid</TableCell>}
                          <TableCell>Status</TableCell>
                          <TableCell align="right">Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {installments.map((inst, idx) => {
                          const status = getInstallmentStatus(inst);
                          const isPaid = status === 'paid';
                          return (
                            <TableRow key={idx} hover sx={{ bgcolor: status === 'overdue' ? 'error.50' : 'inherit' }}>
                              <TableCell>{inst.installmentNumber}</TableCell>
                              <TableCell>
                                <Typography variant="body2">{formatDate(inst.dueDate)}</Typography>
                                {isMobile && <Typography variant="caption" color="text.secondary">{formatCurrency(inst.amount)}</Typography>}
                              </TableCell>
                              {!isMobile && <TableCell align="right">{formatCurrency(inst.amount)}</TableCell>}
                              {!isMobile && (
                                <TableCell align="right">
                                  {inst.paidAmount > 0
                                    ? <Typography variant="body2" color="success.main" fontWeight={600}>{formatCurrency(inst.paidAmount)}</Typography>
                                    : '—'}
                                </TableCell>
                              )}
                              <TableCell><StatusChip status={status} /></TableCell>
                              <TableCell align="right">
                                <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                  <Tooltip title={isPaid ? 'Fully Paid' : 'Record Payment'}>
                                    <span>
                                      <IconButton size="small" color="success" disabled={isPaid}
                                        onClick={() => setPayDialog(inst)}>
                                        <Payment fontSize="small" />
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                  <Tooltip title={isPaid ? 'Already Paid' : 'Change Due Date'}>
                                    <span>
                                      <IconButton size="small" color="warning" disabled={isPaid}
                                        onClick={() => setDateDialog(inst)}>
                                        <CalendarMonth fontSize="small" />
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                </Stack>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Card>
              </>
            ) : (
              <Alert severity="warning" sx={{ mb: 2 }}>
                No EMI installments found. This may be an older record — try editing and re-saving to regenerate.
              </Alert>
            )}

            {/* EMI payment history */}
            {installments.some(i => i.payments?.length > 0) && (
              <Box mt={2}>
                <Typography variant="subtitle2" fontWeight={700} mb={1}>Payment History</Typography>
                {installments.filter(i => i.payments?.length > 0).map((inst, ii) => (
                  <Card key={ii} sx={{ mb: 1 }}>
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Typography variant="body2" fontWeight={700} mb={1} color="primary">
                        EMI #{inst.installmentNumber}
                      </Typography>
                      {inst.payments.map((p, pi) => (
                        <Box key={pi} display="flex" justifyContent="space-between" alignItems="center"
                          sx={{ py: 0.5, borderBottom: pi < inst.payments.length - 1 ? '1px solid' : 'none', borderColor: 'divider' }}>
                          <Box>
                            <Typography variant="body2">{formatDate(p.payDate)} · {p.mode}</Typography>
                            {p.notes && <Typography variant="caption" color="text.secondary">{p.notes}</Typography>}
                          </Box>
                          <Typography variant="body2" fontWeight={700} color="success.main">+ {formatCurrency(p.amount)}</Typography>
                        </Box>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </Box>
            )}

            {/* Due date change history */}
            {installments.some(i => i.dueDateChanges?.length > 0) && (
              <Box mt={2}>
                <Typography variant="subtitle2" fontWeight={700} mb={1}>Due Date Change History</Typography>
                {installments.filter(i => i.dueDateChanges?.length > 0).map((inst, ii) => (
                  <Card key={ii} sx={{ mb: 1 }}>
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Typography variant="body2" fontWeight={700} mb={1} color="warning.dark">
                        EMI #{inst.installmentNumber} — {inst.dueDateChangeCount} change{inst.dueDateChangeCount > 1 ? 's' : ''}
                      </Typography>
                      {inst.dueDateChanges.map((c, ci) => (
                        <Box key={ci} sx={{ py: 0.5, borderBottom: ci < inst.dueDateChanges.length - 1 ? '1px solid' : 'none', borderColor: 'divider' }}>
                          <Typography variant="body2">{formatDate(c.from)} → <strong>{formatDate(c.to)}</strong></Typography>
                          <Typography variant="caption" color="text.secondary">Reason: {c.reason}</Typography>
                        </Box>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </Box>
            )}
          </>
        )}

        {/* ── Non-EMI partial payment tracking ── */}
        {canRecordPayment && (
          <>
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5} flexWrap="wrap" gap={1}>
                  <Typography variant="subtitle2" fontWeight={700}>Payment Status</Typography>
                  {saleBalance > 0.01 && (
                    <Button size="small" variant="contained" color="success"
                      startIcon={<Payment />} onClick={() => setSalePayDialog(true)}>
                      Record Payment
                    </Button>
                  )}
                </Box>
                <Grid container spacing={2}>
                  <Grid item xs={4}>
                    <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 2, textAlign: 'center' }}>
                      <Typography variant="caption" color="text.secondary">Invoice Total</Typography>
                      <Typography variant="h6" fontWeight={700} color="primary">{formatCurrency(sale.grandTotal)}</Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={4}>
                    <Box sx={{ p: 1.5, bgcolor: 'success.50', borderRadius: 2, textAlign: 'center' }}>
                      <Typography variant="caption" color="text.secondary">Total Paid</Typography>
                      <Typography variant="h6" fontWeight={700} color="success.main">{formatCurrency(totalSalePaid)}</Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={4}>
                    <Box sx={{ p: 1.5, bgcolor: saleBalance > 0 ? 'error.50' : 'success.50', borderRadius: 2, textAlign: 'center' }}>
                      <Typography variant="caption" color="text.secondary">Balance Due</Typography>
                      <Typography variant="h6" fontWeight={700} color={saleBalance > 0 ? 'error.main' : 'success.main'}>{formatCurrency(saleBalance)}</Typography>
                    </Box>
                  </Grid>
                </Grid>
                {sale.grandTotal > 0 && (
                  <Box mt={1.5}>
                    <LinearProgress variant="determinate"
                      value={Math.min(100, (totalSalePaid / sale.grandTotal) * 100)}
                      sx={{ height: 8, borderRadius: 4 }} color={saleBalance <= 0 ? 'success' : 'warning'} />
                    <Typography variant="caption" color="text.secondary" mt={0.5} display="block">
                      {((totalSalePaid / sale.grandTotal) * 100).toFixed(1)}% paid
                    </Typography>
                  </Box>
                )}
              </CardContent>
            </Card>

            {salePayments.length > 0 ? (
              <Box mb={2}>
                <Typography variant="subtitle2" fontWeight={700} mb={1}>Payment History</Typography>
                {salePayments.map((p, i) => (
                  <Card key={i} sx={{ mb: 1 }}>
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                        <Box flex={1}>
                          <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                            <Typography variant="body2" fontWeight={600}>{formatDate(p.payDate)}</Typography>
                            <Chip label={p.mode} size="small" variant="outlined" />
                            <Chip label={`#${i + 1}`} size="small" />
                          </Box>
                          {p.notes && <Typography variant="caption" color="text.secondary">{p.notes}</Typography>}
                        </Box>
                        <Box textAlign="right">
                          <Typography variant="body1" fontWeight={700} color="success.main">
                            + {formatCurrency(p.amount)}
                          </Typography>
                          <Button size="small" variant="text" startIcon={<Receipt fontSize="small" />}
                            onClick={() => printReceipt(
                              { ...sale, salePayments: salePayments.slice(0, i + 1), totalPaidAmount: salePayments.slice(0, i + 1).reduce((s, x) => s + x.amount, 0) },
                              p, company
                            )}
                            sx={{ fontSize: 11, mt: 0.5, p: 0.5 }}>
                            Receipt
                          </Button>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                ))}
              </Box>
            ) : (
              <Alert severity="info">
                No payments recorded yet. Click "Record Payment" to add a partial or full payment.
              </Alert>
            )}
          </>
        )}

        {/* Full payment — no action needed */}
        {!isEMI && !canRecordPayment && (
          <Alert severity={sale.paymentType === PAYMENT_TYPES.FULL ? 'success' : 'info'}>
            This sale uses <strong>{PAYMENT_LABELS[sale.paymentType]}</strong>.
            {sale.paymentType === PAYMENT_TYPES.FULL && ' Payment collected in full.'}
          </Alert>
        )}
      </TabPanel>

      <RecordPaymentDialog
        open={Boolean(payDialog)} onClose={() => setPayDialog(null)}
        installment={payDialog} onSave={handleRecordEmiPayment}
      />
      <ChangeDueDateDialog
        open={Boolean(dateDialog)} onClose={() => setDateDialog(null)}
        installment={dateDialog} onSave={handleChangeDueDate}
      />
      <RecordSalePaymentDialog
        open={salePayDialog} onClose={() => setSalePayDialog(false)}
        sale={sale} onSave={handleRecordSalePayment}
      />
    </Box>
  );
};

export default SaleDetail;