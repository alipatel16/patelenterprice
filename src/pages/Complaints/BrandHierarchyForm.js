import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Card, CardContent, Grid, TextField,
  IconButton, Alert, CircularProgress, Chip, Stack, Divider,
  InputAdornment,
} from '@mui/material';
import {
  ArrowBack, Save, Delete, AddCircle, AccountTree,
  DragIndicator, ArrowUpward, ArrowDownward,
} from '@mui/icons-material';
import {
  collection, addDoc, updateDoc, doc, getDoc, serverTimestamp,
} from 'firebase/firestore';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';

const EMPTY_LEVEL = { level: 1, title: '', personName: '', phone: '', email: '' };

const BrandHierarchyForm = () => {
  const { db } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [brandName, setBrandName] = useState('');
  const [description, setDescription] = useState('');
  const [levels, setLevels] = useState([{ ...EMPTY_LEVEL, level: 1 }]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!db || !id) return;
    setLoading(true);
    getDoc(doc(db, 'brandHierarchies', id)).then(snap => {
      if (!snap.exists()) { toast.error('Not found'); navigate('/brand-hierarchy'); return; }
      const d = snap.data();
      setBrandName(d.brandName || '');
      setDescription(d.description || '');
      setLevels(d.levels?.length ? d.levels : [{ ...EMPTY_LEVEL, level: 1 }]);
    }).finally(() => setLoading(false));
  }, [db, id, navigate]);

  const updateLevel = (i, key, val) =>
    setLevels(prev => prev.map((lv, idx) => idx === i ? { ...lv, [key]: val } : lv));

  const addLevel = () => {
    setLevels(prev => [...prev, { ...EMPTY_LEVEL, level: prev.length + 1 }]);
  };

  const removeLevel = (i) => {
    setLevels(prev => prev.filter((_, idx) => idx !== i).map((lv, idx) => ({ ...lv, level: idx + 1 })));
  };

  const moveLevel = (i, dir) => {
    const arr = [...levels];
    const swapIdx = i + dir;
    if (swapIdx < 0 || swapIdx >= arr.length) return;
    [arr[i], arr[swapIdx]] = [arr[swapIdx], arr[i]];
    setLevels(arr.map((lv, idx) => ({ ...lv, level: idx + 1 })));
  };

  const handleSave = async () => {
    setError('');
    if (!brandName.trim()) { setError('Brand name is required'); return; }
    if (levels.length === 0) { setError('At least one escalation level is required'); return; }
    if (levels.some(lv => !lv.personName.trim() || !lv.phone.trim())) {
      setError('Each level must have a person name and phone number');
      return;
    }
    setSaving(true);
    try {
      const data = {
        brandName: brandName.trim(),
        description: description.trim(),
        levels: levels.map((lv, idx) => ({
          level: idx + 1,
          title: lv.title.trim(),
          personName: lv.personName.trim(),
          phone: lv.phone.trim(),
          email: lv.email.trim(),
        })),
      };
      if (isEdit) {
        await updateDoc(doc(db, 'brandHierarchies', id), { ...data, updatedAt: serverTimestamp() });
        toast.success('Brand hierarchy updated!');
      } else {
        await addDoc(collection(db, 'brandHierarchies'), { ...data, createdAt: serverTimestamp() });
        toast.success('Brand hierarchy created!');
      }
      navigate('/brand-hierarchy');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Box display="flex" justifyContent="center" pt={8}><CircularProgress /></Box>;

  const levelColors = ['primary', 'warning', 'error', 'secondary', 'success'];

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 900, mx: 'auto' }}>
      <Box display="flex" alignItems="center" gap={2} mb={3}>
        <IconButton onClick={() => navigate('/brand-hierarchy')}><ArrowBack /></IconButton>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            {isEdit ? 'Edit Brand Hierarchy' : 'New Brand Hierarchy'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Configure escalation levels for service complaints
          </Typography>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Basic Info */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} mb={2} display="flex" alignItems="center" gap={1}>
            <AccountTree fontSize="small" color="error" /> Brand Details
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" label="Brand Name *"
                value={brandName} onChange={e => setBrandName(e.target.value)}
                placeholder="e.g. Samsung, LG, Whirlpool..." />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" label="Description (optional)"
                value={description} onChange={e => setDescription(e.target.value)}
                placeholder="e.g. Consumer Electronics brand" />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Escalation Levels */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
            <Box>
              <Typography variant="subtitle1" fontWeight={700}>Escalation Levels</Typography>
              <Typography variant="caption" color="text.secondary">
                Level 1 is the first contact. Higher levels are escalated to when unresolved.
              </Typography>
            </Box>
            <Button size="small" startIcon={<AddCircle />} color="error" onClick={addLevel}>
              Add Level
            </Button>
          </Box>

          <Stack spacing={2}>
            {levels.map((lv, i) => {
              const color = levelColors[i % levelColors.length];
              return (
                <Card key={i} elevation={0} sx={{
                  border: '2px solid',
                  borderColor: `${color}.200`,
                  borderRadius: 2,
                  bgcolor: `${color}.50`,
                }}>
                  <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
                    <Box display="flex" alignItems="center" justifyContent="space-between" mb={1.5}>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Chip
                          label={`Level ${lv.level}`}
                          color={color}
                          size="small"
                          variant="filled"
                          sx={{ fontWeight: 700, minWidth: 68 }}
                        />
                        {i === 0 && <Chip label="First Contact" size="small" variant="outlined" color="primary" sx={{ fontSize: 10 }} />}
                        {i === levels.length - 1 && levels.length > 1 && (
                          <Chip label="Final Level" size="small" variant="outlined" color="error" sx={{ fontSize: 10 }} />
                        )}
                      </Box>
                      <Box display="flex" alignItems="center" gap={0.5}>
                        <IconButton size="small" onClick={() => moveLevel(i, -1)} disabled={i === 0}>
                          <ArrowUpward sx={{ fontSize: 16 }} />
                        </IconButton>
                        <IconButton size="small" onClick={() => moveLevel(i, 1)} disabled={i === levels.length - 1}>
                          <ArrowDownward sx={{ fontSize: 16 }} />
                        </IconButton>
                        <IconButton size="small" color="error" disabled={levels.length === 1}
                          onClick={() => removeLevel(i)}>
                          <Delete fontSize="small" />
                        </IconButton>
                      </Box>
                    </Box>
                    <Grid container spacing={1.5}>
                      <Grid item xs={12} sm={3}>
                        <TextField fullWidth size="small" label="Title / Role"
                          value={lv.title} onChange={e => updateLevel(i, 'title', e.target.value)}
                          placeholder="e.g. Service Engineer" />
                      </Grid>
                      <Grid item xs={12} sm={3}>
                        <TextField fullWidth size="small" label="Person Name *"
                          value={lv.personName} onChange={e => updateLevel(i, 'personName', e.target.value)}
                          placeholder="Full name" />
                      </Grid>
                      <Grid item xs={12} sm={3}>
                        <TextField fullWidth size="small" label="Phone *"
                          value={lv.phone} onChange={e => updateLevel(i, 'phone', e.target.value)}
                          placeholder="Contact number"
                          InputProps={{ startAdornment: <InputAdornment position="start">📞</InputAdornment> }} />
                      </Grid>
                      <Grid item xs={12} sm={3}>
                        <TextField fullWidth size="small" label="Email"
                          value={lv.email} onChange={e => updateLevel(i, 'email', e.target.value)}
                          placeholder="Optional" type="email" />
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>
              );
            })}
          </Stack>

          <Button fullWidth variant="outlined" color="error" startIcon={<AddCircle />}
            onClick={addLevel} sx={{ mt: 2 }}>
            Add Another Level
          </Button>
        </CardContent>
      </Card>

      {/* Preview */}
      <Card sx={{ mb: 3, bgcolor: 'grey.50', border: '1px solid', borderColor: 'divider' }}>
        <CardContent sx={{ p: 2 }}>
          <Typography variant="subtitle2" fontWeight={700} mb={1.5}>Escalation Flow Preview</Typography>
          <Box display="flex" alignItems="center" flexWrap="wrap" gap={1}>
            {levels.map((lv, i) => (
              <React.Fragment key={i}>
                <Box sx={{
                  px: 1.5, py: 0.75, borderRadius: 1,
                  bgcolor: `${levelColors[i % levelColors.length]}.100`,
                  border: '1px solid',
                  borderColor: `${levelColors[i % levelColors.length]}.300`,
                  textAlign: 'center', minWidth: 100,
                }}>
                  <Typography variant="caption" fontWeight={700} color={`${levelColors[i % levelColors.length]}.main`} display="block">
                    L{lv.level}{lv.title ? ` · ${lv.title}` : ''}
                  </Typography>
                  <Typography variant="caption" color="text.primary" fontWeight={600}>
                    {lv.personName || '—'}
                  </Typography>
                </Box>
                {i < levels.length - 1 && (
                  <Typography color="text.disabled" fontWeight={700}>→</Typography>
                )}
              </React.Fragment>
            ))}
            {levels.length > 0 && (
              <>
                <Typography color="text.disabled" fontWeight={700}>→</Typography>
                <Box sx={{ px: 1.5, py: 0.75, borderRadius: 1, bgcolor: 'grey.200', border: '1px solid', borderColor: 'grey.400', textAlign: 'center', minWidth: 100 }}>
                  <Typography variant="caption" fontWeight={700} color="text.secondary" display="block">Default</Typography>
                  <Typography variant="caption" color="text.secondary">Global Handler</Typography>
                </Box>
              </>
            )}
          </Box>
        </CardContent>
      </Card>

      <Box display="flex" gap={2} justifyContent="flex-end">
        <Button variant="outlined" onClick={() => navigate('/brand-hierarchy')}>Cancel</Button>
        <Button variant="contained" color="error" size="large"
          startIcon={saving ? <CircularProgress size={16} /> : <Save />}
          onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : isEdit ? 'Update Hierarchy' : 'Save Hierarchy'}
        </Button>
      </Box>
    </Box>
  );
};

export default BrandHierarchyForm;