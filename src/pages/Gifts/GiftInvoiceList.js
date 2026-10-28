import { deleteRecord as deleteDoc } from '../../data/writes';
import usePagedCollection from '../../hooks/usePagedCollection';
import QueryStatus from '../../components/QueryStatus';
import { businessListOptions } from '../../utils/businessListQueries';
import { useState } from 'react';
import {
  Box, Typography, Button, Card, CardContent, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TablePagination,
  Chip, IconButton, LinearProgress, Dialog, DialogTitle,
  DialogContent, DialogActions, useTheme, useMediaQuery, Stack, Tooltip,
} from '@mui/material';
import { Add, Edit, Delete, CardGiftcard, Print } from '@mui/icons-material';
import { doc } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { formatDate } from '../../utils';
import MonthSearchBar from '../../components/MonthSearchBar';
import { printGiftInvoice } from '../../utils/giftInvoicePrint';

const PAGE_SIZE = 15;

/** Returns { startStr, endStr } as 'YYYY-MM-DD' strings for the full month. */

const DeliveryProgress = ({ items = [] }) => {
  const total     = items.length;
  const delivered = items.filter(i => i.deliveryStatus === 'delivered').length;
  const pct       = total > 0 ? Math.round((delivered / total) * 100) : 0;
  const allDone   = delivered === total && total > 0;
  return (
    <Box sx={{ minWidth: 100 }}>
      <Box display="flex" justifyContent="space-between" mb={0.3}>
        <Typography variant="caption" color={allDone ? 'success.main' : 'text.secondary'} fontWeight={600}>
          {delivered}/{total}
        </Typography>
        <Typography variant="caption" color="text.secondary">{pct}%</Typography>
      </Box>
      <LinearProgress variant="determinate" value={pct}
        color={allDone ? 'success' : delivered > 0 ? 'warning' : 'inherit'}
        sx={{ height: 5, borderRadius: 3 }} />
    </Box>
  );
};

const statusChip = (row) => {
  const total     = (row.items || []).length;
  const delivered = (row.items || []).filter(i => i.deliveryStatus === 'delivered').length;
  if (total === 0) return { label: 'No Items', color: 'default' };
  if (delivered === total) return { label: 'Completed', color: 'success' };
  if (delivered > 0) return { label: 'Partial', color: 'warning' };
  return { label: 'Pending', color: 'error' };
};

const MobileCard = ({ row, navigate, onDelete, onPrint }) => {
  const status = statusChip(row);
  return (
    <Card elevation={0} sx={{ mb: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, cursor: 'pointer' }}
      onClick={() => navigate(`/gift-invoices/${row.id}`)}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={0.5}>
          <Box>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>{row.invoiceNumber}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mx: 0.5 }}>·</Typography>
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
          <Tooltip title="Print Invoice">
            <IconButton size="small" color="secondary" onClick={() => onPrint(row)}>
              <Print fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Edit Invoice">
            <IconButton size="small" onClick={() => navigate(`/gift-invoices/edit/${row.id}`)}>
              <Edit fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete Invoice">
            <IconButton size="small" color="error" onClick={() => onDelete(row.id)}>
              <Delete fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </CardContent>
    </Card>
  );
};

const GiftInvoiceList = () => {
  const { db } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const navigate = useNavigate();

  const [deleteId, setDeleteId]   = useState(null);

  const [searchMonth,     setSearchMonth]     = useState('');
  const [search,          setSearch]          = useState('');

  const handleSearch = setSearch;

  const handleMonthChange = setSearchMonth;

  const { rows, loading, error, total, page, setPage, refresh } = usePagedCollection(
    db, 'giftInvoices', businessListOptions('giftInvoices', { search, month: searchMonth })
  );

  const handleDelete = async () => {
    try {
      await deleteDoc(doc(db, 'giftInvoices', deleteId));
      toast.success('Gift invoice deleted');
      setDeleteId(null);
       setPage(0); refresh();
    } catch (e) { toast.error('Delete failed'); }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <QueryStatus error={error} loading={loading} search={search} />
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3} flexWrap="wrap" gap={1}>
        <Box display="flex" alignItems="center" gap={1}>
          <CardGiftcard color="secondary" />
          <Box>
            <Typography variant="h5" fontWeight={700}>Gift Invoices</Typography>
            <Typography variant="caption" color="text.secondary">
              {searchMonth ? `${total} results` : `${total} total invoices`}
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

      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 2, p: 2 }}>
        <MonthSearchBar
          selectedMonth={searchMonth} onMonthChange={handleMonthChange}
          search={search} onSearchChange={handleSearch}
          searchPlaceholder="Search by invoice #, customer or gift set…"
          resultCount={searchMonth ? total : undefined} loading={loading}
        />
      </Card>

      {isMobile ? (
        <Box>
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} elevation={0} sx={{ mb: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, height: 120, bgcolor: 'action.hover' }} />
              ))
            : rows.length === 0
              ? (
                <Box textAlign="center" py={6}>
                  <CardGiftcard sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                  <Typography color="text.secondary">
                    {searchMonth && search
                      ? `No invoices matching "${search}"`
                      : searchMonth ? 'No gift invoices in this month'
                      : 'No gift invoices found'}
                  </Typography>
                </Box>
              )
              : rows.map(row => (
                  <MobileCard key={row.id} row={row} navigate={navigate} onDelete={setDeleteId} onPrint={printGiftInvoice} />
                ))
          }
          {rows.length > 0 && (
            <TablePagination component="div" count={total ?? 0} page={page} rowsPerPage={PAGE_SIZE}
              onPageChange={(_, p) => setPage(p)} rowsPerPageOptions={[PAGE_SIZE]} />
          )}
        </Box>
      ) : (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell>Invoice #</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Customer</TableCell>
                  <TableCell>Gift Set</TableCell>
                  <TableCell>Delivery</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading
                  ? Array.from({ length: PAGE_SIZE }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 7 }).map((_, j) => (
                          <TableCell key={j}><Box sx={{ height: 18, bgcolor: 'action.hover', borderRadius: 1 }} /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  : rows.length === 0
                    ? (
                      <TableRow>
                        <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                          <Typography color="text.secondary">
                            {searchMonth && search
                              ? `No invoices matching "${search}"`
                              : searchMonth ? 'No gift invoices in this month'
                              : 'No gift invoices found'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )
                    : rows.map(row => {
                        const status = statusChip(row);
                        return (
                          <TableRow key={row.id} hover sx={{ cursor: 'pointer' }}
                            onClick={() => navigate(`/gift-invoices/${row.id}`)}>
                            <TableCell><Typography variant="body2" fontWeight={600}>{row.invoiceNumber}</Typography></TableCell>
                            <TableCell><Typography variant="caption">{formatDate(row.date)}</Typography></TableCell>
                            <TableCell>
                              <Typography variant="body2">{row.customerName}</Typography>
                              <Typography variant="caption" color="text.secondary">{row.customerPhone}</Typography>
                            </TableCell>
                            <TableCell>
                              <Box display="flex" alignItems="center" gap={0.5}>
                                <CardGiftcard sx={{ fontSize: 14, color: 'secondary.main' }} />
                                <Typography variant="body2">{row.giftSetName}</Typography>
                              </Box>
                            </TableCell>
                            <TableCell><DeliveryProgress items={row.items} /></TableCell>
                            <TableCell><Chip label={status.label} color={status.color} size="small" /></TableCell>
                            <TableCell align="right" onClick={e => e.stopPropagation()}>
                              <Tooltip title="Print Invoice">
                                <IconButton size="small" color="secondary" onClick={() => printGiftInvoice(row)}>
                                  <Print fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Edit Invoice">
                                <IconButton size="small" onClick={() => navigate(`/gift-invoices/edit/${row.id}`)}>
                                  <Edit fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Delete Invoice">
                                <IconButton size="small" color="error" onClick={() => setDeleteId(row.id)}>
                                  <Delete fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        );
                      })
                }
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination component="div" count={total ?? 0} page={page} rowsPerPage={PAGE_SIZE}
            onPageChange={(_, p) => setPage(p)} rowsPerPageOptions={[PAGE_SIZE]} />
        </Card>
      )}

      <Dialog open={Boolean(deleteId)} onClose={() => setDeleteId(null)} maxWidth="xs">
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
