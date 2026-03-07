// src/pages/Employees/ChecklistAdminView.js
import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Chip, Stack,
  CircularProgress, Tab, Tabs, Avatar, IconButton, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, Select, MenuItem, FormControl, InputLabel,
  LinearProgress, Tooltip, Dialog, DialogTitle, DialogContent,
  DialogActions, Divider, useTheme, useMediaQuery,
  ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import {
  CheckCircle, RadioButtonUnchecked, Today, CalendarMonth,
  Refresh, ArrowBack, ArrowForward, ExpandMore, ExpandLess,
  Assignment,
} from '@mui/icons-material';
import {
  collection, query, where, getDocs, orderBy,
  limit, startAfter, getCountFromServer,
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';
import { getTodayStr, formatTime } from './employeeConstants';

const PAGE_SIZE = 15;
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Daily View ────────────────────────────────────────────────────────────────
const ChecklistDailyView = ({ db }) => {
  const theme    = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [selDate,    setSelDate]    = useState(getTodayStr());
  const [employees,  setEmployees]  = useState([]);
  const [instances,  setInstances]  = useState([]);   // all checklist instances for the date
  const [loading,    setLoading]    = useState(false);
  const [expandedEmp, setExpandedEmp] = useState(null);
  const [page,       setPage]       = useState(0);
  const [total,      setTotal]      = useState(0);
  const [cursorMap,  setCursorMap]  = useState({});
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!db) return;
    getCountFromServer(query(collection(db, 'users'), where('role', '==', 'employee')))
      .then(s => setTotal(s.data().count)).catch(() => {});
  }, [db, refreshKey]);

  useEffect(() => {
    if (!db) return;
    const load = async () => {
      setLoading(true);
      try {
        // Load employees (paginated)
        let q;
        if (page === 0) {
          q = query(collection(db, 'users'), where('role', '==', 'employee'), orderBy('name'), limit(PAGE_SIZE));
        } else {
          const cursor = cursorMap[page - 1];
          if (!cursor) return;
          q = query(collection(db, 'users'), where('role', '==', 'employee'), orderBy('name'), startAfter(cursor), limit(PAGE_SIZE));
        }
        const empSnap = await getDocs(q);
        const emps = empSnap.docs.map(d => ({ id: d.id, ...d.data(), _snap: d }));
        if (empSnap.docs.length > 0) {
          setCursorMap(prev => ({ ...prev, [page]: empSnap.docs[empSnap.docs.length - 1] }));
        }
        setEmployees(emps);

        // Load checklist instances for the date
        const uids = emps.map(e => e.id);
        if (uids.length > 0) {
          const clSnap = await getDocs(
            query(collection(db, 'checklistInstances'),
              where('date', '==', selDate),
              where('userId', 'in', uids)
            )
          );
          setInstances(clSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } else {
          setInstances([]);
        }
      } catch (e) {
        toast.error('Failed to load: ' + e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [db, selDate, page, refreshKey]);

  const getEmpChecklists = (uid) => instances.filter(i => i.userId === uid);

  const getEmpStats = (uid) => {
    const items = getEmpChecklists(uid);
    const done  = items.filter(i => i.completed).length;
    return { total: items.length, done, pct: items.length > 0 ? Math.round((done / items.length) * 100) : null };
  };

  // Summary stats
  const allWithItems = employees.filter(e => getEmpStats(e.id).total > 0);
  const allComplete  = allWithItems.filter(e => { const s = getEmpStats(e.id); return s.done === s.total; });
  const noneStarted  = employees.filter(e => getEmpStats(e.id).total === 0);

  return (
    <Box>
      {/* Date picker + summary */}
      <Box display="flex" alignItems={{ xs: 'flex-start', sm: 'center' }}
        flexDirection={{ xs: 'column', sm: 'row' }} gap={2} mb={3}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Button size="small" variant="outlined"
            onClick={() => { const d = new Date(selDate); d.setDate(d.getDate() - 1); setSelDate(d.toISOString().split('T')[0]); setPage(0); setCursorMap({}); }}>
            ‹ Prev
          </Button>
          <input type="date" value={selDate}
            onChange={e => { setSelDate(e.target.value); setPage(0); setCursorMap({}); }}
            style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14 }} />
          <Button size="small" variant="outlined" disabled={selDate >= getTodayStr()}
            onClick={() => { const d = new Date(selDate); d.setDate(d.getDate() + 1); setSelDate(d.toISOString().split('T')[0]); setPage(0); setCursorMap({}); }}>
            Next ›
          </Button>
        </Stack>
        <IconButton size="small" onClick={() => { setPage(0); setCursorMap({}); setRefreshKey(k => k + 1); }}>
          <Refresh />
        </IconButton>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={2} mb={3}>
        {[
          { label: 'All Complete',  val: allComplete.length,  color: 'success' },
          { label: 'Partial / None', val: allWithItems.length - allComplete.length, color: 'warning' },
          { label: 'No Checklists', val: noneStarted.length,  color: 'default' },
        ].map(s => (
          <Grid item xs={4} key={s.label}>
            <Card sx={{ textAlign: 'center' }}>
              <CardContent sx={{ py: '10px !important' }}>
                <Typography variant="h4" fontWeight={800}
                  color={s.color === 'default' ? 'text.secondary' : `${s.color}.main`}>{s.val}</Typography>
                <Typography variant="caption" color="text.secondary">{s.label}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Employee Rows */}
      <Card>
        {loading ? (
          <Box display="flex" justifyContent="center" py={5}><CircularProgress /></Box>
        ) : (
          <>
            <TableContainer>
              <Table size={isMobile ? 'small' : 'medium'}>
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.50' }}>
                    <TableCell>Employee</TableCell>
                    <TableCell>Progress</TableCell>
                    <TableCell align="center">Status</TableCell>
                    <TableCell align="center">Details</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {employees.map(emp => {
                    const stats = getEmpStats(emp.id);
                    const items = getEmpChecklists(emp.id);
                    const isExpanded = expandedEmp === emp.id;
                    return (
                      <React.Fragment key={emp.id}>
                        <TableRow hover>
                          <TableCell>
                            <Box display="flex" alignItems="center" gap={1}>
                              <Avatar sx={{ width: 28, height: 28, fontSize: 12, bgcolor: 'primary.main' }}>
                                {(emp.name || '?')[0]}
                              </Avatar>
                              <Typography variant="body2" fontWeight={600}>{emp.name}</Typography>
                            </Box>
                          </TableCell>
                          <TableCell>
                            {stats.total > 0 ? (
                              <Box minWidth={120}>
                                <Box display="flex" justifyContent="space-between" mb={0.5}>
                                  <Typography variant="caption">{stats.done}/{stats.total}</Typography>
                                  <Typography variant="caption">{stats.pct}%</Typography>
                                </Box>
                                <LinearProgress variant="determinate" value={stats.pct}
                                  color={stats.pct === 100 ? 'success' : stats.pct > 50 ? 'warning' : 'error'}
                                  sx={{ height: 6, borderRadius: 3 }} />
                              </Box>
                            ) : (
                              <Typography variant="caption" color="text.secondary">No checklists</Typography>
                            )}
                          </TableCell>
                          <TableCell align="center">
                            {stats.total === 0 ? (
                              <Chip label="N/A" size="small" />
                            ) : stats.pct === 100 ? (
                              <Chip icon={<CheckCircle sx={{ fontSize: 14 }} />} label="Complete" color="success" size="small" />
                            ) : (
                              <Chip icon={<RadioButtonUnchecked sx={{ fontSize: 14 }} />}
                                label={`${stats.total - stats.done} pending`} color="warning" size="small" />
                            )}
                          </TableCell>
                          <TableCell align="center">
                            {items.length > 0 && (
                              <IconButton size="small" onClick={() => setExpandedEmp(isExpanded ? null : emp.id)}>
                                {isExpanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                              </IconButton>
                            )}
                          </TableCell>
                        </TableRow>

                        {/* Expanded checklist items */}
                        {isExpanded && (
                          <TableRow>
                            <TableCell colSpan={4} sx={{ p: 0, bgcolor: 'grey.50' }}>
                              <Box sx={{ px: 3, py: 1.5 }}>
                                <Stack spacing={0.75}>
                                  {items.map(cl => (
                                    <Box key={cl.id} display="flex" alignItems="center" justifyContent="space-between"
                                      sx={{ p: 1.5, bgcolor: cl.completed ? 'success.50' : 'error.50',
                                            borderRadius: 1, border: '1px solid',
                                            borderColor: cl.completed ? 'success.200' : 'error.200' }}>
                                      <Box display="flex" alignItems="center" gap={1}>
                                        {cl.completed
                                          ? <CheckCircle color="success" fontSize="small" />
                                          : <RadioButtonUnchecked color="error" fontSize="small" />
                                        }
                                        <Typography variant="body2">{cl.templateTitle}</Typography>
                                      </Box>
                                      {cl.completed && cl.completedAt && (
                                        <Typography variant="caption" color="text.secondary">
                                          {formatTime(cl.completedAt)}
                                        </Typography>
                                      )}
                                    </Box>
                                  ))}
                                </Stack>
                              </Box>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination component="div" count={total} page={page}
              onPageChange={(_, p) => { setPage(p); if (p === 0) setCursorMap({}); }}
              rowsPerPage={PAGE_SIZE} rowsPerPageOptions={[PAGE_SIZE]} />
          </>
        )}
      </Card>
    </Box>
  );
};

// ── Monthly View ──────────────────────────────────────────────────────────────
const ChecklistMonthlyView = ({ db }) => {
  const now = new Date();
  const [selYear,   setSelYear]   = useState(now.getFullYear());
  const [selMonth,  setSelMonth]  = useState(now.getMonth());
  const [employees, setEmployees] = useState([]);
  const [instances, setInstances] = useState([]);  // {userId, date, completed, templateTitle}
  const [loading,   setLoading]   = useState(false);
  const [selEmp,    setSelEmp]    = useState('all');

  const daysInMonth = new Date(selYear, selMonth + 1, 0).getDate();
  const dayNums = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  useEffect(() => {
    if (!db) return;
    getDocs(query(collection(db, 'users'), where('role', '==', 'employee'), orderBy('name')))
      .then(snap => setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() })))).catch(() => {});
  }, [db]);

  useEffect(() => {
    if (!db) return;
    const load = async () => {
      setLoading(true);
      try {
        const startDate = `${selYear}-${String(selMonth + 1).padStart(2, '0')}-01`;
        const endDate   = `${selYear}-${String(selMonth + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
        const snap = await getDocs(
          query(collection(db, 'checklistInstances'),
            where('date', '>=', startDate),
            where('date', '<=', endDate)
          )
        );
        setInstances(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        toast.error('Failed: ' + e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [db, selYear, selMonth]);

  const getDayStats = (uid, day) => {
    const dateStr = `${selYear}-${String(selMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const items = instances.filter(i => i.userId === uid && i.date === dateStr);
    if (items.length === 0) return null;
    const done = items.filter(i => i.completed).length;
    return { total: items.length, done, pct: Math.round((done / items.length) * 100) };
  };

  const filteredEmployees = selEmp === 'all' ? employees : employees.filter(e => e.id === selEmp);

  const prevMonth = () => { if (selMonth === 0) { setSelYear(y => y-1); setSelMonth(11); } else setSelMonth(m => m-1); };
  const nextMonth = () => { if (selMonth === 11) { setSelYear(y => y+1); setSelMonth(0); } else setSelMonth(m => m+1); };

  return (
    <Box>
      {/* Controls */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2} flexWrap="wrap" gap={1}>
        <Stack direction="row" spacing={1} alignItems="center">
          <IconButton onClick={prevMonth}><ArrowBack /></IconButton>
          <Typography variant="h6" fontWeight={700} minWidth={140} textAlign="center">
            {MONTH_NAMES[selMonth]} {selYear}
          </Typography>
          <IconButton onClick={nextMonth}><ArrowForward /></IconButton>
        </Stack>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Filter Employee</InputLabel>
          <Select value={selEmp} label="Filter Employee" onChange={e => setSelEmp(e.target.value)}>
            <MenuItem value="all">All Employees</MenuItem>
            {employees.map(e => <MenuItem key={e.id} value={e.id}>{e.name}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>

      {/* Legend */}
      <Stack direction="row" spacing={1.5} mb={2} flexWrap="wrap">
        {[
          { label: '100% Done', bg: '#d1fae5', border: '#6ee7b7' },
          { label: 'Partial',   bg: '#fef3c7', border: '#fcd34d' },
          { label: 'Incomplete',bg: '#fee2e2', border: '#fca5a5' },
          { label: 'No tasks',  bg: 'transparent', border: '#e5e7eb' },
        ].map(l => (
          <Box key={l.label} display="flex" alignItems="center" gap={0.5}>
            <Box sx={{ width: 14, height: 14, borderRadius: 0.5, bgcolor: l.bg, border: `1px solid ${l.border}` }} />
            <Typography variant="caption">{l.label}</Typography>
          </Box>
        ))}
      </Stack>

      {loading ? (
        <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
      ) : (
        <Card>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 600 }}>
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell sx={{ position: 'sticky', left: 0, bgcolor: 'grey.50', zIndex: 1, minWidth: 130 }}>
                    Employee
                  </TableCell>
                  {dayNums.map(d => {
                    const date = new Date(selYear, selMonth, d);
                    const isSun = date.getDay() === 0;
                    return (
                      <TableCell key={d} align="center" sx={{ minWidth: 30, p: '4px 2px',
                        color: isSun ? 'error.main' : 'text.primary', fontWeight: 700, fontSize: 11 }}>
                        {d}
                      </TableCell>
                    );
                  })}
                  <TableCell align="center" sx={{ minWidth: 70, fontSize: 11 }}>Avg %</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredEmployees.map(emp => {
                  let totalPct = 0, daysWithTasks = 0;
                  const today = getTodayStr();
                  return (
                    <TableRow key={emp.id} hover>
                      <TableCell sx={{ position: 'sticky', left: 0, bgcolor: 'background.paper', zIndex: 1 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>{emp.name}</Typography>
                      </TableCell>
                      {dayNums.map(d => {
                        const dateStr = `${selYear}-${String(selMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                        const isFuture = dateStr > today;
                        const stats = getDayStats(emp.id, d);
                        if (stats) { totalPct += stats.pct; daysWithTasks++; }
                        const bg = !stats ? 'transparent'
                          : stats.pct === 100 ? '#d1fae5'
                          : stats.pct > 0    ? '#fef3c7'
                          :                    '#fee2e2';
                        return (
                          <TableCell key={d} align="center" sx={{ p: '2px', bgcolor: isFuture ? 'transparent' : bg }}>
                            {!isFuture && stats && (
                              <Tooltip title={`${stats.done}/${stats.total} (${stats.pct}%)`}>
                                <Typography variant="caption" fontWeight={700} sx={{ fontSize: 10 }}>
                                  {stats.pct === 100 ? '✓' : `${stats.pct}%`}
                                </Typography>
                              </Tooltip>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell align="center">
                        {daysWithTasks > 0 ? (
                          <Chip
                            label={`${Math.round(totalPct / daysWithTasks)}%`}
                            size="small"
                            color={Math.round(totalPct / daysWithTasks) >= 80 ? 'success' : 'warning'}
                            sx={{ fontSize: 11, height: 20 }}
                          />
                        ) : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}
    </Box>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────
const ChecklistAdminView = () => {
  const { db } = useAuth();
  const [tab, setTab] = useState(0);

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Box mb={3}>
        <Typography variant="h5" fontWeight={700}>Checklist Completion</Typography>
        <Typography variant="body2" color="text.secondary">
          Track daily and monthly checklist completion for all employees
        </Typography>
      </Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }} variant="scrollable" scrollButtons="auto">
        <Tab icon={<Today fontSize="small" />} iconPosition="start" label="Daily View" />
        <Tab icon={<CalendarMonth fontSize="small" />} iconPosition="start" label="Monthly Calendar" />
      </Tabs>
      {tab === 0 && <ChecklistDailyView db={db} />}
      {tab === 1 && <ChecklistMonthlyView db={db} />}
    </Box>
  );
};

export default ChecklistAdminView;