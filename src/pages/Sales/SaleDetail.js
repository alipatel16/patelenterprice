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
  AccessTime, Warning, History, AttachMoney,
} from '@mui/icons-material';
import {
  collection, query, where, orderBy, getDocs, addDoc, updateDoc,
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

// ─── Record Payment Dialog ────────────────────────────────────────────────────

const RecordPaymentDialog = ({ open, onClose, installment, onSave }) => {
  const remaining = installment ? installment.amount - (installment.paidAmount || 0) : 0;
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('Cash');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setAmount(remaining.toFixed(2));
      setMode('Cash');
      setPayDate(new Date().toISOString().split('T')[0]);
      setNotes('');
      setError('');
    }
  }, [open, remaining]);

  const handleSave = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return; }
    if (amt > remaining + 0.01) { setError(`Amount cannot exceed remaining ${formatCurrency(remaining)}`); return; }
    setLoading(true);
    try { await onSave({ amount: amt, mode, payDate, notes }); onClose(); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  if (!installment) return null;
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Record Payment — Installment #{installment.installmentNumber}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box sx={{ mb: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 2 }}>
          <Typography variant="caption" color="text.secondary" display="block">EMI Amount</Typography>
          <Typography fontWeight={700}>{formatCurrency(installment.amount)}</Typography>
          <Typography variant="caption" color="text.secondary">
            Paid: {formatCurrency(installment.paidAmount || 0)} &nbsp;|&nbsp;
            Remaining: <strong style={{ color: remaining > 0 ? '#d32f2f' : '#388e3c' }}>{formatCurrency(remaining)}</strong>
          </Typography>
        </Box>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <TextField fullWidth label="Amount Paid (₹) *" type="number" value={amount}
              onChange={e => setAmount(e.target.value)} size="small"
              helperText={`Max: ${formatCurrency(remaining)}`} />
          </Grid>
          <Grid item xs={12}>
            <TextField fullWidth label="Payment Date *" type="date" value={payDate}
              onChange={e => setPayDate(e.target.value)} size="small" InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={12}>
            <TextField fullWidth label="Payment Mode" value={mode}
              onChange={e => setMode(e.target.value)} size="small" select>
              {PAYMENT_MODES.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12}>
            <TextField fullWidth label="Notes (optional)" value={notes}
              onChange={e => setNotes(e.target.value)} size="small" multiline rows={2} />
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
    if (!newDate) { setError('Please select a new date'); return; }
    if (!reason.trim()) { setError('Please provide a reason for date change'); return; }
    if (newDate === installment.dueDate) { setError('New date is same as current date'); return; }
    setLoading(true);
    try { await onSave({ newDate, reason }); onClose(); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  if (!installment) return null;
  const changeCount = installment.dueDateChangeCount || 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Change Due Date — Installment #{installment.installmentNumber}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {changeCount > 0 && (
          <Alert severity="warning" sx={{ mb: 2 }} icon={<History />}>
            This installment's due date has been changed <strong>{changeCount} time{changeCount > 1 ? 's' : ''}</strong> already.
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
            <TextField fullWidth label="Reason for Change *" value={reason}
              onChange={e => setReason(e.target.value)} size="small" multiline rows={2}
              placeholder="e.g. Customer requested extension, financial hardship..." />
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

// ─── Tab Panel ────────────────────────────────────────────────────────────────

const TabPanel = ({ children, value, index }) =>
  value === index ? <Box pt={3}>{children}</Box> : null;

// ─── Main Component ───────────────────────────────────────────────────────────

const SaleDetail = () => {
  const { db } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [sale, setSale] = useState(null);
  const [installments, setInstallments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [installmentsError, setInstallmentsError] = useState('');
  const [tab, setTab] = useState(0);
  const [payDialog, setPayDialog] = useState(null);
  const [dateDialog, setDateDialog] = useState(null);

  useEffect(() => {
    if (!db || !id) return;
    loadSale();
  }, [db, id]);

  const loadInstallments = useCallback(async () => {
    setInstallmentsError('');
    try {
      // NOTE: This query requires a Firestore composite index.
      // If you see an error in the console with a URL, click that URL to create the index automatically.
      const q = query(
        collection(db, 'emi_installments'),
        where('saleId', '==', id),
        orderBy('installmentNumber', 'asc')
      );
      const snap = await getDocs(q);
      setInstallments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      // Log full error so the Firestore index creation URL is visible in browser console
      console.error('[SaleDetail] Failed to load emi_installments:', err);
      console.error('[SaleDetail] If you see a Firestore index URL above, click it to create the required index.');
      setInstallmentsError(
        err.message?.includes('index')
          ? 'Firestore index required — check the browser console for a link to create it automatically.'
          : `Failed to load installments: ${err.message}`
      );
    }
  }, [db, id]);

  const loadSale = async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'sales', id));
      if (!snap.exists()) {
        console.error('[SaleDetail] Sale not found, id:', id);
        toast.error('Sale not found');
        navigate('/sales');
        return;
      }
      const saleData = { id: snap.id, ...snap.data() };
      setSale(saleData);
      if (saleData.paymentType === PAYMENT_TYPES.EMI) {
        await loadInstallments();
      }
    } catch (e) {
      console.error('[SaleDetail] Failed to load sale:', e);
      toast.error('Failed to load sale: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRecordPayment = async ({ amount, mode, payDate, notes }) => {
    const inst = payDialog;
    const newPaid = (inst.paidAmount || 0) + amount;
    const newStatus = newPaid >= inst.amount ? 'paid' : 'partial';
    const payment = { amount, mode, payDate, notes, recordedAt: new Date().toISOString() };
    try {
      await updateDoc(doc(db, 'emi_installments', inst.id), {
        paidAmount: newPaid,
        status: newStatus,
        payments: [...(inst.payments || []), payment],
        updatedAt: serverTimestamp(),
      });
      toast.success(`Payment of ${formatCurrency(amount)} recorded`);
      await loadInstallments();
    } catch (e) {
      console.error('[SaleDetail] Failed to record payment:', e);
      toast.error('Failed to record payment: ' + e.message);
    }
  };

  const handleChangeDueDate = async ({ newDate, reason }) => {
    const inst = dateDialog;
    const change = { from: inst.dueDate, to: newDate, reason, changedAt: new Date().toISOString() };
    try {
      await updateDoc(doc(db, 'emi_installments', inst.id), {
        dueDate: newDate,
        dueDateChanges: [...(inst.dueDateChanges || []), change],
        dueDateChangeCount: (inst.dueDateChangeCount || 0) + 1,
        updatedAt: serverTimestamp(),
      });
      toast.success('Due date updated');
      await loadInstallments();
    } catch (e) {
      console.error('[SaleDetail] Failed to change due date:', e);
      toast.error('Failed to update due date: ' + e.message);
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

  const totalInstallmentAmount = installments.reduce((s, i) => s + i.amount, 0);
  const totalPaid = installments.reduce((s, i) => s + (i.paidAmount || 0), 0);
  const totalRemaining = totalInstallmentAmount - totalPaid;
  const paidCount = installments.filter(i => getInstallmentStatus(i) === 'paid').length;
  const overdueCount = installments.filter(i => getInstallmentStatus(i) === 'overdue').length;

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
        <Button variant="outlined" startIcon={<Edit />} onClick={() => navigate(`/sales/edit/${id}`)}>
          Edit Sale
        </Button>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
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
            <Card>
              <CardContent>
                <Typography variant="subtitle2" fontWeight={700} color="text.secondary" gutterBottom>COMPANY</Typography>
                <Typography fontWeight={700}>{company?.name}</Typography>
                <Typography variant="body2" color="text.secondary">{company?.address}</Typography>
                <Typography variant="body2" color="text.secondary">GST: {company?.gstNumber}</Typography>
                <Typography variant="body2" color="text.secondary">{company?.phone}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Card>
              <CardContent>
                <Typography variant="subtitle2" fontWeight={700} color="text.secondary" gutterBottom>CUSTOMER</Typography>
                <Typography fontWeight={700}>{sale.customerName}</Typography>
                <Typography variant="body2" color="text.secondary">{sale.customerPhone}</Typography>
                <Chip label={sale.invoiceType === 'gst' ? 'GST Invoice' : 'Non-GST Invoice'}
                  size="small" color={sale.invoiceType === 'gst' ? 'info' : 'default'} sx={{ mt: 1 }} />
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="subtitle2" fontWeight={700} mb={1}>ITEMS</Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Product</TableCell>
                        <TableCell align="center">Qty</TableCell>
                        <TableCell align="right">Price</TableCell>
                        {sale.invoiceType === 'gst' && <TableCell align="right">GST</TableCell>}
                        <TableCell align="right">Amount</TableCell>
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
                          <TableCell align="right">{formatCurrency(it.price)}</TableCell>
                          {sale.invoiceType === 'gst' && (
                            <TableCell align="right">
                              <Typography variant="caption" color="text.secondary">{it.gstRate}%</Typography>
                            </TableCell>
                          )}
                          <TableCell align="right" sx={{ fontWeight: 700 }}>{formatCurrency(it.subtotal)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                <Box sx={{ mt: 2, maxWidth: 300, ml: 'auto', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Box display="flex" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">Subtotal</Typography>
                    <Typography variant="body2">{formatCurrency(sale.subtotal)}</Typography>
                  </Box>
                  {sale.invoiceType === 'gst' && (
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">Total GST</Typography>
                      <Typography variant="body2" color="info.main">{formatCurrency(sale.totalTax)}</Typography>
                    </Box>
                  )}
                  {sale.hasExchange && sale.exchangeValue > 0 && (
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">Exchange ({sale.exchangeItem})</Typography>
                      <Typography variant="body2" color="error.main">− {formatCurrency(sale.exchangeValue)}</Typography>
                    </Box>
                  )}
                  <Divider />
                  <Box display="flex" justifyContent="space-between">
                    <Typography fontWeight={700}>Grand Total</Typography>
                    <Typography fontWeight={700} color="primary.main">{formatCurrency(sale.grandTotal)}</Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6}>
            <Card>
              <CardContent>
                <Typography variant="subtitle2" fontWeight={700} color="text.secondary" gutterBottom>DELIVERY</Typography>
                {sale.deliveryType === 'immediate'
                  ? <Chip label="Delivered at sale" color="success" size="small" />
                  : <Box>
                      <Chip label="Scheduled" color="warning" size="small" />
                      {sale.deliveryDate && (
                        <Typography variant="body2" mt={0.5}>Expected: {formatDate(sale.deliveryDate)}</Typography>
                      )}
                    </Box>
                }
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Card>
              <CardContent>
                <Typography variant="subtitle2" fontWeight={700} color="text.secondary" gutterBottom>SALESPERSON</Typography>
                <Typography>{sale.salesperson || '—'}</Typography>
                {sale.notes && (
                  <>
                    <Typography variant="subtitle2" fontWeight={700} color="text.secondary" mt={1}>NOTES</Typography>
                    <Typography variant="body2">{sale.notes}</Typography>
                  </>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </TabPanel>

      {/* ── Tab 1: Payment & EMI ── */}
      <TabPanel value={tab} index={1}>
        {/* Payment summary */}
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={4}>
                <Typography variant="subtitle2" color="text.secondary">Payment Type</Typography>
                <Chip label={PAYMENT_LABELS[sale.paymentType]} color={getPaymentStatusColor(sale.paymentType)} sx={{ mt: 0.5 }} />
              </Grid>
              <Grid item xs={6} sm={2}>
                <Typography variant="subtitle2" color="text.secondary">Grand Total</Typography>
                <Typography fontWeight={700}>{formatCurrency(sale.grandTotal)}</Typography>
              </Grid>
              {sale.downPayment > 0 && (
                <Grid item xs={6} sm={2}>
                  <Typography variant="subtitle2" color="text.secondary">Down Payment</Typography>
                  <Typography fontWeight={700} color="success.main">{formatCurrency(sale.downPayment)}</Typography>
                </Grid>
              )}
              {isEMI && (
                <>
                  <Grid item xs={6} sm={2}>
                    <Typography variant="subtitle2" color="text.secondary">Balance Financed</Typography>
                    <Typography fontWeight={700}>{formatCurrency(sale.balanceDue)}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={2}>
                    <Typography variant="subtitle2" color="text.secondary">EMI / Month</Typography>
                    <Typography fontWeight={700} color="primary.main">{formatCurrency(sale.emiAmount)}</Typography>
                  </Grid>
                </>
              )}
              {(sale.paymentType === PAYMENT_TYPES.FINANCE || sale.paymentType === PAYMENT_TYPES.BANK_TRANSFER) && (
                <>
                  {sale.financerName && (
                    <Grid item xs={6} sm={3}>
                      <Typography variant="subtitle2" color="text.secondary">Financer / Bank</Typography>
                      <Typography fontWeight={600}>{sale.financerName}</Typography>
                    </Grid>
                  )}
                  {sale.paymentRef && (
                    <Grid item xs={6} sm={3}>
                      <Typography variant="subtitle2" color="text.secondary">Reference No.</Typography>
                      <Typography fontWeight={600}>{sale.paymentRef}</Typography>
                    </Grid>
                  )}
                </>
              )}
            </Grid>
          </CardContent>
        </Card>

        {/* EMI section */}
        {isEMI && (
          <>
            {/* Index error banner */}
            {installmentsError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {installmentsError}
              </Alert>
            )}

            {/* EMI progress summary cards */}
            <Grid container spacing={2} mb={2}>
              {[
                { label: 'Total EMI Amount',    value: formatCurrency(totalInstallmentAmount), color: 'text.primary' },
                { label: 'Total Paid',           value: formatCurrency(totalPaid),             color: 'success.main' },
                { label: 'Remaining',            value: formatCurrency(totalRemaining),        color: totalRemaining > 0 ? 'error.main' : 'success.main' },
                { label: 'Paid Installments',    value: `${paidCount} / ${installments.length}`, color: 'primary.main' },
              ].map((s, i) => (
                <Grid item xs={6} sm={3} key={i}>
                  <Paper sx={{ p: 1.5, textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary" display="block">{s.label}</Typography>
                    <Typography variant="h6" fontWeight={700} color={s.color}>{s.value}</Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>

            {/* Overall progress bar */}
            {totalInstallmentAmount > 0 && (
              <Box mb={2}>
                <Box display="flex" justifyContent="space-between" mb={0.5}>
                  <Typography variant="caption" color="text.secondary">Overall EMI Collection Progress</Typography>
                  <Typography variant="caption" fontWeight={700}>{((totalPaid / totalInstallmentAmount) * 100).toFixed(0)}%</Typography>
                </Box>
                <LinearProgress variant="determinate" value={(totalPaid / totalInstallmentAmount) * 100}
                  sx={{ height: 8, borderRadius: 4 }} color={totalRemaining === 0 ? 'success' : 'primary'} />
              </Box>
            )}

            {/* Installments table */}
            {installments.length === 0 && !installmentsError ? (
              <Alert severity="info">No installments found. They are created automatically when an EMI sale is saved.</Alert>
            ) : installments.length > 0 && (
              <Card>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>#</TableCell>
                        <TableCell>Due Date</TableCell>
                        <TableCell align="right">EMI Amt</TableCell>
                        <TableCell align="right">Paid</TableCell>
                        <TableCell align="right">Remaining</TableCell>
                        <TableCell align="center">Status</TableCell>
                        {!isMobile && <TableCell align="center">Changes</TableCell>}
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {installments.map((inst) => {
                        const status = getInstallmentStatus(inst);
                        const remaining = inst.amount - (inst.paidAmount || 0);
                        const changeCount = inst.dueDateChangeCount || 0;
                        const isPaid = status === 'paid';
                        return (
                          <TableRow key={inst.id} sx={{
                            bgcolor: status === 'overdue' ? 'error.50' : status === 'paid' ? 'success.50' : 'inherit',
                          }}>
                            <TableCell><Typography variant="body2" fontWeight={700}>#{inst.installmentNumber}</Typography></TableCell>
                            <TableCell>
                              <Typography variant="body2">{formatDate(inst.dueDate)}</Typography>
                              {changeCount > 0 && (
                                <Typography variant="caption" color="warning.main">(changed {changeCount}×)</Typography>
                              )}
                            </TableCell>
                            <TableCell align="right"><Typography variant="body2" fontWeight={600}>{formatCurrency(inst.amount)}</Typography></TableCell>
                            <TableCell align="right"><Typography variant="body2" color="success.main" fontWeight={600}>{formatCurrency(inst.paidAmount || 0)}</Typography></TableCell>
                            <TableCell align="right">
                              <Typography variant="body2" color={remaining > 0 ? 'error.main' : 'success.main'} fontWeight={600}>
                                {formatCurrency(remaining)}
                              </Typography>
                            </TableCell>
                            <TableCell align="center"><StatusChip status={status} /></TableCell>
                            {!isMobile && (
                              <TableCell align="center">
                                {changeCount > 0
                                  ? <Chip icon={<History sx={{ fontSize: 12 }} />} label={`${changeCount}×`} color="warning" size="small" variant="outlined" />
                                  : <Typography variant="caption" color="text.secondary">—</Typography>
                                }
                              </TableCell>
                            )}
                            <TableCell align="right">
                              <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                <Tooltip title={isPaid ? 'Fully Paid' : 'Record Payment'}>
                                  <span>
                                    <IconButton size="small" color="success" disabled={isPaid} onClick={() => setPayDialog(inst)}>
                                      <Payment fontSize="small" />
                                    </IconButton>
                                  </span>
                                </Tooltip>
                                <Tooltip title={isPaid ? 'Already Paid' : 'Change Due Date'}>
                                  <span>
                                    <IconButton size="small" color="warning" disabled={isPaid} onClick={() => setDateDialog(inst)}>
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
            )}

            {/* Payment history */}
            {installments.some(i => i.payments?.length > 0) && (
              <Box mt={3}>
                <Typography variant="subtitle2" fontWeight={700} mb={1}>Payment History</Typography>
                {installments.filter(i => i.payments?.length > 0).map(inst => (
                  <Card key={inst.id} sx={{ mb: 1 }}>
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Typography variant="body2" fontWeight={700} mb={1} color="primary">
                        Installment #{inst.installmentNumber}
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
              <Box mt={3}>
                <Typography variant="subtitle2" fontWeight={700} mb={1}>Due Date Change History</Typography>
                {installments.filter(i => i.dueDateChanges?.length > 0).map(inst => (
                  <Card key={inst.id} sx={{ mb: 1 }}>
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Typography variant="body2" fontWeight={700} mb={1} color="warning.dark">
                        Installment #{inst.installmentNumber} — {inst.dueDateChangeCount} change{inst.dueDateChangeCount > 1 ? 's' : ''}
                      </Typography>
                      {inst.dueDateChanges.map((c, ci) => (
                        <Box key={ci} sx={{ py: 0.5, borderBottom: ci < inst.dueDateChanges.length - 1 ? '1px solid' : 'none', borderColor: 'divider' }}>
                          <Typography variant="body2">{formatDate(c.from)} → <strong>{formatDate(c.to)}</strong></Typography>
                          <Typography variant="caption" color="text.secondary">
                            Reason: {c.reason} · {c.changedAt ? formatDate(c.changedAt.split('T')[0]) : ''}
                          </Typography>
                        </Box>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </Box>
            )}
          </>
        )}

        {/* Non-EMI */}
        {!isEMI && (
          <Alert severity="info">
            This sale uses <strong>{PAYMENT_LABELS[sale.paymentType]}</strong> — no EMI installments to track.
            {sale.paymentType === PAYMENT_TYPES.PENDING && ' Payment is due at delivery.'}
          </Alert>
        )}
      </TabPanel>

      <RecordPaymentDialog open={Boolean(payDialog)} onClose={() => setPayDialog(null)} installment={payDialog} onSave={handleRecordPayment} />
      <ChangeDueDateDialog open={Boolean(dateDialog)} onClose={() => setDateDialog(null)} installment={dateDialog} onSave={handleChangeDueDate} />
    </Box>
  );
};

export default SaleDetail;