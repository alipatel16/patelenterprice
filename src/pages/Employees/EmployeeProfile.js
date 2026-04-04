// src/pages/Employees/EmployeeProfile.js
import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, TextField,
  Button, IconButton, CircularProgress, Alert, Divider,
  FormGroup, FormControlLabel, Checkbox, Chip, Stack,
  Autocomplete, Avatar, InputAdornment, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import {
  ArrowBack, Save, Person, Lock, Assignment,
  AttachMoney, CheckCircle, Delete as DeleteIcon,
  Block, CheckCircleOutline,
} from '@mui/icons-material';
import {
  doc, getDoc, updateDoc, serverTimestamp,
  collection, getDocs, query, orderBy,
} from 'firebase/firestore';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';
import { ALL_PAGES } from './employeeConstants';

const EmployeeProfile = () => {
  const { db } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [emp,      setEmp]      = useState(null);

  // Editable fields
  const [salary,       setSalary]       = useState('');
  const [phone,        setPhone]        = useState('');
  const [department,   setDepartment]   = useState('');
  const [joinDate,     setJoinDate]     = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [allowedPages, setAllowedPages] = useState([]);
  const [allAccessMode, setAllAccessMode] = useState(true);

  // Checklists
  const [checklistTemplates,  setChecklistTemplates]  = useState([]);
  const [assignedChecklists,  setAssignedChecklists]  = useState([]);

  // Disable/enable dialog
  const [disableDialogOpen, setDisableDialogOpen] = useState(false);
  const [togglingStatus,    setTogglingStatus]    = useState(false);

  useEffect(() => {
    if (!db || !id) return;
    const load = async () => {
      setLoading(true);
      try {
        const [empSnap, clSnap] = await Promise.all([
          getDoc(doc(db, 'users', id)),
          getDocs(query(collection(db, 'checklistTemplates'), orderBy('title'))),
        ]);

        if (!empSnap.exists()) { toast.error('Employee not found'); navigate('/employees'); return; }
        const data = empSnap.data();
        setEmp({ id: empSnap.id, ...data });
        setSalary(data.salary?.toString() || '');
        setPhone(data.phone || '');
        setDepartment(data.department || '');
        setJoinDate(data.joinDate || '');
        setEmployeeCode(data.employeeCode || '');
        if (data.allowedPages && data.allowedPages.length > 0) {
          setAllowedPages(data.allowedPages);
          setAllAccessMode(false);
        } else {
          setAllAccessMode(true);
          setAllowedPages([]);
        }

        const templates = clSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setChecklistTemplates(templates);

        const activeTemplateIds = new Set(templates.map(t => t.id));
        const filteredChecklists = (data.assignedChecklists || []).filter(
          cl => activeTemplateIds.has(cl.templateId)
        );
        setAssignedChecklists(filteredChecklists);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [db, id, navigate]);

  const togglePage = (path) => {
    setAllowedPages(prev =>
      prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
    );
  };

  const toggleAllAccess = () => {
    if (!allAccessMode) {
      setAllAccessMode(true);
      setAllowedPages([]);
    } else {
      setAllAccessMode(false);
      setAllowedPages(ALL_PAGES.map(p => p.path));
    }
  };

  const handleUnassignChecklist = (templateId) => {
    setAssignedChecklists(prev => prev.filter(cl => cl.templateId !== templateId));
  };

  // ── Toggle disabled status ──────────────────────────────────────────────────
  const handleToggleDisabled = async () => {
    if (!emp) return;
    setTogglingStatus(true);
    try {
      const newDisabled = !emp.disabled;
      await updateDoc(doc(db, 'users', id), {
        disabled:  newDisabled,
        updatedAt: serverTimestamp(),
      });
      setEmp(prev => ({ ...prev, disabled: newDisabled }));
      toast.success(newDisabled ? 'Employee account disabled.' : 'Employee account re-enabled.');
      setDisableDialogOpen(false);
    } catch (e) {
      toast.error('Failed: ' + e.message);
    } finally {
      setTogglingStatus(false);
    }
  };

  const handleSave = async () => {
    if (!emp) return;
    setSaving(true);
    setError('');
    try {
      await updateDoc(doc(db, 'users', id), {
        salary:             salary ? parseFloat(salary) : null,
        phone,
        department,
        joinDate,
        employeeCode,
        allowedPages:       allAccessMode ? [] : allowedPages,
        assignedChecklists,
        updatedAt:          serverTimestamp(),
      });
      toast.success('Employee profile updated!');
      navigate('/employees');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const occurrenceBadge = (t) => {
    if (t.occurrenceType === 'daily') return 'Daily';
    if (t.occurrenceType === 'weekly') {
      const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      return `Weekly · ${days[t.dayOfWeek] || ''}`;
    }
    return `Monthly · Day ${t.dayOfMonth}`;
  };

  if (loading) return <Box display="flex" justifyContent="center" pt={8}><CircularProgress /></Box>;
  if (!emp)    return null;

  const isDisabled = Boolean(emp.disabled);

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 900, mx: 'auto' }}>

      {/* ── Disabled banner ── */}
      {isDisabled && (
        <Alert
          severity="error"
          sx={{ mb: 2, fontWeight: 600 }}
          icon={<Block />}
          action={
            <Button size="small" color="inherit" onClick={() => setDisableDialogOpen(true)}>
              Re-enable
            </Button>
          }
        >
          This employee account is <strong>disabled</strong>. They cannot log in.
        </Alert>
      )}

      {/* Header */}
      <Box display="flex" alignItems="center" gap={2} mb={3} flexWrap="wrap">
        <IconButton onClick={() => navigate('/employees')}><ArrowBack /></IconButton>
        <Box display="flex" alignItems="center" gap={2} flex={1} minWidth={0}>
          <Avatar sx={{ width: 48, height: 48, bgcolor: isDisabled ? 'text.disabled' : 'primary.main', fontSize: 20, flexShrink: 0 }}>
            {(emp.name || '?')[0].toUpperCase()}
          </Avatar>
          <Box minWidth={0}>
            <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
              <Typography variant="h5" fontWeight={700}>{emp.name}</Typography>
              {isDisabled && (
                <Chip label="Disabled" color="error" size="small" icon={<Block sx={{ fontSize: '14px !important' }} />} />
              )}
            </Box>
            <Typography variant="body2" color="text.secondary" noWrap>{emp.email}</Typography>
          </Box>
        </Box>
        <Stack direction="row" spacing={1} flexShrink={0}>
          <Chip
            label={emp.role === 'admin' ? 'Admin' : 'Employee'}
            color={emp.role === 'admin' ? 'error' : 'primary'}
            size="small"
          />
          {/* Disable / Enable button — hidden for admins */}
          {emp.role !== 'admin' && (
            <Tooltip title={isDisabled ? 'Re-enable this account' : 'Disable this account'}>
              <Button
                size="small"
                variant="outlined"
                color={isDisabled ? 'success' : 'error'}
                startIcon={isDisabled ? <CheckCircleOutline /> : <Block />}
                onClick={() => setDisableDialogOpen(true)}
              >
                {isDisabled ? 'Enable' : 'Disable'}
              </Button>
            </Tooltip>
          )}
        </Stack>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Profile Details */}
      <Card sx={{ mb: 3, opacity: isDisabled ? 0.75 : 1 }}>
        <CardContent>
          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <Person color="primary" />
            <Typography variant="subtitle1" fontWeight={700}>Profile Details</Typography>
          </Box>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Phone Number" value={phone}
                onChange={e => setPhone(e.target.value)} size="small"
                InputProps={{ startAdornment: <InputAdornment position="start">📱</InputAdornment> }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Employee Code" value={employeeCode}
                onChange={e => setEmployeeCode(e.target.value)} size="small" />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Department" value={department}
                onChange={e => setDepartment(e.target.value)} size="small" />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Join Date" type="date" value={joinDate}
                onChange={e => setJoinDate(e.target.value)} size="small"
                InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Monthly Salary (₹)" type="number" value={salary}
                onChange={e => setSalary(e.target.value)} size="small"
                InputProps={{ startAdornment: <InputAdornment position="start"><AttachMoney fontSize="small" /></InputAdornment> }} />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Page Access Control */}
      <Card sx={{ mb: 3, opacity: isDisabled ? 0.75 : 1 }}>
        <CardContent>
          <Box display="flex" alignItems="center" gap={1} mb={1}>
            <Lock color="warning" />
            <Typography variant="subtitle1" fontWeight={700}>Page Access Control</Typography>
          </Box>
          <FormControlLabel
            control={<Checkbox checked={allAccessMode} onChange={toggleAllAccess} color="success" />}
            label={<Typography variant="body2">All Access (no restrictions)</Typography>}
            sx={{ mb: 1 }}
          />
          {!allAccessMode && (
            <>
              <Divider sx={{ my: 1.5 }} />
              <Typography variant="body2" color="text.secondary" mb={1}>
                Select which pages this employee can access:
              </Typography>
              <FormGroup>
                <Grid container>
                  {ALL_PAGES.map(page => (
                    <Grid item xs={12} sm={6} key={page.path}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={allowedPages.includes(page.path)}
                            onChange={() => togglePage(page.path)}
                            size="small"
                          />
                        }
                        label={<Typography variant="body2">{page.label}</Typography>}
                      />
                    </Grid>
                  ))}
                </Grid>
              </FormGroup>
              <Box display="flex" gap={1} mt={1}>
                <Button size="small" variant="outlined"
                  onClick={() => setAllowedPages(ALL_PAGES.map(p => p.path))}>
                  Select All
                </Button>
                <Button size="small" variant="outlined" color="error"
                  onClick={() => setAllowedPages([])}>
                  Clear All
                </Button>
              </Box>
            </>
          )}
        </CardContent>
      </Card>

      {/* Assigned Checklists */}
      <Card sx={{ mb: 3, opacity: isDisabled ? 0.75 : 1 }}>
        <CardContent>
          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <Assignment color="info" />
            <Typography variant="subtitle1" fontWeight={700}>Assigned Checklists</Typography>
            <Chip label={assignedChecklists.length} size="small" color="info" />
          </Box>

          <Autocomplete
            multiple
            options={checklistTemplates}
            getOptionLabel={opt => opt.title}
            value={checklistTemplates.filter(t => assignedChecklists.some(a => a.templateId === t.id))}
            onChange={(_, selected) => {
              setAssignedChecklists(selected.map(s => ({
                templateId:     s.id,
                templateTitle:  s.title,
                occurrenceType: s.occurrenceType,
                dayOfWeek:      s.dayOfWeek,
                dayOfMonth:     s.dayOfMonth,
              })));
            }}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip
                  key={option.id}
                  label={option.title}
                  size="small"
                  color="info"
                  variant="outlined"
                  {...getTagProps({ index })}
                />
              ))
            }
            renderOption={(props, option) => (
              <Box component="li" {...props}>
                <Box>
                  <Typography variant="body2" fontWeight={600}>{option.title}</Typography>
                  <Typography variant="caption" color="text.secondary">{occurrenceBadge(option)}</Typography>
                </Box>
              </Box>
            )}
            renderInput={params => (
              <TextField {...params} size="small" label="Search & assign checklist templates"
                placeholder="Type to search…" />
            )}
            isOptionEqualToValue={(opt, val) => opt.id === val.id}
          />

          {assignedChecklists.length > 0 && (
            <Box mt={2}>
              <Stack spacing={1}>
                {assignedChecklists.map((cl, i) => (
                  <Box key={i} display="flex" alignItems="center" justifyContent="space-between"
                    sx={{ p: 1.5, bgcolor: 'info.50', borderRadius: 1, border: '1px solid', borderColor: 'info.200' }}>
                    <Box display="flex" alignItems="center" gap={1}>
                      <CheckCircle sx={{ color: 'info.main', fontSize: 18 }} />
                      <Typography variant="body2" fontWeight={600}>{cl.templateTitle}</Typography>
                    </Box>
                    <Box display="flex" alignItems="center" gap={1}>
                      <Chip
                        label={
                          cl.occurrenceType === 'daily' ? 'Daily' :
                          cl.occurrenceType === 'weekly' ? `Weekly · Day ${cl.dayOfWeek ?? ''}` :
                          `Monthly · ${cl.dayOfMonth}`
                        }
                        size="small" variant="outlined" color="info"
                      />
                      <Tooltip title="Unassign this checklist">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleUnassignChecklist(cl.templateId)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>
                ))}
              </Stack>
            </Box>
          )}

          {checklistTemplates.length === 0 && (
            <Alert severity="info" sx={{ mt: 2 }}>
              No checklist templates found.{' '}
              <Button size="small" onClick={() => navigate('/checklist-templates/new')}>
                Create one
              </Button>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Save Footer */}
      <Box display="flex" justifyContent="flex-end" gap={2} flexWrap="wrap">
        <Button variant="outlined" onClick={() => navigate('/employees')}>Cancel</Button>
        <Button variant="contained" startIcon={saving ? <CircularProgress size={16} /> : <Save />}
          onClick={handleSave} disabled={saving}>
          Save Changes
        </Button>
      </Box>

      {/* ── Disable / Enable Confirmation Dialog ── */}
      <Dialog open={disableDialogOpen} onClose={() => setDisableDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {isDisabled
            ? <><CheckCircleOutline color="success" /> Re-enable Account</>
            : <><Block color="error" /> Disable Account</>
          }
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {isDisabled
              ? <>Are you sure you want to <strong>re-enable</strong> <strong>{emp.name}</strong>'s account? They will be able to log in again.</>
              : <>Are you sure you want to <strong>disable</strong> <strong>{emp.name}</strong>'s account? They will be immediately signed out and blocked from logging in.</>
            }
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDisableDialogOpen(false)} variant="outlined">Cancel</Button>
          <Button
            onClick={handleToggleDisabled}
            variant="contained"
            color={isDisabled ? 'success' : 'error'}
            disabled={togglingStatus}
            startIcon={togglingStatus
              ? <CircularProgress size={16} />
              : isDisabled ? <CheckCircleOutline /> : <Block />
            }
          >
            {togglingStatus
              ? 'Updating…'
              : isDisabled ? 'Yes, Re-enable' : 'Yes, Disable'
            }
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
};

export default EmployeeProfile;