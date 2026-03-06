import React, { useState, useCallback, useEffect } from 'react';
import {
  Box, Typography, Button, Card, CardContent, Grid, Chip, Divider,
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
import { useMediaQuery, useTheme } from '@mui/material';

const COMPANY = COMPANIES['company_1'];

// ─── Print Invoice ────────────────────────────────────────────────────────────
const generateGiftInvoiceHTML = (invoice) => {
  const company = COMPANY;
  const fmt = n => n > 0
    ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(n)
    : '—';
  const fmtD = d => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const itemRows = (invoice.items || []).map((it, idx) => {
    const isDelivered = it.deliveryStatus === 'delivered';
    return `
    <tr>
      <td class="tc">${idx + 1}</td>
      <td><strong>${it.name}</strong></td>
      <td class="tc">${it.qty} ${it.unit || 'pcs'}</td>
      <td class="tc">
        <span class="badge ${it.type === 'free' ? 'badge-green' : 'badge-blue'}">
          ${it.type === 'free' ? '🎁 FREE' : '💳 PAID'}
        </span>
      </td>
      <td class="tr">${it.type === 'paid' ? fmt(it.price * it.qty) : '<span style="color:#16a34a;font-weight:700">FREE</span>'}</td>
      <td class="tc">
        <span class="badge ${isDelivered ? 'badge-green' : 'badge-orange'}">
          ${isDelivered ? '✓ Delivered' : '⏳ Pending'}
        </span>
      </td>
      ${isDelivered && it.deliveredAt ? `<td class="tc" style="font-size:11px;color:#6b7280">${fmtD(it.deliveredAt)}</td>` : '<td></td>'}
    </tr>`;
  }).join('');

  const totalItems = invoice.items?.length || 0;
  const deliveredItems = invoice.items?.filter(i => i.deliveryStatus === 'delivered').length || 0;
  const freeItems = invoice.items?.filter(i => i.type === 'free').length || 0;
  const paidItems = invoice.items?.filter(i => i.type === 'paid').length || 0;
  const paidTotal = invoice.items?.filter(i => i.type === 'paid')
    .reduce((s, i) => s + (i.price * i.qty), 0) || 0;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Gift Invoice – ${invoice.invoiceNumber}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Inter',sans-serif;background:#fdf4ff;color:#1e1b4b;font-size:13px}
  .page{max-width:920px;margin:20px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(139,92,246,.12)}
  .header{background:linear-gradient(135deg,#7c3aed 0%,#a855f7 50%,#c084fc 100%);color:#fff;padding:32px 36px;position:relative;overflow:hidden}
  .header::after{content:'🎁';position:absolute;right:32px;top:50%;transform:translateY(-50%);font-size:80px;opacity:.15}
  .header::before{content:'';position:absolute;left:-40px;bottom:-40px;width:180px;height:180px;background:rgba(255,255,255,.05);border-radius:50%}
  .header-inner{display:flex;justify-content:space-between;align-items:flex-start;position:relative;z-index:1}
  .co-name{font-size:20px;font-weight:800;letter-spacing:-.3px;margin-bottom:4px}
  .co-sub{font-size:11px;opacity:.85;line-height:1.7}
  .inv-badge{text-align:right}
  .inv-badge .lbl{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;opacity:.8;margin-bottom:4px}
  .inv-badge .num{font-size:22px;font-weight:800;letter-spacing:-.3px;font-family:monospace}
  .inv-badge .sub-badges{display:flex;gap:6px;justify-content:flex-end;margin-top:6px}
  .inv-badge .sbadge{background:rgba(255,255,255,.2);border-radius:20px;padding:3px 10px;font-size:10px;font-weight:700}
  .gift-bar{background:linear-gradient(90deg,#7c3aed,#a855f7,#c084fc,#a855f7,#7c3aed);height:4px}
  .body{padding:32px 36px}
  .parties{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px}
  .pbox{background:#faf5ff;border:1px solid #e9d5ff;border-radius:10px;padding:16px;border-top:3px solid #7c3aed}
  .pbox .pt{font-size:9px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px}
  .pbox h3{font-size:14px;font-weight:700;color:#1e1b4b;margin-bottom:2px}
  .pbox p{font-size:11px;color:#6b7280}
  .meta-strip{display:flex;gap:0;margin-bottom:20px;border:1px solid #e9d5ff;border-radius:8px;overflow:hidden}
  .meta-cell{flex:1;padding:12px;text-align:center;border-right:1px solid #e9d5ff;background:#faf5ff}
  .meta-cell:last-child{border-right:none}
  .meta-cell .ml{font-size:9px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:.8px;margin-bottom:3px}
  .meta-cell .mv{font-size:13px;font-weight:700;color:#1e1b4b}
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}
  .stat-box{background:#faf5ff;border:1px solid #e9d5ff;border-radius:8px;padding:12px;text-align:center}
  .stat-box .sl{font-size:9px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
  .stat-box .sv{font-size:18px;font-weight:800;color:#1e1b4b}
  .tbl-wrap{border:1px solid #e9d5ff;border-radius:10px;overflow:hidden;margin-bottom:20px}
  table{width:100%;border-collapse:collapse}
  thead tr{background:#7c3aed;color:#fff}
  thead th{padding:10px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.3px}
  tbody tr{border-bottom:1px solid #f3e8ff}
  tbody tr:nth-child(even){background:#fdf4ff}
  tbody tr:last-child{border-bottom:none}
  tbody td{padding:10px 12px}
  .tc{text-align:center}.tr{text-align:right}
  .badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700}
  .badge-green{background:#dcfce7;color:#16a34a}
  .badge-blue{background:#dbeafe;color:#1d4ed8}
  .badge-orange{background:#fef9c3;color:#ca8a04}
  ${invoice.linkedSaleRef ? `.linked{background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:10px 14px;margin-bottom:16px;font-size:12px;color:#1d4ed8}` : ''}
  ${invoice.notes ? `.notes{background:#faf5ff;border:1px solid #e9d5ff;border-radius:8px;padding:14px;margin-bottom:20px}
  .notes .nl{font-size:9px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px}
  .notes p{font-size:12px;color:#4b5563;line-height:1.6}` : ''}
  .footer{display:flex;justify-content:space-between;align-items:flex-end;padding-top:20px;border-top:1px dashed #e9d5ff}
  .footer p{font-size:10px;color:#9ca3af;line-height:1.7}
  .sign-box{text-align:right}
  .sign-line{width:160px;border-top:2px solid #7c3aed;margin:44px 0 6px auto}
  .sign-label{font-size:10px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:.5px}
  @media print{body{background:#fff}.page{margin:0;border-radius:0;box-shadow:none}.np{display:none!important}}
</style></head><body>
<div class="np" style="text-align:center;padding:14px;background:linear-gradient(135deg,#7c3aed,#a855f7)">
  <button onclick="window.print()" style="background:#fff;color:#7c3aed;border:none;padding:10px 28px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:800">🖨️ Print Gift Invoice</button>
  <button onclick="window.close()" style="background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3);padding:10px 24px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:600;margin-left:10px">✕ Close</button>
</div>
<div class="page">
  <div class="header">
    <div class="header-inner">
      <div>
        <div class="co-name">${company.name}</div>
        <div class="co-sub">${company.address}<br>${company.phone} · ${company.email}<br>GSTIN: ${company.gstNumber}</div>
      </div>
      <div class="inv-badge">
        <div class="lbl">🎁 Gift Invoice</div>
        <div class="num">${invoice.invoiceNumber}</div>
        <div class="sub-badges">
          <span class="sbadge">Date: ${fmtD(invoice.date)}</span>
        </div>
      </div>
    </div>
  </div>
  <div class="gift-bar"></div>
  <div class="body">
    <div class="parties">
      <div class="pbox"><div class="pt">Gift Given To</div><h3>${invoice.customerName}</h3><p>${invoice.customerPhone || ''}</p></div>
      <div class="pbox"><div class="pt">Gift Set Used</div><h3>${invoice.giftSetName}</h3>
        <p>${freeItems} free item${freeItems !== 1 ? 's' : ''}, ${paidItems} paid item${paidItems !== 1 ? 's' : ''}</p>
      </div>
    </div>
    <div class="meta-strip">
      <div class="meta-cell"><div class="ml">Invoice Date</div><div class="mv">${fmtD(invoice.date)}</div></div>
      <div class="meta-cell"><div class="ml">Invoice No.</div><div class="mv">${invoice.invoiceNumber}</div></div>
      ${invoice.linkedSaleRef ? `<div class="meta-cell"><div class="ml">Linked Sale</div><div class="mv">${invoice.linkedSaleRef}</div></div>` : ''}
      <div class="meta-cell"><div class="ml">Total Items</div><div class="mv">${totalItems}</div></div>
    </div>
    <div class="stats">
      <div class="stat-box"><div class="sl">Total Items</div><div class="sv">${totalItems}</div></div>
      <div class="stat-box"><div class="sl">🎁 Free Items</div><div class="sv" style="color:#16a34a">${freeItems}</div></div>
      <div class="stat-box"><div class="sl">✓ Delivered</div><div class="sv" style="color:#7c3aed">${deliveredItems}</div></div>
      <div class="stat-box"><div class="sl">⏳ Pending</div><div class="sv" style="color:#d97706">${totalItems - deliveredItems}</div></div>
    </div>
    <div class="tbl-wrap"><table>
      <thead><tr>
        <th class="tc">#</th>
        <th>Item</th>
        <th class="tc">Qty</th>
        <th class="tc">Type</th>
        <th class="tr">Value</th>
        <th class="tc">Delivery</th>
        <th class="tc">Delivered On</th>
      </tr></thead>
      <tbody>${itemRows}</tbody>
    </table></div>
    ${paidTotal > 0 ? `<div style="text-align:right;margin-bottom:16px"><div style="display:inline-block;background:#faf5ff;border:1px solid #e9d5ff;border-radius:8px;padding:10px 20px">
      <span style="font-size:12px;color:#6b7280">Total Paid Items Value: </span>
      <strong style="font-size:16px;color:#7c3aed">${fmt(paidTotal)}</strong>
    </div></div>` : ''}
    ${invoice.linkedSaleRef ? `<div class="linked">📋 Linked to Sale Invoice: <strong>${invoice.linkedSaleRef}</strong></div>` : ''}
    ${invoice.notes ? `<div class="notes"><div class="nl">Notes</div><p>${invoice.notes}</p></div>` : ''}
    <div class="footer">
      <p>This is a computer-generated gift invoice.<br>Generated on ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}.</p>
      <div class="sign-box"><div class="sign-line"></div><div class="sign-label">Authorised Signatory</div></div>
    </div>
  </div>
</div></body></html>`;
};

const printGiftInvoice = (invoice) => {
  const win = window.open('', '_blank', 'width=960,height=750');
  if (!win) { toast.error('Popup blocked. Please allow popups.'); return; }
  win.document.write(generateGiftInvoiceHTML(invoice));
  win.document.close();
};

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