import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Box, Typography, Card, CardContent, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TablePagination, Chip, IconButton,
  Tooltip, Dialog, DialogTitle, DialogContent, DialogActions, Button,
  TextField, Stack, Alert, CircularProgress, Tab, Tabs, InputAdornment,
  Avatar, Divider,
} from '@mui/material';
import {
  LocalShipping, CheckCircle, Schedule, Search, Refresh,
  DoneAll, CalendarMonth,
} from '@mui/icons-material';
import {
  collection, query, where, orderBy, limit,
  getDocs, updateDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { formatCurrency, formatDate } from '../../utils';
import { useMediaQuery, useTheme } from '@mui/material';

const PAGE_SIZE = 10;

// Some older/previously-updated sale documents can carry delivery completion
// in deliveryStatus/actualDeliveryDate even when isDelivered is missing or was
// stored as a string. Treat all supported persisted forms consistently so a
// completed scheduled delivery never reappears in Pending Deliveries.
const isSaleDelivered = (sale = {}) => {
  if (sale.isDelivered === true || String(sale.isDelivered).toLowerCase() === 'true') return true;

  const status = String(sale.deliveryStatus || '').trim().toLowerCase();
  if (status === 'delivered' || status === 'completed') return true;

  // Legacy records may only have the actual delivered date. A record explicitly
  // marked pending still wins, so a stale date cannot hide a reverted delivery.
  return Boolean(sale.actualDeliveryDate) && status !== 'pending';
};

const TabPanel = ({ children, value, index }) =>
  value === index ? <Box sx={{ pt: 2 }}>{children}</Box> : null;

// ─── Mark Delivered Dialog ────────────────────────────────────────────────────

const MarkDeliveredDialog = ({ open, onClose, sale, onConfirm }) => {
  const [deliveredDate, setDeliveredDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) setDeliveredDate(new Date().toISOString().split('T')[0]);
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
        <Button onClick={handleConfirm} variant="contained" color="success" disabled={loading}
          startIcon={loading ? <CircularProgress size={16} /> : <CheckCircle />}>
          Confirm Delivery
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Pending Deliveries Tab ───────────────────────────────────────────────────
//
// FIX: was limit(500) reading ALL sales then client-filtering.
//      Now queries only scheduled deliveries server-side.
//
// ⚠️  COMPOSITE INDEX REQUIRED on first run:
//      Collection : sales
//      Fields     : deliveryType (Ascending) + saleDate (Descending)
//      Firestore will log a clickable auto-create URL in the console.

const PendingDeliveriesTab = ({ db, onDelivered }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const navigate = useNavigate();

  const [allDocs, setAllDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [markDialog, setMarkDialog] = useState(null);
  const searchTimer = useRef(null);

  const handleSearch = (v) => {
    setSearch(v);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(v);
      setPage(0);
    }, 400);
  };

  useEffect(() => {
    if (!db) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        // ── FIX: server-side filter on deliveryType ──────────────────────
        // Before: limit(500) read every recent sale, discarding ~490 of them.
        // After:  Firestore returns ONLY scheduled sales (typically 10–30).
        // A compatibility check below handles legacy/partially-migrated docs where
        // completion may live in deliveryStatus or actualDeliveryDate instead.
        const snap = await getDocs(query(
          collection(db, 'sales'),
          where('deliveryType', '==', 'scheduled'),
          orderBy('saleDate', 'desc'),
          limit(200),                          // safety cap; was 500
        ));
        if (!active) return;
        const docs = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(d => !isSaleDelivered(d))
          .sort((a, b) => (a.deliveryDate || '').localeCompare(b.deliveryDate || ''));
        setAllDocs(docs);
      } catch (err) {
        if (!active) return;
        toast.error('Failed to load deliveries: ' + err.message);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [db, refreshKey]);

  const filtered = useMemo(() => {
    if (!debouncedSearch.trim()) return allDocs;
    const s = debouncedSearch.toLowerCase();
    return allDocs.filter(d =>
      (d.invoiceNumber || '').toLowerCase().includes(s) ||
      (d.customerName  || '').toLowerCase().includes(s) ||
      (d.customerPhone || '').includes(s)
    );
  }, [allDocs, debouncedSearch]);

  const pageRows = useMemo(
    () => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filtered, page]
  );

  const handleMarkDelivered = async (deliveredDate) => {
    await updateDoc(doc(db, 'sales', markDialog.id), {
      isDelivered: true,
      actualDeliveryDate: deliveredDate,
      deliveryStatus: 'delivered',
      updatedAt: serverTimestamp(),
    });
    toast.success('Delivery marked as completed!');
    setMarkDialog(null);
    setPage(0);
    setRefreshKey(k => k + 1);
    onDelivered();
  };

  const isOverdue = (deliveryDate) =>
    deliveryDate ? new Date(deliveryDate) < new Date() : false;

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <TextField
          placeholder="Search invoice, customer..."
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
                          <Typography color="text.secondary">No pending deliveries! All caught up 🎉</Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  )
                  : pageRows.map(row => {
                    const overdue = isOverdue(row.deliveryDate);
                    return (
                      <TableRow key={row.id} hover
                        sx={{ bgcolor: overdue ? 'error.50' : 'inherit', cursor: 'pointer' }}
                      >
                        <TableCell onClick={() => navigate(`/sales/${row.id}`)}>
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
                              <Typography variant="body2" color={overdue ? 'error.main' : 'warning.main'} fontWeight={600}>
                                {formatDate(row.deliveryDate)}
                              </Typography>
                              {overdue && (
                                <Typography variant="caption" color="error">Overdue</Typography>
                              )}
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
                              onClick={(e) => { e.stopPropagation(); setMarkDialog(row); }}
                              sx={{ whiteSpace: 'nowrap', minWidth: { xs: 'auto', sm: 'auto' } }}
                            >
                              {isMobile ? '✓' : 'Delivered'}
                            </Button>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })
              }
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={filtered.length}
          page={page}
          rowsPerPage={PAGE_SIZE}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPageOptions={[PAGE_SIZE]}
        />
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

// ─── Recently Delivered Tab ───────────────────────────────────────────────────
//
// FIX: was limit(500) reading ALL sales then client-filtering to isDelivered.
//      Now queries only delivered sales server-side.
//
// ⚠️  COMPOSITE INDEX REQUIRED on first run:
//      Collection : sales
//      Fields     : isDelivered (Ascending) + saleDate (Descending)

const RecentlyDeliveredTab = ({ db, refresh }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const navigate = useNavigate();

  const [allDocs, setAllDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!db) return;
    let active = true;
    setLoading(true);

    const load = async () => {
      try {
        // ── FIX: server-side filter on isDelivered ───────────────────────
        // Before: limit(500) read every recent sale, then filtered in memory.
        // After:  Firestore returns ONLY delivered sales.
        const snap = await getDocs(query(
          collection(db, 'sales'),
          where('isDelivered', '==', true),
          orderBy('saleDate', 'desc'),
          limit(200),                          // safety cap; was 500
        ));
        if (!active) return;
        // Sort by actual delivery date (newest first); done in memory since
        // actualDeliveryDate is not a reliable sort field server-side
        // (older records may not have it).
        const docs = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.actualDeliveryDate || '').localeCompare(a.actualDeliveryDate || ''));
        setAllDocs(docs);
        setPage(0);
      } catch (err) {
        if (!active) return;
        toast.error('Failed to load delivered items');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, [db, refresh]);

  const pageRows = useMemo(
    () => allDocs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [allDocs, page]
  );

  return (
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
                    {Array.from({ length: isMobile ? 2 : 4 }).map((_, j) => (
                      <TableCell key={j}><Box sx={{ height: 20, bgcolor: 'action.hover', borderRadius: 1 }} /></TableCell>
                    ))}
                  </TableRow>
                ))
              : pageRows.length === 0
                ? (
                  <TableRow>
                    <TableCell colSpan={isMobile ? 2 : 4} align="center" sx={{ py: 6 }}>
                      <Typography color="text.secondary">No delivered items yet</Typography>
                    </TableCell>
                  </TableRow>
                )
                : pageRows.map(row => (
                  <TableRow key={row.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/sales/${row.id}`)}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600} color="primary">{row.invoiceNumber}</Typography>
                      <Typography variant="caption" color="text.secondary">{row.customerName}</Typography>
                    </TableCell>
                    {!isMobile && (
                      <TableCell>
                        <Typography variant="body2">
                          {row.items?.map(i => i.productName).join(', ')}
                        </Typography>
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
                      </TableCell>
                    )}
                  </TableRow>
                ))
            }
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={allDocs.length}
        page={page}
        rowsPerPage={PAGE_SIZE}
        onPageChange={(_, p) => setPage(p)}
        rowsPerPageOptions={[PAGE_SIZE]}
      />
    </Card>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const DeliveryTracking = () => {
  const { db } = useAuth();
  const [tab, setTab] = useState(0);
  const [deliveredRefresh, setDeliveredRefresh] = useState(0);

  const handleDelivered = () => {
    setDeliveredRefresh(r => r + 1);
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* Header */}
      <Box display="flex" alignItems="center" gap={2} mb={3}>
        <Box sx={{
          width: 44, height: 44, borderRadius: 2,
          bgcolor: 'warning.main', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <LocalShipping sx={{ color: '#fff' }} />
        </Box>
        <Box>
          <Typography variant="h5" fontWeight={700}>Delivery Tracking</Typography>
          <Typography variant="body2" color="text.secondary">Manage and track scheduled deliveries</Typography>
        </Box>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 0 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab icon={<Schedule fontSize="small" />} iconPosition="start" label="Pending Deliveries" />
          <Tab icon={<DoneAll fontSize="small" />} iconPosition="start" label="Delivered" />
        </Tabs>
      </Box>

      <TabPanel value={tab} index={0}>
        <PendingDeliveriesTab db={db} onDelivered={handleDelivered} />
      </TabPanel>
      <TabPanel value={tab} index={1}>
        <RecentlyDeliveredTab db={db} refresh={deliveredRefresh} />
      </TabPanel>
    </Box>
  );
};

export default DeliveryTracking;