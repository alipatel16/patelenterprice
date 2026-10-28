import { getKnownSnapshot as getDoc } from '../../utils/knownDocument';
import { deleteRecord as deleteDoc } from '../../data/writes';
import usePagedCollection from '../../hooks/usePagedCollection';
import QueryStatus from '../../components/QueryStatus';
import { businessListOptions } from '../../utils/businessListQueries';
import { useState } from 'react';
import {
  Box, Typography, Button, Card, TextField, InputAdornment,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, Chip, IconButton, Tooltip, Dialog, DialogTitle,
  DialogContent, DialogActions, MenuItem, Select, FormControl,
  InputLabel, Stack, Collapse,
} from '@mui/material';
import { Add, Search, Edit, Delete, FilterList, LocalShipping, Schedule, DateRange, Clear, CreditScore } from '@mui/icons-material';
import { doc } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { PAYMENT_LABELS } from '../../constants';
import { formatCurrency, formatDate, getPaymentStatusColor } from '../../utils';
import { useMediaQuery, useTheme } from '@mui/material';
import { reverseSaleInventory } from '../../utils/inventoryUtils';

const PAGE_SIZE = 15;

const DATE_PRESETS = [
  { label: 'Today',        getDates: () => { const d = new Date(); return [d, d]; } },
  { label: 'Yesterday',    getDates: () => { const d = new Date(); d.setDate(d.getDate()-1); return [d, d]; } },
  { label: 'Last 7 Days',  getDates: () => { const e = new Date(); const s = new Date(); s.setDate(s.getDate()-6); return [s, e]; } },
  { label: 'Last 30 Days', getDates: () => { const e = new Date(); const s = new Date(); s.setDate(s.getDate()-29); return [s, e]; } },
  { label: 'This Month',   getDates: () => { const n = new Date(); return [new Date(n.getFullYear(), n.getMonth(), 1), new Date(n.getFullYear(), n.getMonth()+1, 0)]; } },
  { label: 'Last Month',   getDates: () => { const n = new Date(); return [new Date(n.getFullYear(), n.getMonth()-1, 1), new Date(n.getFullYear(), n.getMonth(), 0)]; } },
];

const toInputDate = d => d ? d.toISOString().split('T')[0] : '';

const SalesList = () => {
  const { db, isAdmin } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const navigate = useNavigate();

  // Search
  const [search,          setSearch]          = useState('');

  // Filters
  const [paymentFilter,  setPaymentFilter]  = useState('all');
  const [invoiceFilter,  setInvoiceFilter]  = useState('all');
  const [deliveryFilter, setDeliveryFilter] = useState('all');

  // Date range
  const [dateFrom,     setDateFrom]     = useState('');
  const [dateTo,       setDateTo]       = useState('');
  const [activePreset, setActivePreset] = useState('');

  const [deleteId,    setDeleteId]    = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const resetPagination = () => { setPage(0);  };

  const handleSearch = setSearch;

  const handleFilterChange = setter => e => { setter(e.target.value); resetPagination(); };

  const applyPreset = preset => {
    const [start, end] = preset.getDates();
    setDateFrom(toInputDate(start));
    setDateTo(toInputDate(end));
    setActivePreset(preset.label);
    resetPagination();
  };

  const handleDateFromChange = val => { setDateFrom(val); setActivePreset(''); resetPagination(); };
  const handleDateToChange   = val => { setDateTo(val);   setActivePreset(''); resetPagination(); };

  const clearDateRange = () => { setDateFrom(''); setDateTo(''); setActivePreset(''); resetPagination(); };

  const clearAllFilters = () => {
    setPaymentFilter('all'); setInvoiceFilter('all'); setDeliveryFilter('all');
    setDateFrom(''); setDateTo(''); setActivePreset('');
    resetPagination();
  };

  // ── Data loading ───────────────────────────────────────────────────────────
  const { rows, loading, error, total, page, setPage, refresh } = usePagedCollection(
    db, 'sales', businessListOptions('sales', { search, paymentFilter, invoiceFilter, deliveryFilter, dateFrom, dateTo })
  );

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    try {
      const saleSnap = await getDoc(doc(db, 'sales', deleteId), { ttlMs: 0 });
      if (saleSnap.exists()) await reverseSaleInventory(db, saleSnap.data().items || []);
      await deleteDoc(doc(db, 'sales', deleteId));
      toast.success('Sale deleted & inventory restored');
      setDeleteId(null);

      setPage(0);
      refresh();
    } catch (e) {
      toast.error('Failed to delete sale: ' + e.message);
    }
  };

  // ── Sub-components ─────────────────────────────────────────────────────────
  const DeliveryChip = ({ type }) => {
    if (!type || type === 'immediate')
      return <Chip icon={<LocalShipping sx={{ fontSize: '12px !important' }} />} label="Delivered" color="success" size="small" sx={{ fontSize: 10 }} />;
    return <Chip icon={<Schedule sx={{ fontSize: '12px !important' }} />} label="Scheduled" color="warning" size="small" sx={{ fontSize: 10 }} />;
  };

  const hasDateFilter   = dateFrom || dateTo;
  const activeFilterCount = [
    paymentFilter  !== 'all',
    invoiceFilter  !== 'all',
    deliveryFilter !== 'all',
    hasDateFilter,
  ].filter(Boolean).length;

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <QueryStatus error={error} loading={loading} search={search} />

      {/* ── Header ── */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2} flexWrap="wrap" gap={1}>
        <Typography variant="h5" fontWeight={700}>Sales</Typography>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={<FilterList />}
            onClick={() => setShowFilters(p => !p)}
            color={activeFilterCount > 0 ? 'primary' : 'inherit'}
            size={isMobile ? 'small' : 'medium'}
          >
            {isMobile ? '' : 'Filters'}{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </Button>
          {isAdmin && (
            <Button
              variant="outlined"
              color="warning"
              startIcon={<CreditScore />}
              onClick={() => navigate('/emi-list')}
              size={isMobile ? 'small' : 'medium'}
            >
              {isMobile ? 'EMI' : 'EMI Pending'}
            </Button>
          )}
          {/* <Button
            variant="outlined"
            startIcon={<ShowChart />}
            onClick={() => navigate('/product-movement')}
            size={isMobile ? 'small' : 'medium'}
          >
            {isMobile ? 'Reports' : 'Movement Reports'}
          </Button> */}
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => navigate('/sales/new')}
            size={isMobile ? 'small' : 'medium'}
          >
            New Sale
          </Button>
        </Stack>
      </Box>

      {/* ── Search + Filter Card ── */}
      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 2 }}>
        <Box sx={{ p: 2 }}>
          {/* Search across all dates, preserving the selected filters. */}
          <TextField
            fullWidth
            size="small"
            placeholder="Search by invoice #, customer name or phone…"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search fontSize="small" color="inherit" />
                </InputAdornment>
              ),
              endAdornment: search ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => handleSearch('')}><Clear fontSize="small" /></IconButton>
                </InputAdornment>
              ) : null,
            }}
            sx={{
              mb: 1.5,
              '& .MuiOutlinedInput-root': {
                bgcolor: 'background.paper',
              },
            }}
          />

          {/* Filter toggles row */}
          <Collapse in={showFilters}>
            <Stack spacing={2} mt={1}>
              {/* Dropdown filters */}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} flexWrap="wrap">
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <InputLabel>Payment</InputLabel>
                  <Select value={paymentFilter} onChange={handleFilterChange(setPaymentFilter)} label="Payment">
                    <MenuItem value="all">All Payments</MenuItem>
                    {Object.entries(PAYMENT_LABELS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <InputLabel>Invoice Type</InputLabel>
                  <Select value={invoiceFilter} onChange={handleFilterChange(setInvoiceFilter)} label="Invoice Type">
                    <MenuItem value="all">All</MenuItem>
                    <MenuItem value="gst">GST</MenuItem>
                    <MenuItem value="non_gst">Non-GST</MenuItem>
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <InputLabel>Delivery</InputLabel>
                  <Select value={deliveryFilter} onChange={handleFilterChange(setDeliveryFilter)} label="Delivery">
                    <MenuItem value="all">All</MenuItem>
                    <MenuItem value="immediate">Delivered</MenuItem>
                    <MenuItem value="scheduled">Scheduled</MenuItem>
                  </Select>
                </FormControl>
                {activeFilterCount > 0 && (
                  <Button size="small" variant="text" color="error" onClick={clearAllFilters}>
                    Clear All
                  </Button>
                )}
              </Stack>

              {/* Date range */}
              <Box sx={{
                p: 1.5, borderRadius: 1.5, border: '1px solid',
                borderColor: hasDateFilter ? 'primary.300' : 'divider',
                bgcolor: hasDateFilter ? 'primary.50' : 'grey.50',
              }}>
                <Box display="flex" alignItems="center" gap={1} mb={1.5}>
                  <DateRange fontSize="small" color={hasDateFilter ? 'primary' : 'action'} />
                  <Typography variant="caption" fontWeight={700} color={hasDateFilter ? 'primary.main' : 'text.secondary'}>
                    DATE RANGE
                  </Typography>
                  {hasDateFilter && (
                    <Chip
                      label={activePreset || `${dateFrom || '…'} → ${dateTo || '…'}`}
                      size="small" color="primary" variant="outlined"
                      onDelete={clearDateRange}
                      sx={{ ml: 'auto', fontSize: 10 }}
                    />
                  )}
                </Box>

                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 1.5 }}>
                  <TextField
                    size="small" type="date" label="From"
                    value={dateFrom} onChange={e => handleDateFromChange(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ max: dateTo || undefined }}
                    sx={{ flex: 1, minWidth: 140 }}
                  />
                  <TextField
                    size="small" type="date" label="To"
                    value={dateTo} onChange={e => handleDateToChange(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ min: dateFrom || undefined }}
                    sx={{ flex: 1, minWidth: 140 }}
                  />
                </Box>

                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                  {DATE_PRESETS.map(p => (
                    <Chip
                      key={p.label} label={p.label} size="small"
                      variant={activePreset === p.label ? 'filled' : 'outlined'}
                      color={activePreset === p.label ? 'primary' : 'default'}
                      onClick={() => applyPreset(p)}
                      sx={{ cursor: 'pointer', fontSize: 11 }}
                    />
                  ))}
                </Box>
              </Box>
            </Stack>
          </Collapse>
        </Box>

        {/* Active date range strip — visible even when filters collapsed */}
        {hasDateFilter && !showFilters && (
          <Box sx={{
            px: 2, py: 1, bgcolor: 'primary.50',
            borderTop: '1px solid', borderColor: 'primary.100',
            display: 'flex', alignItems: 'center', gap: 1,
          }}>
            <DateRange fontSize="small" color="primary" />
            <Typography variant="caption" color="primary.main" fontWeight={600}>
              {activePreset
                ? activePreset
                : `${dateFrom || '…'} → ${dateTo || '…'}`}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              · {total} result{total !== 1 ? 's' : ''}
              {' · search enabled'}
            </Typography>
            <IconButton size="small" onClick={clearDateRange} sx={{ ml: 'auto', p: 0.25 }}>
              <Clear fontSize="small" />
            </IconButton>
          </Box>
        )}
      </Card>

      {/* ── Table ── */}
      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell>Customer</TableCell>
                {!isMobile && <TableCell>Invoice #</TableCell>}
                {!isMobile && <TableCell>Date</TableCell>}
                <TableCell>Amount</TableCell>
                <TableCell>Status</TableCell>
                {!isMobile && <TableCell>Delivery</TableCell>}
                {!isMobile && <TableCell>Type</TableCell>}
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: isMobile ? 5 : 8 }).map((_, j) => (
                        <TableCell key={j}>
                          <Box sx={{ height: 20, bgcolor: 'action.hover', borderRadius: 1 }} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : rows.length === 0
                  ? (
                    <TableRow>
                      <TableCell colSpan={isMobile ? 5 : 8} align="center" sx={{ py: 6 }}>
                        <Typography color="text.secondary">
                          {search
                            ? `No sales matching "${search}"`
                            : hasDateFilter
                              ? 'No sales found for the selected date range'
                              : 'No sales found'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )
                  : rows.map(row => (
                      <TableRow
                        key={row.id} hover sx={{ cursor: 'pointer' }}
                        onClick={() => navigate(`/sales/${row.id}`)}
                      >
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>{row.customerName || '-'}</Typography>
                          {isMobile && (
                            <Typography variant="caption" color="text.secondary">{formatDate(row.saleDate)}</Typography>
                          )}
                        </TableCell>
                        {!isMobile && (
                          <TableCell>
                            <Typography variant="body2">{row.invoiceNumber || '-'}</Typography>
                          </TableCell>
                        )}
                        {!isMobile && <TableCell>{formatDate(row.saleDate)}</TableCell>}
                        <TableCell>
                          <Typography fontWeight={600} color="success.main">
                            {formatCurrency(row.grandTotal)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={
                              row.paymentStatus === 'paid' ? 'Paid'
                                : row.paymentStatus === 'partial' ? 'Partial'
                                : 'Unpaid'
                            }
                            color={getPaymentStatusColor(row.paymentStatus)}
                            size="small" sx={{ fontSize: 10 }}
                          />
                        </TableCell>
                        {!isMobile && (
                          <TableCell><DeliveryChip type={row.deliveryType} /></TableCell>
                        )}
                        {!isMobile && (
                          <TableCell>
                            <Chip
                              label={row.invoiceType === 'gst' ? 'GST' : 'Non-GST'}
                              size="small" variant="outlined" sx={{ fontSize: 10 }}
                            />
                          </TableCell>
                        )}
                        <TableCell align="right" onClick={e => e.stopPropagation()}>
                          <Tooltip title="Edit">
                            <IconButton size="small" onClick={() => navigate(`/sales/edit/${row.id}`)}>
                              <Edit fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton size="small" color="error" onClick={() => setDeleteId(row.id)}>
                              <Delete fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))
              }
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div" count={total ?? 0} page={page} rowsPerPage={PAGE_SIZE}
          onPageChange={(_, p) => setPage(p)} rowsPerPageOptions={[PAGE_SIZE]}
        />
      </Card>

      {/* ── Delete Dialog ── */}
      <Dialog open={Boolean(deleteId)} onClose={() => setDeleteId(null)} maxWidth="xs">
        <DialogTitle>Delete Sale?</DialogTitle>
        <DialogContent>
          <Typography>
            This will delete the sale and restore the inventory quantities. Continue?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SalesList;
