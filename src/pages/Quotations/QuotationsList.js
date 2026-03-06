import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Button, Card, TextField, InputAdornment,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, Chip, IconButton, Tooltip, Dialog, DialogTitle,
  DialogContent, DialogActions, MenuItem, Select, FormControl,
  InputLabel, Stack,
} from '@mui/material';
import { Add, Search, Edit, Delete, FilterList, Print, Description } from '@mui/icons-material';
import {
  collection, query, orderBy, limit, startAfter, getDocs,
  deleteDoc, doc, getCountFromServer, where,
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { formatCurrency, formatDate } from '../../utils';
import { COMPANIES } from '../../constants';
import { useMediaQuery, useTheme } from '@mui/material';

const PAGE_SIZE = 10;

const QuotationsList = () => {
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
  const [invoiceFilter, setInvoiceFilter] = useState('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [cursorMap, setCursorMap] = useState({});
  const [deleteId, setDeleteId] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const searchTimer = useRef(null);

  // Debounce search
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
      setCursorMap({});
    }, 400);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  // Reset pagination when filters change
  useEffect(() => {
    setPage(0);
    setCursorMap({});
  }, [invoiceFilter, companyFilter]);

  // Load page
  useEffect(() => {
    if (!db) return;
    loadPage();
    // eslint-disable-next-line
  }, [db, page, debouncedSearch, invoiceFilter, companyFilter, refreshKey]);

  const buildBaseQuery = () => {
    const constraints = [orderBy('createdAt', 'desc')];
    if (invoiceFilter !== 'all') constraints.push(where('invoiceType', '==', invoiceFilter));
    if (companyFilter !== 'all') constraints.push(where('companyId', '==', companyFilter));
    return constraints;
  };

  const loadPage = async () => {
    setLoading(true);
    try {
      // If searching, do client-side filtered fetch
      if (debouncedSearch.trim()) {
        const snap = await getDocs(query(collection(db, 'quotations'), orderBy('createdAt', 'desc'), limit(500)));
        const s = debouncedSearch.toLowerCase();
        const filtered = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(r =>
            (r.quoteNumber || '').toLowerCase().includes(s) ||
            (r.customerName || '').toLowerCase().includes(s) ||
            (r.customerPhone || '').toLowerCase().includes(s)
          );
        setTotal(filtered.length);
        setRows(filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE));
        return;
      }

      // Count
      const countConstraints = buildBaseQuery().filter(c => c.type !== 'orderBy');
      const countQ = query(collection(db, 'quotations'), ...buildBaseQuery().filter(c => c.type === 'where'));
      const countSnap = await getCountFromServer(query(collection(db, 'quotations'),
        ...(invoiceFilter !== 'all' ? [where('invoiceType', '==', invoiceFilter)] : []),
        ...(companyFilter !== 'all' ? [where('companyId', '==', companyFilter)] : []),
      ));
      setTotal(countSnap.data().count);

      // Paginated fetch
      const constraints = buildBaseQuery();
      constraints.push(limit(PAGE_SIZE));
      if (page > 0 && cursorMap[page]) constraints.push(startAfter(cursorMap[page]));

      const snap = await getDocs(query(collection(db, 'quotations'), ...constraints));
      if (snap.docs.length > 0) {
        setCursorMap(m => ({ ...m, [page + 1]: snap.docs[snap.docs.length - 1] }));
      }
      setRows(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      toast.error('Failed to load quotations');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteDoc(doc(db, 'quotations', deleteId));
      toast.success('Quotation deleted');
      setDeleteId(null);
      setRefreshKey(k => k + 1);
    } catch (e) {
      toast.error('Delete failed');
    }
  };

  const getStatusChip = (row) => {
    const today = new Date().toISOString().split('T')[0];
    if (row.validUntil && row.validUntil < today) {
      return <Chip label="Expired" color="error" size="small" />;
    }
    return <Chip label="Active" color="success" size="small" />;
  };

  // Mobile card view
  const MobileCard = ({ row }) => (
    <Card
      elevation={0}
      sx={{
        mb: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2,
        cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' },
      }}
      onClick={() => navigate(`/quotations/${row.id}`)}
    >
      <Box sx={{ p: 2 }}>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
          <Box>
            <Typography variant="body2" fontWeight={700} color="primary.main">{row.quoteNumber}</Typography>
            <Typography variant="caption" color="text.secondary">{formatDate(row.quoteDate)}</Typography>
          </Box>
          <Box display="flex" gap={0.5} alignItems="center">
            {getStatusChip(row)}
            <Chip
              label={row.invoiceType === 'gst' ? 'GST' : 'Non-GST'}
              size="small"
              variant="outlined"
              color={row.invoiceType === 'gst' ? 'primary' : 'default'}
            />
          </Box>
        </Box>
        <Typography variant="body2" fontWeight={600}>{row.customerName}</Typography>
        <Typography variant="caption" color="text.secondary" display="block">{row.companyName}</Typography>
        <Box display="flex" justifyContent="space-between" alignItems="center" mt={1}>
          <Typography variant="body2" fontWeight={700} color="primary.main">
            {formatCurrency(row.grandTotal)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Valid: {formatDate(row.validUntil)}
          </Typography>
        </Box>
        <Box display="flex" gap={1} mt={1.5} onClick={e => e.stopPropagation()}>
          <IconButton size="small" onClick={() => navigate(`/quotations/edit/${row.id}`)}>
            <Edit fontSize="small" />
          </IconButton>
          <IconButton size="small" color="error" onClick={() => setDeleteId(row.id)}>
            <Delete fontSize="small" />
          </IconButton>
        </Box>
      </Box>
    </Card>
  );

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* Header */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3} flexWrap="wrap" gap={1}>
        <Box display="flex" alignItems="center" gap={1}>
          <Description color="primary" />
          <Box>
            <Typography variant="h5" fontWeight={700}>Quotations</Typography>
            <Typography variant="caption" color="text.secondary">{total} total quotes</Typography>
          </Box>
        </Box>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => navigate('/quotations/new')}
          size={isMobile ? 'small' : 'medium'}
        >
          New Quote
        </Button>
      </Box>

      {/* Search + Filters */}
      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 2, p: 2 }}>
        <Box display="flex" gap={1} flexWrap="wrap" alignItems="center">
          <TextField
            placeholder="Search by quote #, customer, phone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            size="small"
            sx={{ flex: 1, minWidth: 200 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
          />
          <IconButton onClick={() => setShowFilters(f => !f)} color={showFilters ? 'primary' : 'default'}>
            <FilterList />
          </IconButton>
        </Box>

        {showFilters && (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} mt={2}>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Quote Type</InputLabel>
              <Select value={invoiceFilter} onChange={e => setInvoiceFilter(e.target.value)} label="Quote Type">
                <MenuItem value="all">All Types</MenuItem>
                <MenuItem value="gst">GST Quote</MenuItem>
                <MenuItem value="non_gst">Non-GST Quote</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Firm</InputLabel>
              <Select value={companyFilter} onChange={e => setCompanyFilter(e.target.value)} label="Firm">
                <MenuItem value="all">All Firms</MenuItem>
                {Object.values(COMPANIES).map(c => (
                  <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button size="small" variant="outlined" onClick={() => {
              setInvoiceFilter('all'); setCompanyFilter('all'); setSearch('');
            }}>
              Clear
            </Button>
          </Stack>
        )}
      </Card>

      {/* List */}
      {isMobile ? (
        <Box>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Card key={i} elevation={0} sx={{ mb: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2, height: 120, bgcolor: 'action.hover' }} />
            ))
          ) : rows.length === 0 ? (
            <Box textAlign="center" py={6}>
              <Description sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
              <Typography color="text.secondary">No quotations found</Typography>
              <Button variant="contained" startIcon={<Add />} sx={{ mt: 2 }} onClick={() => navigate('/quotations/new')}>
                Create First Quote
              </Button>
            </Box>
          ) : (
            rows.map(row => <MobileCard key={row.id} row={row} />)
          )}
          {rows.length > 0 && (
            <TablePagination
              component="div"
              count={total}
              page={page}
              onPageChange={(_, p) => setPage(p)}
              rowsPerPage={PAGE_SIZE}
              rowsPerPageOptions={[PAGE_SIZE]}
              sx={{ '.MuiTablePagination-toolbar': { px: 0 } }}
            />
          )}
        </Box>
      ) : (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell sx={{ fontWeight: 700 }}>Quote #</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Customer</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Firm</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Quote Date</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Valid Until</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Grand Total</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  Array.from({ length: PAGE_SIZE }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <TableCell key={j}><Box sx={{ height: 16, bgcolor: 'action.hover', borderRadius: 1 }} /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                      <Description sx={{ fontSize: 48, color: 'text.disabled', display: 'block', mx: 'auto', mb: 1 }} />
                      <Typography color="text.secondary">No quotations found</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map(row => (
                    <TableRow
                      key={row.id}
                      hover
                      sx={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/quotations/${row.id}`)}
                    >
                      <TableCell>
                        <Typography variant="body2" fontWeight={700} color="primary.main">{row.quoteNumber}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{row.customerName}</Typography>
                        <Typography variant="caption" color="text.secondary">{row.customerPhone}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 160 }}>{row.companyName}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={row.invoiceType === 'gst' ? 'GST' : 'Non-GST'}
                          size="small"
                          variant="outlined"
                          color={row.invoiceType === 'gst' ? 'primary' : 'default'}
                        />
                      </TableCell>
                      <TableCell>{formatDate(row.quoteDate)}</TableCell>
                      <TableCell>{formatDate(row.validUntil)}</TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={700}>{formatCurrency(row.grandTotal)}</Typography>
                      </TableCell>
                      <TableCell>{getStatusChip(row)}</TableCell>
                      <TableCell align="center" onClick={e => e.stopPropagation()}>
                        <Stack direction="row" spacing={0.5} justifyContent="center">
                          <Tooltip title="Edit">
                            <IconButton size="small" onClick={() => navigate(`/quotations/edit/${row.id}`)}>
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
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={PAGE_SIZE}
            rowsPerPageOptions={[PAGE_SIZE]}
          />
        </Card>
      )}

      {/* Delete Dialog */}
      <Dialog open={!!deleteId} onClose={() => setDeleteId(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Quotation?</DialogTitle>
        <DialogContent>
          <Typography>This action cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default QuotationsList;