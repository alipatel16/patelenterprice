// src/pages/Employees/PenaltySettings.js
import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, TextField,
  Button, CircularProgress, Alert, Divider, InputAdornment,
  Chip, Stack, Switch, FormControlLabel, Tooltip, IconButton,
} from '@mui/material';
import {
  Save, AccessTime, AttachMoney, Warning, Info,
  Schedule, HourglassEmpty, BeachAccess,
} from '@mui/icons-material';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';

const DEFAULT_SETTINGS = {
  // Work hours
  expectedDailyHours:    8,       // hours
  expectedLoginTime:     '09:30', // HH:MM
  expectedLogoutTime:    '18:30', // HH:MM

  // Thresholds (minutes)
  lateArrivalThreshold:    15,    // grace period before "late"
  earlyDepartureThreshold: 15,    // grace period before "early departure"

  // Penalty rates
  hourlyDeductionRate:    50,     // ₹ per short hour
  lateArrivalRate:        0,      // ₹ per late-arrival incident (0 = use hourly)
  earlyDepartureRate:     0,      // ₹ per early-departure incident (0 = use hourly)

  // Leave penalty
  freeLeavePerMonth:      1,      // leaves allowed without penalty per month
  leavePenaltyAmount:     200,    // ₹ per extra leave day
  leavePenaltyEnabled:    true,

  // Short hours penalty
  shortHoursPenaltyEnabled: true,
  lateArrivalPenaltyEnabled: true,
  earlyDeparturePenaltyEnabled: true,
};

const SectionHeader = ({ icon, title, subtitle }) => (
  <Box display="flex" alignItems="flex-start" gap={1.5} mb={2.5}>
    <Box sx={{ p: 1, bgcolor: 'primary.50', borderRadius: 1, color: 'primary.main', display: 'flex' }}>
      {icon}
    </Box>
    <Box>
      <Typography variant="subtitle1" fontWeight={700}>{title}</Typography>
      {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
    </Box>
  </Box>
);

const PenaltySettings = () => {
  const { db, storeType } = useAuth();

  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  const settingsDocId = `penaltySettings_${storeType}`;

  useEffect(() => {
    if (!db) return;
    getDoc(doc(db, 'appSettings', settingsDocId)).then(snap => {
      if (snap.exists()) setSettings({ ...DEFAULT_SETTINGS, ...snap.data() });
    }).finally(() => setLoading(false));
  }, [db, settingsDocId]);

  const set = (key) => (e) => {
    const val = e.target.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value;
    setSettings(prev => ({ ...prev, [key]: val }));
  };

  const toggle = (key) => () => setSettings(prev => ({ ...prev, [key]: !prev[key] }));

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await setDoc(doc(db, 'appSettings', settingsDocId), {
        ...settings,
        updatedAt: serverTimestamp(),
      });
      toast.success('Penalty settings saved!');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Box display="flex" justifyContent="center" pt={8}><CircularProgress /></Box>;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 860, mx: 'auto' }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3} flexWrap="wrap" gap={2}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Penalty & Work Hour Settings</Typography>
          <Typography variant="body2" color="text.secondary">
            Configure expected hours, thresholds, and deduction rates used to compute monthly salary
          </Typography>
        </Box>
        <Button variant="contained" startIcon={saving ? <CircularProgress size={16} /> : <Save />}
          onClick={handleSave} disabled={saving}>
          Save Settings
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Work Hours Policy */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <SectionHeader icon={<Schedule />} title="Work Hour Policy"
            subtitle="Define the standard working day expectations" />
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth size="small" type="number" label="Expected Daily Hours"
                value={settings.expectedDailyHours} onChange={set('expectedDailyHours')}
                inputProps={{ min: 1, max: 24, step: 0.5 }}
                InputProps={{ endAdornment: <InputAdornment position="end">hrs</InputAdornment> }}
                helperText="Standard hours per working day" />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth size="small" type="time" label="Expected Login Time"
                value={settings.expectedLoginTime} onChange={set('expectedLoginTime')}
                InputLabelProps={{ shrink: true }}
                helperText="Official start of work" />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth size="small" type="time" label="Expected Logout Time"
                value={settings.expectedLogoutTime} onChange={set('expectedLogoutTime')}
                InputLabelProps={{ shrink: true }}
                helperText="Official end of work" />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Late / Early Thresholds */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <SectionHeader icon={<AccessTime />} title="Grace Period Thresholds"
            subtitle="Minutes of tolerance before a penalty is triggered" />
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" type="number" label="Late Arrival Threshold"
                value={settings.lateArrivalThreshold} onChange={set('lateArrivalThreshold')}
                inputProps={{ min: 0, max: 120 }}
                InputProps={{ endAdornment: <InputAdornment position="end">mins</InputAdornment> }}
                helperText={`If clock-in is more than ${settings.lateArrivalThreshold} mins after ${settings.expectedLoginTime}, it's flagged as late`} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" type="number" label="Early Departure Threshold"
                value={settings.earlyDepartureThreshold} onChange={set('earlyDepartureThreshold')}
                inputProps={{ min: 0, max: 120 }}
                InputProps={{ endAdornment: <InputAdornment position="end">mins</InputAdornment> }}
                helperText={`If clock-out is more than ${settings.earlyDepartureThreshold} mins before ${settings.expectedLogoutTime}, it's early departure`} />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Deduction Rates */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <SectionHeader icon={<AttachMoney />} title="Penalty Deduction Rates"
            subtitle="Amount deducted per violation. Set to 0 to disable a specific rate." />

          <Stack spacing={2.5}>
            {/* Short work hours */}
            <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={1.5}>
                <Box display="flex" alignItems="center" gap={1}>
                  <HourglassEmpty color="warning" fontSize="small" />
                  <Typography variant="body2" fontWeight={700}>Short Work Hours Penalty</Typography>
                </Box>
                <FormControlLabel
                  control={<Switch checked={settings.shortHoursPenaltyEnabled} onChange={toggle('shortHoursPenaltyEnabled')} color="warning" size="small" />}
                  label={settings.shortHoursPenaltyEnabled ? 'Enabled' : 'Disabled'}
                  labelPlacement="start"
                  sx={{ m: 0 }}
                />
              </Box>
              {settings.shortHoursPenaltyEnabled && (
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField fullWidth size="small" type="number" label="Rate per Short Hour"
                      value={settings.hourlyDeductionRate} onChange={set('hourlyDeductionRate')}
                      InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                      helperText="Deducted for every hour less than expected daily hours" />
                  </Grid>
                </Grid>
              )}
            </Box>

            {/* Late arrival */}
            <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={1.5}>
                <Box display="flex" alignItems="center" gap={1}>
                  <AccessTime color="error" fontSize="small" />
                  <Typography variant="body2" fontWeight={700}>Late Arrival Penalty</Typography>
                </Box>
                <FormControlLabel
                  control={<Switch checked={settings.lateArrivalPenaltyEnabled} onChange={toggle('lateArrivalPenaltyEnabled')} color="error" size="small" />}
                  label={settings.lateArrivalPenaltyEnabled ? 'Enabled' : 'Disabled'}
                  labelPlacement="start" sx={{ m: 0 }}
                />
              </Box>
              {settings.lateArrivalPenaltyEnabled && (
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField fullWidth size="small" type="number" label="Per Late Arrival (₹)"
                      value={settings.lateArrivalRate} onChange={set('lateArrivalRate')}
                      InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                      helperText="Fixed amount per late-arrival incident. 0 = use hourly rate for late minutes" />
                  </Grid>
                </Grid>
              )}
            </Box>

            {/* Early departure */}
            <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={1.5}>
                <Box display="flex" alignItems="center" gap={1}>
                  <AccessTime color="info" fontSize="small" />
                  <Typography variant="body2" fontWeight={700}>Early Departure Penalty</Typography>
                </Box>
                <FormControlLabel
                  control={<Switch checked={settings.earlyDeparturePenaltyEnabled} onChange={toggle('earlyDeparturePenaltyEnabled')} color="info" size="small" />}
                  label={settings.earlyDeparturePenaltyEnabled ? 'Enabled' : 'Disabled'}
                  labelPlacement="start" sx={{ m: 0 }}
                />
              </Box>
              {settings.earlyDeparturePenaltyEnabled && (
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField fullWidth size="small" type="number" label="Per Early Departure (₹)"
                      value={settings.earlyDepartureRate} onChange={set('earlyDepartureRate')}
                      InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                      helperText="Fixed amount per early-departure incident. 0 = use hourly rate for early minutes" />
                  </Grid>
                </Grid>
              )}
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {/* Leave Penalty */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={2.5}>
            <SectionHeader icon={<BeachAccess />} title="Leave Penalty"
              subtitle="Deduction when monthly leave count exceeds the free allowance" />
            <FormControlLabel
              control={<Switch checked={settings.leavePenaltyEnabled} onChange={toggle('leavePenaltyEnabled')} size="small" />}
              label={settings.leavePenaltyEnabled ? 'Enabled' : 'Disabled'}
              labelPlacement="start" sx={{ m: 0, flexShrink: 0 }}
            />
          </Box>
          {settings.leavePenaltyEnabled && (
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth size="small" type="number" label="Free Leaves Per Month"
                  value={settings.freeLeavePerMonth} onChange={set('freeLeavePerMonth')}
                  inputProps={{ min: 0 }}
                  InputProps={{ endAdornment: <InputAdornment position="end">days</InputAdornment> }}
                  helperText="Leaves beyond this count are penalised" />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth size="small" type="number" label="Penalty Per Extra Leave"
                  value={settings.leavePenaltyAmount} onChange={set('leavePenaltyAmount')}
                  InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                  helperText="Deducted per leave day exceeding the free allowance" />
              </Grid>
            </Grid>
          )}
        </CardContent>
      </Card>

      {/* Preview / Summary */}
      <Card sx={{ mb: 3, bgcolor: 'primary.50', border: '1px solid', borderColor: 'primary.200' }}>
        <CardContent>
          <Typography variant="subtitle2" fontWeight={700} mb={1.5} color="primary.dark">
            📋 Policy Summary
          </Typography>
          <Grid container spacing={1}>
            {[
              [`Work Day`, `${settings.expectedLoginTime} – ${settings.expectedLogoutTime} (${settings.expectedDailyHours}h)`],
              [`Late Grace`, `${settings.lateArrivalThreshold} mins after ${settings.expectedLoginTime}`],
              [`Early Grace`, `${settings.earlyDepartureThreshold} mins before ${settings.expectedLogoutTime}`],
              [`Short Hours`, settings.shortHoursPenaltyEnabled ? `₹${settings.hourlyDeductionRate}/hr short` : 'Disabled'],
              [`Late Arrival`, settings.lateArrivalPenaltyEnabled ? (settings.lateArrivalRate > 0 ? `₹${settings.lateArrivalRate}/incident` : 'Hourly rate') : 'Disabled'],
              [`Early Departure`, settings.earlyDeparturePenaltyEnabled ? (settings.earlyDepartureRate > 0 ? `₹${settings.earlyDepartureRate}/incident` : 'Hourly rate') : 'Disabled'],
              [`Leave`, settings.leavePenaltyEnabled ? `${settings.freeLeavePerMonth} free, ₹${settings.leavePenaltyAmount}/extra` : 'Disabled'],
            ].map(([k, v]) => (
              <Grid item xs={12} sm={6} key={k}>
                <Box display="flex" justifyContent="space-between" sx={{ py: 0.5, borderBottom: '1px solid', borderColor: 'primary.100' }}>
                  <Typography variant="caption" color="text.secondary">{k}</Typography>
                  <Typography variant="caption" fontWeight={600} color="primary.dark">{v}</Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

      <Box display="flex" justifyContent="flex-end">
        <Button variant="contained" size="large"
          startIcon={saving ? <CircularProgress size={18} /> : <Save />}
          onClick={handleSave} disabled={saving}>
          Save All Settings
        </Button>
      </Box>
    </Box>
  );
};

export default PenaltySettings;