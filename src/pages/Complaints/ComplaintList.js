import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Button, Card, CardContent, TextField, InputAdornment,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, Chip, IconButton, Stack, Tooltip, Dialog,
  DialogTitle, DialogContent, DialogActions, MenuItem, Select,
  FormControl, InputLabel, Divider,
} from '@mui/material';
import {
  Add, Search, Edit, Delete, BugReport, FilterList,
  AccountTree, Warning, Error as ErrorIcon, Schedule, NotificationsActive,
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
  // Resolved / closed complaints are never urgent
  if (!row.expectedResolutionDate || row.status === 'resolved' || row.status === 'closed') {
    return 'normal';
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(row.expectedResolutionDate);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));

  if (diffDays < 0)  return 'overdue';    // past due
  if (diffDays === 0) return 'due_today'; // due today
  if (diffDays <= 4)  return 'due_soon';  // next 4 days
  return 'normal';
};

// Sort order: overdue(0) > due_today(1) > due_soon(2) > normal(3)
const URGENCY_ORDER = { overdue: 0, due_today: 1, due_soon: 2, normal: 3 };

const sortByUrgency = (rows) =>
  [...rows].sort((a, b) => URGENCY_ORDER[getUrgency(a)] - URGENCY_ORDER[getUrgency(b)]);

const URGENCY_CONFIG = {
  overdue:   { label: 'Overdue',      color: 'error',   bg: '#fef2f2', border: '#ef4444', icon: '🔴', leftBorder: '#ef4444' },
  due_today: { label: 'Due Today',    color: 'error',   bg: '#fff7ed', border: '#f97316', icon: '🟠', leftBorder: '#f97316' },
  due_soon:  { label: 'Due in ≤4d',   color: 'warning', bg: '#fefce8', border: '#eab308', icon: '🟡', leftBorder: '#eab308' },
  normal:    { label: 'On Track',     color: 'success', bg: 'inherit',  border: 'transparent', icon: '🟢', leftBorder: 'transparent' },
};

const UrgencyChip = ({ urgency }) => {
  if (urgency === 'normal') return null;
  const c = URGENCY_CONFIG[urgency];
  return (
    <Chip
      label={`${c.icon} ${c.label}`}
      size="small"
      color={c.color}
      variant={urgency === 'overdue' ? 'filled' : 'outlined'}
      sx={{ fontSize: 10, fontWeight: 700 }}
    />
  );
};

// ─── Urgency summary bar ──────────────────────────────────────────────────────
const UrgencySummaryBar = ({ rows, urgencyFilter, onFilter }) => {
  const counts = { overdue: 0, due_today: 0, due_soon: 0 };
  rows.forEach(r => {
    const u = getUrgency(r);
    if (u !== 'normal') counts[u]++;
  });

  const total = counts.overdue + counts.due_today + counts.due_soon;
  if (total === 0 && urgencyFilter === 'all') return null;

  const items = [
    { key: 'overdue',   label: 'Overdue',    count: counts.overdue,   color: '#ef4444', bg: '#fef2f2', icon: <ErrorIcon sx={{ fontSize: 16, color: '#ef4444' }} /> },
    { key: 'due_today', label: 'Due Today',  count: counts.due_today, color: '#f97316', bg: '#fff7ed', icon: <NotificationsActive sx={{ fontSize: 16, color: '#f97316' }} /> },
    { key: 'due_soon',  label: 'Due in ≤4d', count: counts.due_soon,  color: '#eab308', bg: '#fefce8', icon: <Schedule sx={{ fontSize: 16, color: '#eab308' }} /> },
  ];

  return (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
      {items.map(({ key, label, count, color, bg, icon }) => (
        <Box
          key={key}
          onClick={() => onFilter(urgencyFilter === key ? 'all' : key)}
          sx={{
            display: 'flex', alignItems: 'center', gap: 1,
            px: 1.5, py: 1, borderRadius: 2, cursor: 'pointer',
            border: '2px solid',
            borderColor: urgencyFilter === key ? color : 'transparent',
            bgcolor: bg,
            transition: 'all 0.15s',
            '&:hover': { borderColor: color },
            opacity: count === 0 ? 0.45 : 1,
          }}
        >
          {icon}
          <Box>
            <Typography variant="caption" color="text.secondary" display="block" lineHeight={1.2}>
              {label}
            </Typography>
            <Typography variant="body2" fontWeight={800} color={color} lineHeight={1.2}>
              {count}
            </Typography>
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

// ─── Main Component ───────────────────────────────────────────────────────────
const ComplaintList = () => {
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
  const [statusFilter, setStatusFilter] = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [urgencyFilter, setUrgencyFilter] = useState('all');
  const [cursorMap, setCursorMap] = useState({});
  const [deleteId, setDeleteId] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  // Separate urgency counts fetched once from the full active set
  const [urgencyCounts, setUrgencyCounts] = useState({ overdue: 0, due_today: 0, due_soon: 0 });
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
    setPage(0);
    setCursorMap({});
  }, [statusFilter, assigneeFilter, urgencyFilter]);

  useEffect(() => {
    if (!db) return;
    loadPage();
    // eslint-disable-next-line
  }, [db, page, debouncedSearch, statusFilter, assigneeFilter, urgencyFilter, refreshKey]);

  // Compute urgency summary counts from the currently loaded page
  // (gives live feedback based on visible rows)
  useEffect(() => {
    const counts = { overdue: 0, due_today: 0, due_soon: 0 };
    rows.forEach(r => {
      const u = getUrgency(r);
      if (u !== 'normal') counts[u]++;
    });
    setUrgencyCounts(counts);
  }, [rows]);

  const buildWhereConstraints = () => {
    const w = [];
    if (statusFilter !== 'all') w.push(where('status', '==', statusFilter));
    if (assigneeFilter !== 'all') w.push(where('assigneeType', '==', assigneeFilter));
    return w;
  };

  const loadPage = async () => {
    setLoading(true);
    try {
      // ── Search mode: load 500, filter client-side, urgency-sort ──
      if (debouncedSearch.trim()) {
        const snap = await getDocs(query(collection(db, 'complaints'), orderBy('createdAt', 'desc'), limit(500)));
        const s = debouncedSearch.toLowerCase();
        let filtered = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r =>
          (r.complaintNumber || '').toLowerCase().includes(s) ||
          (r.customerName || '').toLowerCase().includes(s) ||
          (r.customerPhone || '').toLowerCase().includes(s) ||
          (r.title || '').toLowerCase().includes(s) ||
          (r.brand || '').toLowerCase().includes(s)
        );
        if (urgencyFilter !== 'all') filtered = filtered.filter(r => getUrgency(r) === urgencyFilter);
        filtered = sortByUrgency(filtered);
        setTotal(filtered.length);
        setRows(filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE));
        return;
      }

      // ── Normal paginated mode ──
      const whereConstraints = buildWhereConstraints();

      // For urgency filter we need to fetch more and filter client-side
      // because Firestore can't filter by computed urgency.
      // Strategy: fetch a generous batch, filter by urgency, sort, then paginate.
      if (urgencyFilter !== 'all') {
        const snap = await getDocs(query(
          collection(db, 'complaints'), ...whereConstraints,
          orderBy('createdAt', 'desc'), limit(500)
        ));
        let all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        all = all.filter(r => getUrgency(r) === urgencyFilter);
        all = sortByUrgency(all);
        setTotal(all.length);
        setRows(all.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE));
        return;
      }

      // Standard paginated path — sort by urgency within each page
      const countSnap = await getCountFromServer(query(collection(db, 'complaints'), ...whereConstraints));
      setTotal(countSnap.data().count);

      const constraints = [...whereConstraints, orderBy('createdAt', 'desc'), limit(PAGE_SIZE)];
      if (page > 0 && cursorMap[page]) constraints.push(startAfter(cursorMap[page]));
      const snap = await getDocs(query(collection(db, 'complaints'), ...constraints));
      if (snap.docs.length > 0) setCursorMap(m => ({ ...m, [page + 1]: snap.docs[snap.docs.length - 1] }));

      // Sort the fetched page by urgency
      const pageRows = sortByUrgency(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setRows(pageRows);
    } catch (e) {
      toast.error('Failed to load complaints');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteDoc(doc(db, 'complaints', deleteId));
      toast.success('Complaint deleted');
      setDeleteId(null);
      setCursorMap({});
      setPage(0);
      setRefreshKey(k => k + 1);
    } catch (e) {
      toast.error('Delete failed');
    }
  };

  const handleUrgencyFilter = (key) => {
    setUrgencyFilter(key);
    setPage(0);
    setCursorMap({});
  };

  const activeFilters = [statusFilter !== 'all', assigneeFilter !== 'all', urgencyFilter !== 'all'].filter(Boolean).length;

  // ── Mobile card ───────────────────────────────────────────────────────────
  const MobileCard = ({ row }) => {
    const urgency = getUrgency(row);
    const uc = URGENCY_CONFIG[urgency];
    return (
      <Card elevation={0} sx={{
        mb: 1.5,
        borderRadius: 2,
        border: '1px solid',
        borderColor: urgency !== 'normal' ? uc.border : 'divider',
        borderLeft: `4px solid ${uc.leftBorder}`,
        bgcolor: uc.bg,
        cursor: 'pointer',
        '&:hover': { filter: 'brightness(0.97)' },
      }}
        onClick={() => navigate(`/complaints/${row.id}`)}>
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
              {row.brand && (
                <Chip label={row.brand} size="small" variant="outlined" color="error" sx={{ fontSize: 10 }} />
              )}
              <Chip
                label={row.assigneeType === 'internal' ? '👤 Internal' : '🏢 External'}
                size="small" variant="outlined" sx={{ fontSize: 10 }}
              />
            </Stack>
            <Typography variant="caption" fontWeight={600}
              color={urgency === 'overdue' ? 'error.main' : urgency === 'due_today' ? 'warning.main' : 'text.secondary'}>
              {row.expectedResolutionDate ? `📅 ${formatDate(row.expectedResolutionDate)}` : '—'}
            </Typography>
          </Box>
          <Box display="flex" gap={1} mt={1.5} onClick={e => e.stopPropagation()}>
            <IconButton size="small" onClick={() => navigate(`/complaints/edit/${row.id}`)}>
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
          <BugReport color="error" />
          <Box>
            <Typography variant="h5" fontWeight={700}>Complaints</Typography>
            <Typography variant="caption" color="text.secondary">{total} total</Typography>
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

      {/* Urgency summary bar — always visible when there are urgent items */}
      <UrgencySummaryBar
        rows={rows}
        urgencyFilter={urgencyFilter}
        onFilter={handleUrgencyFilter}
      />

      {/* Search + Filters */}
      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 2, p: 2 }}>
        <Box display="flex" gap={1} alignItems="center">
          <TextField
            fullWidth placeholder="Search complaint #, customer, title, brand..."
            value={search} onChange={e => setSearch(e.target.value)} size="small"
            InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
          />
          <Tooltip title="Filters">
            <IconButton onClick={() => setShowFilters(f => !f)}
              color={showFilters || activeFilters > 0 ? 'error' : 'default'}>
              <FilterList />
              {activeFilters > 0 && (
                <Box sx={{
                  position: 'absolute', top: 6, right: 6,
                  width: 8, height: 8, borderRadius: '50%', bgcolor: 'error.main',
                }} />
              )}
            </IconButton>
          </Tooltip>
        </Box>
        {showFilters && (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} mt={2}>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Status</InputLabel>
              <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} label="Status">
                <MenuItem value="all">All Status</MenuItem>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                  <MenuItem key={k} value={k}>{v.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Assignee Type</InputLabel>
              <Select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)} label="Assignee Type">
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
            <Button size="small" variant="outlined"
              onClick={() => { setStatusFilter('all'); setAssigneeFilter('all'); setUrgencyFilter('all'); }}>
              Clear All
            </Button>
          </Stack>
        )}
      </Card>

      {/* ── Mobile list ── */}
      {isMobile ? (
        <Box>
          {loading ? Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} elevation={0} sx={{ mb: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2, height: 140, bgcolor: 'action.hover' }} />
          )) : rows.length === 0 ? (
            <Box textAlign="center" py={6}>
              <BugReport sx={{ fontSize: 52, color: 'text.disabled', mb: 1 }} />
              <Typography color="text.secondary">No complaints found</Typography>
              <Button variant="contained" color="error" startIcon={<Add />} sx={{ mt: 2 }}
                onClick={() => navigate('/complaints/new')}>
                Log First Complaint
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
        /* ── Desktop table ── */
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
                {loading ? Array.from({ length: PAGE_SIZE }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <TableCell key={j}><Box sx={{ height: 16, bgcolor: 'action.hover', borderRadius: 1 }} /></TableCell>
                    ))}
                  </TableRow>
                )) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                      <BugReport sx={{ fontSize: 48, color: 'text.disabled', display: 'block', mx: 'auto', mb: 1 }} />
                      <Typography color="text.secondary">No complaints found</Typography>
                    </TableCell>
                  </TableRow>
                ) : rows.map(row => {
                  const urgency = getUrgency(row);
                  const uc = URGENCY_CONFIG[urgency];
                  return (
                    <TableRow key={row.id} hover sx={{ cursor: 'pointer', bgcolor: uc.bg }}
                      onClick={() => navigate(`/complaints/${row.id}`)}>
                      {/* Urgency colour strip on left */}
                      <TableCell sx={{
                        width: 6, p: 0,
                        bgcolor: uc.leftBorder,
                        '&:hover': { bgcolor: uc.leftBorder },
                      }} />
                      <TableCell>
                        <Typography variant="body2" fontWeight={700} color="error.main">
                          {row.complaintNumber}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{row.customerName}</Typography>
                        <Typography variant="caption" color="text.secondary">{row.customerPhone}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 180 }}>{row.title}</Typography>
                      </TableCell>
                      <TableCell>
                        {row.brand && (
                          <Chip label={row.brand} size="small" color="error" variant="outlined" sx={{ mr: 0.5, fontSize: 10 }} />
                        )}
                        {row.model && (
                          <Typography variant="caption" color="text.secondary">{row.model}</Typography>
                        )}
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
                        <Box display="flex" alignItems="center" gap={0.5}>
                          <Typography variant="body2"
                            color={urgency === 'overdue' ? 'error.main' : urgency === 'due_today' ? 'warning.main' : 'text.primary'}
                            fontWeight={urgency !== 'normal' ? 700 : 400}>
                            {formatDate(row.expectedResolutionDate)}
                          </Typography>
                        </Box>
                        <UrgencyChip urgency={urgency} />
                      </TableCell>
                      <TableCell><StatusChip status={row.status} /></TableCell>
                      <TableCell align="center" onClick={e => e.stopPropagation()}>
                        <Stack direction="row" spacing={0.5} justifyContent="center">
                          <Tooltip title="Edit">
                            <IconButton size="small" onClick={() => navigate(`/complaints/edit/${row.id}`)}>
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
        <DialogTitle>Delete Complaint?</DialogTitle>
        <DialogContent><Typography>This action cannot be undone.</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ComplaintList;