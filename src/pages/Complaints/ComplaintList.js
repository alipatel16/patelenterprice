import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Box, Typography, Button, Card, CardContent, TextField, InputAdornment,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, Chip, IconButton, Stack, Tooltip, Dialog,
  DialogTitle, DialogContent, DialogActions, MenuItem, Select,
  FormControl, InputLabel, Tab, Tabs,
} from '@mui/material';
import {
  Add, Search, Edit, Delete, BugReport, FilterList,
  AccountTree, Error as ErrorIcon, Schedule, NotificationsActive,
  InfoOutlined,
} from '@mui/icons-material';
import {
  collection, query, orderBy, limit, startAfter, getDocs,
  deleteDoc, doc, getCountFromServer, where,
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { formatDate } from '../../utils';
import { useMediaQuery, useTheme } from '@mui/material';

const PAGE_SIZE = 10;

const STATUS_CONFIG = {
  open:        { label: 'Open',        color: 'error'   },
  in_progress: { label: 'In Progress', color: 'warning' },
  resolved:    { label: 'Resolved',    color: 'success' },
  closed:      { label: 'Closed',      color: 'default' },
};

const StatusChip = ({ status }) => {
  const c = STATUS_CONFIG[status] || STATUS_CONFIG.open;
  return <Chip label={c.label} color={c.color} size="small" />;
};

// ─── Urgency helpers ──────────────────────────────────────────────────────────
const getUrgency = (row) => {
  if (!row.expectedResolutionDate || row.status === 'resolved' || row.status === 'closed')
    return 'normal';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(row.expectedResolutionDate); due.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0)   return 'overdue';
  if (diffDays === 0) return 'due_today';
  if (diffDays <= 4)  return 'due_soon';
  return 'normal';
};

const URGENCY_ORDER = { overdue: 0, due_today: 1, due_soon: 2, normal: 3 };
const sortByUrgency = rows =>
  [...rows].sort((a, b) => URGENCY_ORDER[getUrgency(a)] - URGENCY_ORDER[getUrgency(b)]);

const sortByCreatedAt = rows =>
  [...rows].sort((a, b) => {
    const ta = a.createdAt?.toDate?.() || new Date(a.createdAt || 0);
    const tb = b.createdAt?.toDate?.() || new Date(b.createdAt || 0);
    return tb - ta;
  });

const URGENCY_CONFIG = {
  overdue:   { label: 'Overdue',    color: 'error',   bg: '#fef2f2', border: '#ef4444', icon: '🔴', leftBorder: '#ef4444' },
  due_today: { label: 'Due Today',  color: 'error',   bg: '#fff7ed', border: '#f97316', icon: '🟠', leftBorder: '#f97316' },
  due_soon:  { label: 'Due in ≤4d', color: 'warning', bg: '#fefce8', border: '#eab308', icon: '🟡', leftBorder: '#eab308' },
  normal:    { label: 'On Track',   color: 'success', bg: 'inherit',  border: 'transparent', icon: '🟢', leftBorder: 'transparent' },
};

const UrgencyChip = ({ urgency }) => {
  if (urgency === 'normal') return null;
  const c = URGENCY_CONFIG[urgency];
  return (
    <Chip label={`${c.icon} ${c.label}`} size="small" color={c.color}
      variant={urgency === 'overdue' ? 'filled' : 'outlined'}
      sx={{ fontSize: 10, fontWeight: 700 }} />
  );
};

// ─── Urgency summary bar ──────────────────────────────────────────────────────
const UrgencySummaryBar = ({ rows, urgencyFilter, onFilter }) => {
  const counts = { overdue: 0, due_today: 0, due_soon: 0 };
  rows.forEach(r => { const u = getUrgency(r); if (u !== 'normal') counts[u]++; });
  if (counts.overdue + counts.due_today + counts.due_soon === 0 && urgencyFilter === 'all') return null;

  return (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
      {[
        { key: 'overdue',   label: 'Overdue',    count: counts.overdue,   color: '#ef4444', bg: '#fef2f2', icon: <ErrorIcon sx={{ fontSize: 16, color: '#ef4444' }} /> },
        { key: 'due_today', label: 'Due Today',  count: counts.due_today, color: '#f97316', bg: '#fff7ed', icon: <NotificationsActive sx={{ fontSize: 16, color: '#f97316' }} /> },
        { key: 'due_soon',  label: 'Due in ≤4d', count: counts.due_soon,  color: '#eab308', bg: '#fefce8', icon: <Schedule sx={{ fontSize: 16, color: '#eab308' }} /> },
      ].map(({ key, label, count, color, bg, icon }) => (
        <Box key={key} onClick={() => onFilter(urgencyFilter === key ? 'all' : key)}
          sx={{
            display: 'flex', alignItems: 'center', gap: 1,
            px: 1.5, py: 1, borderRadius: 2, cursor: 'pointer',
            border: '2px solid', borderColor: urgencyFilter === key ? color : 'transparent',
            bgcolor: bg, transition: 'all 0.15s',
            '&:hover': { borderColor: color }, opacity: count === 0 ? 0.45 : 1,
          }}>
          {icon}
          <Box>
            <Typography variant="caption" color="text.secondary" display="block" lineHeight={1.2}>{label}</Typography>
            <Typography variant="body2" fontWeight={800} color={color} lineHeight={1.2}>{count}</Typography>
          </Box>
        </Box>
      ))}
      {urgencyFilter !== 'all' && (
        <Button size="small" variant="outlined" onClick={() => onFilter('all')} sx={{ alignSelf: 'center' }}>
          Clear urgency filter
        </Button>
      )}
    </Box>
  );
};

// ─── Shared row components ────────────────────────────────────────────────────
const MobileComplaintCard = ({ row, navigate, onDelete }) => {
  const urgency = getUrgency(row);
  const uc = URGENCY_CONFIG[urgency];
  return (
    <Card elevation={0} sx={{
      mb: 1.5, borderRadius: 2, border: '1px solid',
      borderColor: urgency !== 'normal' ? uc.border : 'divider',
      borderLeft: `4px solid ${uc.leftBorder}`, bgcolor: uc.bg,
      cursor: 'pointer', '&:hover': { filter: 'brightness(0.97)' },
    }} onClick={() => navigate(`/complaints/${row.id}`)}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={0.75}>
          <Box>
            <Typography variant="body2" fontWeight={700} color="error.main">{row.complaintNumber}</Typography>
            <Typography variant="caption" color="text.secondary">
              {formatDate(row.createdAt?.toDate?.() || row.createdAt)}
            </Typography>
          </Box>
          <Stack direction="row" spacing={0.5} flexWrap="wrap" justifyContent="flex-end">
            <UrgencyChip urgency={urgency} />
            <StatusChip status={row.status} />
          </Stack>
        </Box>
        <Typography variant="body2" fontWeight={600} noWrap mb={0.25}>{row.title}</Typography>
        <Typography variant="caption" color="text.secondary" display="block">
          {row.customerName} · {row.customerPhone}
        </Typography>
        <Box display="flex" justifyContent="space-between" alignItems="center" mt={1}>
          <Stack direction="row" gap={0.5} flexWrap="wrap">
            {row.brand && <Chip label={row.brand} size="small" variant="outlined" color="error" sx={{ fontSize: 10 }} />}
            <Chip label={row.assigneeType === 'internal' ? '👤 Internal' : '🏢 External'} size="small" variant="outlined" sx={{ fontSize: 10 }} />
          </Stack>
          <Typography variant="caption" fontWeight={600}
            color={urgency === 'overdue' ? 'error.main' : urgency === 'due_today' ? 'warning.main' : 'text.secondary'}>
            {row.expectedResolutionDate ? `📅 ${formatDate(row.expectedResolutionDate)}` : '—'}
          </Typography>
        </Box>
        <Box display="flex" gap={1} mt={1.5} onClick={e => e.stopPropagation()}>
          <IconButton size="small" onClick={() => navigate(`/complaints/edit/${row.id}`)}><Edit fontSize="small" /></IconButton>
          <IconButton size="small" color="error" onClick={() => onDelete(row.id)}><Delete fontSize="small" /></IconButton>
        </Box>
      </CardContent>
    </Card>
  );
};

const DesktopComplaintRow = ({ row, navigate, onDelete }) => {
  const urgency = getUrgency(row);
  const uc = URGENCY_CONFIG[urgency];
  return (
    <TableRow hover sx={{ cursor: 'pointer', bgcolor: uc.bg }} onClick={() => navigate(`/complaints/${row.id}`)}>
      <TableCell sx={{ width: 6, p: 0, bgcolor: uc.leftBorder, '&:hover': { bgcolor: uc.leftBorder } }} />
      <TableCell><Typography variant="body2" fontWeight={700} color="error.main">{row.complaintNumber}</Typography></TableCell>
      <TableCell>
        <Typography variant="body2" fontWeight={600}>{row.customerName}</Typography>
        <Typography variant="caption" color="text.secondary">{row.customerPhone}</Typography>
      </TableCell>
      <TableCell><Typography variant="body2" noWrap sx={{ maxWidth: 180 }}>{row.title}</Typography></TableCell>
      <TableCell>
        {row.brand && <Chip label={row.brand} size="small" color="error" variant="outlined" sx={{ mr: 0.5, fontSize: 10 }} />}
        {row.model && <Typography variant="caption" color="text.secondary">{row.model}</Typography>}
      </TableCell>
      <TableCell>
        <Typography variant="body2" fontWeight={600}>
          {row.assigneeType === 'internal' ? row.internalEmployeeName : row.assignedPersonName}
        </Typography>
        <Chip
          label={row.assigneeType === 'internal' ? 'Internal' : `External L${row.currentEscalationLevel || 1}`}
          size="small" variant="outlined"
          color={row.assigneeType === 'internal' ? 'primary' : 'warning'}
          sx={{ fontSize: 10, mt: 0.25 }}
        />
      </TableCell>
      <TableCell>
        <Typography variant="body2"
          color={urgency === 'overdue' ? 'error.main' : urgency === 'due_today' ? 'warning.main' : 'text.primary'}
          fontWeight={urgency !== 'normal' ? 700 : 400}>
          {formatDate(row.expectedResolutionDate)}
        </Typography>
        <UrgencyChip urgency={urgency} />
      </TableCell>
      <TableCell><StatusChip status={row.status} /></TableCell>
      <TableCell align="center" onClick={e => e.stopPropagation()}>
        <Stack direction="row" spacing={0.5} justifyContent="center">
          <Tooltip title="Edit">
            <IconButton size="small" onClick={() => navigate(`/complaints/edit/${row.id}`)}><Edit fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton size="small" color="error" onClick={() => onDelete(row.id)}><Delete fontSize="small" /></IconButton>
          </Tooltip>
        </Stack>
      </TableCell>
    </TableRow>
  );
};

const TableSkeleton = ({ cols }) => (
  <>
    {Array.from({ length: 5 }).map((_, i) => (
      <TableRow key={i}>
        {Array.from({ length: cols }).map((_, j) => (
          <TableCell key={j}><Box sx={{ height: 16, bgcolor: 'action.hover', borderRadius: 1 }} /></TableCell>
        ))}
      </TableRow>
    ))}
  </>
);

const DeleteDialog = ({ open, onClose, onConfirm }) => (
  <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
    <DialogTitle>Delete Complaint?</DialogTitle>
    <DialogContent><Typography>This action cannot be undone.</Typography></DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Cancel</Button>
      <Button onClick={onConfirm} color="error" variant="contained">Delete</Button>
    </DialogActions>
  </Dialog>
);

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1 & 2 — ACTIVE COMPLAINTS (Open / In Progress)
// ═══════════════════════════════════════════════════════════════════════════════
const ActiveComplaintsTab = ({ db, status, navigate, isMobile, onRefreshCounts }) => {
  const [allDocs, setAllDocs]       = useState([]);
  const [loading, setLoading]       = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [page, setPage]                   = useState(0);
  const [search, setSearch]               = useState('');
  const [debouncedSearch, setDebSearch]   = useState('');
  const [assigneeFilter, setAssignee]     = useState('all');
  const [urgencyFilter, setUrgency]       = useState('all');
  const [showFilters, setShowFilters]     = useState(false);
  const [deleteId, setDeleteId]           = useState(null);
  const searchTimer = useRef(null);

  useEffect(() => {
    if (!db) return;
    let active = true;
    setLoading(true);
    getDocs(query(
      collection(db, 'complaints'),
      where('status', '==', status)
    ))
      .then(snap => {
        if (!active) return;
        const docs = sortByCreatedAt(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setAllDocs(docs);
      })
      .catch(e => {
        if (!active) return;
        console.error('ActiveComplaintsTab error:', e);
        toast.error('Failed to load complaints');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [db, status, refreshKey]);

  const handleSearch = val => {
    setSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setDebSearch(val); setPage(0); }, 350);
  };

  const handleUrgencyFilter = key => { setUrgency(key); setPage(0); };

  const filtered = useMemo(() => {
    let list = allDocs;
    if (assigneeFilter !== 'all') list = list.filter(r => r.assigneeType === assigneeFilter);
    if (urgencyFilter  !== 'all') list = list.filter(r => getUrgency(r) === urgencyFilter);
    if (debouncedSearch.trim()) {
      const s = debouncedSearch.toLowerCase();
      list = list.filter(r =>
        (r.complaintNumber || '').toLowerCase().includes(s) ||
        (r.customerName    || '').toLowerCase().includes(s) ||
        (r.customerPhone   || '').toLowerCase().includes(s) ||
        (r.title           || '').toLowerCase().includes(s) ||
        (r.brand           || '').toLowerCase().includes(s)
      );
    }
    return sortByUrgency(list);
  }, [allDocs, assigneeFilter, urgencyFilter, debouncedSearch]);

  const pageRows = useMemo(
    () => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filtered, page]
  );

  const handleDelete = async () => {
    try {
      await deleteDoc(doc(db, 'complaints', deleteId));
      toast.success('Complaint deleted');
      setDeleteId(null);
      setRefreshKey(k => k + 1);
      onRefreshCounts();
    } catch { toast.error('Delete failed'); }
  };

  const activeFilters = [assigneeFilter !== 'all', urgencyFilter !== 'all'].filter(Boolean).length;

  return (
    <Box>
      <UrgencySummaryBar rows={allDocs} urgencyFilter={urgencyFilter} onFilter={handleUrgencyFilter} />

      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 2, p: 2 }}>
        <Box display="flex" gap={1} alignItems="center">
          <TextField
            fullWidth placeholder="Search complaint #, customer, title, brand..."
            value={search} onChange={e => handleSearch(e.target.value)} size="small"
            InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
          />
          <Tooltip title="Filters">
            <IconButton onClick={() => setShowFilters(f => !f)}
              color={showFilters || activeFilters > 0 ? 'error' : 'default'}
              sx={{ position: 'relative' }}>
              <FilterList />
              {activeFilters > 0 && (
                <Box sx={{ position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: '50%', bgcolor: 'error.main' }} />
              )}
            </IconButton>
          </Tooltip>
        </Box>
        {showFilters && (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} mt={2}>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Assignee Type</InputLabel>
              <Select value={assigneeFilter} onChange={e => { setAssignee(e.target.value); setPage(0); }} label="Assignee Type">
                <MenuItem value="all">All Types</MenuItem>
                <MenuItem value="internal">Internal</MenuItem>
                <MenuItem value="external">External (Brand)</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Urgency</InputLabel>
              <Select value={urgencyFilter} onChange={e => handleUrgencyFilter(e.target.value)} label="Urgency">
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="overdue">🔴 Overdue</MenuItem>
                <MenuItem value="due_today">🟠 Due Today</MenuItem>
                <MenuItem value="due_soon">🟡 Due in ≤4 Days</MenuItem>
                <MenuItem value="normal">🟢 On Track</MenuItem>
              </Select>
            </FormControl>
            {activeFilters > 0 && (
              <Button size="small" variant="outlined" onClick={() => { setAssignee('all'); setUrgency('all'); setPage(0); }}>
                Clear All
              </Button>
            )}
          </Stack>
        )}
      </Card>

      {isMobile ? (
        <Box>
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} elevation={0} sx={{ mb: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, height: 140, bgcolor: 'action.hover' }} />
              ))
            : pageRows.length === 0
              ? <Box textAlign="center" py={6}><BugReport sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} /><Typography color="text.secondary">No complaints found</Typography></Box>
              : pageRows.map(row => <MobileComplaintCard key={row.id} row={row} navigate={navigate} onDelete={setDeleteId} />)
          }
          {filtered.length > PAGE_SIZE && (
            <TablePagination component="div" count={filtered.length} page={page}
              onPageChange={(_, p) => setPage(p)} rowsPerPage={PAGE_SIZE} rowsPerPageOptions={[PAGE_SIZE]}
              sx={{ '.MuiTablePagination-toolbar': { px: 0 } }} />
          )}
        </Box>
      ) : (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell sx={{ fontWeight: 700, width: 6, p: 0 }} />
                  <TableCell sx={{ fontWeight: 700 }}>Complaint #</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Customer</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Title</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Brand / Model</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Assigned To</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Expected By</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading
                  ? <TableSkeleton cols={9} />
                  : pageRows.length === 0
                    ? <TableRow><TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                        <BugReport sx={{ fontSize: 48, color: 'text.disabled', display: 'block', mx: 'auto', mb: 1 }} />
                        <Typography color="text.secondary">No complaints found</Typography>
                      </TableCell></TableRow>
                    : pageRows.map(row => <DesktopComplaintRow key={row.id} row={row} navigate={navigate} onDelete={setDeleteId} />)
                }
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination component="div" count={filtered.length} page={page}
            onPageChange={(_, p) => setPage(p)} rowsPerPage={PAGE_SIZE} rowsPerPageOptions={[PAGE_SIZE]} />
        </Card>
      )}

      <DeleteDialog open={Boolean(deleteId)} onClose={() => setDeleteId(null)} onConfirm={handleDelete} />
    </Box>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 3 — HISTORY (Resolved / Closed)
//
// ✅ TRUE SERVER-SIDE PAGINATION using startAfter cursors.
//    Reads exactly PAGE_SIZE (10) docs per page — never more.
//    getCountFromServer for total badge → 0 read cost (count queries are free).
//    Search is client-side within the current page of 10 rows.
//
// ⚠️  REQUIRES a Firestore composite index:
//    Collection : complaints
//    Fields     : status (Ascending)  +  createdAt (Descending)
//    When you first load this tab, Firebase console will log a URL
//    to create the index automatically — click it once.
// ═══════════════════════════════════════════════════════════════════════════════
const HistoryComplaintsTab = ({ db, navigate, isMobile, onRefreshCounts }) => {
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [totalCount, setTotal]    = useState(0);
  const [page, setPage]           = useState(0);
  // cursors[n] = last Firestore doc snapshot of page n (used as startAfter for page n+1)
  const [cursors, setCursors]     = useState({});
  const cursorsRef                = useRef({});
  const [refreshKey, setRefresh]  = useState(0);
  const [deleteId, setDeleteId]   = useState(null);
  const [search, setSearch]       = useState('');
  const [debouncedSearch, setDeb] = useState('');
  const searchTimer               = useRef(null);

  // Keep ref in sync so the fetch effect always reads the latest cursors
  // without needing cursors in its dependency array (avoids infinite loops).
  useEffect(() => { cursorsRef.current = cursors; }, [cursors]);

  // ── Fetch total count (FREE — count queries don't bill reads) ──────────────
  useEffect(() => {
    if (!db) return;
    getCountFromServer(
      query(collection(db, 'complaints'), where('status', 'in', ['resolved', 'closed']))
    )
      .then(s => setTotal(s.data().count))
      .catch(() => {});
  }, [db, refreshKey]);

  // ── Fetch exactly PAGE_SIZE docs for the current page ─────────────────────
  useEffect(() => {
    if (!db) return;
    let active = true;
    setLoading(true);

    // Build constraints:
    //   where + orderBy → requires composite index (status ASC + createdAt DESC)
    const constraints = [
      where('status', 'in', ['resolved', 'closed']),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE),
    ];

    // For page > 0 use the last doc of the previous page as the cursor
    const prevCursor = cursorsRef.current[page - 1];
    if (page > 0 && prevCursor) constraints.push(startAfter(prevCursor));

    getDocs(query(collection(db, 'complaints'), ...constraints))
      .then(snap => {
        if (!active) return;
        setRows(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        // Store last doc of this page so the NEXT page can use it as cursor
        if (snap.docs.length > 0) {
          const lastDoc = snap.docs[snap.docs.length - 1];
          setCursors(prev => ({ ...prev, [page]: lastDoc }));
        }
      })
      .catch(e => {
        if (!active) return;
        console.error('HistoryComplaintsTab error:', e);
        toast.error('Failed to load history');
      })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [db, page, refreshKey]); // cursors intentionally excluded — read via ref

  // ── Search (client-side within the current page of 10 rows) ───────────────
  const handleSearch = val => {
    setSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDeb(val), 350);
  };

  const displayRows = useMemo(() => {
    if (!debouncedSearch.trim()) return rows;
    const s = debouncedSearch.toLowerCase();
    return rows.filter(r =>
      (r.complaintNumber || '').toLowerCase().includes(s) ||
      (r.customerName    || '').toLowerCase().includes(s) ||
      (r.customerPhone   || '').toLowerCase().includes(s) ||
      (r.title           || '').toLowerCase().includes(s)
    );
  }, [rows, debouncedSearch]);

  // ── Page change ────────────────────────────────────────────────────────────
  const handlePageChange = (_, newPage) => {
    setSearch('');
    setDeb('');
    setPage(newPage);
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    try {
      await deleteDoc(doc(db, 'complaints', deleteId));
      toast.success('Complaint deleted');
      setDeleteId(null);
      // Reset all cursors and return to page 0 so pagination stays consistent
      setCursors({});
      cursorsRef.current = {};
      setPage(0);
      setRefresh(k => k + 1); // triggers both count re-fetch and page-0 re-fetch
      onRefreshCounts();
    } catch { toast.error('Delete failed'); }
  };

  return (
    <Box>
      {/* Search + info banner */}
      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 2, p: 2 }}>
        <TextField
          fullWidth
          placeholder="Search within this page (complaint #, customer, title)..."
          value={search}
          onChange={e => handleSearch(e.target.value)}
          size="small"
          InputProps={{
            startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment>,
          }}
        />
        {/* Subtle hint so users know search scope */}
        <Box display="flex" alignItems="center" gap={0.5} mt={1}>
          <InfoOutlined sx={{ fontSize: 13, color: 'text.disabled' }} />
          <Typography variant="caption" color="text.disabled">
            Search filters within the current page · {totalCount} total resolved/closed complaints
          </Typography>
        </Box>
      </Card>

      {/* Mobile */}
      {isMobile ? (
        <Box>
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} elevation={0} sx={{ mb: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, height: 120, bgcolor: 'action.hover' }} />
              ))
            : displayRows.length === 0
              ? (
                <Box textAlign="center" py={6}>
                  <BugReport sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                  <Typography color="text.secondary">
                    {debouncedSearch ? 'No matches on this page' : 'No resolved or closed complaints'}
                  </Typography>
                </Box>
              )
              : displayRows.map(row => (
                  <MobileComplaintCard key={row.id} row={row} navigate={navigate} onDelete={setDeleteId} />
                ))
          }
          {totalCount > PAGE_SIZE && (
            <TablePagination
              component="div"
              count={totalCount}
              page={page}
              onPageChange={handlePageChange}
              rowsPerPage={PAGE_SIZE}
              rowsPerPageOptions={[PAGE_SIZE]}
              sx={{ '.MuiTablePagination-toolbar': { px: 0 } }}
            />
          )}
        </Box>
      ) : (
        /* Desktop */
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell sx={{ fontWeight: 700, width: 6, p: 0 }} />
                  <TableCell sx={{ fontWeight: 700 }}>Complaint #</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Customer</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Title</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Brand / Model</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Assigned To</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Expected By</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading
                  ? <TableSkeleton cols={9} />
                  : displayRows.length === 0
                    ? (
                      <TableRow>
                        <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                          <BugReport sx={{ fontSize: 48, color: 'text.disabled', display: 'block', mx: 'auto', mb: 1 }} />
                          <Typography color="text.secondary">
                            {debouncedSearch ? 'No matches on this page' : 'No resolved or closed complaints'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )
                    : displayRows.map(row => (
                        <DesktopComplaintRow key={row.id} row={row} navigate={navigate} onDelete={setDeleteId} />
                      ))
                }
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={totalCount}
            page={page}
            onPageChange={handlePageChange}
            rowsPerPage={PAGE_SIZE}
            rowsPerPageOptions={[PAGE_SIZE]}
          />
        </Card>
      )}

      <DeleteDialog open={Boolean(deleteId)} onClose={() => setDeleteId(null)} onConfirm={handleDelete} />
    </Box>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
const ComplaintList = () => {
  const { db } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const navigate = useNavigate();

  const [tab, setTab] = useState(0);
  const [tabCounts, setTabCounts] = useState({ open: 0, in_progress: 0, history: 0 });
  const [countsKey, setCountsKey] = useState(0);

  useEffect(() => {
    if (!db) return;
    Promise.all([
      getCountFromServer(query(collection(db, 'complaints'), where('status', '==', 'open'))),
      getCountFromServer(query(collection(db, 'complaints'), where('status', '==', 'in_progress'))),
      getCountFromServer(query(collection(db, 'complaints'), where('status', 'in', ['resolved', 'closed']))),
    ]).then(([openSnap, ipSnap, histSnap]) => {
      setTabCounts({
        open:        openSnap.data().count,
        in_progress: ipSnap.data().count,
        history:     histSnap.data().count,
      });
    }).catch(() => {});
  }, [db, countsKey]);

  const handleRefreshCounts = () => setCountsKey(k => k + 1);

  const tabLabel = (label, count, color) => (
    <Box display="flex" alignItems="center" gap={0.75}>
      {label}
      {count > 0 && (
        <Chip label={count} size="small" color={color}
          sx={{ height: 18, fontSize: 10, fontWeight: 700, '& .MuiChip-label': { px: 0.75 } }} />
      )}
    </Box>
  );

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* Header */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3} flexWrap="wrap" gap={1}>
        <Box display="flex" alignItems="center" gap={1}>
          <BugReport color="error" />
          <Box>
            <Typography variant="h5" fontWeight={700}>Complaints</Typography>
            <Typography variant="caption" color="text.secondary">
              {tabCounts.open + tabCounts.in_progress + tabCounts.history} total
            </Typography>
          </Box>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Button variant="outlined" color="error" startIcon={<AccountTree />}
            onClick={() => navigate('/brand-hierarchy')} size={isMobile ? 'small' : 'medium'}>
            Brand Hierarchy
          </Button>
          <Button variant="contained" color="error" startIcon={<Add />}
            onClick={() => navigate('/complaints/new')} size={isMobile ? 'small' : 'medium'}>
            New Complaint
          </Button>
        </Stack>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant={isMobile ? 'fullWidth' : 'standard'}
          TabIndicatorProps={{
            style: { backgroundColor: tab === 0 ? '#ef4444' : tab === 1 ? '#f97316' : '#22c55e' },
          }}
        >
          <Tab label={tabLabel('Open', tabCounts.open, 'error')} sx={{ fontWeight: 600 }} />
          <Tab label={tabLabel('In Progress', tabCounts.in_progress, 'warning')} sx={{ fontWeight: 600 }} />
          <Tab label={tabLabel('Resolved / Closed', tabCounts.history, 'success')} sx={{ fontWeight: 600 }} />
        </Tabs>
      </Box>

      {tab === 0 && (
        <ActiveComplaintsTab key="open" db={db} status="open"
          navigate={navigate} isMobile={isMobile} onRefreshCounts={handleRefreshCounts} />
      )}
      {tab === 1 && (
        <ActiveComplaintsTab key="in_progress" db={db} status="in_progress"
          navigate={navigate} isMobile={isMobile} onRefreshCounts={handleRefreshCounts} />
      )}
      {tab === 2 && (
        <HistoryComplaintsTab key="history" db={db}
          navigate={navigate} isMobile={isMobile} onRefreshCounts={handleRefreshCounts} />
      )}
    </Box>
  );
};

export default ComplaintList;