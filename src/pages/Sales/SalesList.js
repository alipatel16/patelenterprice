import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Button, Card, TextField, InputAdornment,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, Chip, IconButton, Tooltip, Dialog, DialogTitle,
  DialogContent, DialogActions, MenuItem, Select, FormControl,
  InputLabel, Stack,
} from '@mui/material';
import { Add, Search, Edit, Delete, FilterList, LocalShipping, Schedule } from '@mui/icons-material';
import {
  collection, query, orderBy, limit, startAfter, getDocs,
  deleteDoc, doc, getCountFromServer, where,
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { PAYMENT_LABELS } from '../../constants';
import { formatCurrency, formatDate, getPaymentStatusColor } from '../../utils';
import { useMediaQuery, useTheme } from '@mui/material';

const PAGE_SIZE = 10;

const SalesList = () => {
  const { db } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [invoiceFilter, setInvoiceFilter] = useState('all');
  const [deliveryFilter, setDeliveryFilter] = useState('all');
  const [cursorMap, setCursorMap] = useState({});
  const [deleteId, setDeleteId] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const searchTimer = useRef(null);

  const handleSearch = val => {
    setSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(0);
      setCursorMap({});
    }, 450);
  };

  const handleFilterChange = setter => e => {
    setter(e.target.value);
    setPage(0);
    setCursorMap({});
  };

  // Single effect with active-flag cancellation
  useEffect(() => {
    if (!db) return;
    let active = true;

    const run = async () => {
      setLoading(true);
      try {
        const constraints = [orderBy('createdAt', 'desc'), limit(PAGE_SIZE)];
        if (paymentFilter !== 'all') constraints.push(where('paymentType', '==', paymentFilter));
        if (invoiceFilter !== 'all') constraints.push(where('invoiceType', '==', invoiceFilter));
        if (deliveryFilter !== 'all') constraints.push(where('deliveryType', '==', deliveryFilter));
        if (page > 0 && cursorMap[page - 1]) constraints.push(startAfter(cursorMap[page - 1]));

        const snap = await getDocs(query(collection(db, 'sales'), ...constraints));
        let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        if (debouncedSearch.trim()) {
          const s = debouncedSearch.toLowerCase();
          docs = docs.filter(d =>
            d.invoiceNumber?.toLowerCase().includes(s) ||
            d.customerName?.toLowerCase().includes(s) ||
            d.customerPhone?.includes(s)
          );
        }

        const countFilters = [];
        if (paymentFilter !== 'all') countFilters.push(where('paymentType', '==', paymentFilter));
        if (invoiceFilter !== 'all') countFilters.push(where('invoiceType', '==', invoiceFilter));
        if (deliveryFilter !== 'all') countFilters.push(where('deliveryType', '==', deliveryFilter));
        const countSnap = await getCountFromServer(query(collection(db, 'sales'), ...countFilters));

        if (!active) return;
        setRows(docs);
        setTotal(countSnap.data().count);
        setCursorMap(prev => ({ ...prev, [page]: snap.docs[snap.docs.length - 1] || null }));
      } catch (err) {
        if (!active) return;
        toast.error('Failed to load sales: ' + err.message);
      } finally {
        if (active) setLoading(false);
      }
    };

    run();
    return () => { active = false; };
  }, [db, page, paymentFilter, invoiceFilter, deliveryFilter, debouncedSearch]);

  const handleDelete = async () => {
    await deleteDoc(doc(db, 'sales', deleteId));
    toast.success('Sale deleted');
    setDeleteId(null);
    setCursorMap({});
    setPage(0);
  };

  const DeliveryChip = ({ type }) => {
    if (!type || type === 'immediate') return <Chip icon={<LocalShipping sx={{ fontSize: '12px !important' }} />} label="Delivered" color="success" size="small" sx={{ fontSize: 10 }} />;
    return <Chip icon={<Schedule sx={{ fontSize: '12px !important' }} />} label="Scheduled" color="warning" size="small" sx={{ fontSize: 10 }} />;
  };

  const activeFilters = [paymentFilter !== 'all', invoiceFilter !== 'all', deliveryFilter !== 'all'].filter(Boolean).length;

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2} flexWrap="wrap" gap={1}>
        <Typography variant="h5" fontWeight={700}>Sales</Typography>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<FilterList />}
            onClick={() => setShowFilters(p => !p)}
            color={activeFilters > 0 ? 'primary' : 'inherit'}
          >
            Filters {activeFilters > 0 ? `(${activeFilters})` : ''}
          </Button>
          <Button variant="contained" startIcon={<Add />} onClick={() => navigate('/sales/new')}>
            New Sale
          </Button>
        </Stack>
      </Box>

      <Card sx={{ mb: 2 }}>
        <Box sx={{ p: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            placeholder="Search invoice, customer..." value={search}
            onChange={e => handleSearch(e.target.value)} size="small" sx={{ flex: 1, minWidth: 200 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
          />
          {showFilters && (
            <>
              <FormControl size="small" sx={{ minWidth: 170 }}>
                <InputLabel>Payment</InputLabel>
                <Select value={paymentFilter} onChange={handleFilterChange(setPaymentFilter)} label="Payment">
                  <MenuItem value="all">All Payments</MenuItem>
                  {Object.entries(PAYMENT_LABELS).map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>Invoice Type</InputLabel>
                <Select value={invoiceFilter} onChange={handleFilterChange(setInvoiceFilter)} label="Invoice Type">
                  <MenuItem value="all">All</MenuItem>
                  <MenuItem value="gst">GST Invoice</MenuItem>
                  <MenuItem value="non_gst">Non-GST</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>Delivery</InputLabel>
                <Select value={deliveryFilter} onChange={handleFilterChange(setDeliveryFilter)} label="Delivery">
                  <MenuItem value="all">All</MenuItem>
                  <MenuItem value="immediate">Delivered</MenuItem>
                  <MenuItem value="scheduled">Scheduled</MenuItem>
                </Select>
              </FormControl>
            </>
          )}
        </Box>
        {activeFilters > 0 && (
          <Box sx={{ px: 2, pb: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {paymentFilter !== 'all' && <Chip label={PAYMENT_LABELS[paymentFilter]} onDelete={() => setPaymentFilter('all')} color={getPaymentStatusColor(paymentFilter)} size="small" />}
            {invoiceFilter !== 'all' && <Chip label={invoiceFilter === 'gst' ? 'GST Invoice' : 'Non-GST'} onDelete={() => setInvoiceFilter('all')} size="small" />}
            {deliveryFilter !== 'all' && <Chip label={deliveryFilter === 'immediate' ? 'Delivered' : 'Scheduled'} onDelete={() => setDeliveryFilter('all')} size="small" />}
          </Box>
        )}
      </Card>

      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Invoice</TableCell>
                <TableCell>Customer</TableCell>
                {!isMobile && <TableCell>Date</TableCell>}
                <TableCell>Total</TableCell>
                <TableCell>Payment</TableCell>
                <TableCell>Delivery</TableCell>
                {!isMobile && <TableCell>Type</TableCell>}
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: isMobile ? 6 : 8 }).map((_, j) => (
                      <TableCell key={j}><Box sx={{ height: 20, bgcolor: 'action.hover', borderRadius: 1 }} /></TableCell>
                    ))}</TableRow>
                  ))
                : rows.length === 0
                  ? <TableRow>
                      <TableCell colSpan={isMobile ? 6 : 8} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">No sales found</Typography>
                        <Button variant="outlined" sx={{ mt: 1 }} onClick={() => navigate('/sales/new')}>Create First Sale</Button>
                      </TableCell>
                    </TableRow>
                  : rows.map(row => (
                      <TableRow key={row.id} hover sx={{ cursor: "pointer" }} onClick={() => navigate(`/sales/${row.id}`)}>
                        <TableCell>
                          <Typography variant="body2" fontWeight={700} color="primary">{row.invoiceNumber}</Typography>
                          {isMobile && <Typography variant="caption" color="text.secondary">{formatDate(row.saleDate)}</Typography>}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>{row.customerName}</Typography>
                          {!isMobile && <Typography variant="caption" color="text.secondary">{row.customerPhone}</Typography>}
                        </TableCell>
                        {!isMobile && <TableCell>{formatDate(row.saleDate)}</TableCell>}
                        <TableCell><Typography fontWeight={700} color="success.main">{formatCurrency(row.grandTotal)}</Typography></TableCell>
                        <TableCell>
                          <Chip label={PAYMENT_LABELS[row.paymentType] || row.paymentType} size="small"
                            color={getPaymentStatusColor(row.paymentType)} sx={{ fontSize: 10, height: 22 }} />
                        </TableCell>
                        <TableCell><DeliveryChip type={row.deliveryType} /></TableCell>
                        {!isMobile && (
                          <TableCell>
                            <Chip label={row.invoiceType === 'gst' ? 'GST' : 'Non-GST'} size="small" variant="outlined" sx={{ fontSize: 10 }} />
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
          component="div" count={total} page={page} rowsPerPage={PAGE_SIZE}
          onPageChange={(_, p) => setPage(p)} rowsPerPageOptions={[PAGE_SIZE]}
        />
      </Card>

      <Dialog open={Boolean(deleteId)} onClose={() => setDeleteId(null)} maxWidth="xs">
        <DialogTitle>Delete Sale?</DialogTitle>
        <DialogContent><Typography>This will not restore inventory. Continue?</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SalesList;