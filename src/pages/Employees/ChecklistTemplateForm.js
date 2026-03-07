// src/pages/Employees/ChecklistTemplateForm.js
import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, TextField,
  Button, IconButton, CircularProgress, Alert,
  FormControl, InputLabel, Select, MenuItem, FormHelperText,
  ToggleButtonGroup, ToggleButton, Chip, Stack,
} from '@mui/material';
import { ArrowBack, Save, Checklist } from '@mui/icons-material';
import {
  collection, addDoc, updateDoc, doc, getDoc, serverTimestamp,
} from 'firebase/firestore';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';
import { DAYS_OF_WEEK } from './employeeConstants';

const OCCURRENCE_TYPES = [
  { value: 'daily',   label: 'Daily',   desc: 'Generated every single working day' },
  { value: 'weekly',  label: 'Weekly',  desc: 'Generated on a specific day each week' },
  { value: 'monthly', label: 'Monthly', desc: 'Generated on a specific day each month' },
];

const ChecklistTemplateForm = () => {
  const { db } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [title,          setTitle]          = useState('');
  const [description,    setDescription]    = useState('');
  const [occurrenceType, setOccurrenceType] = useState('daily');
  const [dayOfWeek,      setDayOfWeek]      = useState(1); // Monday default
  const [dayOfMonth,     setDayOfMonth]     = useState(1);
  const [loading,        setLoading]        = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState('');

  useEffect(() => {
    if (!db || !id) return;
    setLoading(true);
    getDoc(doc(db, 'checklistTemplates', id)).then(snap => {
      if (!snap.exists()) { toast.error('Not found'); navigate('/checklist-templates'); return; }
      const d = snap.data();
      setTitle(d.title || '');
      setDescription(d.description || '');
      setOccurrenceType(d.occurrenceType || 'daily');
      setDayOfWeek(d.dayOfWeek ?? 1);
      setDayOfMonth(d.dayOfMonth ?? 1);
    }).finally(() => setLoading(false));
  }, [db, id, navigate]);

  const handleSave = async () => {
    setError('');
    if (!title.trim()) { setError('Title is required'); return; }
    if (occurrenceType === 'weekly' && (dayOfWeek === null || dayOfWeek === undefined)) {
      setError('Select a day of week'); return;
    }
    if (occurrenceType === 'monthly' && (!dayOfMonth || dayOfMonth < 1 || dayOfMonth > 31)) {
      setError('Enter a valid day of month (1-31)'); return;
    }
    setSaving(true);
    try {
      const data = {
        title: title.trim(),
        description: description.trim(),
        occurrenceType,
        dayOfWeek:  occurrenceType === 'weekly'  ? dayOfWeek  : null,
        dayOfMonth: occurrenceType === 'monthly' ? dayOfMonth : null,
        updatedAt: serverTimestamp(),
      };
      if (isEdit) {
        await updateDoc(doc(db, 'checklistTemplates', id), data);
        toast.success('Template updated!');
      } else {
        await addDoc(collection(db, 'checklistTemplates'), { ...data, createdAt: serverTimestamp() });
        toast.success('Template created!');
      }
      navigate('/checklist-templates');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Box display="flex" justifyContent="center" pt={8}><CircularProgress /></Box>;

  const previewLabel = () => {
    if (occurrenceType === 'daily') return 'This checklist will be generated every day';
    if (occurrenceType === 'weekly') {
      const day = DAYS_OF_WEEK.find(d => d.value === dayOfWeek)?.label || '';
      return `This checklist will be generated every ${day}`;
    }
    return `This checklist will be generated on day ${dayOfMonth} of every month`;
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 700, mx: 'auto' }}>
      {/* Header */}
      <Box display="flex" alignItems="center" gap={2} mb={3}>
        <IconButton onClick={() => navigate('/checklist-templates')}><ArrowBack /></IconButton>
        <Box flex={1}>
          <Typography variant="h5" fontWeight={700}>
            {isEdit ? 'Edit Checklist Template' : 'New Checklist Template'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Define what and when this checklist should appear for employees
          </Typography>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Basic Info */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <Checklist color="primary" />
            <Typography variant="subtitle1" fontWeight={700}>Checklist Details</Typography>
          </Box>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField fullWidth size="small" label="Title *"
                value={title} onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Daily Opening Checklist, Weekly Inventory Check…" />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth size="small" label="Description"
                multiline rows={2} value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe what this checklist covers…" />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Occurrence */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} mb={2}>Occurrence Type</Typography>

          <Stack spacing={1.5} mb={2}>
            {OCCURRENCE_TYPES.map(ot => (
              <Box
                key={ot.value}
                onClick={() => setOccurrenceType(ot.value)}
                sx={{
                  p: 2, borderRadius: 1, cursor: 'pointer', border: '2px solid',
                  borderColor: occurrenceType === ot.value ? 'primary.main' : 'divider',
                  bgcolor: occurrenceType === ot.value ? 'primary.50' : 'background.paper',
                  transition: 'all 0.15s',
                }}
              >
                <Box display="flex" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography variant="body1" fontWeight={600}>{ot.label}</Typography>
                    <Typography variant="body2" color="text.secondary">{ot.desc}</Typography>
                  </Box>
                  {occurrenceType === ot.value && (
                    <Chip label="Selected" color="primary" size="small" />
                  )}
                </Box>
              </Box>
            ))}
          </Stack>

          {/* Weekly — day of week selector */}
          {occurrenceType === 'weekly' && (
            <Box mt={2}>
              <Typography variant="body2" fontWeight={600} mb={1}>Select Day of Week</Typography>
              <ToggleButtonGroup
                value={dayOfWeek}
                exclusive
                onChange={(_, v) => v !== null && setDayOfWeek(v)}
                size="small"
                sx={{ flexWrap: 'wrap', gap: 0.5 }}
              >
                {DAYS_OF_WEEK.map(d => (
                  <ToggleButton key={d.value} value={d.value}
                    sx={{ minWidth: { xs: 40, sm: 56 } }}>
                    {d.label.slice(0, 3)}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
          )}

          {/* Monthly — day of month */}
          {occurrenceType === 'monthly' && (
            <Box mt={2}>
              <Typography variant="body2" fontWeight={600} mb={1}>Select Day of Month</Typography>
              <Box display="flex" flexWrap="wrap" gap={0.75}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                  <Box
                    key={day}
                    onClick={() => setDayOfMonth(day)}
                    sx={{
                      width: 36, height: 36, borderRadius: 1, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: '1px solid',
                      borderColor: dayOfMonth === day ? 'primary.main' : 'divider',
                      bgcolor: dayOfMonth === day ? 'primary.main' : 'background.paper',
                      color: dayOfMonth === day ? 'primary.contrastText' : 'text.primary',
                      fontWeight: dayOfMonth === day ? 700 : 400,
                      fontSize: 13,
                      transition: 'all 0.1s',
                      '&:hover': { bgcolor: dayOfMonth === day ? 'primary.dark' : 'grey.100' },
                    }}>
                    {day}
                  </Box>
                ))}
              </Box>
              <FormHelperText>For months with fewer days, checklist won't generate if the day doesn't exist</FormHelperText>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Preview */}
      <Card sx={{ mb: 3, bgcolor: 'success.50', border: '1px solid', borderColor: 'success.200' }}>
        <CardContent sx={{ py: '12px !important' }}>
          <Typography variant="body2" fontWeight={600} color="success.dark">
            📅 {previewLabel()}
          </Typography>
        </CardContent>
      </Card>

      {/* Actions */}
      <Box display="flex" justifyContent="flex-end" gap={2}>
        <Button variant="outlined" onClick={() => navigate('/checklist-templates')}>Cancel</Button>
        <Button variant="contained" startIcon={saving ? <CircularProgress size={16} /> : <Save />}
          onClick={handleSave} disabled={saving}>
          {isEdit ? 'Update Template' : 'Create Template'}
        </Button>
      </Box>
    </Box>
  );
};

export default ChecklistTemplateForm;