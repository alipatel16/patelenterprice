import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Card, CardContent, Grid, TextField,
  MenuItem, Select, FormControl, InputLabel, IconButton, Alert,
  CircularProgress, Chip, Stack, Divider, InputAdornment,
} from '@mui/material';
import {
  ArrowBack, Save, Delete, AddCircle, CardGiftcard,
} from '@mui/icons-material';
import {
  collection, addDoc, updateDoc, doc, getDoc, serverTimestamp,
} from 'firebase/firestore';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';
import { formatCurrency } from '../../utils';

const EMPTY_ITEM = { name: '', qty: 1, type: 'free', price: 0, unit: 'pcs' };

const GiftSetForm = () => {
  const { db } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!db || !id) return;
    setLoading(true);
    getDoc(doc(db, 'giftSets', id)).then(snap => {
      if (!snap.exists()) { toast.error('Gift set not found'); navigate('/gift-sets'); return; }
      const d = snap.data();
      setName(d.name || '');
      setDescription(d.description || '');
      setItems(d.items?.length ? d.items : [{ ...EMPTY_ITEM }]);
    }).catch(() => toast.error('Failed to load'))
      .finally(() => setLoading(false));
  }, [db, id, navigate]);

  const updateItem = (i, key, val) =>
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [key]: val } : it));

  const totalValue = items.reduce((s, it) => {
    if (it.type === 'paid') return s + (parseFloat(it.price) || 0) * (parseFloat(it.qty) || 0);
    return s;
  }, 0);

  const handleSave = async () => {
    setError('');
    if (!name.trim()) { setError('Gift set name is required'); return; }
    if (items.some(it => !it.name.trim())) { setError('All items must have a name'); return; }
    if (items.some(it => (parseFloat(it.qty) || 0) <= 0)) { setError('All quantities must be > 0'); return; }

    setSaving(true);
    try {
      const data = {
        name: name.trim(),
        description: description.trim(),
        companyId: 'company_1',
        items: items.map(it => ({
          name: it.name.trim(),
          qty: parseFloat(it.qty) || 1,
          type: it.type,
          price: it.type === 'paid' ? parseFloat(it.price) || 0 : 0,
          unit: it.unit || 'pcs',
        })),
      };

      if (isEdit) {
        await updateDoc(doc(db, 'giftSets', id), { ...data, updatedAt: serverTimestamp() });
        toast.success('Gift set updated!');
      } else {
        await addDoc(collection(db, 'giftSets'), { ...data, createdAt: serverTimestamp() });
        toast.success('Gift set created!');
      }
      navigate('/gift-sets');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Box display="flex" justifyContent="center" pt={8}><CircularProgress /></Box>;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 900, mx: 'auto' }}>
      {/* Header */}
      <Box display="flex" alignItems="center" gap={2} mb={3}>
        <IconButton onClick={() => navigate('/gift-sets')}><ArrowBack /></IconButton>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            {isEdit ? 'Edit Gift Set' : 'New Gift Set'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Only for Patel Electronics And Furniture
          </Typography>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Basic Info */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} mb={2} display="flex" alignItems="center" gap={1}>
            <CardGiftcard fontSize="small" color="secondary" /> Gift Set Details
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth label="Gift Set Name *" size="small"
                value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. TV Purchase Gift Pack (11 items)"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth label="Description (optional)" size="small"
                value={description} onChange={e => setDescription(e.target.value)}
                placeholder='"e.g. Free gifts on purchase of 43\" LED TV"'
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Items */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
            <Box>
              <Typography variant="subtitle1" fontWeight={700}>Gift Items</Typography>
              <Typography variant="caption" color="text.secondary">
                {items.length} item{items.length !== 1 ? 's' : ''} ·{' '}
                {items.filter(i => i.type === 'free').length} free,{' '}
                {items.filter(i => i.type === 'paid').length} paid
                {totalValue > 0 ? ` · Paid total: ${formatCurrency(totalValue)}` : ''}
              </Typography>
            </Box>
            <Button size="small" startIcon={<AddCircle />}
              onClick={() => setItems(p => [...p, { ...EMPTY_ITEM }])}>
              Add Item
            </Button>
          </Box>

          <Stack spacing={1.5}>
            {items.map((it, i) => (
              <Card
                key={i}
                elevation={0}
                sx={{
                  border: '1px solid',
                  borderColor: it.type === 'free' ? 'success.200' : 'primary.200',
                  borderRadius: 2,
                  bgcolor: it.type === 'free' ? 'success.50' : 'primary.50',
                }}
              >
                <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
                  <Box display="flex" alignItems="center" justifyContent="space-between" mb={1.5}>
                    <Chip
                      label={`Item ${i + 1}`}
                      size="small"
                      color={it.type === 'free' ? 'success' : 'primary'}
                      variant="outlined"
                    />
                    <IconButton size="small" color="error" disabled={items.length === 1}
                      onClick={() => setItems(p => p.filter((_, idx) => idx !== i))}>
                      <Delete fontSize="small" />
                    </IconButton>
                  </Box>
                  <Grid container spacing={1.5}>
                    {/* Item Name */}
                    <Grid item xs={12} sm={4}>
                      <TextField
                        fullWidth size="small" label="Item Name *"
                        value={it.name} onChange={e => updateItem(i, 'name', e.target.value)}
                        placeholder="e.g. LED Bulb, Wall Clock..."
                      />
                    </Grid>
                    {/* Type */}
                    <Grid item xs={6} sm={2}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Type</InputLabel>
                        <Select value={it.type} onChange={e => updateItem(i, 'type', e.target.value)} label="Type">
                          <MenuItem value="free">
                            <Chip label="Free" size="small" color="success" sx={{ cursor: 'pointer' }} />
                          </MenuItem>
                          <MenuItem value="paid">
                            <Chip label="Paid" size="small" color="primary" sx={{ cursor: 'pointer' }} />
                          </MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    {/* Qty */}
                    <Grid item xs={6} sm={2}>
                      <TextField
                        fullWidth size="small" label="Qty *" type="number"
                        value={it.qty} onChange={e => updateItem(i, 'qty', e.target.value)}
                        inputProps={{ min: 1 }}
                      />
                    </Grid>
                    {/* Unit */}
                    <Grid item xs={6} sm={2}>
                      <TextField
                        fullWidth size="small" label="Unit"
                        value={it.unit} onChange={e => updateItem(i, 'unit', e.target.value)}
                        placeholder="pcs"
                      />
                    </Grid>
                    {/* Price (only if paid) */}
                    {it.type === 'paid' && (
                      <Grid item xs={6} sm={2}>
                        <TextField
                          fullWidth size="small" label="Price (₹)" type="number"
                          value={it.price} onChange={e => updateItem(i, 'price', e.target.value)}
                          inputProps={{ min: 0 }}
                          InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                        />
                      </Grid>
                    )}
                  </Grid>
                </CardContent>
              </Card>
            ))}
          </Stack>

          <Button
            fullWidth variant="outlined" startIcon={<AddCircle />}
            onClick={() => setItems(p => [...p, { ...EMPTY_ITEM }])}
            sx={{ mt: 2 }}
          >
            Add Another Item
          </Button>
        </CardContent>
      </Card>

      {/* Summary */}
      {items.length > 0 && (
        <Card sx={{ mb: 3, bgcolor: 'secondary.50', border: '1px solid', borderColor: 'secondary.200' }}>
          <CardContent sx={{ p: 2 }}>
            <Typography variant="subtitle2" fontWeight={700} mb={1} color="secondary.main">
              Gift Set Summary
            </Typography>
            <Grid container spacing={1}>
              {[
                { label: 'Total Items', value: items.length },
                { label: 'Free Items', value: items.filter(i => i.type === 'free').length, color: 'success.main' },
                { label: 'Paid Items', value: items.filter(i => i.type === 'paid').length, color: 'primary.main' },
                { label: 'Paid Value', value: formatCurrency(totalValue), color: 'primary.main' },
              ].map(({ label, value, color }) => (
                <Grid item xs={6} sm={3} key={label}>
                  <Box sx={{ textAlign: 'center', p: 1, bgcolor: 'background.paper', borderRadius: 1 }}>
                    <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
                    <Typography variant="body1" fontWeight={800} color={color || 'text.primary'}>{value}</Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Save */}
      <Box display="flex" gap={2} justifyContent="flex-end">
        <Button variant="outlined" onClick={() => navigate('/gift-sets')}>Cancel</Button>
        <Button
          variant="contained" color="secondary"
          startIcon={saving ? <CircularProgress size={16} /> : <Save />}
          onClick={handleSave} disabled={saving} size="large"
        >
          {saving ? 'Saving...' : isEdit ? 'Update Gift Set' : 'Save Gift Set'}
        </Button>
      </Box>
    </Box>
  );
};

export default GiftSetForm;