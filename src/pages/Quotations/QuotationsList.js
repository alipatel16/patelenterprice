import { deleteRecord as deleteDoc } from '../../data/writes';
import usePagedCollection from '../../hooks/usePagedCollection';
import QueryStatus from '../../components/QueryStatus';
import { businessListOptions } from '../../utils/businessListQueries';
import { useState } from 'react';
import {
  Box, Typography, Button, Card, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TablePagination, Chip,
  IconButton, Tooltip, Dialog, DialogTitle, DialogContent,
  DialogActions, MenuItem, Select, FormControl, InputLabel, Stack,
} from '@mui/material';
import { Add, Edit, Delete, FilterList, Description } from '@mui/icons-material';
import { doc } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { formatCurrency, formatDate } from '../../utils';
import { COMPANIES } from '../../constants';
import { useMediaQuery, useTheme } from '@mui/material';
import MonthSearchBar from '../../components/MonthSearchBar';

const PAGE_SIZE = 15;

/** Returns { start: Date, end: Date } spanning the full calendar month. */

const QuotationsList = () => {
  const { db }   = useAuth();
  const theme    = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const navigate = useNavigate();

  // Month-scoped search
  const [searchMonth,     setSearchMonth]     = useState('');
  const [search,          setSearch]          = useState('');

  // Filters
  const [invoiceFilter, setInvoiceFilter] = useState('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [showFilters,   setShowFilters]   = useState(false);

  const [deleteId,    setDeleteId]    = useState(null);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSearch = setSearch;

  const handleMonthChange = setSearchMonth;

  // ── Data loading ───────────────────────────────────────────────────────────
  const { rows, loading, error, total, page, setPage, refresh } = usePagedCollection(
    db, 'quotations', businessListOptions('quotations', { search, month: searchMonth, invoiceFilter, companyFilter })
  );

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteDoc(doc(db, 'quotations', deleteId));
      toast.success('Quotation deleted');
      setDeleteId(null);

      setPage(0);
      refresh();
    } catch (e) {
      toast.error('Delete failed');
    }
  };

  const getStatusChip = (row) => {
    const today = new Date().toISOString().split('T')[0];
    if (row.validUntil && row.validUntil < today)
      return <Chip label="Expired" color="error" size="small" />;
    return <Chip label="Active" color="success" size="small" />;
  };

  // ── Mobile card ────────────────────────────────────────────────────────────
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
              size="small" variant="outlined"
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
      <QueryStatus error={error} loading={loading} search={search} />

      {/* ── Header ── */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3} flexWrap="wrap" gap={1}>
        <Box display="flex" alignItems="center" gap={1}>
          <Description color="primary" />
          <Box>
            <Typography variant="h5" fontWeight={700}>Quotations</Typography>
            <Typography variant="caption" color="text.secondary">
              {searchMonth ? `${total} results` : `${total} total quotes`}
            </Typography>
          </Box>
        </Box>
        <Button
          variant="contained" startIcon={<Add />}
          onClick={() => navigate('/quotations/new')}
          size={isMobile ? 'small' : 'medium'}
        >
          New Quote
        </Button>
      </Box>

      {/* ── Search + Filters ── */}
      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 2, p: 2 }}>
        {/* Month-scoped search */}
        <MonthSearchBar
          selectedMonth={searchMonth}
          onMonthChange={handleMonthChange}
          search={search}
          onSearchChange={handleSearch}
          searchPlaceholder="Search by quote #, customer name or phone…"
          resultCount={searchMonth ? total : undefined}
          loading={loading}
        />

        {/* Filters toggle */}
        <Box display="flex" gap={1} alignItems="center" mt={1.5}>
          <IconButton
            size="small"
            onClick={() => setShowFilters(f => !f)}
            color={showFilters || invoiceFilter !== 'all' || companyFilter !== 'all' ? 'primary' : 'default'}
          >
            <FilterList />
          </IconButton>
          {(invoiceFilter !== 'all' || companyFilter !== 'all') && (
            <Typography variant="caption" color="primary.main">Filters active</Typography>
          )}
        </Box>

        {showFilters && (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} mt={1.5}>
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
            <Button
              size="small" variant="outlined"
              onClick={() => { setInvoiceFilter('all'); setCompanyFilter('all'); }}
            >
              Clear Filters
            </Button>
          </Stack>
        )}
      </Card>

      {/* ── List: Mobile ── */}
      {isMobile ? (
        <Box>
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <Card key={i} elevation={0}
                  sx={{ mb: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2, height: 120, bgcolor: 'action.hover' }} />
              ))
            : rows.length === 0
              ? (
                <Box textAlign="center" py={6}>
                  <Description sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                  <Typography color="text.secondary">
                    {searchMonth && search
                      ? `No quotations matching "${search}"`
                      : searchMonth ? 'No quotations in this month'
                      : 'No quotations found'}
                  </Typography>
                </Box>
              )
              : rows.map(row => <MobileCard key={row.id} row={row} />)
          }
          {rows.length > 0 && (
            <TablePagination component="div" count={total ?? 0} page={page} rowsPerPage={PAGE_SIZE}
              onPageChange={(_, p) => setPage(p)} rowsPerPageOptions={[PAGE_SIZE]} />
          )}
        </Box>
      ) : (
        /* ── List: Desktop ── */
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell>Quote #</TableCell>
                  <TableCell>Customer</TableCell>
                  <TableCell>Firm</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Valid Until</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 9 }).map((_, j) => (
                          <TableCell key={j}>
                            <Box sx={{ height: 20, bgcolor: 'action.hover', borderRadius: 1 }} />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  : rows.length === 0
                    ? (
                      <TableRow>
                        <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                          <Typography color="text.secondary">
                            {searchMonth && search
                              ? `No quotations matching "${search}"`
                              : searchMonth ? 'No quotations in this month'
                              : 'No quotations found'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )
                    : rows.map(row => (
                        <TableRow
                          key={row.id} hover sx={{ cursor: 'pointer' }}
                          onClick={() => navigate(`/quotations/${row.id}`)}
                        >
                          <TableCell>
                            <Typography variant="body2" fontWeight={700} color="primary.main">
                              {row.quoteNumber}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight={600}>{row.customerName}</Typography>
                            <Typography variant="caption" color="text.secondary">{row.customerPhone}</Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption">{row.companyName}</Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={row.invoiceType === 'gst' ? 'GST' : 'Non-GST'}
                              size="small" variant="outlined"
                              color={row.invoiceType === 'gst' ? 'primary' : 'default'}
                            />
                          </TableCell>
                          <TableCell>{formatDate(row.quoteDate)}</TableCell>
                          <TableCell>{formatDate(row.validUntil)}</TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" fontWeight={700}>
                              {formatCurrency(row.grandTotal)}
                            </Typography>
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
                }
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div" count={total ?? 0} page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={PAGE_SIZE} rowsPerPageOptions={[PAGE_SIZE]}
          />
        </Card>
      )}

      {/* ── Delete Dialog ── */}
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
