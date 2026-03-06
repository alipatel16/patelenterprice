import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Card, CardContent, Grid, TextField,
  Alert, CircularProgress, IconButton, Autocomplete, Chip, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, FormControl,
  InputLabel, Select, MenuItem,
} from '@mui/material';
import {
  ArrowBack, Save, CardGiftcard, PersonAdd, CheckCircle,
  HourglassEmpty,
} from '@mui/icons-material';
import {
  collection, query, orderBy, getDocs, addDoc, updateDoc, doc,
  serverTimestamp, getDoc, getCountFromServer,
} from 'firebase/firestore';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';
import { COMPANIES, CUSTOMER_TYPES, CUSTOMER_CATEGORIES } from '../../constants';
import { generateInvoiceNumber, formatCurrency } from '../../utils';

const COMPANY = COMPANIES['company_1'];

const EMPTY_CUSTOMER_FORM = {
  name: '', phone: '', email: '', address: '', city: '',
  state: 'Gujarat', customerType: 'retail', category: 'individual',
};

const NewCustomerDialog = ({ open, onClose, onSave }) => {
  const [form, setForm] = useState(EMPTY_CUSTOMER_FORM);
  const [loading, setLoading] = useState(false);
  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }));
  useEffect(() => { if (open) setForm(EMPTY_CUSTOMER_FORM); }, [open]);
  const handleSave = async () => {
    if (!form.name || !form.phone) { toast.error('Name & phone required'); return; }
    setLoading(true);
    try { await onSave(form); onClose(); } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Quick Add Customer</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} mt={0}>
          <Grid item xs={6}>
            <FormControl fullWidth size="small"><InputLabel>Type</InputLabel>
              <Select value={form.customerType} onChange={set('customerType')} label="Type">
                {CUSTOMER_TYPES.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6}>
            <FormControl fullWidth size="small"><InputLabel>Category</InputLabel>
              <Select value={form.category} onChange={set('category')} label="Category">
                {CUSTOMER_CATEGORIES.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          {[['name', 'Full Name *', 12], ['phone', 'Phone *', 6], ['email', 'Email', 6],
            ['city', 'City', 6], ['state', 'State', 6], ['address', 'Address', 12]]
            .map(([k, label, xs]) => (
              <Grid item xs={xs} key={k}>
                <TextField fullWidth label={label} size="small" value={form[k]} onChange={set(k)} />
              </Grid>
            ))}
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={loading}
          startIcon={loading ? <CircularProgress size={16} /> : <PersonAdd />}>
          Add Customer
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Gift Set Selector Card ───────────────────────────────────────────────────
const GiftSetCard = ({ giftSet, selected, onSelect }) => (
  <Card
    elevation={0}
    onClick={() => onSelect(giftSet)}
    sx={{
      border: '2px solid',
      borderColor: selected ? 'secondary.main' : 'divider',
      borderRadius: 2,
      cursor: 'pointer',
      bgcolor: selected ? 'secondary.50' : 'background.paper',
      transition: 'all 0.15s',
      '&:hover': { borderColor: 'secondary.light', bgcolor: 'secondary.50' },
    }}
  >
    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
      <Box display="flex" alignItems="center" gap={1} mb={1}>
        <CardGiftcard color={selected ? 'secondary' : 'action'} fontSize="small" />
        <Typography variant="body2" fontWeight={700}>{giftSet.name}</Typography>
        {selected && <Chip label="Selected" color="secondary" size="small" sx={{ ml: 'auto' }} />}
      </Box>
      {giftSet.description && (
        <Typography variant="caption" color="text.secondary" display="block" mb={1}>
          {giftSet.description}
        </Typography>
      )}
      <Box display="flex" flexWrap="wrap" gap={0.5}>
        {(giftSet.items || []).map((it, i) => (
          <Chip
            key={i}
            label={`${it.name} ×${it.qty}`}
            size="small"
            color={it.type === 'free' ? 'success' : 'primary'}
            variant={selected ? 'filled' : 'outlined'}
            sx={{ fontSize: 10 }}
          />
        ))}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        {(giftSet.items || []).length} items ·{' '}
        {(giftSet.items || []).filter(i => i.type === 'free').length} free,{' '}
        {(giftSet.items || []).filter(i => i.type === 'paid').length} paid
      </Typography>
    </CardContent>
  </Card>
);

// ─── Main Component ───────────────────────────────────────────────────────────
const CreateGiftInvoice = () => {
  const { db } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [customers, setCustomers] = useState([]);
  const [giftSets, setGiftSets] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedGiftSet, setSelectedGiftSet] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [linkedSaleRef, setLinkedSaleRef] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([]); // items with delivery status
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [giftSetSearch, setGiftSetSearch] = useState('');

  useEffect(() => {
    if (!db) return;
    loadLookups();
    if (id) loadExisting();
    // eslint-disable-next-line
  }, [db]);

  const loadLookups = async () => {
    const [custSnap, gsSnap] = await Promise.all([
      getDocs(query(collection(db, 'customers'), orderBy('name'))),
      getDocs(query(collection(db, 'giftSets'), orderBy('createdAt', 'desc'))),
    ]);
    setCustomers(custSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setGiftSets(gsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const loadExisting = async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'giftInvoices', id));
      if (!snap.exists()) { toast.error('Invoice not found'); navigate('/gift-invoices'); return; }
      const d = snap.data();
      setSelectedCustomer(d.customerId
        ? { id: d.customerId, name: d.customerName, phone: d.customerPhone }
        : { id: '__manual__', name: d.customerName, phone: d.customerPhone });
      setDate(d.date || new Date().toISOString().split('T')[0]);
      setLinkedSaleRef(d.linkedSaleRef || '');
      setNotes(d.notes || '');
      setItems(d.items || []);
      // find the gift set
      if (d.giftSetId) {
        setSelectedGiftSet({ id: d.giftSetId, name: d.giftSetName, items: d.items });
      }
    } catch (e) {
      toast.error('Failed to load invoice');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectGiftSet = (gs) => {
    setSelectedGiftSet(gs);
    // Populate items with pending delivery status
    setItems((gs.items || []).map(it => ({
      ...it,
      deliveryStatus: 'pending',
      deliveredAt: null,
    })));
  };

  const handleAddNewCustomer = async form => {
    const ref = await addDoc(collection(db, 'customers'), { ...form, createdAt: serverTimestamp() });
    const newCust = { id: ref.id, ...form };
    setCustomers(p => [...p, newCust]);
    setSelectedCustomer(newCust);
    toast.success('Customer added');
  };

  const filteredGiftSets = giftSetSearch.trim()
    ? giftSets.filter(g => g.name?.toLowerCase().includes(giftSetSearch.toLowerCase()))
    : giftSets;

  const handleSave = async () => {
    setError('');
    if (!selectedCustomer) { setError('Please select a customer'); return; }
    if (!selectedGiftSet) { setError('Please select a gift set'); return; }
    if (!date) { setError('Please select a date'); return; }

    setSaving(true);
    try {
      const invoiceData = {
        companyId: 'company_1',
        companyName: COMPANY.name,
        customerId: selectedCustomer.id !== '__manual__' ? selectedCustomer.id : null,
        customerName: selectedCustomer.name,
        customerPhone: selectedCustomer.phone || '',
        giftSetId: selectedGiftSet.id,
        giftSetName: selectedGiftSet.name,
        date,
        linkedSaleRef: linkedSaleRef.trim(),
        notes: notes.trim(),
        items,
      };

      if (isEdit) {
        await updateDoc(doc(db, 'giftInvoices', id), { ...invoiceData, updatedAt: serverTimestamp() });
        toast.success('Gift invoice updated!');
      } else {
        const count = (await getCountFromServer(collection(db, 'giftInvoices'))).data().count;
        const invoiceNumber = generateInvoiceNumber('GFT-EL1', count);
        await addDoc(collection(db, 'giftInvoices'), {
          ...invoiceData,
          invoiceNumber,
          createdAt: serverTimestamp(),
        });
        toast.success('Gift invoice raised!');
      }
      navigate('/gift-invoices');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Box display="flex" justifyContent="center" pt={8}><CircularProgress /></Box>;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100, mx: 'auto' }}>
      {/* Header */}
      <Box display="flex" alignItems="center" gap={2} mb={3}>
        <IconButton onClick={() => navigate('/gift-invoices')}><ArrowBack /></IconButton>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            {isEdit ? 'Edit Gift Invoice' : 'New Gift Invoice'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {COMPANY.name}
          </Typography>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* ── Invoice Details ── */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} mb={2}>Invoice Details</Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth size="small" label="Invoice Date *" type="date"
                value={date} onChange={e => setDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth size="small" label="Linked Sale Invoice # (optional)"
                value={linkedSaleRef} onChange={e => setLinkedSaleRef(e.target.value)}
                placeholder="e.g. EL1/2025/0042"
                helperText="Reference to the sale this gift is linked to"
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* ── Customer ── */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
            <Typography variant="subtitle1" fontWeight={700}>Customer</Typography>
            <Button size="small" startIcon={<PersonAdd />} onClick={() => setNewCustomerOpen(true)}>
              New Customer
            </Button>
          </Box>
          <Autocomplete
            options={customers}
            getOptionLabel={o => o.name ? `${o.name}${o.phone ? ` — ${o.phone}` : ''}` : ''}
            value={selectedCustomer}
            onChange={(_, v) => setSelectedCustomer(v)}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderInput={params => (
              <TextField {...params} label="Select Customer *" size="small"
                placeholder="Search by name or phone..." />
            )}
            renderOption={(props, o) => (
              <Box component="li" {...props}>
                <Box>
                  <Typography variant="body2" fontWeight={600}>{o.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{o.phone} · {o.city}</Typography>
                </Box>
              </Box>
            )}
          />
          {selectedCustomer && selectedCustomer.id !== '__manual__' && (
            <Box sx={{ mt: 1.5, p: 1.5, bgcolor: 'secondary.50', borderRadius: 1, border: '1px solid', borderColor: 'secondary.200' }}>
              <Typography variant="caption" color="text.secondary">
                {selectedCustomer.address && `${selectedCustomer.address}, `}
                {selectedCustomer.city}{selectedCustomer.state ? `, ${selectedCustomer.state}` : ''}
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* ── Gift Set Selection ── */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={2} flexWrap="wrap" gap={1}>
            <Box>
              <Typography variant="subtitle1" fontWeight={700}>Select Gift Set *</Typography>
              <Typography variant="caption" color="text.secondary">
                All items from the selected set will be added with individual delivery tracking
              </Typography>
            </Box>
            <Button size="small" variant="outlined" color="secondary"
              onClick={() => navigate('/gift-sets/new')}>
              + Create New Set
            </Button>
          </Box>

          {giftSets.length === 0 ? (
            <Alert severity="info">
              No gift sets found.{' '}
              <Button size="small" onClick={() => navigate('/gift-sets/new')}>Create your first gift set →</Button>
            </Alert>
          ) : (
            <>
              <TextField
                fullWidth size="small" placeholder="Search gift sets..."
                value={giftSetSearch} onChange={e => setGiftSetSearch(e.target.value)}
                sx={{ mb: 2 }}
              />
              <Grid container spacing={1.5}>
                {filteredGiftSets.map(gs => (
                  <Grid item xs={12} sm={6} md={4} key={gs.id}>
                    <GiftSetCard
                      giftSet={gs}
                      selected={selectedGiftSet?.id === gs.id}
                      onSelect={handleSelectGiftSet}
                    />
                  </Grid>
                ))}
              </Grid>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Items Preview ── */}
      {items.length > 0 && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Box display="flex" alignItems="center" gap={1} mb={2}>
              <Typography variant="subtitle1" fontWeight={700}>Items Preview</Typography>
              <Chip
                label={`${items.length} items from "${selectedGiftSet?.name}"`}
                size="small" color="secondary" variant="outlined"
              />
            </Box>
            <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
              All items start as <strong>Pending</strong>. You can mark each item as delivered from the invoice detail page after saving.
            </Typography>

            {/* Desktop */}
            <TableContainer sx={{ display: { xs: 'none', sm: 'block' } }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 700 }}>#</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Item</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="center">Qty</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="center">Type</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">Price</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="center">Delivery</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((it, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{idx + 1}</TableCell>
                      <TableCell><Typography variant="body2" fontWeight={600}>{it.name}</Typography></TableCell>
                      <TableCell align="center">{it.qty} {it.unit}</TableCell>
                      <TableCell align="center">
                        <Chip label={it.type === 'free' ? 'Free' : 'Paid'}
                          color={it.type === 'free' ? 'success' : 'primary'} size="small" />
                      </TableCell>
                      <TableCell align="right">
                        {it.type === 'paid' ? formatCurrency(it.price * it.qty) : <Chip label="FREE" size="small" color="success" variant="outlined" />}
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          icon={<HourglassEmpty sx={{ fontSize: '12px !important' }} />}
                          label="Pending"
                          size="small"
                          color="warning"
                          variant="outlined"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Mobile */}
            <Box sx={{ display: { xs: 'block', sm: 'none' } }}>
              {items.map((it, idx) => (
                <Box key={idx} sx={{ p: 1.5, mb: 1, bgcolor: 'grey.50', borderRadius: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="body2" fontWeight={600}>{it.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Qty: {it.qty} {it.unit}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={0.5}>
                    <Chip label={it.type === 'free' ? 'Free' : 'Paid'}
                      color={it.type === 'free' ? 'success' : 'primary'} size="small" />
                    <Chip label="Pending" color="warning" size="small" variant="outlined" />
                  </Stack>
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* ── Notes ── */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <TextField
            fullWidth multiline rows={2} size="small" label="Notes (optional)"
            value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Any remarks about this gift invoice..."
          />
        </CardContent>
      </Card>

      {/* Save */}
      <Box display="flex" gap={2} justifyContent="flex-end">
        <Button variant="outlined" onClick={() => navigate('/gift-invoices')}>Cancel</Button>
        <Button
          variant="contained" color="secondary" size="large"
          startIcon={saving ? <CircularProgress size={16} /> : <Save />}
          onClick={handleSave} disabled={saving}
        >
          {saving ? 'Saving...' : isEdit ? 'Update Invoice' : 'Raise Gift Invoice'}
        </Button>
      </Box>

      <NewCustomerDialog
        open={newCustomerOpen}
        onClose={() => setNewCustomerOpen(false)}
        onSave={handleAddNewCustomer}
      />
    </Box>
  );
};

export default CreateGiftInvoice;