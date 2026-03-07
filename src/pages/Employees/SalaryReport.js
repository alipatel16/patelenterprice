// src/pages/Employees/SalaryReport.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Chip, Stack,
  CircularProgress, Avatar, Button, IconButton, Tooltip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, InputAdornment, Alert, Divider, LinearProgress,
  Accordion, AccordionSummary, AccordionDetails, Select, MenuItem,
  FormControl, InputLabel, useTheme, useMediaQuery,
} from '@mui/material';
import {
  ArrowBack, ArrowForward, Calculate, Delete, Edit, Save,
  ExpandMore, Refresh, AttachMoney, Warning, CheckCircle,
  Download, Info, Close,
} from '@mui/icons-material';
import {
  collection, query, where, getDocs, doc, getDoc,
  setDoc, updateDoc, serverTimestamp, orderBy,
  limit, startAfter, getCountFromServer,
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';
import { formatTime } from './employeeConstants';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const PAGE_SIZE = 10;

const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(n || 0);

// ── Core salary computation ───────────────────────────────────────────────────
function computeSalary(employee, attendanceLogs, settings, year, month) {
  const baseSalary = employee.salary || 0;

  const {
    expectedDailyHours      = 8,
    expectedLoginTime       = '09:30',
    expectedLogoutTime      = '18:30',
    lateArrivalThreshold    = 15,
    earlyDepartureThreshold = 15,
    hourlyDeductionRate     = 50,
    lateArrivalRate         = 0,
    earlyDepartureRate      = 0,
    freeLeavePerMonth       = 1,
    leavePenaltyAmount      = 200,
    leavePenaltyEnabled     = true,
    shortHoursPenaltyEnabled    = true,
    lateArrivalPenaltyEnabled   = true,
    earlyDeparturePenaltyEnabled = true,
  } = settings;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const [expLoginH, expLoginM] = expectedLoginTime.split(':').map(Number);
  const [expLogoutH, expLogoutM] = expectedLogoutTime.split(':').map(Number);
  const expLoginMins  = expLoginH  * 60 + expLoginM;
  const expLogoutMins = expLogoutH * 60 + expLogoutM;

  let totalWorkMinutes   = 0;
  let leaveCount         = 0;
  let presentDays        = 0;
  let lateCount          = 0;
  let earlyDepartureCount = 0;
  let shortHoursMins     = 0;
  let lateMinutes        = 0;
  let earlyMinutes       = 0;
  const breakdownByDay   = [];

  attendanceLogs.forEach(log => {
    if (log.status === 'leave') {
      leaveCount++;
      breakdownByDay.push({ date: log.date, type: 'leave', workMins: 0, late: false, early: false });
      return;
    }
    if (!log.loginTime || !log.logoutTime) return;

    presentDays++;
    const loginDate  = new Date(log.loginTime);
    const logoutDate = new Date(log.logoutTime);

    // Total break time
    const breakMins = (log.breaks || [])
      .filter(b => b.startTime && b.endTime)
      .reduce((s, b) => s + (new Date(b.endTime) - new Date(b.startTime)) / 60000, 0);

    const grossWorkMins = (logoutDate - loginDate) / 60000;
    const netWorkMins   = Math.max(0, grossWorkMins - breakMins);
    totalWorkMinutes   += netWorkMins;

    // Expected daily hours shortfall
    const expectedMins = expectedDailyHours * 60;
    if (netWorkMins < expectedMins) {
      shortHoursMins += (expectedMins - netWorkMins);
    }

    // Late arrival
    const loginMins = loginDate.getHours() * 60 + loginDate.getMinutes();
    const isLate    = loginMins > expLoginMins + lateArrivalThreshold;
    if (isLate) {
      lateCount++;
      lateMinutes += (loginMins - expLoginMins - lateArrivalThreshold);
    }

    // Early departure
    const logoutMins = logoutDate.getHours() * 60 + logoutDate.getMinutes();
    const isEarly    = logoutMins < expLogoutMins - earlyDepartureThreshold;
    if (isEarly) {
      earlyDepartureCount++;
      earlyMinutes += (expLogoutMins - earlyDepartureThreshold - logoutMins);
    }

    breakdownByDay.push({
      date: log.date,
      type: 'present',
      workMins: Math.round(netWorkMins),
      late: isLate,
      early: isEarly,
      loginTime: log.loginTime,
      logoutTime: log.logoutTime,
      breakMins: Math.round(breakMins),
    });
  });

  // ── Penalty Calculation ────────────────────────────────────────────────────
  const penalties = [];

  if (shortHoursPenaltyEnabled && shortHoursMins > 0) {
    const shortHrs = shortHoursMins / 60;
    const deduction = Math.round(shortHrs * hourlyDeductionRate);
    if (deduction > 0) {
      penalties.push({
        id: 'short_hours',
        type: 'Short Work Hours',
        description: `${shortHrs.toFixed(1)} hrs short across ${presentDays} working days`,
        amount: deduction,
        removed: false,
      });
    }
  }

  if (lateArrivalPenaltyEnabled && lateCount > 0) {
    const deduction = lateArrivalRate > 0
      ? Math.round(lateCount * lateArrivalRate)
      : Math.round((lateMinutes / 60) * hourlyDeductionRate);
    if (deduction > 0) {
      penalties.push({
        id: 'late_arrival',
        type: 'Late Arrivals',
        description: `${lateCount} late arrival${lateCount > 1 ? 's' : ''} (${Math.round(lateMinutes)} mins total)`,
        amount: deduction,
        removed: false,
      });
    }
  }

  if (earlyDeparturePenaltyEnabled && earlyDepartureCount > 0) {
    const deduction = earlyDepartureRate > 0
      ? Math.round(earlyDepartureCount * earlyDepartureRate)
      : Math.round((earlyMinutes / 60) * hourlyDeductionRate);
    if (deduction > 0) {
      penalties.push({
        id: 'early_departure',
        type: 'Early Departures',
        description: `${earlyDepartureCount} early departure${earlyDepartureCount > 1 ? 's' : ''} (${Math.round(earlyMinutes)} mins total)`,
        amount: deduction,
        removed: false,
      });
    }
  }

  if (leavePenaltyEnabled && leaveCount > freeLeavePerMonth) {
    const extraLeaves = leaveCount - freeLeavePerMonth;
    const deduction   = extraLeaves * leavePenaltyAmount;
    penalties.push({
      id: 'leave_excess',
      type: 'Excess Leaves',
      description: `${leaveCount} leaves (${freeLeavePerMonth} free, ${extraLeaves} penalised)`,
      amount: deduction,
      removed: false,
    });
  }

  const totalPenalties = penalties.filter(p => !p.removed).reduce((s, p) => s + p.amount, 0);
  const netSalary      = Math.max(0, baseSalary - totalPenalties);

  return {
    baseSalary,
    presentDays,
    leaveCount,
    lateCount,
    earlyDepartureCount,
    totalWorkMinutes: Math.round(totalWorkMinutes),
    penalties,
    totalPenalties,
    netSalary,
    breakdownByDay,
    daysInMonth,
  };
}

// ── Detail Dialog ─────────────────────────────────────────────────────────────
const SalaryDetailDialog = ({ open, onClose, report, onRemovePenalty, onRestorePenalty, saving }) => {
  if (!report) return null;
  const workHrs = Math.floor(report.totalWorkMinutes / 60);
  const workMin = report.totalWorkMinutes % 60;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box display="flex" alignItems="center" gap={1.5}>
            <Avatar sx={{ bgcolor: 'primary.main' }}>{(report.employeeName || '?')[0]}</Avatar>
            <Box>
              <Typography fontWeight={700}>{report.employeeName}</Typography>
              <Typography variant="caption" color="text.secondary">
                {MONTH_NAMES[report.month]} {report.year} Salary Report
              </Typography>
            </Box>
          </Box>
          <IconButton onClick={onClose}><Close /></IconButton>
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        {/* Summary grid */}
        <Grid container spacing={2} mb={3}>
          {[
            { label: 'Base Salary',   val: fmt(report.baseSalary),     color: 'text.primary' },
            { label: 'Present Days',  val: report.presentDays,          color: 'success.main' },
            { label: 'Leave Days',    val: report.leaveCount,            color: 'warning.main' },
            { label: 'Late Arrivals', val: report.lateCount,            color: 'error.main' },
            { label: 'Work Hours',    val: `${workHrs}h ${workMin}m`,   color: 'info.main' },
            { label: 'Total Penalty', val: fmt(report.totalPenalties),  color: 'error.main' },
          ].map(s => (
            <Grid item xs={6} sm={4} key={s.label}>
              <Box sx={{ p: 1.5, bgcolor: 'grey.50', borderRadius: 1, textAlign: 'center' }}>
                <Typography variant="h6" fontWeight={700} color={s.color}>{s.val}</Typography>
                <Typography variant="caption" color="text.secondary">{s.label}</Typography>
              </Box>
            </Grid>
          ))}
        </Grid>

        {/* Penalties */}
        <Typography variant="subtitle2" fontWeight={700} mb={1.5}>Penalty Breakdown</Typography>
        {report.penalties.length === 0 ? (
          <Alert severity="success" sx={{ mb: 2 }}>No penalties this month 🎉</Alert>
        ) : (
          <Stack spacing={1} mb={2}>
            {report.penalties.map(p => (
              <Box key={p.id} display="flex" alignItems="center" justifyContent="space-between"
                sx={{
                  p: 1.5, borderRadius: 1, border: '1px solid',
                  borderColor: p.removed ? 'success.200' : 'error.200',
                  bgcolor: p.removed ? 'success.50' : 'error.50',
                  opacity: p.removed ? 0.7 : 1,
                }}>
                <Box>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Typography variant="body2" fontWeight={700}
                      sx={{ textDecoration: p.removed ? 'line-through' : 'none' }}>
                      {p.type}
                    </Typography>
                    {p.removed && <Chip label="Waived" color="success" size="small" sx={{ height: 18, fontSize: 10 }} />}
                  </Box>
                  <Typography variant="caption" color="text.secondary">{p.description}</Typography>
                </Box>
                <Box display="flex" alignItems="center" gap={1}>
                  <Typography fontWeight={700} color={p.removed ? 'text.disabled' : 'error.main'}>
                    -{fmt(p.amount)}
                  </Typography>
                  <Tooltip title={p.removed ? 'Restore penalty' : 'Waive penalty'}>
                    <IconButton size="small"
                      onClick={() => p.removed ? onRestorePenalty(p.id) : onRemovePenalty(p.id)}
                      disabled={saving}>
                      {p.removed ? <CheckCircle color="success" fontSize="small" /> : <Delete color="error" fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
            ))}
          </Stack>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Net Salary */}
        <Box sx={{ p: 2, bgcolor: 'success.50', borderRadius: 1, border: '1px solid', borderColor: 'success.300' }}>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="subtitle1" fontWeight={700}>Net Salary</Typography>
            <Typography variant="h5" fontWeight={800} color="success.dark">{fmt(report.netSalary)}</Typography>
          </Box>
          <Typography variant="caption" color="text.secondary">
            {fmt(report.baseSalary)} base − {fmt(report.totalPenalties)} penalties
          </Typography>
        </Box>

        {/* Day-by-day breakdown (collapsible) */}
        {report.breakdownByDay?.length > 0 && (
          <Accordion sx={{ mt: 2 }} elevation={0}>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography variant="body2" fontWeight={600}>Day-by-Day Breakdown</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'grey.50' }}>
                      <TableCell>Date</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Login</TableCell>
                      <TableCell>Logout</TableCell>
                      <TableCell>Work</TableCell>
                      <TableCell>Flags</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {report.breakdownByDay.map((day, i) => (
                      <TableRow key={i} sx={{ bgcolor: day.type === 'leave' ? 'warning.50' : 'transparent' }}>
                        <TableCell>
                          <Typography variant="caption">{day.date}</Typography>
                        </TableCell>
                        <TableCell>
                          <Chip label={day.type === 'leave' ? 'Leave' : 'Present'} size="small"
                            color={day.type === 'leave' ? 'warning' : 'success'} />
                        </TableCell>
                        <TableCell>{day.loginTime ? formatTime(day.loginTime) : '—'}</TableCell>
                        <TableCell>{day.logoutTime ? formatTime(day.logoutTime) : '—'}</TableCell>
                        <TableCell>
                          {day.workMins > 0 ? `${Math.floor(day.workMins / 60)}h ${day.workMins % 60}m` : '—'}
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={0.5}>
                            {day.late  && <Chip label="Late"  color="error"   size="small" sx={{ height: 18, fontSize: 10 }} />}
                            {day.early && <Chip label="Early" color="warning" size="small" sx={{ height: 18, fontSize: 10 }} />}
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </AccordionDetails>
          </Accordion>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────
const SalaryReport = () => {
  const { db, storeType } = useAuth();
  const theme    = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const now = new Date();
  const [selYear,    setSelYear]    = useState(now.getFullYear());
  const [selMonth,   setSelMonth]   = useState(now.getMonth());
  const [employees,  setEmployees]  = useState([]);
  const [reports,    setReports]    = useState({});   // { uid: computedReport }
  const [dbReports,  setDbReports]  = useState({});   // { uid: saved overrides from Firestore }
  const [settings,   setSettings]   = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(0);
  const [cursorMap,  setCursorMap]  = useState({});
  const [detailReport, setDetailReport] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const settingsDocId = `penaltySettings_${storeType}`;

  // Load settings
  useEffect(() => {
    if (!db) return;
    getDoc(doc(db, 'appSettings', settingsDocId))
      .then(snap => setSettings(snap.exists() ? snap.data() : {}))
      .catch(() => setSettings({}));
  }, [db, settingsDocId]);

  // Count employees
  useEffect(() => {
    if (!db) return;
    getCountFromServer(query(collection(db, 'users'), where('role', '==', 'employee')))
      .then(s => setTotal(s.data().count)).catch(() => {});
  }, [db, refreshKey]);

  // Load employees page
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
        if (snap.docs.length > 0) {
          setCursorMap(prev => ({ ...prev, [page]: snap.docs[snap.docs.length - 1] }));
        }
        setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        toast.error('Load error: ' + e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [db, page, refreshKey]);

  // Load saved report overrides from Firestore
  useEffect(() => {
    if (!db || employees.length === 0) return;
    const uids = employees.map(e => e.id);
    const reportIds = uids.map(uid => `${uid}_${selYear}_${selMonth}`);
    Promise.all(reportIds.map(id => getDoc(doc(db, 'salaryReports', id))))
      .then(snaps => {
        const map = {};
        snaps.forEach(snap => {
          if (snap.exists()) {
            const data = snap.data();
            map[data.userId] = data;
          }
        });
        setDbReports(map);
      }).catch(() => {});
  }, [db, employees, selYear, selMonth, refreshKey]);

  // Generate reports from attendance data
  const generateReports = useCallback(async () => {
    if (!db || employees.length === 0 || !settings) return;
    setGenerating(true);
    try {
      const startDate = `${selYear}-${String(selMonth + 1).padStart(2, '0')}-01`;
      const daysInMonth = new Date(selYear, selMonth + 1, 0).getDate();
      const endDate   = `${selYear}-${String(selMonth + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
      const uids = employees.map(e => e.id);

      const logSnap = await getDocs(
        query(collection(db, 'attendanceLogs'),
          where('date', '>=', startDate),
          where('date', '<=', endDate),
          where('userId', 'in', uids)
        )
      );
      const logsByUid = {};
      logSnap.docs.forEach(d => {
        const data = d.data();
        if (!logsByUid[data.userId]) logsByUid[data.userId] = [];
        logsByUid[data.userId].push(data);
      });

      const computed = {};
      employees.forEach(emp => {
        const empLogs = logsByUid[emp.id] || [];
        computed[emp.id] = computeSalary(emp, empLogs, settings, selYear, selMonth);
      });
      setReports(computed);
    } catch (e) {
      toast.error('Failed to generate: ' + e.message);
    } finally {
      setGenerating(false);
    }
  }, [db, employees, settings, selYear, selMonth]);

  useEffect(() => {
    generateReports();
  }, [generateReports]);

  // Merge computed + db overrides
  const getMergedReport = (uid) => {
    const computed = reports[uid];
    if (!computed) return null;
    const saved = dbReports[uid];
    if (!saved) return { ...computed, userId: uid, employeeName: employees.find(e => e.id === uid)?.name || '', year: selYear, month: selMonth };
    // Merge penalties (preserve removed flags from saved)
    const mergedPenalties = computed.penalties.map(p => {
      const savedP = saved.penalties?.find(sp => sp.id === p.id);
      return savedP ? { ...p, removed: savedP.removed } : p;
    });
    const totalPenalties = mergedPenalties.filter(p => !p.removed).reduce((s, p) => s + p.amount, 0);
    return {
      ...computed,
      penalties: mergedPenalties,
      totalPenalties,
      netSalary: Math.max(0, computed.baseSalary - totalPenalties),
      userId: uid,
      employeeName: employees.find(e => e.id === uid)?.name || '',
      year: selYear,
      month: selMonth,
    };
  };

  const handleRemovePenalty = async (penaltyId) => {
    if (!detailReport) return;
    setSaving(true);
    try {
      const uid = detailReport.userId;
      const current = getMergedReport(uid);
      const updatedPenalties = current.penalties.map(p => p.id === penaltyId ? { ...p, removed: true } : p);
      const totalPenalties   = updatedPenalties.filter(p => !p.removed).reduce((s, p) => s + p.amount, 0);
      const netSalary        = Math.max(0, current.baseSalary - totalPenalties);

      await setDoc(doc(db, 'salaryReports', `${uid}_${selYear}_${selMonth}`), {
        userId: uid, year: selYear, month: selMonth,
        penalties: updatedPenalties, totalPenalties, netSalary,
        updatedAt: serverTimestamp(),
      });
      setDbReports(prev => ({
        ...prev,
        [uid]: { ...prev[uid], penalties: updatedPenalties, totalPenalties, netSalary, userId: uid },
      }));
      setDetailReport(prev => ({
        ...prev,
        penalties: updatedPenalties, totalPenalties, netSalary,
      }));
      toast.success('Penalty waived!');
    } catch (e) {
      toast.error('Failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRestorePenalty = async (penaltyId) => {
    if (!detailReport) return;
    setSaving(true);
    try {
      const uid = detailReport.userId;
      const current = getMergedReport(uid);
      const updatedPenalties = current.penalties.map(p => p.id === penaltyId ? { ...p, removed: false } : p);
      const totalPenalties   = updatedPenalties.filter(p => !p.removed).reduce((s, p) => s + p.amount, 0);
      const netSalary        = Math.max(0, current.baseSalary - totalPenalties);

      await setDoc(doc(db, 'salaryReports', `${uid}_${selYear}_${selMonth}`), {
        userId: uid, year: selYear, month: selMonth,
        penalties: updatedPenalties, totalPenalties, netSalary,
        updatedAt: serverTimestamp(),
      });
      setDbReports(prev => ({
        ...prev,
        [uid]: { ...prev[uid], penalties: updatedPenalties, totalPenalties, netSalary, userId: uid },
      }));
      setDetailReport(prev => ({
        ...prev,
        penalties: updatedPenalties, totalPenalties, netSalary,
      }));
      toast.success('Penalty restored');
    } catch (e) {
      toast.error('Failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const prevMonth = () => { if (selMonth === 0) { setSelYear(y => y-1); setSelMonth(11); } else setSelMonth(m => m-1); };
  const nextMonth = () => { if (selMonth === 11) { setSelYear(y => y+1); setSelMonth(0); } else setSelMonth(m => m+1); };

  // Summary totals
  const summaryTotal = employees.reduce((acc, emp) => {
    const r = getMergedReport(emp.id);
    if (!r) return acc;
    return {
      base:    acc.base + r.baseSalary,
      penalty: acc.penalty + r.totalPenalties,
      net:     acc.net + r.netSalary,
    };
  }, { base: 0, penalty: 0, net: 0 });

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* Header */}
      <Box display="flex" alignItems={{ xs: 'flex-start', sm: 'center' }}
        flexDirection={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between" gap={2} mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Salary Report</Typography>
          <Typography variant="body2" color="text.secondary">
            Monthly salary with auto-computed penalties
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <IconButton onClick={prevMonth}><ArrowBack /></IconButton>
          <Typography variant="h6" fontWeight={700} minWidth={170} textAlign="center">
            {MONTH_NAMES[selMonth]} {selYear}
          </Typography>
          <IconButton onClick={nextMonth}><ArrowForward /></IconButton>
          <Tooltip title="Refresh & recalculate">
            <IconButton onClick={() => { setPage(0); setCursorMap({}); setRefreshKey(k => k+1); }}>
              <Refresh />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={2} mb={3}>
        {[
          { label: 'Total Base Salary',   val: fmt(summaryTotal.base),    color: 'primary' },
          { label: 'Total Penalties',     val: fmt(summaryTotal.penalty), color: 'error' },
          { label: 'Total Net Payable',   val: fmt(summaryTotal.net),     color: 'success' },
        ].map(s => (
          <Grid item xs={12} sm={4} key={s.label}>
            <Card>
              <CardContent sx={{ py: '12px !important' }}>
                <Typography variant="h5" fontWeight={800} color={`${s.color}.main`}>{s.val}</Typography>
                <Typography variant="caption" color="text.secondary">{s.label}</Typography>
                <Typography variant="caption" display="block" color="text.disabled">
                  {MONTH_NAMES[selMonth]} {selYear} · {employees.length} employees
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {(generating || loading) && <LinearProgress sx={{ mb: 2 }} />}

      {/* Table */}
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
                    <TableCell align="center">Present</TableCell>
                    {!isMobile && <TableCell align="center">Leave</TableCell>}
                    {!isMobile && <TableCell align="center">Flags</TableCell>}
                    <TableCell align="right">Base Salary</TableCell>
                    <TableCell align="right">Penalty</TableCell>
                    <TableCell align="right">Net Salary</TableCell>
                    <TableCell align="center">Details</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {employees.map(emp => {
                    const r = getMergedReport(emp.id);
                    if (!r) return null;
                    const hasWaived = r.penalties.some(p => p.removed);
                    return (
                      <TableRow key={emp.id} hover>
                        <TableCell>
                          <Box display="flex" alignItems="center" gap={1.5}>
                            <Avatar sx={{ width: 32, height: 32, fontSize: 13, bgcolor: 'primary.main' }}>
                              {(emp.name || '?')[0]}
                            </Avatar>
                            <Box>
                              <Typography variant="body2" fontWeight={600}>{emp.name}</Typography>
                              {isMobile && (
                                <Typography variant="caption" color="text.secondary">
                                  {r.presentDays}d present · {r.leaveCount}d leave
                                </Typography>
                              )}
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell align="center">
                          <Chip label={r.presentDays} color="success" size="small" />
                        </TableCell>
                        {!isMobile && (
                          <TableCell align="center">
                            <Chip label={r.leaveCount} color={r.leaveCount > 0 ? 'warning' : 'default'} size="small" />
                          </TableCell>
                        )}
                        {!isMobile && (
                          <TableCell align="center">
                            <Stack direction="row" spacing={0.5} justifyContent="center">
                              {r.lateCount > 0 && (
                                <Chip label={`${r.lateCount}L`} color="error" size="small" sx={{ height: 20, fontSize: 10 }} />
                              )}
                              {r.earlyDepartureCount > 0 && (
                                <Chip label={`${r.earlyDepartureCount}E`} color="warning" size="small" sx={{ height: 20, fontSize: 10 }} />
                              )}
                              {r.lateCount === 0 && r.earlyDepartureCount === 0 && (
                                <CheckCircle color="success" fontSize="small" />
                              )}
                            </Stack>
                          </TableCell>
                        )}
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={600}>{fmt(r.baseSalary)}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Box>
                            <Typography variant="body2" fontWeight={600}
                              color={r.totalPenalties > 0 ? 'error.main' : 'text.primary'}>
                              {r.totalPenalties > 0 ? `-${fmt(r.totalPenalties)}` : '—'}
                            </Typography>
                            {hasWaived && (
                              <Typography variant="caption" color="success.main">some waived</Typography>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={800} color="success.dark">
                            {fmt(r.netSalary)}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Button size="small" variant="outlined"
                            onClick={() => setDetailReport(getMergedReport(emp.id))}>
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
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

      {/* Detail Dialog */}
      <SalaryDetailDialog
        open={!!detailReport}
        onClose={() => setDetailReport(null)}
        report={detailReport}
        onRemovePenalty={handleRemovePenalty}
        onRestorePenalty={handleRestorePenalty}
        saving={saving}
      />
    </Box>
  );
};

export default SalaryReport;