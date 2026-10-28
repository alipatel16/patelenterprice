import usePagedCollection from '../../hooks/usePagedCollection';
import QueryStatus from '../../components/QueryStatus';
import EmployeePageControls from './EmployeePageControls';
import { employeeQuery, loadChecklistDays } from './employeeData';
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
  Assignment, Warning,
} from '@mui/icons-material';

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
  const [search, setSearch] = useState('');
  const employeePage = usePagedCollection(db, 'users', employeeQuery(search));
  const { rows: employees, page, total, setPage, refresh } = employeePage;
  const [summaries, setSummaries] = useState([]);
  const [summaryError, setSummaryError] = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [expandedEmp, setExpandedEmp] = useState(null);



  const [refreshKey, setRefreshKey] = useState(0);

  const taskPage = usePagedCollection(expandedEmp ? db : null, 'checklistInstances', { filters: [['userId', '==', expandedEmp || ''], ['date', '==', selDate]], sort: [['createdAt', 'asc']], pageSize: 15 });
  useEffect(() => {
    if (!db) return;
    let active = true;
    setSummaries([]); setExpandedEmp(null); setSummaryError(null); setLoading(true);
    loadChecklistDays(db, employees.map(e => e.id), [selDate])
      .then(rows => { if (active) setSummaries(rows); })
      .catch(e => { if (active) setSummaryError(e); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [db, selDate, employees, refreshKey]);

  const getEmpChecklists = uid => expandedEmp === uid ? taskPage.rows : [];
  const getEmpStats = uid => {
    const summary = summaries.find(row => row.userId === uid);
    const total = summary?.totalCount || 0, done = summary?.completedCount || 0;
    return { total, done, pct: total ? Math.round(done / total * 100) : null };
  };

  const allWithItems = employees.filter(e => getEmpStats(e.id).total > 0);
  const allComplete  = allWithItems.filter(e => { const s = getEmpStats(e.id); return s.done === s.total; });
  const noneStarted  = employees.filter(e => getEmpStats(e.id).total === 0);

  if (summaryError) return <Box><EmployeePageControls search={search} setSearch={setSearch} result={employeePage} /><QueryStatus error={summaryError} loading={false} /><Button onClick={() => window.location.reload()}>Reload summaries</Button></Box>;
  return (
    <Box>
      <EmployeePageControls search={search} setSearch={setSearch} result={employeePage} />
      <Typography variant="caption">Completion totals cover this employee page; task counts cover each full day.</Typography>
      {/* Date picker + summary */}
      <Box display="flex" alignItems={{ xs: 'flex-start', sm: 'center' }}
        flexDirection={{ xs: 'column', sm: 'row' }} gap={2} mb={3}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Button size="small" variant="outlined"
            onClick={() => { const d = new Date(selDate); d.setDate(d.getDate() - 1); setSelDate(d.toISOString().split('T')[0]); setPage(0); refresh(); }}>
            ‹ Prev
          </Button>
          <input type="date" value={selDate}
            onChange={e => { setSelDate(e.target.value); setPage(0); refresh(); }}
            style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14 }} />
          <Button size="small" variant="outlined" disabled={selDate >= getTodayStr()}
            onClick={() => { const d = new Date(selDate); d.setDate(d.getDate() + 1); setSelDate(d.toISOString().split('T')[0]); setPage(0); refresh(); }}>
            Next ›
          </Button>
        </Stack>
        <IconButton size="small" onClick={() => { setPage(0); refresh(); setRefreshKey(k => k + 1); }}>
          <Refresh />
        </IconButton>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={2} mb={3}>
        {[
          { label: 'All Complete',   val: allComplete.length,                       color: 'success' },
          { label: 'Partial / None', val: allWithItems.length - allComplete.length, color: 'warning' },
          { label: 'No Checklists',  val: noneStarted.length,                       color: 'default' },
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
                            {stats.total > 0 && (
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
                                <QueryStatus error={taskPage.error} loading={taskPage.loading} />
                                <TablePagination component="div" count={taskPage.total ?? -1} page={taskPage.page} rowsPerPage={15} rowsPerPageOptions={[15]} onPageChange={(_, p) => taskPage.setPage(p)} nextIconButtonProps={{ disabled: !taskPage.hasNext || taskPage.loading }} />
                                <Stack spacing={0.75}>
                                  {items.map(cl => (
                                    <Box key={cl.id} display="flex" alignItems="flex-start" justifyContent="space-between"
                                      sx={{ p: 1.5, bgcolor: cl.completed ? 'success.50' : 'error.50',
                                            borderRadius: 1, border: '1px solid',
                                            borderColor: cl.completed ? 'success.200' : 'error.200' }}>
                                      <Box display="flex" alignItems="flex-start" gap={1} flex={1}>
                                        {cl.completed
                                          ? <CheckCircle color="success" fontSize="small" sx={{ mt: 0.2 }} />
                                          : <RadioButtonUnchecked color="error" fontSize="small" sx={{ mt: 0.2 }} />
                                        }
                                        <Box>
                                          <Typography variant="body2">{cl.templateTitle}</Typography>
                                          {/* FIX: show not-completed reason if employee provided one */}
                                          {!cl.completed && cl.notCompletedReason && (
                                            <Box display="flex" alignItems="center" gap={0.5} mt={0.5}>
                                              <Warning sx={{ fontSize: 12, color: 'warning.main' }} />
                                              <Typography variant="caption" color="warning.dark">
                                                Reason: {cl.notCompletedReason}
                                              </Typography>
                                            </Box>
                                          )}
                                        </Box>
                                      </Box>
                                      {cl.completed && cl.completedAt && (
                                        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, ml: 1 }}>
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
            <TablePagination component="div" count={total ?? -1} page={page}
              onPageChange={(_, p) => { setPage(p); if (p === 0) refresh(); }}
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
  const [search, setSearch] = useState('');
  const employeePage = usePagedCollection(db, 'users', employeeQuery(search));
  const employees = employeePage.rows;
  const [instances, setInstances] = useState([]);
  const [summaryError, setSummaryError] = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [selEmp,    setSelEmp]    = useState('all');

  const daysInMonth = new Date(selYear, selMonth + 1, 0).getDate();
  const dayNums = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  useEffect(() => {
    if (!db) return;
    let active = true;
    setInstances([]); setSummaryError(null); setLoading(true);
    const dates = dayNums.map(day => `${selYear}-${String(selMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    loadChecklistDays(db, employees.map(e => e.id), dates)
      .then(rows => { if (active) setInstances(rows); })
      .catch(e => { if (active) setSummaryError(e); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [db, employees, selYear, selMonth, daysInMonth]);

  const filteredEmps = selEmp === 'all' ? employees : employees.filter(e => e.id === selEmp);

  const getDayStats = (uid, day) => {
    const dateStr = `${selYear}-${String(selMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const summary = instances.find(i => i.userId === uid && i.date === dateStr);
    if (!summary?.totalCount) return null;
    return { total: summary.totalCount, done: summary.completedCount, pct: Math.round(summary.completedCount / summary.totalCount * 100) };
  };

  if (summaryError) return <Box><EmployeePageControls search={search} setSearch={setSearch} result={employeePage} /><QueryStatus error={summaryError} loading={false} /><Button onClick={() => window.location.reload()}>Reload summaries</Button></Box>;
  return (
    <Box>
      <EmployeePageControls search={search} setSearch={setSearch} result={employeePage} />
      {/* Controls */}
      <Box display="flex" alignItems="center" gap={2} mb={3} flexWrap="wrap">
        <Stack direction="row" spacing={1} alignItems="center">
          <IconButton size="small"
            onClick={() => {
              if (selMonth === 0) { setSelYear(y => y - 1); setSelMonth(11); }
              else setSelMonth(m => m - 1);
            }}>
            <ArrowBack fontSize="small" />
          </IconButton>
          <Typography fontWeight={700}>{MONTH_NAMES[selMonth]} {selYear}</Typography>
          <IconButton size="small"
            onClick={() => {
              if (selMonth === 11) { setSelYear(y => y + 1); setSelMonth(0); }
              else setSelMonth(m => m + 1);
            }}>
            <ArrowForward fontSize="small" />
          </IconButton>
        </Stack>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Employee</InputLabel>
          <Select value={selEmp} onChange={e => setSelEmp(e.target.value)} label="Employee">
            <MenuItem value="all">All Employees</MenuItem>
            {employees.map(e => <MenuItem key={e.id} value={e.id}>{e.name}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>

      {loading ? (
        <Box display="flex" justifyContent="center" py={5}><CircularProgress /></Box>
      ) : (
        <Card>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell sx={{ minWidth: 120, position: 'sticky', left: 0, bgcolor: 'grey.50', zIndex: 1 }}>
                    Employee
                  </TableCell>
                  {dayNums.map(d => (
                    <TableCell key={d} align="center" sx={{ minWidth: 36, px: 0.5, fontSize: 11 }}>
                      {d}
                    </TableCell>
                  ))}
                  <TableCell align="center" sx={{ minWidth: 60 }}>Avg</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredEmps.map(emp => {
                  let totalPct = 0;
                  let daysWithTasks = 0;
                  return (
                    <TableRow key={emp.id} hover>
                      <TableCell sx={{ position: 'sticky', left: 0, bgcolor: 'background.paper', zIndex: 1 }}>
                        <Box display="flex" alignItems="center" gap={1}>
                          <Avatar sx={{ width: 22, height: 22, fontSize: 10, bgcolor: 'primary.main' }}>
                            {(emp.name || '?')[0]}
                          </Avatar>
                          <Typography variant="caption" fontWeight={600} noWrap>{emp.name}</Typography>
                        </Box>
                      </TableCell>
                      {dayNums.map(d => {
                        const stats = getDayStats(emp.id, d);
                        if (stats) { totalPct += stats.pct; daysWithTasks++; }
                        return (
                          <TableCell key={d} align="center" sx={{ px: 0.5 }}>
                            {stats ? (
                              <Tooltip title={`${stats.done}/${stats.total} (${stats.pct}%)`}>
                                <Typography variant="caption" fontWeight={700}
                                  sx={{ color: stats.pct === 100 ? 'success.main' : stats.pct > 50 ? 'warning.main' : 'error.main' }}>
                                  {stats.pct === 100 ? '✓' : `${stats.pct}%`}
                                </Typography>
                              </Tooltip>
                            ) : (
                              <Typography variant="caption" color="text.disabled">—</Typography>
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