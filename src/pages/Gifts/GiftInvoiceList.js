import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Button, Card, CardContent, TextField, InputAdornment,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, Chip, IconButton, Stack, Tooltip, Dialog,
  DialogTitle, DialogContent, DialogActions, LinearProgress,
} from '@mui/material';
import { Add, Search, Edit, Delete, CardGiftcard, LocalShipping } from '@mui/icons-material';
import {
  collection, query, orderBy, limit, startAfter, getDocs,
  deleteDoc, doc, getCountFromServer,
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { formatDate } from '../../utils';
import { useMediaQuery, useTheme } from '@mui/material';

const PAGE_SIZE = 10;

const DeliveryProgress = ({ items }) => {
  const total = items?.length || 0;
  const delivered = items?.filter(i => i.deliveryStatus === 'delivered').length || 0;
  const pct = total > 0 ? Math.round((delivered / total) * 100) : 0;
  const allDone = delivered === total && total > 0;

  return (
    <Box sx={{ minWidth: 100 }}>
      <Box display="flex" justifyContent="space-between" mb={0.3}>
        <Typography variant="caption" color={allDone ? 'success.main' : 'text.secondary'} fontWeight={600}>
          {delivered}/{total}
        </Typography>
        <Typography variant="caption" color="text.secondary">{pct}%</Typography>
      </Box>
      <LinearProgress
        variant="determinate" value={pct}
        color={allDone ? 'success' : delivered > 0 ? 'warning' : 'inherit'}
        sx={{ height: 5, borderRadius: 3 }}
      />
    </Box>
  );
};

const GiftInvoiceList = () => {
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
  const [cursorMap, setCursorMap] = useState({});
  const [deleteId, setDeleteId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const searchTimer = useRef(null);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
      setCursorMap({});
    }, 400);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  useEffect(() => {
    if (!db) return;
    loadPage();
    // eslint-disable-next-line
  }, [db, page, debouncedSearch, refreshKey]);

  const loadPage = async () => {
    setLoading(true);
    try {
      if (debouncedSearch.trim()) {
        const snap = await getDocs(query(collection(db, 'giftInvoices'), orderBy('createdAt', 'desc'), limit(500)));
        const s = debouncedSearch.toLowerCase();
        const filtered = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(r =>
            (r.invoiceNumber || '').toLowerCase().includes(s) ||
            (r.customerName || '').toLowerCase().includes(s) ||
            (r.customerPhone || '').toLowerCase().includes(s) ||
            (r.giftSetName || '').toLowerCase().includes(s)
          );
        setTotal(filtered.length);
        setRows(filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE));
        return;
      }

      const countSnap = await getCountFromServer(collection(db, 'giftInvoices'));
      setTotal(countSnap.data().count);

      const constraints = [orderBy('createdAt', 'desc'), limit(PAGE_SIZE)];
      if (page > 0 && cursorMap[page]) constraints.push(startAfter(cursorMap[page]));
      const snap = await getDocs(query(collection(db, 'giftInvoices'), ...constraints));
      if (snap.docs.length > 0) {
        setCursorMap(m => ({ ...m, [page + 1]: snap.docs[snap.docs.length - 1] }));
      }
      setRows(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      toast.error('Failed to load gift invoices');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteDoc(doc(db, 'giftInvoices', deleteId));
      toast.success('Gift invoice deleted');
      setDeleteId(null);
      setCursorMap({});
      setPage(0);
      setRefreshKey(k => k + 1);
    } catch (e) {
      toast.error('Delete failed');
    }
  };

  const getOverallStatus = (items) => {
    if (!items?.length) return { label: 'No Items', color: 'default' };
    const total = items.length;
    const delivered = items.filter(i => i.deliveryStatus === 'delivered').length;
    if (delivered === total) return { label: 'All Delivered', color: 'success' };
    if (delivered > 0) return { label: 'Partial', color: 'warning' };
    return { label: 'Pending', color: 'error' };
  };

  const MobileCard = ({ row }) => {
    const status = getOverallStatus(row.items);
    return (
      <Card elevation={0} sx={{ mb: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2,
        cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
        onClick={() => navigate(`/gift-invoices/${row.id}`)}>
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
            <Box>
              <Typography variant="body2" fontWeight={700} color="secondary.main">{row.invoiceNumber}</Typography>
              <Typography variant="caption" color="text.secondary">{formatDate(row.date)}</Typography>
            </Box>
            <Chip label={status.label} color={status.color} size="small" />
          </Box>
          <Typography variant="body2" fontWeight={600}>{row.customerName}</Typography>
          <Typography variant="caption" color="text.secondary" display="block">{row.customerPhone}</Typography>
          <Box display="flex" alignItems="center" gap={0.5} mt={0.5} mb={1}>
            <CardGiftcard sx={{ fontSize: 14, color: 'secondary.main' }} />
            <Typography variant="caption" color="secondary.main" fontWeight={600}>{row.giftSetName}</Typography>
          </Box>
          <DeliveryProgress items={row.items} />
          <Box display="flex" gap={1} mt={1.5} onClick={e => e.stopPropagation()}>
            <IconButton size="small" onClick={() => navigate(`/gift-invoices/edit/${row.id}`)}>
              <Edit fontSize="small" />
            </IconButton>
            <IconButton size="small" color="error" onClick={() => setDeleteId(row.id)}>
              <Delete fontSize="small" />
            </IconButton>
          </Box>
        </CardContent>
      </Card>
    );
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* Header */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3} flexWrap="wrap" gap={1}>
        <Box display="flex" alignItems="center" gap={1}>
          <CardGiftcard color="secondary" />
          <Box>
            <Typography variant="h5" fontWeight={700}>Gift Invoices</Typography>
            <Typography variant="caption" color="text.secondary">
              {total} invoices · Patel Electronics And Furniture
            </Typography>
          </Box>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" color="secondary" startIcon={<CardGiftcard />}
            onClick={() => navigate('/gift-sets')} size={isMobile ? 'small' : 'medium'}>
            Gift Sets
          </Button>
          <Button variant="contained" color="secondary" startIcon={<Add />}
            onClick={() => navigate('/gift-invoices/new')} size={isMobile ? 'small' : 'medium'}>
            New Invoice
          </Button>
        </Stack>
      </Box>

      {/* Search */}
      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 2, p: 2 }}>
        <TextField
          fullWidth placeholder="Search by invoice #, customer, gift set..."
          value={search} onChange={e => setSearch(e.target.value)} size="small"
          InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
        />
      </Card>

      {/* List */}
      {isMobile ? (
        <Box>
          {loading ? Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} elevation={0} sx={{ mb: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2, height: 130, bgcolor: 'action.hover' }} />
          )) : rows.length === 0 ? (
            <Box textAlign="center" py={6}>
              <CardGiftcard sx={{ fontSize: 52, color: 'text.disabled', mb: 1 }} />
              <Typography color="text.secondary">No gift invoices yet</Typography>
              <Button variant="contained" color="secondary" startIcon={<Add />} sx={{ mt: 2 }}
                onClick={() => navigate('/gift-invoices/new')}>
                Raise First Gift Invoice
              </Button>
            </Box>
          ) : rows.map(row => <MobileCard key={row.id} row={row} />)}
          {rows.length > 0 && (
            <TablePagination component="div" count={total} page={page}
              onPageChange={(_, p) => { setPage(p); setCursorMap({}); }}
              rowsPerPage={PAGE_SIZE} rowsPerPageOptions={[PAGE_SIZE]}
              sx={{ '.MuiTablePagination-toolbar': { px: 0 } }} />
          )}
        </Box>
      ) : (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell sx={{ fontWeight: 700 }}>Invoice #</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Customer</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Gift Set</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Delivery Progress</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? Array.from({ length: PAGE_SIZE }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><Box sx={{ height: 16, bgcolor: 'action.hover', borderRadius: 1 }} /></TableCell>
                    ))}
                  </TableRow>
                )) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                      <CardGiftcard sx={{ fontSize: 48, color: 'text.disabled', display: 'block', mx: 'auto', mb: 1 }} />
                      <Typography color="text.secondary">No gift invoices found</Typography>
                    </TableCell>
                  </TableRow>
                ) : rows.map(row => {
                  const status = getOverallStatus(row.items);
                  return (
                    <TableRow key={row.id} hover sx={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/gift-invoices/${row.id}`)}>
                      <TableCell>
                        <Typography variant="body2" fontWeight={700} color="secondary.main">
                          {row.invoiceNumber}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{row.customerName}</Typography>
                        <Typography variant="caption" color="text.secondary">{row.customerPhone}</Typography>
                      </TableCell>
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={0.5}>
                          <CardGiftcard sx={{ fontSize: 14, color: 'secondary.main' }} />
                          <Typography variant="body2">{row.giftSetName}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell>{formatDate(row.date)}</TableCell>
                      <TableCell sx={{ minWidth: 130 }}>
                        <DeliveryProgress items={row.items} />
                      </TableCell>
                      <TableCell>
                        <Chip label={status.label} color={status.color} size="small" />
                      </TableCell>
                      <TableCell align="center" onClick={e => e.stopPropagation()}>
                        <Stack direction="row" spacing={0.5} justifyContent="center">
                          <Tooltip title="Edit">
                            <IconButton size="small" onClick={() => navigate(`/gift-invoices/edit/${row.id}`)}>
                              <Edit fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton size="small" color="error" onClick={() => setDeleteId(row.id)}>
                              <Delete fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination component="div" count={total} page={page}
            onPageChange={(_, p) => { setPage(p); setCursorMap({}); }}
            rowsPerPage={PAGE_SIZE} rowsPerPageOptions={[PAGE_SIZE]} />
        </Card>
      )}

      <Dialog open={!!deleteId} onClose={() => setDeleteId(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Gift Invoice?</DialogTitle>
        <DialogContent><Typography>This action cannot be undone.</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default GiftInvoiceList;