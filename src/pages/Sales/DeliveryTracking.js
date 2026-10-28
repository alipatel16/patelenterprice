import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Card, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, IconButton,
  Tooltip, Dialog, DialogTitle, DialogContent, DialogActions, Button,
  TextField, Stack, CircularProgress, Tab, Tabs, InputAdornment,
} from '@mui/material';
import {
  LocalShipping, CheckCircle, Schedule, Search, Refresh,
  DoneAll, CalendarMonth, ChevronLeft, ChevronRight,
} from '@mui/icons-material';
import { doc, serverTimestamp } from 'firebase/firestore';
import { updateRecord } from '../../data/writes';
import usePagedCollection from '../../hooks/usePagedCollection';
import QueryStatus from '../../components/QueryStatus';
import { deliveryFilters, indiaDay } from '../../data/salesQueues';
import { useIndiaDay } from '../../hooks/useSalesQueue';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { formatCurrency, formatDate } from '../../utils';
import { useMediaQuery, useTheme } from '@mui/material';

const PAGE_SIZE = 15;
const TabPanel = ({ children, value, index }) =>
  value === index ? <Box sx={{ pt: 2 }}>{children}</Box> : null;

const PageControls = ({ page, hasNext, loading, onPrevious, onNext }) => (
  <Stack
    direction="row"
    alignItems="center"
    justifyContent="flex-end"
    spacing={1}
    sx={{ px: 2, py: 1.5, borderTop: '1px solid', borderColor: 'divider' }}
  >
    <Button
      size="small"
      startIcon={<ChevronLeft />}
      disabled={loading || page === 0}
      onClick={onPrevious}
    >
      Previous
    </Button>
    <Chip label={`Page ${page + 1}`} size="small" variant="outlined" />
    <Button
      size="small"
      endIcon={<ChevronRight />}
      disabled={loading || !hasNext}
      onClick={onNext}
    >
      Next
    </Button>
  </Stack>
);

// ─── Mark Delivered Dialog ────────────────────────────────────────────────────

const MarkDeliveredDialog = ({ open, onClose, sale, onConfirm }) => {
  const [deliveredDate, setDeliveredDate] = useState(indiaDay());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) setDeliveredDate(indiaDay());
  }, [open]);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm(deliveredDate);
      onClose();
    } catch (e) {
      toast.error('Failed to mark as delivered: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!sale) return null;
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Mark as Delivered</DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 2 }}>
          <Typography variant="body2" fontWeight={600}>{sale.invoiceNumber}</Typography>
          <Typography variant="body2" color="text.secondary">{sale.customerName} — {sale.customerPhone}</Typography>
        </Box>
        <TextField
          fullWidth
          label="Actual Delivery Date *"
          type="date"
          value={deliveredDate}
          onChange={e => setDeliveredDate(e.target.value)}
          size="small"
          InputLabelProps={{ shrink: true }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="outlined" disabled={loading}>Cancel</Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          color="success"
          disabled={loading}
          startIcon={loading ? <CircularProgress size={16} /> : <CheckCircle />}
        >
          Confirm Delivery
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Pending Deliveries ───────────────────────────────────────────────────────
const PendingDeliveriesTab = ({ db, search, onSearch }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const navigate = useNavigate();

  const today = useIndiaDay();
  const [markDialog, setMarkDialog] = useState(null);
  const view = usePagedCollection(db, 'sales', { search, filters: deliveryFilters('pending'), sort: [['deliveryDate', 'asc']], pageSize: PAGE_SIZE, requireReady: true });
  const { rows: visibleRows, loading, page, hasNext } = view;
  const handleSearch = onSearch, debouncedSearch = search;
  const resetToFirstPage = view.refresh;

  const handleMarkDelivered = async (deliveredDate) => {
    if (!markDialog?.id) return;

    await updateRecord(doc(db, 'sales', markDialog.id), {
      isDelivered: true,
      deliveryStatus: 'delivered',
      actualDeliveryDate: deliveredDate,
      updatedAt: serverTimestamp(),
    });

    toast.success('Delivery marked as completed!');
    setMarkDialog(null);
    resetToFirstPage();
  };

  const isOverdue = (deliveryDate) =>
    deliveryDate ? deliveryDate < today : false;

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
        <TextField
          placeholder="Search all pending deliveries by invoice or customer..."
          value={search}
          onChange={e => handleSearch(e.target.value)}
          size="small"
          fullWidth
          sx={{ maxWidth: 430 }}
          InputProps={{
            startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment>,
          }}
        />
        <Tooltip title="Refresh pending deliveries">
          <span>
            <IconButton onClick={resetToFirstPage} disabled={loading}>
              <Refresh />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      <QueryStatus error={view.error} search={search} />
      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Invoice / Customer</TableCell>
                {!isMobile && <TableCell>Products</TableCell>}
                <TableCell>Expected Date</TableCell>
                {!isMobile && <TableCell align="right">Amount</TableCell>}
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: isMobile ? 3 : 5 }).map((__, j) => (
                        <TableCell key={j}>
                          <Box sx={{ height: 20, bgcolor: 'action.hover', borderRadius: 1 }} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : visibleRows.length === 0
                  ? (
                    <TableRow>
                      <TableCell colSpan={isMobile ? 3 : 5} align="center" sx={{ py: 6 }}>
                        <Box>
                          <DoneAll sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
                          <Typography color="text.secondary">
                            {debouncedSearch
                              ? debouncedSearch.length < 2
                                ? `Type at least ${2} characters to search`
                                : 'No matching pending deliveries found'
                              : 'No pending deliveries on this page'}
                          </Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  )
                  : visibleRows.map(row => {
                    const overdue = isOverdue(row.deliveryDate);
                    return (
                      <TableRow key={row.id} hover sx={{ bgcolor: overdue ? 'error.50' : 'inherit' }}>
                        <TableCell onClick={() => navigate(`/sales/${row.id}`)} sx={{ cursor: 'pointer' }}>
                          <Typography variant="body2" fontWeight={600} color="primary">{row.invoiceNumber}</Typography>
                          <Typography variant="caption" color="text.secondary">{row.customerName}</Typography>
                          <br />
                          <Typography variant="caption" color="text.secondary">{row.customerPhone}</Typography>
                          {isMobile && (
                            <>
                              <br />
                              <Typography variant="caption" color="text.secondary">
                                {row.items?.map(i => i.productName).join(', ')}
                              </Typography>
                            </>
                          )}
                        </TableCell>
                        {!isMobile && (
                          <TableCell>
                            <Typography variant="body2">
                              {row.items?.map(i => `${i.productName} (×${i.qty})`).join(', ')}
                            </Typography>
                          </TableCell>
                        )}
                        <TableCell>
                          <Box display="flex" alignItems="center" gap={0.5}>
                            <CalendarMonth fontSize="small" color={overdue ? 'error' : 'warning'} />
                            <Box>
                              <Typography
                                variant="body2"
                                color={overdue ? 'error.main' : 'warning.main'}
                                fontWeight={600}
                              >
                                {formatDate(row.deliveryDate)}
                              </Typography>
                              {overdue && <Typography variant="caption" color="error">Overdue</Typography>}
                            </Box>
                          </Box>
                        </TableCell>
                        {!isMobile && (
                          <TableCell align="right">
                            <Typography variant="body2" fontWeight={600}>{formatCurrency(row.grandTotal)}</Typography>
                          </TableCell>
                        )}
                        <TableCell align="right">
                          <Tooltip title="Mark as Delivered">
                            <Button
                              size="small"
                              variant="contained"
                              color="success"
                              startIcon={<CheckCircle fontSize="small" />}
                              onClick={() => setMarkDialog(row)}
                              sx={{ whiteSpace: 'nowrap' }}
                            >
                              {isMobile ? '✓' : 'Delivered'}
                            </Button>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
            </TableBody>
          </Table>
        </TableContainer>

        <PageControls page={page} hasNext={hasNext} loading={loading} onPrevious={view.previous} onNext={view.next} />
      </Card>

      <MarkDeliveredDialog
        open={Boolean(markDialog)}
        onClose={() => setMarkDialog(null)}
        sale={markDialog}
        onConfirm={handleMarkDelivered}
      />
    </Box>
  );
};

// ─── Delivered ────────────────────────────────────────────────────────────────
const RecentlyDeliveredTab = ({ db, search, onSearch, outstanding = false }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const navigate = useNavigate();

  const view = usePagedCollection(db, 'sales', { search, filters: deliveryFilters(outstanding ? 'outstanding' : 'delivered'), sort: [['actualDeliveryDate', 'desc']], pageSize: PAGE_SIZE, requireReady: true });
  const { rows, loading, page, hasNext } = view;
  const refreshCurrent = view.refresh;

  return (
    <Box>
      <TextField fullWidth size="small" placeholder="Search customer, phone or invoice..." value={search} onChange={e => onSearch(e.target.value)} sx={{ mt: 1, mb: 1 }} />
      <QueryStatus error={view.error} search={search} />
      <Box display="flex" justifyContent="flex-end" sx={{ mb: 1 }}>
        <Tooltip title="Refresh delivered history">
          <span>
            <IconButton onClick={refreshCurrent} disabled={loading}><Refresh /></IconButton>
          </span>
        </Tooltip>
      </Box>

      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Invoice / Customer</TableCell>
                {!isMobile && <TableCell>Products</TableCell>}
                <TableCell>Delivered On</TableCell>
                {!isMobile && <TableCell align="right">Amount</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: isMobile ? 2 : 4 }).map((__, j) => (
                        <TableCell key={j}>
                          <Box sx={{ height: 20, bgcolor: 'action.hover', borderRadius: 1 }} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : rows.length === 0
                  ? (
                    <TableRow>
                      <TableCell colSpan={isMobile ? 2 : 4} align="center" sx={{ py: 6 }}>
                        <Typography color="text.secondary">No delivered items on this page</Typography>
                      </TableCell>
                    </TableRow>
                  )
                  : rows.map(row => (
                    <TableRow
                      key={row.id}
                      hover
                      sx={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/sales/${row.id}`)}
                    >
                      <TableCell>
                        <Typography variant="body2" fontWeight={600} color="primary">{row.invoiceNumber}</Typography>
                        <Typography variant="caption" color="text.secondary">{row.customerName}</Typography>
                      </TableCell>
                      {!isMobile && (
                        <TableCell>
                          <Typography variant="body2">{row.items?.map(i => i.productName).join(', ')}</Typography>
                        </TableCell>
                      )}
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={0.5}>
                          <CheckCircle fontSize="small" color="success" />
                          <Typography variant="body2" color="success.main" fontWeight={600}>
                            {formatDate(row.actualDeliveryDate)}
                          </Typography>
                        </Box>
                      </TableCell>
                      {!isMobile && (
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={600}>{formatCurrency(row.grandTotal)}</Typography>
                          {row.hasOutstandingPayment && <Typography variant="caption" color="error">Payment pending: {row.outstandingPaymentAmount == null ? 'Needs reconciliation' : formatCurrency(row.outstandingPaymentAmount)}</Typography>}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </TableContainer>

        <PageControls
          page={page}
          hasNext={hasNext}
          loading={loading}
          onPrevious={view.previous}
          onNext={view.next}
        />
      </Card>
    </Box>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const DeliveryTracking = () => {
  const { db } = useAuth();
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState('');
  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Box display="flex" alignItems="center" gap={2} mb={3}>
        <Box sx={{
          width: 44,
          height: 44,
          borderRadius: 2,
          bgcolor: 'warning.main',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <LocalShipping sx={{ color: '#fff' }} />
        </Box>
        <Box>
          <Typography variant="h5" fontWeight={700}>Delivery Tracking</Typography>
          <Typography variant="body2" color="text.secondary">Manage and track scheduled deliveries</Typography>
        </Box>
      </Box>

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tab} onChange={(_, value) => setTab(value)}>
          <Tab icon={<Schedule fontSize="small" />} iconPosition="start" label="Pending Deliveries" />
          <Tab icon={<DoneAll fontSize="small" />} iconPosition="start" label="Delivered" />
          <Tab label="Delivered · Payment Pending" />
        </Tabs>
      </Box>

      <TabPanel value={tab} index={0}>
        <PendingDeliveriesTab db={db} search={search} onSearch={setSearch} />
      </TabPanel>
      <TabPanel value={tab} index={1}>
        <RecentlyDeliveredTab db={db} search={search} onSearch={setSearch} />
      </TabPanel>
      <TabPanel value={tab} index={2}>
        <RecentlyDeliveredTab db={db} search={search} onSearch={setSearch} outstanding />
      </TabPanel>
    </Box>
  );
};

export default DeliveryTracking;
