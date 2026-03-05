import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Card, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TablePagination, Chip, 
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  TextField, Stack, Alert, CircularProgress, Tab, Tabs,
  InputAdornment, Tooltip,
} from '@mui/material';
import {
  SwapHoriz, CheckCircle, Search, Refresh, DoneAll, Inbox,
} from '@mui/icons-material';
import {
  collection, query, where, orderBy, limit, startAfter,
  getDocs, updateDoc, doc, getCountFromServer, serverTimestamp,
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { formatCurrency, formatDate, debounce } from '../../utils';
import { useMediaQuery, useTheme } from '@mui/material';

const PAGE_SIZE = 10;

const TabPanel = ({ children, value, index }) =>
  value === index ? <Box sx={{ pt: 2 }}>{children}</Box> : null;

// ─── Mark Received Dialog ─────────────────────────────────────────────────────

const MarkReceivedDialog = ({ open, onClose, sale, onConfirm }) => {
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setReceivedDate(new Date().toISOString().split('T')[0]);
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
            fullWidth
            label="Date Received *"
            type="date"
            value={receivedDate}
            onChange={e => setReceivedDate(e.target.value)}
            size="small"
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            fullWidth
            label="Notes (optional)"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            size="small"
            multiline
            rows={2}
            placeholder="Condition of exchange item, remarks..."
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

const PendingExchangeTab = ({ db, onReceived }) => {
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
  const [markDialog, setMarkDialog] = useState(null);
  const debounceRef = useRef(debounce(v => { setDebouncedSearch(v); setPage(0); setCursorMap({}); }, 400));

  const handleSearch = (v) => { setSearch(v); debounceRef.current(v); };

  const fetchData = async () => {
    if (!db) return;
    setLoading(true);
    let active = true;
    try {
      const cursor = page > 0 ? cursorMap[page - 1] : null;

      const snap = await getDocs(query(
        collection(db, 'sales'),
        where('hasExchange', '==', true),
        where('exchangeReceived', '==', false),
        orderBy('saleDate', 'desc'),
        ...(cursor ? [startAfter(cursor)] : []),
        limit(PAGE_SIZE),
      ));

      const countSnap = await getCountFromServer(
        query(collection(db, 'sales'),
          where('hasExchange', '==', true),
          where('exchangeReceived', '==', false))
      ).catch(() => ({ data: () => ({ count: 0 }) }));

      if (!active) return;

      let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Client-side search filter
      if (debouncedSearch) {
        const s = debouncedSearch.toLowerCase();
        docs = docs.filter(d =>
          (d.invoiceNumber || '').toLowerCase().includes(s) ||
          (d.customerName || '').toLowerCase().includes(s) ||
          (d.exchangeItem || '').toLowerCase().includes(s)
        );
      }

      setRows(docs);
      setTotal(countSnap.data().count);
      setCursorMap(prev => ({ ...prev, [page]: snap.docs[snap.docs.length - 1] || null }));
    } catch (err) {
      if (!active) return;
      // Fallback for missing index - simpler query
      try {
        const cursor = page > 0 ? cursorMap[page - 1] : null;
        const snap = await getDocs(query(
          collection(db, 'sales'),
          where('hasExchange', '==', true),
          orderBy('saleDate', 'desc'),
          ...(cursor ? [startAfter(cursor)] : []),
          limit(PAGE_SIZE * 2),
        ));
        if (!active) return;
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .filter(d => d.exchangeReceived !== true);
        setRows(docs.slice(0, PAGE_SIZE));
        setTotal(docs.length);
      } catch (e2) {
        toast.error('Failed to load exchange items');
      }
    } finally {
      if (active) setLoading(false);
    }
    return () => { active = false; };
  };

  useEffect(() => { fetchData(); }, [db, page, debouncedSearch]);

  const handleMarkReceived = async (receivedDate, notes) => {
    await updateDoc(doc(db, 'sales', markDialog.id), {
      exchangeReceived: true,
      exchangeReceivedDate: receivedDate,
      exchangeReceivedNotes: notes || '',
      updatedAt: serverTimestamp(),
    });
    toast.success('Exchange item marked as received!');
    setCursorMap({});
    setPage(0);
    fetchData();
    onReceived();
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
                : rows.length === 0
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
                  : rows.map(row => (
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
          count={total}
          page={page}
          rowsPerPage={PAGE_SIZE}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPageOptions={[PAGE_SIZE]}
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

const ReceivedExchangeTab = ({ db, refresh }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [cursorMap, setCursorMap] = useState({});

  useEffect(() => {
    if (!db) return;
    let active = true;
    setLoading(true);

    const run = async () => {
      try {
        const cursor = page > 0 ? cursorMap[page - 1] : null;
        const snap = await getDocs(query(
          collection(db, 'sales'),
          where('hasExchange', '==', true),
          where('exchangeReceived', '==', true),
          orderBy('exchangeReceivedDate', 'desc'),
          ...(cursor ? [startAfter(cursor)] : []),
          limit(PAGE_SIZE),
        ));

        const countSnap = await getCountFromServer(
          query(collection(db, 'sales'),
            where('hasExchange', '==', true),
            where('exchangeReceived', '==', true))
        ).catch(() => ({ data: () => ({ count: 0 }) }));

        if (!active) return;
        setRows(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setTotal(countSnap.data().count);
        setCursorMap(prev => ({ ...prev, [page]: snap.docs[snap.docs.length - 1] || null }));
      } catch (err) {
        // Fallback
        try {
          const snap = await getDocs(query(
            collection(db, 'sales'),
            where('hasExchange', '==', true),
            where('exchangeReceived', '==', true),
            orderBy('saleDate', 'desc'),
            limit(PAGE_SIZE),
          ));
          if (!active) return;
          setRows(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e2) {
          toast.error('Failed to load received exchanges');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    run();
    return () => { active = false; };
  }, [db, page, refresh]);

  return (
    <Card>
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
              : rows.length === 0
                ? (
                  <TableRow>
                    <TableCell colSpan={isMobile ? 3 : 4} align="center" sx={{ py: 6 }}>
                      <Typography color="text.secondary">No exchange items received yet</Typography>
                    </TableCell>
                  </TableRow>
                )
                : rows.map(row => (
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
        count={total}
        page={page}
        rowsPerPage={PAGE_SIZE}
        onPageChange={(_, p) => setPage(p)}
        rowsPerPageOptions={[PAGE_SIZE]}
      />
    </Card>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const ExchangeTracking = () => {
  const { db } = useAuth();
  const [tab, setTab] = useState(0);
  const [receivedRefresh, setReceivedRefresh] = useState(0);

  const handleReceived = () => {
    setReceivedRefresh(r => r + 1);
  };

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
          <Tab
            icon={<SwapHoriz fontSize="small" />}
            iconPosition="start"
            label="Pending Receipt"
          />
          <Tab
            icon={<DoneAll fontSize="small" />}
            iconPosition="start"
            label="Received"
          />
        </Tabs>
      </Box>

      <TabPanel value={tab} index={0}>
        <PendingExchangeTab db={db} onReceived={handleReceived} />
      </TabPanel>
      <TabPanel value={tab} index={1}>
        <ReceivedExchangeTab db={db} refresh={receivedRefresh} />
      </TabPanel>
    </Box>
  );
};

export default ExchangeTracking;