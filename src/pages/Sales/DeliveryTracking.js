import React, { useEffect, useRef, useState } from 'react';
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
import {
  collection, query, where, orderBy, limit, startAfter, startAt, endAt,
  getDocs, updateDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { formatCurrency, formatDate } from '../../utils';
import { useMediaQuery, useTheme } from '@mui/material';

const PAGE_SIZE = 10;
const QUERY_SIZE = PAGE_SIZE + 1;
const SEARCH_LIMIT = 20;
const MIN_SEARCH_LENGTH = 2;

const toTitleCase = (value = '') =>
  value
    .toLowerCase()
    .replace(/(^|\s)\S/g, char => char.toUpperCase());

// Firestore does not provide native full-text/substring search. For delivery
// lookup we use bounded prefix queries against the existing indexed scalar
// fields instead of downloading a month/collection and filtering in memory.
// Each field query is capped and the merged result is capped at SEARCH_LIMIT.
const searchPendingDeliveries = async (db, rawTerm) => {
  const term = String(rawTerm || '').trim();
  if (term.length < MIN_SEARCH_LENGTH) return [];

  const searches = [];
  const seenQueries = new Set();

  const addPrefixSearch = (field, prefix) => {
    const value = String(prefix || '').trim();
    if (!value) return;
    const key = `${field}:${value}`;
    if (seenQueries.has(key)) return;
    seenQueries.add(key);

    searches.push(
      getDocs(query(
        collection(db, 'sales'),
        orderBy(field),
        startAt(value),
        endAt(`${value}\uf8ff`),
        limit(SEARCH_LIMIT),
      ))
    );
  };

  // Invoice numbers are generated in uppercase in this app. Customer names
  // are normally saved in title case, while phones are searched as digits.
  addPrefixSearch('invoiceNumber', term.toUpperCase());
  addPrefixSearch('customerName', toTitleCase(term));

  const phoneTerm = term.replace(/\D/g, '');
  if (phoneTerm.length >= MIN_SEARCH_LENGTH) {
    addPrefixSearch('customerPhone', phoneTerm);
  }

  const results = await Promise.allSettled(searches);
  const merged = new Map();
  let successfulQueryCount = 0;

  results.forEach(result => {
    if (result.status !== 'fulfilled') return;
    successfulQueryCount += 1;
    result.value.docs.forEach(snapshot => {
      const sale = { id: snapshot.id, ...snapshot.data() };
      if (isScheduledSale(sale) && !isSaleDelivered(sale)) {
        merged.set(snapshot.id, sale);
      }
    });
  });

  if (searches.length > 0 && successfulQueryCount === 0) {
    const firstError = results.find(result => result.status === 'rejected')?.reason;
    throw firstError || new Error('Delivery search failed');
  }

  return Array.from(merged.values())
    .sort((a, b) => (a.deliveryDate || '').localeCompare(b.deliveryDate || ''))
    .slice(0, SEARCH_LIMIT);
};

// Compatibility guard for old records. New records use boolean isDelivered as
// the canonical queue field, while these checks ensure an older inconsistent
// document can never be shown as pending just because isDelivered was stale.
const isSaleDelivered = (sale = {}) => {
  if (sale.isDelivered === true || String(sale.isDelivered).toLowerCase() === 'true') return true;

  const status = String(sale.deliveryStatus || '').trim().toLowerCase();
  if (status === 'delivered' || status === 'completed') return true;
  if (status === 'pending') return false;

  return Boolean(sale.actualDeliveryDate);
};

const isScheduledSale = (sale = {}) => sale.deliveryType === 'scheduled';

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
//
// Fresh queue logic:
//   • Firestore itself filters isDelivered === false.
//   • Results are ordered by expected delivery date.
//   • Only PAGE_SIZE + 1 docs are read per page; the extra doc is used only to
//     determine whether a Next page exists.
//   • No count query and no bulk read are performed.
//   • The compatibility guard hides previously-corrupted legacy records where
//     deliveryStatus/actualDeliveryDate already prove delivery completion.

const PendingDeliveriesTab = ({ db }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [page, setPage] = useState(0);
  const pageCursorsRef = useRef([null]);
  const [hasNext, setHasNext] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchRows, setSearchRows] = useState([]);
  const [markDialog, setMarkDialog] = useState(null);
  const searchTimer = useRef(null);

  const handleSearch = (value) => {
    setSearch(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(value.trim());
      setPage(0);
      pageCursorsRef.current = [null];
    }, 400);
  };

  const resetToFirstPage = () => {
    setPage(0);
    pageCursorsRef.current = [null];
    setRefreshKey(k => k + 1);
  };

  useEffect(() => () => clearTimeout(searchTimer.current), []);

  useEffect(() => {
    if (!db || debouncedSearch) return;
    let active = true;

    const load = async () => {
      setLoading(true);
      try {
        const constraints = [
          where('isDelivered', '==', false),
          orderBy('deliveryDate', 'asc'),
          limit(QUERY_SIZE),
        ];

        const cursor = pageCursorsRef.current[page];
        if (page > 0 && cursor) constraints.push(startAfter(cursor));

        let snap;
        try {
          snap = await getDocs(query(collection(db, 'sales'), ...constraints));
        } catch (err) {
          // Some existing production projects may not yet have the composite
          // index for isDelivered + deliveryDate. Fall back to the automatic
          // single-field isDelivered index instead of breaking the live page.
          if (err?.code !== 'failed-precondition') throw err;
          const fallbackConstraints = [
            where('isDelivered', '==', false),
            limit(QUERY_SIZE),
          ];
          if (page > 0 && cursor) fallbackConstraints.push(startAfter(cursor));
          snap = await getDocs(query(collection(db, 'sales'), ...fallbackConstraints));
        }
        if (!active) return;

        // Consume exactly PAGE_SIZE raw documents for this cursor page. The
        // extra document is only a look-ahead and is not displayed/read again
        // until the user explicitly requests the next page.
        const rawPageDocs = snap.docs.slice(0, PAGE_SIZE);
        const pageRows = rawPageDocs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(d => isScheduledSale(d) && !isSaleDelivered(d))
          .sort((a, b) => (a.deliveryDate || '').localeCompare(b.deliveryDate || ''));

        setRows(pageRows);
        setHasNext(snap.docs.length > PAGE_SIZE);

        if (rawPageDocs.length > 0) {
          const nextCursor = rawPageDocs[rawPageDocs.length - 1];
          pageCursorsRef.current[page + 1] = nextCursor;
        }
      } catch (err) {
        if (!active) return;
        toast.error('Failed to load pending deliveries: ' + err.message);
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, [db, page, refreshKey, debouncedSearch]);

  // Search mode is intentionally separate from normal pagination. It queries
  // Firestore across the collection and returns at most SEARCH_LIMIT pending
  // scheduled deliveries, rather than filtering only the 10 rows on screen.
  useEffect(() => {
    if (!db || !debouncedSearch) {
      setSearchRows([]);
      return;
    }

    let active = true;
    const runSearch = async () => {
      if (debouncedSearch.length < MIN_SEARCH_LENGTH) {
        setSearchRows([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const matches = await searchPendingDeliveries(db, debouncedSearch);
        if (active) setSearchRows(matches);
      } catch (err) {
        if (active) toast.error('Failed to search pending deliveries: ' + err.message);
      } finally {
        if (active) setLoading(false);
      }
    };

    runSearch();
    return () => { active = false; };
  }, [db, debouncedSearch, refreshKey]);

  const visibleRows = debouncedSearch ? searchRows : rows;

  const handleMarkDelivered = async (deliveredDate) => {
    if (!markDialog?.id) return;

    await updateDoc(doc(db, 'sales', markDialog.id), {
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
    deliveryDate ? new Date(`${deliveryDate}T23:59:59`) < new Date() : false;

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
                              ? debouncedSearch.length < MIN_SEARCH_LENGTH
                                ? `Type at least ${MIN_SEARCH_LENGTH} characters to search`
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

        {debouncedSearch ? (
          <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
            <Typography variant="caption" color="text.secondary">
              Showing up to {SEARCH_LIMIT} matches from the full sales collection
            </Typography>
          </Box>
        ) : (
          <PageControls
            page={page}
            hasNext={hasNext}
            loading={loading}
            onPrevious={() => setPage(p => Math.max(0, p - 1))}
            onNext={() => hasNext && setPage(p => p + 1)}
          />
        )}
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
//
// Marking a scheduled delivery writes actualDeliveryDate. Firestore orderBy
// only returns documents where that field exists, so immediate sales are not
// loaded into this tab at all. This keeps the delivered history on-demand and
// avoids scanning ordinary sales.

const RecentlyDeliveredTab = ({ db }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const pageCursorsRef = useRef([null]);
  const [hasNext, setHasNext] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!db) return;
    let active = true;

    const load = async () => {
      setLoading(true);
      try {
        const constraints = [
          orderBy('actualDeliveryDate', 'desc'),
          limit(QUERY_SIZE),
        ];
        const cursor = pageCursorsRef.current[page];
        if (page > 0 && cursor) constraints.push(startAfter(cursor));

        const snap = await getDocs(query(collection(db, 'sales'), ...constraints));
        if (!active) return;

        const rawPageDocs = snap.docs.slice(0, PAGE_SIZE);
        const pageRows = rawPageDocs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(d => isScheduledSale(d) && isSaleDelivered(d));

        setRows(pageRows);
        setHasNext(snap.docs.length > PAGE_SIZE);

        if (rawPageDocs.length > 0) {
          const nextCursor = rawPageDocs[rawPageDocs.length - 1];
          pageCursorsRef.current[page + 1] = nextCursor;
        }
      } catch (err) {
        if (!active) return;
        toast.error('Failed to load delivered items: ' + err.message);
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, [db, page, refreshKey]);

  const refreshCurrent = () => setRefreshKey(k => k + 1);

  return (
    <Box>
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
          onPrevious={() => setPage(p => Math.max(0, p - 1))}
          onNext={() => hasNext && setPage(p => p + 1)}
        />
      </Card>
    </Box>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const DeliveryTracking = () => {
  const { db } = useAuth();
  const [tab, setTab] = useState(0);
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
        </Tabs>
      </Box>

      <TabPanel value={tab} index={0}>
        <PendingDeliveriesTab db={db} />
      </TabPanel>
      <TabPanel value={tab} index={1}>
        <RecentlyDeliveredTab db={db} />
      </TabPanel>
    </Box>
  );
};

export default DeliveryTracking;
