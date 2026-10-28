import { computeSalary } from './payroll';
import { getKnownSnapshot as getDoc } from './employeeData';
import usePagedCollection from '../../hooks/usePagedCollection';
import QueryStatus from '../../components/QueryStatus';
import { employeeQuery, loadAttendanceMonths, mergePayrollWaivers } from './employeeData';
import { updateRecord as updateDoc, setRecord as setDoc } from '../../data/writes';
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
import { doc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';
import { formatTime } from './employeeConstants';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const PAGE_SIZE = 15;

const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(n || 0);

// ── Core salary computation ───────────────────────────────────────────────────
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
  const [search, setSearch] = useState('');
  const { rows: employees, total, page, setPage, refresh, loading, error } = usePagedCollection(db, 'users', employeeQuery(search));
  const [reportsIdentity, setReportsIdentity] = useState(null);
  const [overrideIdentity, setOverrideIdentity] = useState(null);
  const reportsKey = `${selYear}-${selMonth}:${employees.map(e => e.id).join(',')}`;
  const [reports,    setReports]    = useState({});   // { uid: computedReport }
  const [dbReports,  setDbReports]  = useState({});   // { uid: saved overrides from Firestore }
  const [settings,   setSettings]   = useState(null);

  const [reportError, setReportError] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [saving,     setSaving]     = useState(false);



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
        setOverrideIdentity({ db, key: `${selYear}-${selMonth}:${employees.map(e => e.id).join(',')}` });
      }).catch(() => {});
  }, [db, employees, selYear, selMonth, refreshKey]);

  // Generate reports from attendance data
  const generateReports = useCallback(async () => {
    if (!db || employees.length === 0 || !settings) return;
    setReportError(null); setGenerating(true);
    try {
      const logsByUid = await loadAttendanceMonths(db, employees.map(e => e.id), `${selYear}-${String(selMonth + 1).padStart(2, '0')}`);

      const computed = {};
      employees.forEach(emp => {
        const empLogs = logsByUid[emp.id] || [];
        computed[emp.id] = computeSalary(emp, empLogs, settings, selYear, selMonth);
      });
      setReports(computed);
      setReportsIdentity({ db, key: `${selYear}-${selMonth}:${employees.map(e => e.id).join(',')}` });
    } catch (e) {
      setReportError(e);
    } finally {
      setGenerating(false);
    }
  }, [db, employees, settings, selYear, selMonth]);

  useEffect(() => {
    generateReports();
  }, [generateReports]);

  // Merge computed + db overrides
  const getMergedReport = (uid) => {
    const computed = reportsIdentity?.db === db && reportsIdentity?.key === reportsKey ? reports[uid] : null;
    if (!computed) return null;
    const saved = overrideIdentity?.db === db && overrideIdentity?.key === reportsKey ? dbReports[uid] : null;
    if (!saved) return { ...computed, userId: uid, employeeName: employees.find(e => e.id === uid)?.name || '', year: selYear, month: selMonth };
    return { ...mergePayrollWaivers(computed, saved), userId: uid, employeeName: employees.find(e => e.id === uid)?.name || '', year: selYear, month: selMonth };
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
      <TextField size="small" label="Search employees" value={search} onChange={e => setSearch(e.target.value)} sx={{ mb: 2 }} />
      <QueryStatus error={error || reportError} loading={loading} search={search} />
      <Typography variant="caption">Salary totals and printed rows cover this employee page.</Typography>
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
            <IconButton onClick={() => { setPage(0); refresh(); setRefreshKey(k => k+1); }}>
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
            <TablePagination component="div" count={total ?? -1} page={page}
              onPageChange={(_, p) => { setPage(p); if (p === 0) refresh(); }}
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