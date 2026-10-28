import usePagedCollection from '../../hooks/usePagedCollection';
import QueryStatus from '../../components/QueryStatus';
import { TablePagination } from '@mui/material';
import { getKnownSnapshot as getDoc, loadChecklistDays } from './employeeData';
import { updateRecord as updateDoc, setRecord as setDoc } from '../../data/writes';
// src/pages/Employees/EmployeeDashboard.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Typography, Card, CardContent, Button, CircularProgress,
  Alert, Chip, Stack, Divider, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, LinearProgress, IconButton, Tooltip,
  Grid, Avatar, List, ListItem, ListItemIcon, ListItemText,
  Checkbox, useTheme, useMediaQuery,
} from '@mui/material';
import {
  Login as LoginIcon, Logout as LogoutIcon, Coffee, PlayArrow,
  BeachAccess, CheckCircle, RadioButtonUnchecked, LocationOn,
  AccessTime, Refresh, Warning,
} from '@mui/icons-material';
import { doc } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';
import {
  isWithinAllowedLocation, getTodayStr, formatTime, formatDuration,
  shouldGenerateChecklist,
} from './employeeConstants';

// ── Geolocation helper ─────────────────────────────────────────────────────────
const getPosition = () =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported on this device'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true, timeout: 15000, maximumAge: 0,
    });
  });

// ── Main Component ─────────────────────────────────────────────────────────────
const EmployeeDashboard = () => {
  const { db, user, userProfile, storeType } = useAuth();
  const theme    = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const today  = getTodayStr();
  const userId = user?.uid;

  const [log,          setLog]          = useState(null);   // today's attendanceLog
  const taskPage = usePagedCollection(db && userId ? db : null, 'checklistInstances', { filters: [['userId', '==', userId || ''], ['date', '==', today]], sort: [['createdAt', 'asc']], pageSize: 15 });
  const checklists = taskPage.rows;
  const [checklistSummary, setChecklistSummary] = useState(null);
  const generationIdentity = useRef(null);
  if (generationIdentity.current?.db !== db || generationIdentity.current?.userId !== userId || generationIdentity.current?.today !== today) {
    generationIdentity.current = { db, userId, today };
  }
  const [generationProgress, setGenerationProgress] = useState(null);
  const generationCursor = generationProgress?.identity === generationIdentity.current ? generationProgress.cursor : 0;
  const [loading,      setLoading]      = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Dialogs
  const [leaveDialogOpen,  setLeaveDialogOpen]  = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [leaveReason,      setLeaveReason]      = useState('');
  const pendingPage = usePagedCollection(logoutDialogOpen ? db : null, 'checklistInstances', { filters: [['userId', '==', userId || ''], ['date', '==', today], ['completed', '==', false]], sort: [['createdAt', 'asc']], pageSize: 15 });
  const pendingChecklists = pendingPage.rows;
  // CHANGE 1: per-checklist not-completed reasons state
  const [checklistReasons, setChecklistReasons] = useState({});

  const logDocId = `${userId}_${today}`;

  // ── Load today's data ──────────────────────────────────────────────────────
  const loadTodayData = useCallback(async () => {
    if (!db || !userId) return;
    setLoadError(null); setLoading(true);
    try {
      const [logSnap, summaryDays] = await Promise.all([
        getDoc(doc(db, 'attendanceLogs', logDocId)),
        loadChecklistDays(db, [userId], [today]),
      ]);
      setLog(logSnap.exists() ? { id: logSnap.id, ...logSnap.data() } : null);
      setChecklistSummary(summaryDays[0] || null);
    } catch (e) {
      setLoadError(e);
    } finally {
      setLoading(false);
    }
  }, [db, userId, logDocId, today]);

  useEffect(() => { loadTodayData(); }, [loadTodayData]);

  // ── Generate checklists for today (called on clock-in) ─────────────────────
  const generateChecklists = async () => {
    const identity = generationIdentity.current;
    const assigned = userProfile?.assignedChecklists || [];
    if (assigned.length === 0) return;

    const batch = assigned.slice(generationCursor, generationCursor + 15);
    // Deterministic source IDs plus an operation marker protect retries, including
    // a concurrent generation request after another tab has completed a task.
    for (const cl of batch) {
      const template = await getDoc(doc(db, 'checklistTemplates', cl.templateId));
      if (!template.exists() || !shouldGenerateChecklist(cl, today)) continue;
      const instanceId = `${userId}_${cl.templateId}_${today}`;
      const existing = await getDoc(doc(db, 'checklistInstances', instanceId));
      if (!existing.exists()) await setDoc(doc(db, 'checklistInstances', instanceId), {
        userId, userName: userProfile?.name || '', templateId: cl.templateId,
        templateTitle: cl.templateTitle || template.data().title || '', date: today,
        completed: false, completedAt: null, createdAt: new Date().toISOString(),
      }, { operationId: 'generate-checklist-v2' });
    }
    if (generationIdentity.current === identity) setGenerationProgress({ identity, cursor: generationCursor + batch.length });
    taskPage.refresh();
  };

  // ── Validate location ──────────────────────────────────────────────────────
  const validateLocation = async () => {
    try {
      const pos = await getPosition();
      const { latitude: lat, longitude: lng } = pos.coords;
      if (!isWithinAllowedLocation(lat, lng, storeType)) {
        throw new Error('You are not within an allowed location to perform this action. Please be at the store.');
      }
      return { lat, lng };
    } catch (e) {
      if (e.code === 1) throw new Error('Location permission denied. Please allow location access and try again.');
      if (e.code === 2) throw new Error('Unable to determine your location. Please try again.');
      throw e;
    }
  };

  // ── Clock In ──────────────────────────────────────────────────────────────
  const handleClockIn = async () => {
    setActionLoading(true);
    try {
      const location = await validateLocation();
      const now = new Date().toISOString();
      await setDoc(doc(db, 'attendanceLogs', logDocId), {
        userId,
        userName:      userProfile?.name || '',
        date:          today,
        status:        'present',
        loginTime:     now,
        logoutTime:    null,
        breaks:        [],
        leaveReason:   null,
        loginLocation: location,
        logoutLocation: null,
        createdAt:     now,
        updatedAt:     now,
      });
      await generateChecklists();
      toast.success('Clocked in successfully!');
      await loadTodayData();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  // ── Take Break ────────────────────────────────────────────────────────────
  const handleTakeBreak = async () => {
    if (!log) return;
    setActionLoading(true);
    try {
      // CHANGE 3: location check before taking break
      await validateLocation();
      const breaks = [...(log.breaks || []), { startTime: new Date().toISOString(), endTime: null }];
      await updateDoc(doc(db, 'attendanceLogs', logDocId), {
        breaks, updatedAt: new Date().toISOString(),
      });
      toast.success('Break started');
      await loadTodayData();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  // ── Resume from Break ─────────────────────────────────────────────────────
  const handleResumeBreak = async () => {
    if (!log) return;
    setActionLoading(true);
    try {
      // CHANGE 3: location check before resuming from break
      await validateLocation();
      const breaks = (log.breaks || []).map((b, i) =>
        i === log.breaks.length - 1 && !b.endTime
          ? { ...b, endTime: new Date().toISOString() }
          : b
      );
      await updateDoc(doc(db, 'attendanceLogs', logDocId), {
        breaks, updatedAt: new Date().toISOString(),
      });
      toast.success('Break ended — back to work!');
      await loadTodayData();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  // ── Clock Out ─────────────────────────────────────────────────────────────
  const handleClockOutIntent = async () => {
    try {
    // Check pending checklists first
    const summaryDays = await loadChecklistDays(db, [userId], [today]);
    setChecklistSummary(summaryDays[0] || null);
    if ((summaryDays[0]?.pendingCount || 0) > 0) {
      setChecklistReasons({}); // CHANGE 1: reset reasons on open
      setLogoutDialogOpen(true);
    } else {
      await performClockOut();
    }
    } catch (e) { toast.error(e.message); }
  };

  const performClockOut = async () => {
    setActionLoading(true);
    setLogoutDialogOpen(false);
    try {
      const location = await validateLocation();
      const now = new Date().toISOString();
      // Close any open break
      let breaks = [...(log?.breaks || [])];
      if (breaks.length > 0 && !breaks[breaks.length - 1].endTime) {
        breaks[breaks.length - 1] = { ...breaks[breaks.length - 1], endTime: now };
      }
      await updateDoc(doc(db, 'attendanceLogs', logDocId), {
        logoutTime:     now,
        logoutLocation: location,
        breaks,
        updatedAt:      now,
      });
      toast.success('Clocked out. Have a great evening!');
      await loadTodayData();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  // CHANGE 1: save not-completed reasons then perform clock out
  const performClockOutWithReasons = async () => {
    setActionLoading(true);
    try {
      const reasonSavePromises = Object.entries(checklistReasons)
        .filter(([, reason]) => reason?.trim())
        .map(([id, reason]) => updateDoc(doc(db, 'checklistInstances', id), {
          notCompleted: true, notCompletedReason: reason.trim(), notCompletedAt: new Date().toISOString(),
        }));
      if (reasonSavePromises.length > 0) await Promise.all(reasonSavePromises);
    } catch (_) { /* non-critical */ }
    await performClockOut();
  };

  // ── Mark Leave ────────────────────────────────────────────────────────────
  const handleMarkLeave = async () => {
    if (!leaveReason.trim()) { toast.error('Please provide a reason'); return; }
    setActionLoading(true);
    try {
      const now = new Date().toISOString();
      await setDoc(doc(db, 'attendanceLogs', logDocId), {
        userId,
        userName:      userProfile?.name || '',
        date:          today,
        status:        'leave',
        loginTime:     null,
        logoutTime:    null,
        breaks:        [],
        leaveReason:   leaveReason.trim(),
        loginLocation: null,
        logoutLocation: null,
        createdAt:     now,
        updatedAt:     now,
      });
      toast.success('Leave marked for today');
      setLeaveDialogOpen(false);
      setLeaveReason('');
      await loadTodayData();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  // ── Toggle checklist item ─────────────────────────────────────────────────
  const handleToggleChecklist = async (cl) => {
    try {
      const completed   = !cl.completed;
      const completedAt = completed ? new Date().toISOString() : null;
      await updateDoc(doc(db, 'checklistInstances', cl.id), { completed, completedAt });
      taskPage.refresh();
      await loadTodayData();
    } catch (e) {
      toast.error('Failed to update: ' + e.message);
    }
  };

  // ── Derived State ─────────────────────────────────────────────────────────
  const isOnLeave  = log?.status === 'leave';
  const isClockedIn = log && !isOnLeave && !log.logoutTime;
  const isClockedOut = log && !isOnLeave && !!log.logoutTime;
  const isOnBreak  = isClockedIn && log?.breaks?.length > 0 && !log.breaks[log.breaks.length - 1]?.endTime;
  const completedCount = checklistSummary?.completedCount || 0;
  const checklistCount = checklistSummary?.totalCount || 0;
  const progress = checklistCount > 0 ? (completedCount / checklistCount) * 100 : 0;

  if (loadError && !loading) return <Box sx={{ p: 3 }}><Alert severity="error">{loadError.message}</Alert><Button onClick={loadTodayData}>Reload today</Button></Box>;
  if (loading) return <Box display="flex" justifyContent="center" pt={8}><CircularProgress /></Box>;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 720, mx: 'auto' }}>
      <QueryStatus error={taskPage.error} loading={taskPage.loading} />
      <TablePagination component="div" count={taskPage.total ?? -1} page={taskPage.page} rowsPerPage={15} rowsPerPageOptions={[15]} onPageChange={(_, p) => taskPage.setPage(p)} nextIconButtonProps={{ disabled: taskPage.loading || !taskPage.hasNext }} />
      {generationCursor < (userProfile?.assignedChecklists?.length || 0) && isClockedIn && <Button disabled={actionLoading} onClick={async () => { setActionLoading(true); try { await generateChecklists(); await loadTodayData(); } catch (e) { toast.error(e.message); } finally { setActionLoading(false); } }}>Generate next 15 assigned tasks</Button>}
      {/* Header */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'},{' '}
            {userProfile?.name?.split(' ')[0]}! 👋
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
          </Typography>
        </Box>
        <IconButton onClick={loadTodayData}><Refresh /></IconButton>
      </Box>

      {/* Status Card */}
      <Card sx={{
        mb: 3,
        background: isOnLeave ? 'linear-gradient(135deg, #fff3cd, #ffe69c)' :
                    isClockedOut ? 'linear-gradient(135deg, #d1e7dd, #a3cfbb)' :
                    isClockedIn  ? 'linear-gradient(135deg, #cfe2ff, #9ec5fe)' :
                                   'linear-gradient(135deg, #f8f9fa, #e9ecef)',
        border: '1px solid',
        borderColor: isOnLeave ? 'warning.300' : isClockedOut ? 'success.300' : isClockedIn ? 'info.300' : 'divider',
      }}>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
            <Box>
              <Typography variant="subtitle2" color="text.secondary">Today's Status</Typography>
              <Chip
                label={
                  isOnLeave   ? '🏖️ On Leave' :
                  isClockedOut ? '✅ Completed' :
                  isOnBreak   ? '☕ On Break' :
                  isClockedIn ? '🟢 Working' : '⏳ Not Started'
                }
                color={isOnLeave ? 'warning' : isClockedOut ? 'success' : isClockedIn ? 'info' : 'default'}
                sx={{ mt: 0.5, fontWeight: 700 }}
              />
            </Box>
            {isClockedIn && log.loginTime && (
              <Box textAlign="right">
                <Typography variant="caption" color="text.secondary">Since</Typography>
                <Typography fontWeight={700}>{formatTime(log.loginTime)}</Typography>
              </Box>
            )}
          </Box>

          {/* Times Row */}
          {log && !isOnLeave && (
            <Grid container spacing={1} mb={2}>
              <Grid item xs={4}>
                <Box textAlign="center" sx={{ p: 1, bgcolor: 'rgba(255,255,255,0.6)', borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary">Clock In</Typography>
                  <Typography variant="body2" fontWeight={700}>{formatTime(log.loginTime)}</Typography>
                </Box>
              </Grid>
              <Grid item xs={4}>
                <Box textAlign="center" sx={{ p: 1, bgcolor: 'rgba(255,255,255,0.6)', borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary">Breaks</Typography>
                  <Typography variant="body2" fontWeight={700}>
                    {(log.breaks || []).filter(b => b.startTime && b.endTime).length} taken
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={4}>
                <Box textAlign="center" sx={{ p: 1, bgcolor: 'rgba(255,255,255,0.6)', borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary">Clock Out</Typography>
                  <Typography variant="body2" fontWeight={700}>{formatTime(log.logoutTime)}</Typography>
                </Box>
              </Grid>
            </Grid>
          )}

          {isOnLeave && (
            <Alert severity="warning" sx={{ mt: 1 }} icon={<BeachAccess />}>
              <strong>Leave Reason:</strong> {log.leaveReason}
            </Alert>
          )}

          {/* Action Buttons */}
          {!isOnLeave && !isClockedOut && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} mt={1}>
              {!isClockedIn && (
                <>
                  <Button fullWidth variant="contained" color="success" size="large"
                    startIcon={actionLoading ? <CircularProgress size={18} color="inherit" /> : <LoginIcon />}
                    onClick={handleClockIn} disabled={actionLoading}
                    sx={{ fontWeight: 700 }}>
                    Clock In
                  </Button>
                  <Button fullWidth variant="outlined" color="warning" size="large"
                    startIcon={<BeachAccess />}
                    onClick={() => setLeaveDialogOpen(true)} disabled={actionLoading}>
                    Mark Leave
                  </Button>
                </>
              )}
              {isClockedIn && (
                <>
                  {!isOnBreak ? (
                    <Button fullWidth variant="outlined" color="info" size="large"
                      startIcon={actionLoading ? <CircularProgress size={18} color="inherit" /> : <Coffee />}
                      onClick={handleTakeBreak} disabled={actionLoading}>
                      Take Break
                    </Button>
                  ) : (
                    <Button fullWidth variant="contained" color="info" size="large"
                      startIcon={actionLoading ? <CircularProgress size={18} color="inherit" /> : <PlayArrow />}
                      onClick={handleResumeBreak} disabled={actionLoading}>
                      Resume Work
                    </Button>
                  )}
                  <Button fullWidth variant="contained" color="error" size="large"
                    startIcon={actionLoading ? <CircularProgress size={18} color="inherit" /> : <LogoutIcon />}
                    onClick={handleClockOutIntent} disabled={actionLoading || isOnBreak}
                    sx={{ fontWeight: 700 }}>
                    Clock Out
                  </Button>
                </>
              )}
            </Stack>
          )}

          {actionLoading && <LinearProgress sx={{ mt: 1.5, borderRadius: 1 }} />}
        </CardContent>
      </Card>

      {/* Location Info */}
      <Card sx={{ mb: 3, bgcolor: 'grey.50' }}>
        <CardContent sx={{ py: '10px !important' }}>
          <Box display="flex" alignItems="center" gap={1}>
            <LocationOn sx={{ fontSize: 18, color: 'text.secondary' }} />
            <Typography variant="caption" color="text.secondary">
              Clock-in and clock-out require you to be within 100m of the store location
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {/* Today's Checklists */}
      {isClockedIn && (
        <Card>
          <CardContent>
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={1.5}>
              <Typography variant="subtitle1" fontWeight={700}>
                Today's Checklist
              </Typography>
              <Chip
                label={`${completedCount} / ${checklistCount}`}
                color={progress === 100 ? 'success' : progress > 0 ? 'warning' : 'default'}
                size="small"
              />
            </Box>

            {checklists.length > 0 && (
              <Box mb={2}>
                <LinearProgress variant="determinate" value={progress}
                  color={progress === 100 ? 'success' : 'primary'}
                  sx={{ height: 8, borderRadius: 4, mb: 0.5 }} />
                <Typography variant="caption" color="text.secondary">
                  {Math.round(progress)}% completed
                </Typography>
              </Box>
            )}

            {checklists.length === 0 ? (
              <Box textAlign="center" py={3}>
                <CheckCircle sx={{ fontSize: 40, color: 'success.main', mb: 1 }} />
                <Typography color="text.secondary">No checklists assigned for today</Typography>
              </Box>
            ) : (
              <List disablePadding>
                {checklists.map((cl, i) => (
                  <React.Fragment key={cl.id}>
                    {i > 0 && <Divider />}
                    <ListItem disableGutters sx={{ py: 1 }}>
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        <Checkbox
                          edge="start"
                          checked={cl.completed}
                          onChange={() => handleToggleChecklist(cl)}
                          icon={<RadioButtonUnchecked color="action" />}
                          checkedIcon={<CheckCircle color="success" />}
                        />
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Typography
                            variant="body2"
                            fontWeight={600}
                            sx={{ textDecoration: cl.completed ? 'line-through' : 'none',
                                  color: cl.completed ? 'text.disabled' : 'text.primary' }}>
                            {cl.templateTitle}
                          </Typography>
                        }
                        secondary={cl.completed && cl.completedAt
                          ? `Completed at ${formatTime(cl.completedAt)}`
                          : 'Pending'
                        }
                      />
                      {cl.completed && <CheckCircle color="success" fontSize="small" />}
                    </ListItem>
                  </React.Fragment>
                ))}
              </List>
            )}
          </CardContent>
        </Card>
      )}

      {/* Completed view shows checklist read-only */}
      {isClockedOut && checklists.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={700} mb={1.5}>Today's Checklist Summary</Typography>
            <Stack spacing={0.5}>
              {checklists.map(cl => (
                <Box key={cl.id} display="flex" alignItems="center" gap={1}
                  sx={{ p: 1, bgcolor: cl.completed ? 'success.50' : 'error.50', borderRadius: 1 }}>
                  {cl.completed
                    ? <CheckCircle color="success" fontSize="small" />
                    : <Warning color="error" fontSize="small" />
                  }
                  <Typography variant="body2"
                    sx={{ color: cl.completed ? 'success.dark' : 'error.dark' }}>
                    {cl.templateTitle}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* ── Leave Dialog ── */}
      <Dialog open={leaveDialogOpen} onClose={() => setLeaveDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Mark Leave for Today</DialogTitle>
        <DialogContent>
          <TextField fullWidth multiline rows={3} label="Reason for Leave *"
            value={leaveReason} onChange={e => setLeaveReason(e.target.value)}
            placeholder="Please mention the reason…" sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLeaveDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="warning" onClick={handleMarkLeave}
            disabled={actionLoading}>
            {actionLoading ? <CircularProgress size={16} /> : 'Confirm Leave'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Pending Checklist Warning Dialog ── */}
      <Dialog open={logoutDialogOpen} onClose={() => setLogoutDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Warning color="warning" /> Pending Checklists
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            You have <strong>{checklistSummary?.pendingCount || 0}</strong> incomplete checklist item(s).
            You can provide a reason for each before clocking out.
          </Alert>
          {/* CHANGE 1: per-checklist reason fields */}
          <Stack spacing={1.5}>
            <QueryStatus error={pendingPage.error} loading={pendingPage.loading} />
            <TablePagination component="div" count={pendingPage.total ?? -1} page={pendingPage.page} rowsPerPage={15} rowsPerPageOptions={[15]} onPageChange={(_, p) => pendingPage.setPage(p)} nextIconButtonProps={{ disabled: pendingPage.loading || !pendingPage.hasNext }} />
            {pendingChecklists.map(cl => (
              <Box key={cl.id}
                sx={{ p: 1.5, bgcolor: 'warning.50', borderRadius: 1, border: '1px solid', borderColor: 'warning.200' }}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <Warning color="warning" fontSize="small" />
                  <Typography variant="body2" fontWeight={600}>{cl.templateTitle}</Typography>
                </Box>
                <TextField
                  fullWidth size="small"
                  label="Reason not completed (optional)"
                  placeholder="e.g. Task deferred, will do tomorrow…"
                  value={checklistReasons[cl.id] || ''}
                  onChange={e => setChecklistReasons(prev => ({ ...prev, [cl.id]: e.target.value }))}
                  multiline rows={2}
                />
              </Box>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLogoutDialogOpen(false)} color="primary" variant="outlined">
            Go Back &amp; Complete
          </Button>
          {/* CHANGE 1: uses performClockOutWithReasons to save reasons first */}
          <Button onClick={performClockOutWithReasons} color="error" variant="contained"
            disabled={actionLoading}>
            {actionLoading ? <CircularProgress size={16} /> : 'Clock Out Anyway'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default EmployeeDashboard;