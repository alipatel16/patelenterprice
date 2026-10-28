import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TablePagination,
  Chip, IconButton, LinearProgress, TextField, InputAdornment,
  CircularProgress, Alert, Stack, Tab, Tabs,
  useTheme, useMediaQuery,
} from '@mui/material';
import {
  ArrowBack, Search, CreditScore, Refresh, OpenInNew,
  Warning, Schedule,
} from '@mui/icons-material';
import usePagedCollection from '../../hooks/usePagedCollection';
import QueryStatus from '../../components/QueryStatus';
import { useQueueTotals } from '../../hooks/useSalesQueue';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';
import { formatCurrency, formatDate } from '../../utils';
import { PAYMENT_TYPES } from '../../constants';

const PAGE_SIZE = 15;

// ─── Compute pending amount from installments ─────────────────────────────────
// Only counts what's still owed — fully paid installments contribute ₹0.
const computeSalePending = sale => sale.emiOutstandingAmount;

// ─── EMI progress string ──────────────────────────────────────────────────────
const emiProgress = (sale) => {
  const insts = sale.emiInstallments || [];
  if (insts.length === 0) return '—';
  const paid = insts.filter(i => (i.paidAmount || 0) >= i.amount).length;
  return `${paid}/${insts.length}`;
};

// ─── Status chip ─────────────────────────────────────────────────────────────
const StatusChip = ({ status }) => {
  if (status === 'paid') return <Chip label="Paid" color="success" size="small" />;
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
            {pending == null ? 'Needs reconciliation' : formatCurrency(pending)}
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

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState(0);
  const filters = [['paymentType', '==', PAYMENT_TYPES.EMI], ...(tab === 0 ? [['hasPendingEmi', '==', true]] : [])];
  const view = usePagedCollection(isAdmin ? db : null, 'sales', { search, filters, sort: tab === 0 ? [['nextEmiDueDate', 'asc']] : [['saleDate', 'desc']], pageSize: PAGE_SIZE, requireReady: true });
  const { rows, loading, page, setPage } = view;
  const totals = useQueueTotals(isAdmin ? db : null, 'sales', [{ name: 'sales', filters, sums: { pending: 'emiOutstandingAmount', grand: 'grandTotal' } }], search);
  const totalPending = totals.data?.sales.pending;
  const totalGrand = totals.data?.sales.grand;
  const pageRows = rows, debSearch = search;
  const pendingMap = Object.fromEntries(rows.map(row => [row.id, computeSalePending(row)]));
  const handleSearch = setSearch;
  useEffect(() => {
    if (!isAdmin) { toast.error('Admin access required'); navigate('/sales'); }
  }, [isAdmin, navigate]);

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
        <IconButton onClick={view.refresh} disabled={loading} size="small">
          {loading ? <CircularProgress size={20} /> : <Refresh />}
        </IconButton>
      </Box>

      {/* ── Summary cards ── */}
      {!loading && rows.length > 0 && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mb={3}>
          {[
            {
              label:    'Total Outstanding',
              value:    totalPending == null ? '—' : formatCurrency(totalPending),
              sub:      debSearch ? 'filtered results' : 'across all matching EMI sales',
              color:    'error',
            },
            {
              label:    debSearch ? 'Matching Sales' : 'Pending EMI Sales',
              value:    totals.data?.sales.count ?? '—',
              sub:      'all matching invoices',
              color:    'warning',
            },
            {
              label:    'Invoice Value',
              value:    totalGrand == null ? '—' : formatCurrency(totalGrand),
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

      <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 2 }}>
        <Tab label="Active EMI" /><Tab label="All EMI" />
      </Tabs>
      <QueryStatus error={view.error || totals.error} search={search} />
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
      {!loading && !view.error && !search.trim() && rows.length === 0 && (
        <Alert severity="success" sx={{ borderRadius: 2 }}>
          {tab === 0 ? 'No pending EMI sales found — all EMI invoices are fully paid!' : 'No EMI sales found.'}
        </Alert>
      )}

      {!loading && !view.error && search.trim().length >= 2 && rows.length === 0 && (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          No results match "{debSearch}". Try a different search.
        </Alert>
      )}

      {/* ── Mobile card list ── */}
      {!loading && isMobile && pageRows.length > 0 && (
        <Box>
          {pageRows.map(row => (
            <MobileRow key={row.id} row={row} pending={pendingMap[row.id]} navigate={navigate} />
          ))}
          <TablePagination
            component="div"
            count={view.total ?? -1}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={PAGE_SIZE}
            rowsPerPageOptions={[PAGE_SIZE]}
            backIconButtonProps={{ disabled: loading || page === 0 }}
            nextIconButtonProps={{ disabled: loading || !view.hasNext }}
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
                  const pending = pendingMap[row.id];
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
                          {pending == null ? 'Needs reconciliation' : formatCurrency(pending)}
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
                      {view.total} sale{view.total !== 1 ? 's' : ''}
                      {debSearch ? ` matching "${debSearch}"` : ''}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight={700}>
                      {totalGrand == null ? '—' : formatCurrency(totalGrand)}
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
            count={view.total ?? -1}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={PAGE_SIZE}
            rowsPerPageOptions={[PAGE_SIZE]}
            backIconButtonProps={{ disabled: loading || page === 0 }}
            nextIconButtonProps={{ disabled: loading || !view.hasNext }}
          />
        </Card>
      )}
    </Box>
  );
};

export default EmiList;