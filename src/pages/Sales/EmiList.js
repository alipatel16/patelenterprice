// src/pages/Sales/EmiList.js
//
// ─── EMI PENDING LIST ─────────────────────────────────────────────────────────
//
//  Admin-only page linked from SalesList.
//  Shows all EMI sales where paymentStatus is 'unpaid' or 'partial'.
//
//  PENDING AMOUNT CALCULATION (per sale):
//    For each installment: max(0, inst.amount - (inst.paidAmount || 0))
//    Sum those remainders across ALL installments.
//    Example: 6 installments of ₹5k, 5 paid → pending = ₹5k (not ₹30k or ₹5k paid)
//
//  REQUIRES a Firestore composite index (auto-created on first run):
//    Collection : sales
//    Fields     : paymentType (Ascending) + paymentStatus (Ascending)
//    Firestore will log a clickable URL in the console on first load.
//
//  PAGINATION: Client-side (bounded query — only unpaid/partial EMI sales).
//  SEARCH:     Client-side by customer name, phone, invoice number.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Box, Typography, Card, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TablePagination,
  Chip, IconButton, LinearProgress, TextField, InputAdornment,
  CircularProgress, Alert, Stack, Button,
  useTheme, useMediaQuery,
} from '@mui/material';
import {
  ArrowBack, Search, CreditScore, Refresh, OpenInNew,
  Warning, Schedule,
} from '@mui/icons-material';
import {
  collection, query, where, getDocs, orderBy,
} from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';
import { formatCurrency, formatDate } from '../../utils';
import { PAYMENT_TYPES } from '../../constants';

const PAGE_SIZE = 15;

// ─── Compute pending amount from installments ─────────────────────────────────
// Only counts what's still owed — fully paid installments contribute ₹0.
const computeSalePending = (sale) => {
  const insts = sale.emiInstallments || [];
  if (insts.length === 0) {
    // Fallback: if no installments tracked, use grandTotal - totalPaidAmount
    return Math.max(0, (sale.grandTotal || 0) - (sale.totalPaidAmount || 0));
  }
  return insts.reduce((sum, inst) => {
    const remaining = Math.max(0, (inst.amount || 0) - (inst.paidAmount || 0));
    return sum + remaining;
  }, 0);
};

// ─── EMI progress string ──────────────────────────────────────────────────────
const emiProgress = (sale) => {
  const insts = sale.emiInstallments || [];
  if (insts.length === 0) return '—';
  const paid = insts.filter(i => (i.paidAmount || 0) >= i.amount).length;
  return `${paid}/${insts.length}`;
};

// ─── Status chip ─────────────────────────────────────────────────────────────
const StatusChip = ({ status }) => {
  if (status === 'partial') return <Chip label="Partial" color="warning" size="small" icon={<Schedule sx={{ fontSize: '12px !important' }} />} />;
  return <Chip label="Unpaid" color="error" size="small" icon={<Warning sx={{ fontSize: '12px !important' }} />} />;
};

// ─── Mobile card ─────────────────────────────────────────────────────────────
const MobileRow = ({ row, pending, navigate }) => (
  <Card elevation={0} sx={{
    mb: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2,
    cursor: 'pointer', '&:hover': { borderColor: 'primary.main', bgcolor: 'primary.50' },
  }} onClick={() => navigate(`/sales/${row.id}`)}>
    <Box sx={{ p: 2 }}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
        <Box>
          <Typography variant="body2" fontWeight={700} color="primary">{row.invoiceNumber}</Typography>
          <Typography variant="caption" color="text.secondary">{formatDate(row.saleDate)}</Typography>
        </Box>
        <StatusChip status={row.paymentStatus} />
      </Box>
      <Typography variant="body2" fontWeight={600}>{row.customerName}</Typography>
      {row.customerPhone && (
        <Typography variant="caption" color="text.secondary">{row.customerPhone}</Typography>
      )}
      <Box display="flex" justifyContent="space-between" alignItems="center" mt={1.5}>
        <Box>
          <Typography variant="caption" color="text.secondary">EMI Progress</Typography>
          <Typography variant="body2" fontWeight={600}>{emiProgress(row)} paid</Typography>
        </Box>
        <Box textAlign="right">
          <Typography variant="caption" color="text.secondary">Pending</Typography>
          <Typography variant="body2" fontWeight={700} color="error.main">
            {formatCurrency(pending)}
          </Typography>
        </Box>
        <Box textAlign="right">
          <Typography variant="caption" color="text.secondary">Total</Typography>
          <Typography variant="body2" fontWeight={600}>{formatCurrency(row.grandTotal)}</Typography>
        </Box>
      </Box>
    </Box>
  </Card>
);

// ─── Main Component ───────────────────────────────────────────────────────────
const EmiList = () => {
  const { db, isAdmin } = useAuth();
  const navigate = useNavigate();
  const theme    = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [rows,       setRows]       = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [page,       setPage]       = useState(0);
  const [search,     setSearch]     = useState('');
  const [debSearch,  setDebSearch]  = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const searchTimer = useRef(null);

  // Admin guard
  useEffect(() => {
    if (!isAdmin) {
      toast.error('Admin access required');
      navigate('/sales');
    }
  }, [isAdmin, navigate]);

  // ── Fetch ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!db || !isAdmin) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        // Fetch only EMI sales that still have an outstanding balance.
        // Requires composite index: paymentType ASC + paymentStatus ASC
        // (Firestore will log auto-create URL on first run)
        const snap = await getDocs(query(
          collection(db, 'sales'),
          where('paymentType',  '==',  PAYMENT_TYPES.EMI),
          where('paymentStatus', 'in', ['unpaid', 'partial']),
          orderBy('saleDate', 'desc'),
        ));
        if (!active) return;
        setRows(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setPage(0);
      } catch (err) {
        if (!active) return;
        // If composite index not yet created, Firestore throws an error with a URL.
        // Check browser console for the auto-create link.
        console.error('[EmiList] fetch error — if this is an index error, click the URL in console:', err);
        toast.error('Failed to load: ' + err.message);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [db, isAdmin, refreshKey]);

  // ── Debounce search ──────────────────────────────────────────────────────────
  const handleSearch = val => {
    setSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebSearch(val);
      setPage(0);
    }, 350);
  };

  // ── Filter in memory ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!debSearch.trim()) return rows;
    const s = debSearch.toLowerCase();
    return rows.filter(r =>
      (r.customerName   || '').toLowerCase().includes(s) ||
      (r.customerPhone  || '').includes(s)               ||
      (r.invoiceNumber  || '').toLowerCase().includes(s)
    );
  }, [rows, debSearch]);

  // ── Pending amounts for filtered rows ────────────────────────────────────────
  const pendingMap = useMemo(() => {
    const map = {};
    filtered.forEach(r => { map[r.id] = computeSalePending(r); });
    return map;
  }, [filtered]);

  // ── Summary totals ───────────────────────────────────────────────────────────
  const totalPending  = useMemo(() => Object.values(pendingMap).reduce((s, v) => s + v, 0), [pendingMap]);
  const totalGrand    = useMemo(() => filtered.reduce((s, r) => s + (r.grandTotal || 0), 0), [filtered]);

  // ── Current page rows ────────────────────────────────────────────────────────
  const pageRows = useMemo(
    () => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filtered, page]
  );

  if (!isAdmin) return null;

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>

      {/* ── Header ── */}
      <Box display="flex" alignItems="center" gap={1} mb={3} flexWrap="wrap">
        <IconButton onClick={() => navigate('/sales')} size="small">
          <ArrowBack />
        </IconButton>
        <Box flex={1}>
          <Box display="flex" alignItems="center" gap={1}>
            <CreditScore color="warning" />
            <Typography variant="h5" fontWeight={700}>EMI Pending List</Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            Admin view — all EMI sales with outstanding balance
          </Typography>
        </Box>
        <IconButton onClick={() => setRefreshKey(k => k + 1)} disabled={loading} size="small">
          {loading ? <CircularProgress size={20} /> : <Refresh />}
        </IconButton>
      </Box>

      {/* ── Summary cards ── */}
      {!loading && rows.length > 0 && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mb={3}>
          {[
            {
              label:    'Total Outstanding',
              value:    formatCurrency(debSearch ? totalPending : rows.reduce((s, r) => s + computeSalePending(r), 0)),
              sub:      debSearch ? 'filtered results' : 'across all pending EMI sales',
              color:    'error',
            },
            {
              label:    debSearch ? 'Matching Sales' : 'Pending EMI Sales',
              value:    filtered.length,
              sub:      `of ${rows.length} total`,
              color:    'warning',
            },
            {
              label:    'Invoice Value',
              value:    formatCurrency(totalGrand),
              sub:      'total sale amount (filtered)',
              color:    'primary',
            },
          ].map(c => (
            <Card key={c.label} elevation={0}
              sx={{ flex: 1, border: '1.5px solid', borderColor: `${c.color}.main`, borderRadius: 2 }}>
              <Box sx={{ p: 2 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>{c.label}</Typography>
                <Typography variant="h5" fontWeight={800} color={`${c.color}.main`} mt={0.25}>
                  {c.value}
                </Typography>
                <Typography variant="caption" color="text.secondary">{c.sub}</Typography>
              </Box>
            </Card>
          ))}
        </Stack>
      )}

      {/* ── Search ── */}
      <TextField
        fullWidth
        placeholder="Search by customer name, phone or invoice number…"
        value={search}
        onChange={e => handleSearch(e.target.value)}
        size="small"
        sx={{ mb: 2 }}
        InputProps={{
          startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment>,
        }}
      />

      {/* ── Loading skeleton ── */}
      {loading && (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <LinearProgress />
          <Box display="flex" justifyContent="center" py={6}>
            <CircularProgress />
          </Box>
        </Card>
      )}

      {/* ── Empty states ── */}
      {!loading && rows.length === 0 && (
        <Alert severity="success" sx={{ borderRadius: 2 }}>
          No pending EMI sales found — all EMI invoices are fully paid!
        </Alert>
      )}

      {!loading && rows.length > 0 && filtered.length === 0 && (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          No results match "{debSearch}". Try a different search.
        </Alert>
      )}

      {/* ── Mobile card list ── */}
      {!loading && isMobile && pageRows.length > 0 && (
        <Box>
          {pageRows.map(row => (
            <MobileRow key={row.id} row={row} pending={pendingMap[row.id] || 0} navigate={navigate} />
          ))}
          <TablePagination
            component="div"
            count={filtered.length}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={PAGE_SIZE}
            rowsPerPageOptions={[PAGE_SIZE]}
          />
        </Box>
      )}

      {/* ── Desktop table ── */}
      {!loading && !isMobile && pageRows.length > 0 && (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell sx={{ fontWeight: 700 }}>Customer</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Invoice #</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">EMI Progress</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Invoice Total</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Pending Amount</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">Status</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">View</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pageRows.map(row => {
                  const pending = pendingMap[row.id] || 0;
                  return (
                    <TableRow
                      key={row.id}
                      hover
                      sx={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/sales/${row.id}`)}
                    >
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{row.customerName}</Typography>
                        {row.customerPhone && (
                          <Typography variant="caption" color="text.secondary">{row.customerPhone}</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="primary" fontWeight={600}>
                          {row.invoiceNumber}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{formatDate(row.saleDate)}</Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Box>
                          <Typography variant="body2" fontWeight={600}>{emiProgress(row)}</Typography>
                          {(row.emiInstallments || []).length > 0 && (
                            <LinearProgress
                              variant="determinate"
                              value={(() => {
                                const insts = row.emiInstallments || [];
                                const paid  = insts.filter(i => (i.paidAmount || 0) >= i.amount).length;
                                return insts.length > 0 ? (paid / insts.length) * 100 : 0;
                              })()}
                              sx={{ height: 4, borderRadius: 2, mt: 0.5, width: 60, mx: 'auto' }}
                              color="warning"
                            />
                          )}
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={600}>
                          {formatCurrency(row.grandTotal)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={700} color="error.main">
                          {formatCurrency(pending)}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <StatusChip status={row.paymentStatus} />
                      </TableCell>
                      <TableCell align="center" onClick={e => e.stopPropagation()}>
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => navigate(`/sales/${row.id}`)}
                        >
                          <OpenInNew fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}

                {/* ── Totals footer row ── */}
                <TableRow sx={{ bgcolor: 'grey.50', borderTop: '2px solid', borderColor: 'divider' }}>
                  <TableCell colSpan={4}>
                    <Typography variant="body2" fontWeight={700} color="text.secondary">
                      {filtered.length} sale{filtered.length !== 1 ? 's' : ''}
                      {debSearch ? ` matching "${debSearch}"` : ''}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight={700}>
                      {formatCurrency(totalGrand)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight={700} color="error.main">
                      {formatCurrency(totalPending)}
                    </Typography>
                  </TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={filtered.length}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={PAGE_SIZE}
            rowsPerPageOptions={[PAGE_SIZE]}
          />
        </Card>
      )}
    </Box>
  );
};

export default EmiList;