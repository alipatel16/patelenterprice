// src/pages/Employees/EmployeeProfile.js
import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, TextField,
  Button, IconButton, CircularProgress, Alert, Divider,
  FormGroup, FormControlLabel, Checkbox, Chip, Stack,
  Autocomplete, Avatar, InputAdornment, Tooltip,
} from '@mui/material';
import {
  ArrowBack, Save, Person, Lock, Assignment,
  AttachMoney, CheckCircle, Delete as DeleteIcon,
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

        // FIX: auto-remove assigned checklists whose template has been deleted
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

  // FIX: unassign a specific checklist template
  const handleUnassignChecklist = (templateId) => {
    setAssignedChecklists(prev => prev.filter(cl => cl.templateId !== templateId));
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

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 900, mx: 'auto' }}>
      {/* Header */}
      <Box display="flex" alignItems="center" gap={2} mb={3}>
        <IconButton onClick={() => navigate('/employees')}><ArrowBack /></IconButton>
        <Box display="flex" alignItems="center" gap={2} flex={1}>
          <Avatar sx={{ width: 48, height: 48, bgcolor: 'primary.main', fontSize: 20 }}>
            {(emp.name || '?')[0].toUpperCase()}
          </Avatar>
          <Box>
            <Typography variant="h5" fontWeight={700}>{emp.name}</Typography>
            <Typography variant="body2" color="text.secondary">{emp.email}</Typography>
          </Box>
        </Box>
        <Chip label={emp.role === 'admin' ? 'Admin' : 'Employee'} color={emp.role === 'admin' ? 'error' : 'primary'} size="small" />
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Profile Details */}
      <Card sx={{ mb: 3 }}>
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
      <Card sx={{ mb: 3 }}>
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
      <Card sx={{ mb: 3 }}>
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
                      {/* FIX: unassign button */}
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
      <Box display="flex" justifyContent="flex-end" gap={2}>
        <Button variant="outlined" onClick={() => navigate('/employees')}>Cancel</Button>
        <Button variant="contained" startIcon={saving ? <CircularProgress size={16} /> : <Save />}
          onClick={handleSave} disabled={saving}>
          Save Changes
        </Button>
      </Box>
    </Box>
  );
};

export default EmployeeProfile;