import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Button, Card, CardContent, Grid, TextField,
  MenuItem, Select, FormControl, InputLabel, Divider, Chip,
  Alert, Autocomplete, CircularProgress, IconButton, Stack,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import {
  ArrowBack, Save, Delete, AddCircle, PersonAdd,
  Receipt, ReceiptLong, Description,
} from '@mui/icons-material';
import {
  collection, query, orderBy, getDocs, addDoc, updateDoc, doc,
  serverTimestamp, getDoc, getCountFromServer,
} from 'firebase/firestore';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';
import {
  COMPANIES, GST_SLABS, CUSTOMER_TYPES, CUSTOMER_CATEGORIES,
} from '../../constants';
import { calculateGST, formatCurrency, generateInvoiceNumber } from '../../utils';

const EMPTY_ITEM = { productId: '', productName: '', qty: 1, price: 0, gstRate: 18, unit: 'pcs' };
const EMPTY_CUSTOMER_FORM = {
  name: '', phone: '', email: '', address: '', city: '',
  state: 'Gujarat', customerType: 'retail', category: 'individual',
};

// ─── Quick Add Customer Dialog ────────────────────────────────────────────────
const NewCustomerDialog = ({ open, onClose, onSave }) => {
  const [form, setForm] = useState(EMPTY_CUSTOMER_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }));
  useEffect(() => { if (open) { setForm(EMPTY_CUSTOMER_FORM); setError(''); } }, [open]);
  const handleSave = async () => {
    if (!form.name || !form.phone) { toast.error('Name & phone required'); return; }
    setLoading(true);
    try { await onSave(form); onClose(); } catch (e) { setError(e.message); } finally { setLoading(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Quick Add Customer</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
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

// ─── Main Component ───────────────────────────────────────────────────────────
const CreateQuotation = () => {
  const { db } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  // Form state
  const [invoiceType, setInvoiceType] = useState('gst');
  const [companyId, setCompanyId] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [quoteDate, setQuoteDate] = useState(new Date().toISOString().split('T')[0]);
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0];
  });
  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);
  const [notes, setNotes] = useState('');

  // Lookups
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);

  const allCompanies = Object.values(COMPANIES);
  const dataLoadedRef = useRef(false);

  useEffect(() => {
    if (!db) return;
    loadLookups();
    if (id) loadExistingQuotation();
    else dataLoadedRef.current = true;
    // eslint-disable-next-line
  }, [db]);

  const loadLookups = async () => {
    const [custSnap, prodSnap] = await Promise.all([
      getDocs(query(collection(db, 'customers'), orderBy('name'))),
      getDocs(query(collection(db, 'products'), orderBy('name'))),
    ]);
    setCustomers(custSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setProducts(prodSnap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const loadExistingQuotation = async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'quotations', id));
      if (!snap.exists()) { toast.error('Quotation not found'); navigate('/quotations'); return; }
      const d = snap.data();
      setInvoiceType(d.invoiceType || 'gst');
      setCompanyId(d.companyId || '');
      setSelectedCustomer(d.customerId
        ? { id: d.customerId, name: d.customerName, phone: d.customerPhone }
        : { id: '__manual__', name: d.customerName, phone: d.customerPhone });
      setQuoteDate(d.quoteDate || new Date().toISOString().split('T')[0]);
      setValidUntil(d.validUntil || '');
      setItems(d.items?.length ? d.items.map(it => ({
        productId: it.productId || '',
        productName: it.productName || '',
        qty: it.qty || 1,
        price: it.price || 0,
        gstRate: it.gstRate ?? 18,
        unit: it.unit || 'pcs',
      })) : [{ ...EMPTY_ITEM }]);
      setNotes(d.notes || '');
    } catch (e) {
      toast.error('Failed to load quotation');
    } finally {
      setLoading(false);
      dataLoadedRef.current = true;
    }
  };

  // ── Item helpers ──
  const updateItem = (i, key, val) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [key]: val } : it));

  const handleProductSelect = (i, product) => {
    if (!product) { updateItem(i, 'productId', ''); updateItem(i, 'productName', ''); return; }
    setItems(prev => prev.map((it, idx) => idx === i ? {
      ...it,
      productId: product.id,
      productName: product.name,
      price: product.price || 0,
      gstRate: product.gstRate ?? 18,
      unit: product.unit || 'pcs',
    } : it));
  };

  // ── Calculations ──
  const itemsWithCalc = items.map(it => {
    const subtotal = (parseFloat(it.qty) || 0) * (parseFloat(it.price) || 0);
    const gst = invoiceType === 'gst'
      ? calculateGST(subtotal, it.gstRate)
      : { baseAmount: subtotal, totalTax: 0, cgst: 0, sgst: 0 };
    return { ...it, subtotal, ...gst };
  });

  const subtotal = itemsWithCalc.reduce((s, it) => s + it.subtotal, 0);
  const totalTax = itemsWithCalc.reduce((s, it) => s + (it.totalTax || 0), 0);
  const grandTotal = subtotal;

  const handleAddNewCustomer = async form => {
    const ref = await addDoc(collection(db, 'customers'), { ...form, createdAt: serverTimestamp() });
    const newCust = { id: ref.id, ...form };
    setCustomers(p => [...p, newCust]);
    setSelectedCustomer(newCust);
    toast.success('Customer added');
  };

  const handleSave = async () => {
    setError('');
    if (!companyId) { setError('Please select a company / firm'); return; }
    if (!selectedCustomer) { setError('Please select a customer'); return; }
    if (items.some(it => !it.productId)) { setError('Please select a product for every item'); return; }
    if (items.some(it => (parseFloat(it.qty) || 0) <= 0)) { setError('Quantity must be greater than 0'); return; }

    setSaving(true);
    try {
      const company = COMPANIES[companyId];
      const quoteData = {
        invoiceType,
        companyId,
        companyName: company?.name,
        customerId: selectedCustomer.id !== '__manual__' ? selectedCustomer.id : null,
        customerName: selectedCustomer.name,
        customerPhone: selectedCustomer.phone || '',
        quoteDate,
        validUntil,
        items: itemsWithCalc.map(it => ({
          productId: it.productId,
          productName: it.productName,
          qty: parseFloat(it.qty),
          price: parseFloat(it.price),
          gstRate: it.gstRate,
          subtotal: it.subtotal,
          baseAmount: it.baseAmount,
          totalTax: it.totalTax || 0,
          cgst: it.cgst || 0,
          sgst: it.sgst || 0,
          unit: it.unit,
        })),
        subtotal,
        totalTax,
        grandTotal,
        notes,
      };

      if (isEdit) {
        await updateDoc(doc(db, 'quotations', id), { ...quoteData, updatedAt: serverTimestamp() });
        toast.success('Quotation updated!');
      } else {
        const count = (await getCountFromServer(collection(db, 'quotations'))).data().count;
        const quoteNumber = generateInvoiceNumber(`QT-${company?.code || 'QT'}`, count);
        await addDoc(collection(db, 'quotations'), {
          ...quoteData,
          quoteNumber,
          createdAt: serverTimestamp(),
        });
        toast.success('Quotation created!');
      }
      navigate('/quotations');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Box display="flex" justifyContent="center" pt={8}><CircularProgress /></Box>;

  const withGST = invoiceType === 'gst';

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: 'auto' }}>
      {/* Header */}
      <Box display="flex" alignItems="center" gap={2} mb={3}>
        <IconButton onClick={() => navigate('/quotations')}><ArrowBack /></IconButton>
        <Box>
          <Typography variant="h5" fontWeight={700}>{isEdit ? 'Edit Quotation' : 'New Quotation'}</Typography>
          <Typography variant="body2" color="text.secondary">
            {isEdit ? 'Update quotation details' : 'Create a new price quotation'}
          </Typography>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* ── Quote Details ── */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} mb={2} display="flex" alignItems="center" gap={1}>
            <Description fontSize="small" color="primary" /> Quote Details
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Quote Type</InputLabel>
                <Select value={invoiceType} onChange={e => setInvoiceType(e.target.value)} label="Quote Type">
                  <MenuItem value="gst"><Receipt sx={{ mr: 1, fontSize: 16, verticalAlign: 'middle' }} />GST Quote</MenuItem>
                  <MenuItem value="non_gst"><ReceiptLong sx={{ mr: 1, fontSize: 16, verticalAlign: 'middle' }} />Non-GST Quote</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Company / Firm *</InputLabel>
                <Select value={companyId} onChange={e => setCompanyId(e.target.value)} label="Company / Firm *">
                  {allCompanies.map(c => (
                    <MenuItem key={c.id} value={c.id}>
                      <Box>
                        <Typography variant="body2" fontWeight={600}>{c.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{c.code} · {c.storeType}</Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth size="small" label="Quote Date *" type="date"
                value={quoteDate} onChange={e => setQuoteDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth size="small" label="Valid Until *" type="date"
                value={validUntil} onChange={e => setValidUntil(e.target.value)}
                InputLabelProps={{ shrink: true }}
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
              <TextField {...params} label="Select Customer *" size="small" placeholder="Search by name or phone..." />
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
            <Box sx={{ mt: 1.5, p: 1.5, bgcolor: 'primary.50', borderRadius: 1, border: '1px solid', borderColor: 'primary.200' }}>
              <Typography variant="caption" color="text.secondary">
                {selectedCustomer.address && `${selectedCustomer.address}, `}{selectedCustomer.city}
                {selectedCustomer.state && `, ${selectedCustomer.state}`}
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* ── Items ── */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
            <Typography variant="subtitle1" fontWeight={700}>Items</Typography>
            <Button size="small" startIcon={<AddCircle />} onClick={() => setItems(p => [...p, { ...EMPTY_ITEM }])}>
              Add Item
            </Button>
          </Box>

          {/* Desktop table */}
          <Box sx={{ display: { xs: 'none', md: 'block' }, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ padding: '8px', textAlign: 'left', fontSize: 12, fontWeight: 700, width: withGST ? '35%' : '42%' }}>Product</th>
                  <th style={{ padding: '8px', textAlign: 'center', fontSize: 12, fontWeight: 700, width: '10%' }}>Qty</th>
                  <th style={{ padding: '8px', textAlign: 'center', fontSize: 12, fontWeight: 700, width: '15%' }}>Price (₹)</th>
                  {withGST && <th style={{ padding: '8px', textAlign: 'center', fontSize: 12, fontWeight: 700, width: '15%' }}>GST %</th>}
                  <th style={{ padding: '8px', textAlign: 'right', fontSize: 12, fontWeight: 700, width: '15%' }}>Amount</th>
                  <th style={{ padding: '8px', textAlign: 'center', fontSize: 12, fontWeight: 700, width: '8%' }}>Del</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '6px 8px' }}>
                      <Autocomplete
                        options={products}
                        getOptionLabel={o => o.name || ''}
                        value={products.find(p => p.id === it.productId) || null}
                        onChange={(_, v) => handleProductSelect(i, v)}
                        size="small"
                        renderInput={params => <TextField {...params} placeholder="Select product" size="small" />}
                        renderOption={(props, o) => (
                          <Box component="li" {...props}>
                            <Box>
                              <Typography variant="body2" fontWeight={600}>{o.name}</Typography>
                              <Typography variant="caption" color="text.secondary">₹{o.price} · {o.unit}</Typography>
                            </Box>
                          </Box>
                        )}
                      />
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <TextField size="small" type="number" value={it.qty}
                        onChange={e => updateItem(i, 'qty', e.target.value)} inputProps={{ min: 0.01, step: 0.01 }}
                        sx={{ width: 80 }} />
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <TextField size="small" type="number" value={it.price}
                        onChange={e => updateItem(i, 'price', e.target.value)} inputProps={{ min: 0 }}
                        sx={{ width: 110 }} />
                    </td>
                    {withGST && (
                      <td style={{ padding: '6px 8px' }}>
                        <FormControl size="small" sx={{ width: 90 }}>
                          <Select value={it.gstRate} onChange={e => updateItem(i, 'gstRate', e.target.value)}>
                            {GST_SLABS.map(g => <MenuItem key={g} value={g}>{g}%</MenuItem>)}
                          </Select>
                        </FormControl>
                      </td>
                    )}
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                      <Typography variant="body2" fontWeight={600}>
                        {formatCurrency(itemsWithCalc[i]?.subtotal || 0)}
                      </Typography>
                      {withGST && itemsWithCalc[i]?.totalTax > 0 && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          Tax: {formatCurrency(itemsWithCalc[i].totalTax)}
                        </Typography>
                      )}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      <IconButton size="small" color="error" disabled={items.length === 1}
                        onClick={() => setItems(p => p.filter((_, idx) => idx !== i))}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>

          {/* Mobile item cards */}
          <Box sx={{ display: { xs: 'block', md: 'none' } }}>
            {items.map((it, i) => (
              <Card key={i} elevation={0} sx={{ mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5}>
                    <Chip label={`Item ${i + 1}`} size="small" color="primary" variant="outlined" />
                    <IconButton size="small" color="error" disabled={items.length === 1}
                      onClick={() => setItems(p => p.filter((_, idx) => idx !== i))}>
                      <Delete fontSize="small" />
                    </IconButton>
                  </Box>
                  <Grid container spacing={1.5}>
                    <Grid item xs={12}>
                      <Autocomplete
                        options={products}
                        getOptionLabel={o => o.name || ''}
                        value={products.find(p => p.id === it.productId) || null}
                        onChange={(_, v) => handleProductSelect(i, v)}
                        size="small"
                        renderInput={params => <TextField {...params} label="Product" size="small" />}
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField fullWidth size="small" label="Qty" type="number" value={it.qty}
                        onChange={e => updateItem(i, 'qty', e.target.value)} inputProps={{ min: 0.01 }} />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField fullWidth size="small" label="Price (₹)" type="number" value={it.price}
                        onChange={e => updateItem(i, 'price', e.target.value)} inputProps={{ min: 0 }} />
                    </Grid>
                    {withGST && (
                      <Grid item xs={6}>
                        <FormControl fullWidth size="small">
                          <InputLabel>GST %</InputLabel>
                          <Select value={it.gstRate} onChange={e => updateItem(i, 'gstRate', e.target.value)} label="GST %">
                            {GST_SLABS.map(g => <MenuItem key={g} value={g}>{g}%</MenuItem>)}
                          </Select>
                        </FormControl>
                      </Grid>
                    )}
                    <Grid item xs={withGST ? 6 : 12}>
                      <Box sx={{ p: 1.5, bgcolor: 'primary.50', borderRadius: 1 }}>
                        <Typography variant="caption" color="text.secondary">Amount</Typography>
                        <Typography variant="body2" fontWeight={700}>
                          {formatCurrency(itemsWithCalc[i]?.subtotal || 0)}
                        </Typography>
                        {withGST && itemsWithCalc[i]?.totalTax > 0 && (
                          <Typography variant="caption" color="text.secondary">
                            Tax: {formatCurrency(itemsWithCalc[i].totalTax)}
                          </Typography>
                        )}
                      </Box>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            ))}
            <Button fullWidth variant="outlined" startIcon={<AddCircle />}
              onClick={() => setItems(p => [...p, { ...EMPTY_ITEM }])}>
              Add Item
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* ── Grand Total Summary ── */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} mb={2}>Grand Total Summary</Typography>
          <Box sx={{ maxWidth: 360, ml: 'auto' }}>
            <Box display="flex" justifyContent="space-between" py={0.75}>
              <Typography variant="body2" color="text.secondary">Subtotal</Typography>
              <Typography variant="body2" fontWeight={600}>{formatCurrency(subtotal)}</Typography>
            </Box>
            {withGST && (
              <>
                <Box display="flex" justifyContent="space-between" py={0.75}>
                  <Typography variant="body2" color="text.secondary">CGST</Typography>
                  <Typography variant="body2">{formatCurrency(totalTax / 2)}</Typography>
                </Box>
                <Box display="flex" justifyContent="space-between" py={0.75}>
                  <Typography variant="body2" color="text.secondary">SGST</Typography>
                  <Typography variant="body2">{formatCurrency(totalTax / 2)}</Typography>
                </Box>
                <Box display="flex" justifyContent="space-between" py={0.75}>
                  <Typography variant="body2" color="text.secondary">Total Tax</Typography>
                  <Typography variant="body2" color="warning.main" fontWeight={600}>{formatCurrency(totalTax)}</Typography>
                </Box>
              </>
            )}
            <Divider sx={{ my: 1 }} />
            <Box display="flex" justifyContent="space-between" py={0.75}
              sx={{ bgcolor: 'primary.50', px: 1.5, borderRadius: 1, border: '1px solid', borderColor: 'primary.200' }}>
              <Typography variant="body1" fontWeight={800} color="primary.main">Grand Total</Typography>
              <Typography variant="body1" fontWeight={800} color="primary.main">{formatCurrency(grandTotal)}</Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* ── Notes ── */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <TextField
            fullWidth multiline rows={3} label="Notes / Terms (optional)"
            value={notes} onChange={e => setNotes(e.target.value)} size="small"
            placeholder="e.g. Prices valid for 30 days. GST extra as applicable..."
          />
        </CardContent>
      </Card>

      {/* ── Save Button ── */}
      <Box display="flex" gap={2} justifyContent="flex-end">
        <Button variant="outlined" onClick={() => navigate('/quotations')}>Cancel</Button>
        <Button
          variant="contained"
          startIcon={saving ? <CircularProgress size={16} /> : <Save />}
          onClick={handleSave}
          disabled={saving}
          size="large"
        >
          {saving ? 'Saving...' : isEdit ? 'Update Quotation' : 'Save Quotation'}
        </Button>
      </Box>

      <NewCustomerDialog open={newCustomerOpen} onClose={() => setNewCustomerOpen(false)} onSave={handleAddNewCustomer} />
    </Box>
  );
};

export default CreateQuotation;