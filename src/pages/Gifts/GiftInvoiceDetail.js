import React, { useState, useCallback, useEffect } from 'react';
import {
  Box, Typography, Button, Card, CardContent, Grid, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  IconButton, Alert, CircularProgress, Stack, LinearProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  Tooltip,
} from '@mui/material';
import {
  ArrowBack, Edit, Print, CardGiftcard, CheckCircle,
  HourglassEmpty, LocalShipping, Undo,
} from '@mui/icons-material';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';
import { COMPANIES } from '../../constants';
import { formatDate, formatCurrency } from '../../utils';
import { printGiftInvoice } from '../../utils/giftInvoicePrint';
import { useMediaQuery, useTheme } from '@mui/material';

const COMPANY = COMPANIES['company_1'];

// ─── Mark Delivery Dialog ─────────────────────────────────────────────────────
const DeliveryDialog = ({ open, onClose, item, itemIndex, onConfirm }) => {
  const [deliveredDate, setDeliveredDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  useEffect(() => { if (open) setDeliveredDate(new Date().toISOString().split('T')[0]); }, [open]);
  if (!item) return null;
  const isDelivered = item.deliveryStatus === 'delivered';
  const handleConfirm = async () => {
    setLoading(true);
    try { await onConfirm(itemIndex, deliveredDate); onClose(); }
    catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{isDelivered ? 'Mark as Pending' : 'Mark as Delivered'}</DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 2, p: 1.5, bgcolor: 'secondary.50', borderRadius: 2, border: '1px solid', borderColor: 'secondary.200' }}>
          <Typography variant="body2" fontWeight={700}>{item.name}</Typography>
          <Typography variant="caption" color="text.secondary">
            Qty: {item.qty} {item.unit} · {item.type === 'free' ? 'Free Gift' : `Paid: ${formatCurrency(item.price * item.qty)}`}
          </Typography>
        </Box>
        {!isDelivered && (
          <TextField
            fullWidth label="Delivery Date *" type="date"
            value={deliveredDate} onChange={e => setDeliveredDate(e.target.value)}
            size="small" InputLabelProps={{ shrink: true }}
          />
        )}
        {isDelivered && (
          <Alert severity="warning">This will revert the item back to Pending status.</Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="outlined" disabled={loading}>Cancel</Button>
        <Button onClick={handleConfirm} variant="contained"
          color={isDelivered ? 'warning' : 'success'} disabled={loading}
          startIcon={loading ? <CircularProgress size={16} /> : isDelivered ? <Undo /> : <CheckCircle />}>
          {isDelivered ? 'Revert to Pending' : 'Mark Delivered'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const GiftInvoiceDetail = () => {
  const { db } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deliveryDialog, setDeliveryDialog] = useState(null); // { item, index }

  const loadInvoice = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'giftInvoices', id));
      if (!snap.exists()) { toast.error('Gift invoice not found'); navigate('/gift-invoices'); return; }
      setInvoice({ id: snap.id, ...snap.data() });
    } catch (e) {
      toast.error('Failed to load');
    } finally {
      setLoading(false);
    }
  }, [db, id, navigate]);

  useEffect(() => { loadInvoice(); }, [loadInvoice]);

  const handleDeliveryToggle = async (itemIndex, deliveredDate) => {
    const newItems = [...invoice.items];
    const it = newItems[itemIndex];
    if (it.deliveryStatus === 'delivered') {
      newItems[itemIndex] = { ...it, deliveryStatus: 'pending', deliveredAt: null };
    } else {
      newItems[itemIndex] = { ...it, deliveryStatus: 'delivered', deliveredAt: deliveredDate };
    }
    await updateDoc(doc(db, 'giftInvoices', id), { items: newItems, updatedAt: serverTimestamp() });
    toast.success(it.deliveryStatus === 'delivered' ? 'Reverted to pending' : 'Marked as delivered!');
    setInvoice(prev => ({ ...prev, items: newItems }));
  };

  if (loading) return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
      <CircularProgress />
    </Box>
  );
  if (!invoice) return null;

  const items = invoice.items || [];
  const totalItems = items.length;
  const delivered = items.filter(i => i.deliveryStatus === 'delivered').length;
  const pending = totalItems - delivered;
  const pct = totalItems > 0 ? Math.round((delivered / totalItems) * 100) : 0;
  const allDelivered = delivered === totalItems && totalItems > 0;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1000, mx: 'auto' }}>
      {/* Header */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3} flexWrap="wrap" gap={1}>
        <Box display="flex" alignItems="center" gap={1}>
          <IconButton onClick={() => navigate('/gift-invoices')}><ArrowBack /></IconButton>
          <Box>
            <Typography variant="h5" fontWeight={700}>{invoice.invoiceNumber}</Typography>
            <Typography variant="body2" color="text.secondary">
              {formatDate(invoice.date)} · {COMPANY.name}
            </Typography>
          </Box>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Button variant="outlined" color="secondary" startIcon={<Print />}
            onClick={() => printGiftInvoice(invoice)} size={isMobile ? 'small' : 'medium'}>
            {isMobile ? 'Print' : 'Print Invoice'}
          </Button>
          <Button variant="outlined" startIcon={<Edit />}
            onClick={() => navigate(`/gift-invoices/edit/${id}`)} size={isMobile ? 'small' : 'medium'}>
            {isMobile ? 'Edit' : 'Edit'}
          </Button>
        </Stack>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={2} mb={2}>
        {[
          { label: 'Customer', value: invoice.customerName, sub: invoice.customerPhone },
          { label: 'Gift Set', value: invoice.giftSetName, icon: <CardGiftcard fontSize="small" color="secondary" /> },
          { label: 'Invoice Date', value: formatDate(invoice.date) },
          { label: 'Linked Sale', value: invoice.linkedSaleRef || '—', color: invoice.linkedSaleRef ? 'primary.main' : 'text.secondary' },
        ].map(({ label, value, sub, icon, color }) => (
          <Grid item xs={6} sm={3} key={label}>
            <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, height: '100%' }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block">{label}</Typography>
                <Box display="flex" alignItems="center" gap={0.5}>
                  {icon}
                  <Typography variant="body2" fontWeight={700} color={color || 'text.primary'}>{value}</Typography>
                </Box>
                {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Delivery Progress */}
      <Card elevation={0} sx={{
        border: '2px solid',
        borderColor: allDelivered ? 'success.main' : 'secondary.200',
        borderRadius: 2, mb: 2,
        bgcolor: allDelivered ? 'success.50' : 'secondary.50',
      }}>
        <CardContent sx={{ p: 2 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5} flexWrap="wrap" gap={1}>
            <Box>
              <Typography variant="subtitle1" fontWeight={700}
                color={allDelivered ? 'success.main' : 'secondary.main'}>
                {allDelivered ? '🎉 All Items Delivered!' : '📦 Delivery Progress'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {delivered} of {totalItems} items delivered
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Chip label={`${delivered} Delivered`} color="success" size="small" icon={<CheckCircle sx={{ fontSize: '14px !important' }} />} />
              <Chip label={`${pending} Pending`} color="warning" size="small" variant="outlined" icon={<HourglassEmpty sx={{ fontSize: '14px !important' }} />} />
            </Stack>
          </Box>
          <Box>
            <Box display="flex" justifyContent="space-between" mb={0.5}>
              <Typography variant="caption" color="text.secondary">Progress</Typography>
              <Typography variant="caption" fontWeight={700} color={allDelivered ? 'success.main' : 'secondary.main'}>
                {pct}%
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate" value={pct}
              color={allDelivered ? 'success' : 'secondary'}
              sx={{ height: 8, borderRadius: 4 }}
            />
          </Box>
        </CardContent>
      </Card>

      {/* Items with per-item delivery */}
      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 2 }}>
        <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle1" fontWeight={700}>
            Gift Items — Tap to toggle delivery status
          </Typography>
        </Box>

        {/* Desktop */}
        <TableContainer sx={{ display: { xs: 'none', sm: 'block' } }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell sx={{ fontWeight: 700 }}>#</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Item</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="center">Qty</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="center">Type</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">Value</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="center">Status</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="center">Delivered On</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="center">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((it, idx) => {
                const isDelivered = it.deliveryStatus === 'delivered';
                return (
                  <TableRow key={idx} hover
                    sx={{ bgcolor: isDelivered ? 'success.50' : 'inherit' }}>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{it.name}</Typography>
                    </TableCell>
                    <TableCell align="center">{it.qty} {it.unit || 'pcs'}</TableCell>
                    <TableCell align="center">
                      <Chip
                        label={it.type === 'free' ? '🎁 Free' : '💳 Paid'}
                        color={it.type === 'free' ? 'success' : 'primary'}
                        size="small" variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right">
                      {it.type === 'paid'
                        ? <Typography variant="body2" fontWeight={600}>{formatCurrency(it.price * it.qty)}</Typography>
                        : <Chip label="FREE" size="small" color="success" />}
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        icon={isDelivered
                          ? <CheckCircle sx={{ fontSize: '14px !important' }} />
                          : <HourglassEmpty sx={{ fontSize: '14px !important' }} />}
                        label={isDelivered ? 'Delivered' : 'Pending'}
                        color={isDelivered ? 'success' : 'warning'}
                        size="small"
                        variant={isDelivered ? 'filled' : 'outlined'}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="caption" color={isDelivered ? 'success.main' : 'text.disabled'}>
                        {isDelivered && it.deliveredAt ? formatDate(it.deliveredAt) : '—'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title={isDelivered ? 'Revert to Pending' : 'Mark as Delivered'}>
                        <Button
                          size="small"
                          variant={isDelivered ? 'outlined' : 'contained'}
                          color={isDelivered ? 'warning' : 'success'}
                          startIcon={isDelivered ? <Undo sx={{ fontSize: '14px !important' }} /> : <LocalShipping sx={{ fontSize: '14px !important' }} />}
                          onClick={() => setDeliveryDialog({ item: it, index: idx })}
                          sx={{ fontSize: 11, py: 0.5 }}
                        >
                          {isDelivered ? 'Revert' : 'Deliver'}
                        </Button>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Mobile */}
        <Box sx={{ display: { xs: 'block', sm: 'none' }, p: 1.5 }}>
          {items.map((it, idx) => {
            const isDelivered = it.deliveryStatus === 'delivered';
            return (
              <Card key={idx} elevation={0}
                sx={{
                  mb: 1.5, border: '1px solid',
                  borderColor: isDelivered ? 'success.300' : 'divider',
                  borderRadius: 2,
                  bgcolor: isDelivered ? 'success.50' : 'background.paper',
                }}>
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                    <Box flex={1}>
                      <Box display="flex" alignItems="center" gap={0.5} mb={0.5}>
                        <Typography variant="caption" color="text.secondary">#{idx + 1}</Typography>
                        <Typography variant="body2" fontWeight={700}>{it.name}</Typography>
                      </Box>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" mb={0.5}>
                        <Chip label={`×${it.qty} ${it.unit}`} size="small" variant="outlined" sx={{ fontSize: 10 }} />
                        <Chip label={it.type === 'free' ? '🎁 Free' : '💳 Paid'}
                          color={it.type === 'free' ? 'success' : 'primary'} size="small" variant="outlined" sx={{ fontSize: 10 }} />
                      </Stack>
                      {isDelivered && it.deliveredAt && (
                        <Typography variant="caption" color="success.main">
                          ✓ Delivered on {formatDate(it.deliveredAt)}
                        </Typography>
                      )}
                    </Box>
                    <Box ml={1}>
                      <Button
                        size="small"
                        variant={isDelivered ? 'outlined' : 'contained'}
                        color={isDelivered ? 'warning' : 'success'}
                        onClick={() => setDeliveryDialog({ item: it, index: idx })}
                        sx={{ fontSize: 11, minWidth: 80 }}
                      >
                        {isDelivered ? 'Revert' : 'Deliver'}
                      </Button>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      </Card>

      {invoice.notes && (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 2 }}>
          <CardContent sx={{ p: 2 }}>
            <Typography variant="subtitle2" fontWeight={700} mb={1}>Notes</Typography>
            <Typography variant="body2" color="text.secondary">{invoice.notes}</Typography>
          </CardContent>
        </Card>
      )}

      <DeliveryDialog
        open={!!deliveryDialog}
        onClose={() => setDeliveryDialog(null)}
        item={deliveryDialog?.item}
        itemIndex={deliveryDialog?.index}
        onConfirm={handleDeliveryToggle}
      />
    </Box>
  );
};

export default GiftInvoiceDetail;