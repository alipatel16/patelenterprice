// src/pages/Employees/AttendanceTracker.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Chip, Stack,
  CircularProgress, Tab, Tabs, Avatar, Button, IconButton,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, Select, MenuItem, FormControl, InputLabel,
  Dialog, DialogTitle, DialogContent, DialogActions, Tooltip,
  useTheme, useMediaQuery, Divider,
} from '@mui/material';
import {
  Today, CalendarMonth, Refresh, ArrowBack, ArrowForward,
  CheckCircle, Cancel, HourglassEmpty, BeachAccess, AccessTime,
} from '@mui/icons-material';
import {
  collection, query, where, getDocs, orderBy, doc, getDoc,
  limit, startAfter, getCountFromServer, writeBatch,
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';
import { formatTime, formatDuration, getTodayStr } from './employeeConstants';

const PAGE_SIZE = 15;

const STATUS_CONFIG = {
  present:  { label: 'Present',        color: 'success', icon: <CheckCircle sx={{ fontSize: 14 }} /> },
  leave:    { label: 'On Leave',        color: 'warning', icon: <BeachAccess sx={{ fontSize: 14 }} /> },
  absent:   { label: 'Not Checked In',  color: 'error',   icon: <Cancel sx={{ fontSize: 14 }} /> },
  working:  { label: 'Working',         color: 'info',    icon: <HourglassEmpty sx={{ fontSize: 14 }} /> },
};

const getMonthDays = (year, month) => new Date(year, month + 1, 0).getDate();
const MONTH_NAMES  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ─────────────────────────────────────────────────────────────────────────────
// Auto-fill: for every attendanceLog in the current month where loginTime is
// set but logoutTime is null AND the date is strictly before today, write
// logoutTime = that date at 20:00:00 local time.
// Called once when the daily view mounts / refreshes.
// ─────────────────────────────────────────────────────────────────────────────
async function autoFillMissingLogouts(db) {
  const today = getTodayStr();
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth();

  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;

  try {
    // Fetch all logs this month that have loginTime but no logoutTime
    // and are not a leave status, and are before today
    const snap = await getDocs(
      query(
        collection(db, 'attendanceLogs'),
        where('date', '>=', monthStart),
        where('date', '<',  today),       // strictly before today
      )
    );

    const docsToFix = snap.docs.filter(d => {
      const data = d.data();
      return (
        data.loginTime &&          // has a clock-in
        !data.logoutTime &&        // no clock-out yet
        data.status !== 'leave'    // not a leave entry
      );
    });

    if (docsToFix.length === 0) return;

    // Firestore writeBatch supports up to 500 ops
    const batch = writeBatch(db);

    docsToFix.forEach(docSnap => {
      const data  = docSnap.data();
      const date  = data.date;                          // "YYYY-MM-DD"
      const [y, m, d] = date.split('-').map(Number);

      // Build ISO string for 20:00:00 local time on that date
      const logoutDate  = new Date(y, m - 1, d, 20, 0, 0, 0);
      const logoutISO   = logoutDate.toISOString();

      // Also close any open break that was left active
      const breaks = (data.breaks || []).map(b =>
        b.startTime && !b.endTime
          ? { ...b, endTime: logoutISO }
          : b
      );

      batch.update(docSnap.ref, {
        logoutTime:     logoutISO,
        logoutLocation: null,          // no location — auto-filled
        autoFilledLogout: true,        // flag so admin knows it was auto-filled
        breaks,
        updatedAt: logoutISO,
      });
    });

    await batch.commit();

    if (docsToFix.length > 0) {
      toast.info(
        `Auto-filled logout (8:00 PM) for ${docsToFix.length} incomplete day${docsToFix.length > 1 ? 's' : ''}`,
        { autoClose: 4000 }
      );
    }
  } catch (e) {
    // Non-critical — log silently; don't block the UI
    console.warn('[autoFillMissingLogouts]', e.message);
  }
}

// ── Daily Status Card ─────────────────────────────────────────────────────────
const AttendanceDailyView = ({ db }) => {
  const [employees,  setEmployees]  = useState([]);
  const [logs,       setLogs]       = useState({});
  const [loading,    setLoading]    = useState(false);
  const [page,       setPage]       = useState(0);
  const [total,      setTotal]      = useState(0);
  const [cursorMap,  setCursorMap]  = useState({});
  const [detailEmp,  setDetailEmp]  = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const theme    = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const today = getTodayStr();

  // ── Auto-fill missing logouts ONCE per mount/refresh ──────────────────────
  useEffect(() => {
    if (!db) return;
    autoFillMissingLogouts(db);
  }, [db, refreshKey]);   // re-runs on manual refresh too

  // ── Count ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!db) return;
    getCountFromServer(query(collection(db, 'users'), where('role', '==', 'employee')))
      .then(s => setTotal(s.data().count)).catch(() => {});
  }, [db, refreshKey]);

  // ── Load page ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!db) return;
    const load = async () => {
      setLoading(true);
      try {
        let q;
        if (page === 0) {
          q = query(collection(db, 'users'), where('role', '==', 'employee'), orderBy('name'), limit(PAGE_SIZE));
        } else {
          const cursor = cursorMap[page - 1];
          if (!cursor) return;
          q = query(collection(db, 'users'), where('role', '==', 'employee'), orderBy('name'), startAfter(cursor), limit(PAGE_SIZE));
        }
        const snap = await getDocs(q);
        const emps = snap.docs.map(d => ({ id: d.id, ...d.data(), _snap: d }));
        if (snap.docs.length > 0) {
          setCursorMap(prev => ({ ...prev, [page]: snap.docs[snap.docs.length - 1] }));
        }
        setEmployees(emps);

        // Load today's attendance for these employees
        const uids = emps.map(e => e.id);
        if (uids.length > 0) {
          const logSnap = await getDocs(
            query(collection(db, 'attendanceLogs'),
              where('date', '==', today),
              where('userId', 'in', uids)
            )
          );
          const logMap = {};
          logSnap.docs.forEach(d => { logMap[d.data().userId] = { id: d.id, ...d.data() }; });
          setLogs(logMap);
        }
      } catch (e) {
        toast.error('Failed to load: ' + e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [db, page, today, refreshKey]);

  const getStatus = (emp) => {
    const log = logs[emp.id];
    if (!log) return 'absent';
    if (log.status === 'leave') return 'leave';
    if (log.logoutTime) return 'present';
    return 'working';
  };

  const summaryStats = () => {
    const present = employees.filter(e => getStatus(e) === 'present').length;
    const working = employees.filter(e => getStatus(e) === 'working').length;
    const leave   = employees.filter(e => getStatus(e) === 'leave').length;
    const absent  = employees.filter(e => getStatus(e) === 'absent').length;
    return { present, working, leave, absent };
  };

  const stats = summaryStats();

  return (
    <Box>
      {/* Summary Cards */}
      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Present',          val: stats.present + stats.working, color: 'success.main', bg: 'success.50' },
          { label: 'On Leave',         val: stats.leave,                   color: 'warning.main', bg: 'warning.50' },
          { label: 'Not Checked In',   val: stats.absent,                  color: 'error.main',   bg: 'error.50'   },
        ].map(s => (
          <Grid item xs={4} key={s.label}>
            <Card sx={{ bgcolor: s.bg, border: '1px solid', borderColor: s.color, textAlign: 'center' }}>
              <CardContent sx={{ py: '12px !important' }}>
                <Typography variant="h4" fontWeight={800} color={s.color}>{s.val}</Typography>
                <Typography variant="caption" color="text.secondary">{s.label}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Card>
        <Box display="flex" alignItems="center" justifyContent="space-between" px={2} pt={2} pb={1}>
          <Typography variant="subtitle1" fontWeight={700}>
            Today — {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </Typography>
          <IconButton size="small" onClick={() => { setPage(0); setCursorMap({}); setRefreshKey(k => k + 1); }}>
            <Refresh fontSize="small" />
          </IconButton>
        </Box>

        {loading ? (
          <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
        ) : (
          <>
            <TableContainer>
              <Table size={isMobile ? 'small' : 'medium'}>
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.50' }}>
                    <TableCell>Employee</TableCell>
                    <TableCell>Status</TableCell>
                    {!isMobile && <TableCell>Login</TableCell>}
                    {!isMobile && <TableCell>Logout</TableCell>}
                    {!isMobile && <TableCell>Breaks</TableCell>}
                    <TableCell align="center">Details</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {employees.map(emp => {
                    const log    = logs[emp.id];
                    const status = getStatus(emp);
                    const sc     = STATUS_CONFIG[status];
                    const breaks = log?.breaks || [];
                    const totalBreakMins = breaks
                      .filter(b => b.startTime && b.endTime)
                      .reduce((sum, b) => sum + (new Date(b.endTime) - new Date(b.startTime)) / 60000, 0);
                    return (
                      <TableRow key={emp.id} hover>
                        <TableCell>
                          <Box display="flex" alignItems="center" gap={1}>
                            <Avatar sx={{ width: 30, height: 30, fontSize: 12, bgcolor: 'primary.main' }}>
                              {(emp.name || '?')[0]}
                            </Avatar>
                            <Box>
                              <Typography variant="body2" fontWeight={600}>{emp.name}</Typography>
                              {isMobile && log && (
                                <Typography variant="caption" color="text.secondary">
                                  {formatTime(log.loginTime)} – {log.logoutTime ? formatTime(log.logoutTime) : 'Active'}
                                </Typography>
                              )}
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Chip icon={sc.icon} label={sc.label} color={sc.color} size="small" />
                        </TableCell>
                        {!isMobile && <TableCell>{log ? formatTime(log.loginTime) : '—'}</TableCell>}
                        {!isMobile && (
                          <TableCell>
                            {log?.logoutTime ? (
                              <Box display="flex" alignItems="center" gap={0.5}>
                                {formatTime(log.logoutTime)}
                                {log.autoFilledLogout && (
                                  <Tooltip title="Auto-filled: employee did not clock out">
                                    <Chip label="Auto" size="small" color="warning"
                                      sx={{ height: 16, fontSize: 9, '& .MuiChip-label': { px: 0.75 } }} />
                                  </Tooltip>
                                )}
                              </Box>
                            ) : '—'}
                          </TableCell>
                        )}
                        {!isMobile && (
                          <TableCell>
                            {breaks.length > 0 ? (
                              <Tooltip title={breaks.map((b, i) =>
                                `Break ${i + 1}: ${formatTime(b.startTime)} – ${b.endTime ? formatTime(b.endTime) : 'Active'}`
                              ).join('\n')}>
                                <Chip label={`${breaks.length} · ${Math.round(totalBreakMins)}m`}
                                  size="small" variant="outlined" />
                              </Tooltip>
                            ) : '—'}
                          </TableCell>
                        )}
                        <TableCell align="center">
                          {log && (
                            <Button size="small" variant="text"
                              onClick={() => setDetailEmp({ emp, log })}>
                              View
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div" count={total} page={page}
              onPageChange={(_, p) => { setPage(p); if (p === 0) setCursorMap({}); }}
              rowsPerPage={PAGE_SIZE} rowsPerPageOptions={[PAGE_SIZE]}
            />
          </>
        )}
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!detailEmp} onClose={() => setDetailEmp(null)} maxWidth="sm" fullWidth>
        {detailEmp && (
          <>
            <DialogTitle>
              <Box display="flex" alignItems="center" gap={2}>
                <Avatar sx={{ bgcolor: 'primary.main' }}>{detailEmp.emp.name[0]}</Avatar>
                <Box>
                  <Typography fontWeight={700}>{detailEmp.emp.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(detailEmp.log.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </Typography>
                </Box>
                {detailEmp.log.autoFilledLogout && (
                  <Chip label="Auto-Logout Applied" color="warning" size="small" />
                )}
              </Box>
            </DialogTitle>
            <DialogContent>
              {detailEmp.log.autoFilledLogout && (
                <Box mb={2} p={1.5} sx={{ bgcolor: 'warning.50', borderRadius: 1, border: '1px solid', borderColor: 'warning.200' }}>
                  <Typography variant="caption" color="warning.dark">
                    ⚠️ Logout was auto-filled at 8:00 PM because the employee did not clock out.
                  </Typography>
                </Box>
              )}
              <Grid container spacing={2} mb={2}>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Clock In</Typography>
                  <Typography fontWeight={600}>{formatTime(detailEmp.log.loginTime)}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Clock Out</Typography>
                  <Typography fontWeight={600}>
                    {detailEmp.log.logoutTime ? formatTime(detailEmp.log.logoutTime) : 'Still Active'}
                  </Typography>
                </Grid>
                {detailEmp.log.loginTime && detailEmp.log.logoutTime && (
                  <Grid item xs={12}>
                    <Typography variant="caption" color="text.secondary">Total Duration</Typography>
                    <Typography fontWeight={600}>
                      {formatDuration(detailEmp.log.loginTime, detailEmp.log.logoutTime)}
                    </Typography>
                  </Grid>
                )}
              </Grid>
              {detailEmp.log.breaks?.length > 0 && (
                <>
                  <Divider sx={{ my: 1.5 }} />
                  <Typography variant="subtitle2" fontWeight={700} mb={1}>Breaks</Typography>
                  <Stack spacing={1}>
                    {detailEmp.log.breaks.map((b, i) => (
                      <Box key={i} display="flex" justifyContent="space-between" alignItems="center"
                        sx={{ p: 1, bgcolor: 'grey.50', borderRadius: 1 }}>
                        <Typography variant="body2">Break {i + 1}</Typography>
                        <Typography variant="body2">
                          {formatTime(b.startTime)} – {b.endTime ? formatTime(b.endTime) : 'Active'}
                          {b.startTime && b.endTime && ` (${formatDuration(b.startTime, b.endTime)})`}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                </>
              )}
              {detailEmp.log.leaveReason && (
                <Box mt={2} p={1.5} bgcolor="warning.50" borderRadius={1}>
                  <Typography variant="body2">
                    <strong>Leave Reason:</strong> {detailEmp.log.leaveReason}
                  </Typography>
                </Box>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDetailEmp(null)}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};

// ── Monthly Calendar View ─────────────────────────────────────────────────────
const AttendanceMonthlyView = ({ db }) => {
  const now = new Date();
  const [selYear,   setSelYear]   = useState(now.getFullYear());
  const [selMonth,  setSelMonth]  = useState(now.getMonth());
  const [employees, setEmployees] = useState([]);
  const [logMap,    setLogMap]    = useState({});  // { "uid_YYYY-MM-DD": log }
  const [loading,   setLoading]   = useState(false);
  const [selEmp,    setSelEmp]    = useState('all');
  const theme    = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  useEffect(() => {
    if (!db) return;
    getDocs(query(collection(db, 'users'), where('role', '==', 'employee'), orderBy('name')))
      .then(snap => setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {});
  }, [db]);

  useEffect(() => {
    if (!db) return;
    const load = async () => {
      setLoading(true);
      try {
        const startDate   = `${selYear}-${String(selMonth + 1).padStart(2, '0')}-01`;
        const daysInMonth = getMonthDays(selYear, selMonth);
        const endDate     = `${selYear}-${String(selMonth + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

        const snap = await getDocs(
          query(collection(db, 'attendanceLogs'),
            where('date', '>=', startDate),
            where('date', '<=', endDate)
          )
        );
        const map = {};
        snap.docs.forEach(d => {
          const data = d.data();
          map[`${data.userId}_${data.date}`] = { id: d.id, ...data };
        });
        setLogMap(map);
      } catch (e) {
        toast.error('Failed: ' + e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [db, selYear, selMonth]);

  const daysInMonth = getMonthDays(selYear, selMonth);
  const dayNums     = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const prevMonth = () => {
    if (selMonth === 0) { setSelYear(y => y - 1); setSelMonth(11); }
    else setSelMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (selMonth === 11) { setSelYear(y => y + 1); setSelMonth(0); }
    else setSelMonth(m => m + 1);
  };

  const getCellColor = (log) => {
    if (!log) return { bg: 'transparent', text: 'text.disabled' };
    if (log.status === 'leave') return { bg: 'warning.100', text: 'warning.dark' };
    if (log.logoutTime) return { bg: 'success.100', text: 'success.dark' };
    return { bg: 'info.100', text: 'info.dark' };
  };

  const getCellLabel = (log) => {
    if (!log) return '';
    if (log.status === 'leave') return 'L';
    if (log.logoutTime) return 'P';
    return 'W';
  };

  const filteredEmployees = selEmp === 'all' ? employees : employees.filter(e => e.id === selEmp);

  return (
    <Box>
      {/* Controls */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2} flexWrap="wrap" gap={1}>
        <Box display="flex" alignItems="center" gap={1}>
          <IconButton onClick={prevMonth}><ArrowBack /></IconButton>
          <Typography variant="h6" fontWeight={700} minWidth={140} textAlign="center">
            {MONTH_NAMES[selMonth]} {selYear}
          </Typography>
          <IconButton onClick={nextMonth}><ArrowForward /></IconButton>
        </Box>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Filter Employee</InputLabel>
          <Select value={selEmp} label="Filter Employee" onChange={e => setSelEmp(e.target.value)}>
            <MenuItem value="all">All Employees</MenuItem>
            {employees.map(e => (
              <MenuItem key={e.id} value={e.id}>{e.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* Legend */}
      <Stack direction="row" spacing={1.5} mb={2} flexWrap="wrap">
        {[
          { label: 'Present', bg: 'success.100', text: 'success.dark' },
          { label: 'Working', bg: 'info.100',    text: 'info.dark' },
          { label: 'Leave',   bg: 'warning.100', text: 'warning.dark' },
          { label: 'Absent',  bg: 'grey.100',    text: 'text.disabled' },
        ].map(l => (
          <Box key={l.label} display="flex" alignItems="center" gap={0.5}>
            <Box sx={{ width: 14, height: 14, borderRadius: 0.5, bgcolor: l.bg }} />
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
                    const isSat = date.getDay() === 6;
                    return (
                      <TableCell key={d} align="center"
                        sx={{
                          minWidth: 34, p: '4px 2px',
                          color: (isSun || isSat) ? 'error.main' : 'text.primary',
                          fontWeight: 700,
                        }}>
                        <Box>{d}</Box>
                        <Box sx={{ fontSize: 9, fontWeight: 400, color: 'text.secondary' }}>
                          {['Su','Mo','Tu','We','Th','Fr','Sa'][date.getDay()]}
                        </Box>
                      </TableCell>
                    );
                  })}
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredEmployees.map(emp => {
                  return (
                    <TableRow key={emp.id} hover>
                      <TableCell sx={{ position: 'sticky', left: 0, bgcolor: 'background.paper', zIndex: 1 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>{emp.name}</Typography>
                      </TableCell>
                      {dayNums.map(d => {
                        const dateStr = `${selYear}-${String(selMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                        const log     = logMap[`${emp.id}_${dateStr}`];
                        const { bg, text } = getCellColor(log);
                        const label   = getCellLabel(log);
                        const isFuture = dateStr > getTodayStr();
                        return (
                          <TableCell key={d} align="center"
                            sx={{ p: '2px', bgcolor: isFuture ? 'transparent' : bg }}>
                            {!isFuture && label && (
                              <Tooltip
                                title={
                                  log
                                    ? `${formatTime(log.loginTime)} – ${log.logoutTime ? formatTime(log.logoutTime) : 'Active'}${log.autoFilledLogout ? ' (auto-filled)' : ''}`
                                    : ''
                                }>
                                <Typography variant="caption" fontWeight={700} color={text}
                                  sx={{
                                    fontSize: 11,
                                    // faint underline to indicate auto-filled logout
                                    textDecoration: log?.autoFilledLogout ? 'underline dotted' : 'none',
                                  }}>
                                  {label}
                                </Typography>
                              </Tooltip>
                            )}
                          </TableCell>
                        );
                      })}
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

// ── Main Component ─────────────────────────────────────────────────────────────
const AttendanceTracker = () => {
  const { db } = useAuth();
  const [tab, setTab] = useState(0);

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Box mb={3}>
        <Typography variant="h5" fontWeight={700}>Attendance Tracker</Typography>
        <Typography variant="body2" color="text.secondary">
          Monitor daily attendance and view monthly history
        </Typography>
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}
        variant="scrollable" scrollButtons="auto">
        <Tab icon={<Today fontSize="small" />} iconPosition="start" label="Daily View" />
        <Tab icon={<CalendarMonth fontSize="small" />} iconPosition="start" label="Monthly Calendar" />
      </Tabs>

      {tab === 0 && <AttendanceDailyView db={db} />}
      {tab === 1 && <AttendanceMonthlyView db={db} />}
    </Box>
  );
};

export default AttendanceTracker;