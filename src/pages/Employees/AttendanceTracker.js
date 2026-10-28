import QueryStatus from '../../components/QueryStatus';
import { getKnownSnapshot as getDoc } from './employeeData';
import usePagedCollection from '../../hooks/usePagedCollection';
import EmployeePageControls from './EmployeePageControls';
import { employeeQuery, loadAttendanceMonths } from './employeeData';
import { updateRecord } from '../../data/writes';
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
import { where, doc } from 'firebase/firestore';
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
async function autoFillMissingLogouts(db, logsByUser) {
  const today = getTodayStr();
  const pending = Object.values(logsByUser).flat().filter(log => log.date < today && log.loginTime && !log.logoutTime && log.status !== 'leave');
  // One visible page contains at most 15 × 31 day summaries. Apply a bounded
  // batch per refresh; later visits resume naturally from the source summaries.
  for (const log of pending.slice(0, 15)) {
    const [y, m, d] = log.date.split('-').map(Number);
    const logoutISO = new Date(y, m - 1, d, 20, 0, 0, 0).toISOString();
    await updateRecord(doc(db, 'attendanceLogs', log.id), {
      logoutTime: logoutISO, logoutLocation: null, autoFilledLogout: true,
      breaks: (log.breaks || []).map(b => b.startTime && !b.endTime ? { ...b, endTime: logoutISO } : b), updatedAt: logoutISO,
    });
  }
  if (pending.length) toast.info(`Auto-filled ${Math.min(15, pending.length)} logouts for this page${pending.length > 15 ? '; refresh to continue' : ''}`);
}

// ── Daily Status Card ─────────────────────────────────────────────────────────
const AttendanceDailyView = ({ db }) => {
  const [search, setSearch] = useState('');
  const employeePage = usePagedCollection(db, 'users', employeeQuery(search));
  const { rows: employees, page, total, setPage, refresh } = employeePage;
  const [logs,       setLogs]       = useState({});
  const [summaryError, setSummaryError] = useState(null);
  const [loading,    setLoading]    = useState(false);



  const [detailEmp,  setDetailEmp]  = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const theme    = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const today = getTodayStr();

  useEffect(() => {
    if (!db) return;
    let active = true;
    setLogs({}); setSummaryError(null); setLoading(true);
    loadAttendanceMonths(db, employees.map(e => e.id), today.slice(0, 7))
      .then(async months => {
        if (!active) return;
        setLogs(Object.fromEntries(employees.map(e => [e.id, months[e.id]?.find(day => day.date === today)])));
        await autoFillMissingLogouts(db, months);
      }).catch(e => { if (active) setSummaryError(e); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [db, employees, today, refreshKey]);

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

  if (summaryError) return <Box><EmployeePageControls search={search} setSearch={setSearch} result={employeePage} /><QueryStatus error={summaryError} loading={false} /><Button onClick={() => window.location.reload()}>Reload summaries</Button></Box>;
  return (
    <Box>
      <EmployeePageControls search={search} setSearch={setSearch} result={employeePage} />
      <Typography variant="caption">Status totals cover this employee page.</Typography>
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
          <IconButton size="small" onClick={() => { setPage(0); refresh(); setRefreshKey(k => k + 1); }}>
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
              component="div" count={total ?? -1} page={page}
              onPageChange={(_, p) => { setPage(p); if (p === 0) refresh(); }}
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
  const [search, setSearch] = useState('');
  const employeePage = usePagedCollection(db, 'users', employeeQuery(search));
  const employees = employeePage.rows;
  const [logMap,    setLogMap]    = useState({});  // { "uid_YYYY-MM-DD": log }
  const [summaryError, setSummaryError] = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [selEmp,    setSelEmp]    = useState('all');
  const theme    = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  useEffect(() => {
    if (!db) return;
    let active = true;
    setLogMap({}); setSummaryError(null); setLoading(true);
    loadAttendanceMonths(db, employees.map(e => e.id), `${selYear}-${String(selMonth + 1).padStart(2, '0')}`)
      .then(months => { if (active) setLogMap(Object.fromEntries(Object.entries(months).flatMap(([uid, days]) => days.map(log => [`${uid}_${log.date}`, log])))); })
      .catch(e => { if (active) setSummaryError(e); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [db, employees, selYear, selMonth]);

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

  if (summaryError) return <Box><EmployeePageControls search={search} setSearch={setSearch} result={employeePage} /><QueryStatus error={summaryError} loading={false} /><Button onClick={() => window.location.reload()}>Reload summaries</Button></Box>;
  return (
    <Box>
      <EmployeePageControls search={search} setSearch={setSearch} result={employeePage} />
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
                                    ? [
                                        `${formatTime(log.loginTime)} – ${log.logoutTime ? formatTime(log.logoutTime) : 'Active'}${log.autoFilledLogout ? ' (auto-filled)' : ''}`,
                                        ...(log.breaks?.length > 0
                                          ? log.breaks.map((b, i) =>
                                              `Break ${i + 1}: ${formatTime(b.startTime)} – ${b.endTime ? formatTime(b.endTime) : 'Active'}`
                                            )
                                          : [])
                                      ].join('\n')
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