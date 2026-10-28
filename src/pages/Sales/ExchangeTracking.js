import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TablePagination, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  TextField, Stack, CircularProgress, Tab, Tabs,
  InputAdornment, Tooltip,
} from '@mui/material';
import {
  SwapHoriz, CheckCircle, Search, DoneAll, Inbox,
} from '@mui/icons-material';
import { doc, serverTimestamp } from 'firebase/firestore';
import { updateRecord } from '../../data/writes';
import usePagedCollection from '../../hooks/usePagedCollection';
import QueryStatus from '../../components/QueryStatus';
import { exchangeFilters, indiaDay } from '../../data/salesQueues';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { formatCurrency, formatDate } from '../../utils';
import { useMediaQuery, useTheme } from '@mui/material';

const PAGE_SIZE = 15;

const TabPanel = ({ children, value, index }) =>
  value === index ? <Box sx={{ pt: 2 }}>{children}</Box> : null;

// ─── Mark Received Dialog ─────────────────────────────────────────────────────

const MarkReceivedDialog = ({ open, onClose, sale, onConfirm }) => {
  const [receivedDate, setReceivedDate] = useState(indiaDay());
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setReceivedDate(indiaDay());
      setNotes('');
    }
  }, [open]);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm(receivedDate, notes);
      onClose();
    } catch (e) {
      toast.error('Failed to mark as received: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!sale) return null;
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Mark Exchange Item as Received</DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 2 }}>
          <Typography variant="body2" fontWeight={600}>{sale.invoiceNumber}</Typography>
          <Typography variant="body2" color="text.secondary">{sale.customerName} — {sale.customerPhone}</Typography>
          <Box sx={{ mt: 1, p: 1, bgcolor: 'warning.50', borderRadius: 1, border: '1px solid', borderColor: 'warning.light' }}>
            <Typography variant="caption" color="text.secondary">Exchange Item</Typography>
            <Typography variant="body2" fontWeight={600}>{sale.exchangeItem}</Typography>
            <Typography variant="caption" color="primary">Value: {formatCurrency(sale.exchangeValue)}</Typography>
          </Box>
        </Box>
        <Stack spacing={2}>
          <TextField
            fullWidth label="Date Received *" type="date"
            value={receivedDate} onChange={e => setReceivedDate(e.target.value)}
            size="small" InputLabelProps={{ shrink: true }}
          />
          <TextField
            fullWidth label="Notes (optional)" value={notes}
            onChange={e => setNotes(e.target.value)} size="small"
            multiline rows={2} placeholder="Condition of exchange item, remarks..."
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="outlined" disabled={loading}>Cancel</Button>
        <Button onClick={handleConfirm} variant="contained" color="primary" disabled={loading}
          startIcon={loading ? <CircularProgress size={16} /> : <CheckCircle />}>
          Confirm Receipt
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Pending Exchange Tab ─────────────────────────────────────────────────────
const PendingExchangeTab = ({ db, search, onSearch }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const navigate = useNavigate();

  const [markDialog, setMarkDialog] = useState(null);
  const view = usePagedCollection(db, 'sales', { search, filters: exchangeFilters('pending'), sort: [['saleDate', 'desc']], pageSize: PAGE_SIZE, requireReady: true });
  const { rows: pageRows, loading, page, setPage } = view;
  const handleSearch = onSearch;

  const handleMarkReceived = async (receivedDate, notes) => {
    await updateRecord(doc(db, 'sales', markDialog.id), {
      exchangeReceived: true,
      exchangeReceivedDate: receivedDate,
      exchangeReceivedNotes: notes || '',
      updatedAt: serverTimestamp(),
    });
    toast.success('Exchange item marked as received!');
    setMarkDialog(null);
    setPage(0);
    view.refresh();
  };

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <TextField
          placeholder="Search invoice, customer, item..."
          value={search}
          onChange={e => handleSearch(e.target.value)}
          size="small"
          fullWidth
          sx={{ maxWidth: 400 }}
          InputProps={{
            startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment>
          }}
        />
      </Box>

      <QueryStatus error={view.error} search={search} />
      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Invoice / Customer</TableCell>
                <TableCell>Exchange Item</TableCell>
                {!isMobile && <TableCell align="right">Value</TableCell>}
                {!isMobile && <TableCell>Sale Date</TableCell>}
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: isMobile ? 3 : 5 }).map((_, j) => (
                        <TableCell key={j}><Box sx={{ height: 20, bgcolor: 'action.hover', borderRadius: 1 }} /></TableCell>
                      ))}
                    </TableRow>
                  ))
                : pageRows.length === 0
                  ? (
                    <TableRow>
                      <TableCell colSpan={isMobile ? 3 : 5} align="center" sx={{ py: 6 }}>
                        <Box>
                          <DoneAll sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
                          <Typography color="text.secondary">No pending exchange items!</Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  )
                  : pageRows.map(row => (
                    <TableRow key={row.id} hover sx={{ cursor: 'pointer' }}>
                      <TableCell onClick={() => navigate(`/sales/${row.id}`)}>
                        <Typography variant="body2" fontWeight={600} color="primary">{row.invoiceNumber}</Typography>
                        <Typography variant="caption" color="text.secondary">{row.customerName}</Typography>
                        <br />
                        <Typography variant="caption" color="text.secondary">{row.customerPhone}</Typography>
                      </TableCell>
                      <TableCell onClick={() => navigate(`/sales/${row.id}`)}>
                        <Typography variant="body2" fontWeight={600}>{row.exchangeItem}</Typography>
                        {isMobile && (
                          <Typography variant="caption" color="primary">{formatCurrency(row.exchangeValue)}</Typography>
                        )}
                      </TableCell>
                      {!isMobile && (
                        <TableCell align="right" onClick={() => navigate(`/sales/${row.id}`)}>
                          <Typography variant="body2" fontWeight={600} color="primary">
                            {formatCurrency(row.exchangeValue)}
                          </Typography>
                        </TableCell>
                      )}
                      {!isMobile && (
                        <TableCell onClick={() => navigate(`/sales/${row.id}`)}>
                          <Typography variant="body2">{formatDate(row.saleDate)}</Typography>
                        </TableCell>
                      )}
                      <TableCell align="right">
                        <Tooltip title="Mark Exchange Item as Received">
                          <Button
                            size="small"
                            variant="contained"
                            color="primary"
                            startIcon={<Inbox fontSize="small" />}
                            onClick={(e) => { e.stopPropagation(); setMarkDialog(row); }}
                            sx={{ whiteSpace: 'nowrap' }}
                          >
                            {isMobile ? '✓' : 'Received'}
                          </Button>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))
              }
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={view.total ?? -1}
          page={page}
          rowsPerPage={PAGE_SIZE}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPageOptions={[PAGE_SIZE]}
          backIconButtonProps={{ disabled: loading || page === 0 }}
          nextIconButtonProps={{ disabled: loading || !view.hasNext }}
        />
      </Card>

      <MarkReceivedDialog
        open={Boolean(markDialog)}
        onClose={() => setMarkDialog(null)}
        sale={markDialog}
        onConfirm={handleMarkReceived}
      />
    </Box>
  );
};

// ─── Received Exchange Tab ────────────────────────────────────────────────────
const ReceivedExchangeTab = ({ db, search, onSearch }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const navigate = useNavigate();

  const view = usePagedCollection(db, 'sales', { search, filters: exchangeFilters('received'), sort: [['saleDate', 'desc']], pageSize: PAGE_SIZE, requireReady: true });
  const { rows: pageRows, loading, page, setPage } = view;

  return (
    <Card>
      <TextField fullWidth size="small" placeholder="Search customer, phone, invoice or exchange item..." value={search} onChange={e => onSearch(e.target.value)} sx={{ my: 1 }} />
      <QueryStatus error={view.error} search={search} />
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Invoice / Customer</TableCell>
              <TableCell>Exchange Item</TableCell>
              {!isMobile && <TableCell align="right">Value</TableCell>}
              <TableCell>Received On</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: isMobile ? 3 : 4 }).map((_, j) => (
                      <TableCell key={j}><Box sx={{ height: 20, bgcolor: 'action.hover', borderRadius: 1 }} /></TableCell>
                    ))}
                  </TableRow>
                ))
              : pageRows.length === 0
                ? (
                  <TableRow>
                    <TableCell colSpan={isMobile ? 3 : 4} align="center" sx={{ py: 6 }}>
                      <Typography color="text.secondary">No exchange items received yet</Typography>
                    </TableCell>
                  </TableRow>
                )
                : pageRows.map(row => (
                  <TableRow key={row.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/sales/${row.id}`)}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600} color="primary">{row.invoiceNumber}</Typography>
                      <Typography variant="caption" color="text.secondary">{row.customerName}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{row.exchangeItem}</Typography>
                      {row.exchangeReceivedNotes && (
                        <Typography variant="caption" color="text.secondary">{row.exchangeReceivedNotes}</Typography>
                      )}
                    </TableCell>
                    {!isMobile && (
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={600} color="primary">
                          {formatCurrency(row.exchangeValue)}
                        </Typography>
                      </TableCell>
                    )}
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={0.5}>
                        <CheckCircle fontSize="small" color="success" />
                        <Typography variant="body2" color="success.main" fontWeight={600}>
                          {formatDate(row.exchangeReceivedDate)}
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
            }
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={view.total ?? -1}
        page={page}
        rowsPerPage={PAGE_SIZE}
        onPageChange={(_, p) => setPage(p)}
        rowsPerPageOptions={[PAGE_SIZE]}
          backIconButtonProps={{ disabled: loading || page === 0 }}
          nextIconButtonProps={{ disabled: loading || !view.hasNext }}
      />
    </Card>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const ExchangeTracking = () => {
  const { db } = useAuth();
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState('');

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* Header */}
      <Box display="flex" alignItems="center" gap={2} mb={3}>
        <Box sx={{
          width: 44, height: 44, borderRadius: 2,
          bgcolor: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <SwapHoriz sx={{ color: '#fff' }} />
        </Box>
        <Box>
          <Typography variant="h5" fontWeight={700}>Exchange Tracking</Typography>
          <Typography variant="body2" color="text.secondary">Track exchange items pending receipt</Typography>
        </Box>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 0 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab icon={<SwapHoriz fontSize="small" />} iconPosition="start" label="Pending Receipt" />
          <Tab icon={<DoneAll fontSize="small" />} iconPosition="start" label="Received" />
        </Tabs>
      </Box>

      <TabPanel value={tab} index={0}>
        <PendingExchangeTab db={db} search={search} onSearch={setSearch} />
      </TabPanel>
      <TabPanel value={tab} index={1}>
        <ReceivedExchangeTab db={db} search={search} onSearch={setSearch} />
      </TabPanel>
    </Box>
  );
};

export default ExchangeTracking;