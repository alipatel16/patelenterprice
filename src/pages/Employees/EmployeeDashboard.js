// src/pages/Employees/EmployeeDashboard.js
import React, { useState, useEffect, useCallback } from 'react';
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
import {
  doc, setDoc, getDoc, updateDoc, serverTimestamp,
  collection, getDocs, query, where,
} from 'firebase/firestore';
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
  const [checklists,   setChecklists]   = useState([]);     // today's checklistInstances
  const [loading,      setLoading]      = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Dialogs
  const [leaveDialogOpen,  setLeaveDialogOpen]  = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [leaveReason,      setLeaveReason]      = useState('');
  const [pendingChecklists, setPendingChecklists] = useState([]);

  const logDocId = `${userId}_${today}`;

  // ── Load today's data ──────────────────────────────────────────────────────
  const loadTodayData = useCallback(async () => {
    if (!db || !userId) return;
    setLoading(true);
    try {
      const [logSnap, clSnap] = await Promise.all([
        getDoc(doc(db, 'attendanceLogs', logDocId)),
        getDocs(query(collection(db, 'checklistInstances'),
          where('userId', '==', userId),
          where('date', '==', today)
        )),
      ]);
      setLog(logSnap.exists() ? { id: logSnap.id, ...logSnap.data() } : null);
      setChecklists(clSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      toast.error('Failed to load: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [db, userId, logDocId, today]);

  useEffect(() => { loadTodayData(); }, [loadTodayData]);

  // ── Generate checklists for today (called on clock-in) ─────────────────────
  const generateChecklists = async () => {
    const assigned = userProfile?.assignedChecklists || [];
    if (assigned.length === 0) return;

    const promises = assigned
      .filter(cl => shouldGenerateChecklist(cl, today))
      .map(async cl => {
        const instanceId = `${userId}_${cl.templateId}_${today}`;
        const existing   = await getDoc(doc(db, 'checklistInstances', instanceId));
        if (!existing.exists()) {
          await setDoc(doc(db, 'checklistInstances', instanceId), {
            userId,
            userName:      userProfile.name,
            templateId:    cl.templateId,
            templateTitle: cl.templateTitle,
            date:          today,
            completed:     false,
            completedAt:   null,
            createdAt:     new Date().toISOString(),
          });
        }
      });
    await Promise.all(promises);
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
    // Check pending checklists first
    const pending = checklists.filter(cl => !cl.completed);
    if (pending.length > 0) {
      setPendingChecklists(pending);
      setLogoutDialogOpen(true);
    } else {
      await performClockOut();
    }
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
      setChecklists(prev =>
        prev.map(c => c.id === cl.id ? { ...c, completed, completedAt } : c)
      );
    } catch (e) {
      toast.error('Failed to update: ' + e.message);
    }
  };

  // ── Derived State ─────────────────────────────────────────────────────────
  const isOnLeave  = log?.status === 'leave';
  const isClockedIn = log && !isOnLeave && !log.logoutTime;
  const isClockedOut = log && !isOnLeave && !!log.logoutTime;
  const isOnBreak  = isClockedIn && log?.breaks?.length > 0 && !log.breaks[log.breaks.length - 1]?.endTime;
  const completedCount = checklists.filter(c => c.completed).length;
  const progress = checklists.length > 0 ? (completedCount / checklists.length) * 100 : 0;

  if (loading) return <Box display="flex" justifyContent="center" pt={8}><CircularProgress /></Box>;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 720, mx: 'auto' }}>
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
                label={`${completedCount} / ${checklists.length}`}
                color={progress === 100 ? 'success' : 'default'}
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
            You have <strong>{pendingChecklists.length}</strong> incomplete checklist item(s). Please complete them before End of Day.
          </Alert>
          <Stack spacing={1}>
            {pendingChecklists.map(cl => (
              <Box key={cl.id} display="flex" alignItems="center" gap={1}
                sx={{ p: 1.5, bgcolor: 'warning.50', borderRadius: 1, border: '1px solid', borderColor: 'warning.200' }}>
                <Warning color="warning" fontSize="small" />
                <Typography variant="body2" fontWeight={600}>{cl.templateTitle}</Typography>
              </Box>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLogoutDialogOpen(false)} color="primary" variant="outlined">
            Go Back & Complete
          </Button>
          <Button onClick={performClockOut} color="error" variant="contained"
            disabled={actionLoading}>
            {actionLoading ? <CircularProgress size={16} /> : 'Clock Out Anyway'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default EmployeeDashboard;