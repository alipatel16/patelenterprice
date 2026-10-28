import { fetchAggregate, subscribeInvalidation } from '../../data/query';
import { deleteRecord as deleteDoc } from '../../data/writes';
import usePagedCollection from '../../hooks/usePagedCollection';
import QueryStatus from '../../components/QueryStatus';
import { businessListOptions, complaintUrgency as getUrgency } from '../../utils/businessListQueries';
import { useState, useEffect } from 'react';
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
import { doc } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { formatDate } from '../../utils';
import { useMediaQuery, useTheme } from '@mui/material';

const PAGE_SIZE = 15;

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
        { key: 'overdue',   label: 'Overdue (page)',    count: counts.overdue,   color: '#ef4444', bg: '#fef2f2', icon: <ErrorIcon sx={{ fontSize: 16, color: '#ef4444' }} /> },
        { key: 'due_today', label: 'Due Today (page)',  count: counts.due_today, color: '#f97316', bg: '#fff7ed', icon: <NotificationsActive sx={{ fontSize: 16, color: '#f97316' }} /> },
        { key: 'due_soon',  label: 'Due in ≤4d (page)', count: counts.due_soon,  color: '#eab308', bg: '#fefce8', icon: <Schedule sx={{ fontSize: 16, color: '#eab308' }} /> },
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
  const [search, setSearch] = useState('');
  const [assigneeFilter, setAssignee] = useState('all');
  const [urgencyFilter, setUrgency] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const { rows: pageRows, total, loading, error, page, setPage, refresh } = usePagedCollection(
    db, 'complaints', businessListOptions('complaints', { search, status, assigneeFilter, urgencyFilter })
  );
  const handleSearch = setSearch;
  const handleUrgencyFilter = setUrgency;

  const handleDelete = async () => {
    try {
      await deleteDoc(doc(db, 'complaints', deleteId));
      toast.success('Complaint deleted');
      setDeleteId(null);
      refresh();
      onRefreshCounts();
    } catch { toast.error('Delete failed'); }
  };

  const activeFilters = [assigneeFilter !== 'all', urgencyFilter !== 'all'].filter(Boolean).length;

  return (
    <Box>
      <QueryStatus error={error} loading={loading} search={search} />
      <UrgencySummaryBar rows={pageRows} urgencyFilter={urgencyFilter} onFilter={handleUrgencyFilter} />

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
          {total > PAGE_SIZE && (
            <TablePagination component="div" count={total ?? 0} page={page}
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
          <TablePagination component="div" count={total ?? 0} page={page}
            onPageChange={(_, p) => setPage(p)} rowsPerPage={PAGE_SIZE} rowsPerPageOptions={[PAGE_SIZE]} />
        </Card>
      )}

      <DeleteDialog open={Boolean(deleteId)} onClose={() => setDeleteId(null)} onConfirm={handleDelete} />
    </Box>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 3 — HISTORY: indexed server search and cursor pagination.
const HistoryComplaintsTab = ({ db, navigate, isMobile, onRefreshCounts }) => {
  const [deleteId, setDeleteId] = useState(null);
  const [search, setSearch] = useState('');
  const { rows: displayRows, total: totalCount, loading, error, page, setPage, refresh } = usePagedCollection(
    db, 'complaints', businessListOptions('complaints', { search, status: 'history' })
  );
  const handleSearch = setSearch;
  const handlePageChange = (_, nextPage) => setPage(nextPage);

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    try {
      await deleteDoc(doc(db, 'complaints', deleteId));
      toast.success('Complaint deleted');
      setDeleteId(null);
      refresh();
      onRefreshCounts();
    } catch { toast.error('Delete failed'); }
  };

  return (
    <Box>
      <QueryStatus error={error} loading={loading} search={search} />
      {/* Search + info banner */}
      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 2, p: 2 }}>
        <TextField
          fullWidth
          placeholder="Search complaint #, customer, title..."
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
            Search all resolved/closed complaints · {totalCount} total resolved/closed complaints
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
                    {search ? 'No matching complaints' : 'No resolved or closed complaints'}
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
              count={totalCount ?? 0}
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
                            {search ? 'No matching complaints' : 'No resolved or closed complaints'}
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
            count={totalCount ?? 0}
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
  const [countsError, setCountsError] = useState(null);

  useEffect(() => subscribeInvalidation(db, names => {
    if (!names || names.includes('complaints')) {
      setTabCounts({ open: 0, in_progress: 0, history: 0 });
      setCountsKey(key => key + 1);
    }
  }), [db]);

  useEffect(() => {
    if (!db) return;
    let active = true;
    setCountsError(null);
    Promise.all([
      fetchAggregate(db, 'complaints', { filters: [['status', '==', 'open']] }),
      fetchAggregate(db, 'complaints', { filters: [['status', '==', 'in_progress']] }),
      fetchAggregate(db, 'complaints', { filters: [['status', 'in', ['resolved', 'closed']]] }),
    ]).then(([open, inProgress, history]) => {
      if (active) setTabCounts({ open: open.count, in_progress: inProgress.count, history: history.count });
    }).catch(e => { if (active) setCountsError(e); });
    return () => { active = false; };
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
      <QueryStatus error={countsError} />
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
