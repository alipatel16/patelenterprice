import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Card, CardContent, Grid, TextField,
  MenuItem, Select, FormControl, InputLabel, Divider, Chip,
  FormControlLabel, Checkbox, Radio, RadioGroup, Alert, Autocomplete,
  CircularProgress, Paper, IconButton, Stack, InputAdornment, Dialog,
  DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import {
  ArrowBack, Save, Delete, AddCircle, PersonAdd,
  SwapHoriz, Receipt, ReceiptLong, LocalShipping, Schedule,
  CheckCircle,
} from '@mui/icons-material';
import {
  collection, query, orderBy, getDocs, addDoc, updateDoc, doc,
  serverTimestamp, getDoc, where, getCountFromServer,
} from 'firebase/firestore';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';
import {
  COMPANIES, GST_SLABS, PAYMENT_TYPES, PAYMENT_LABELS,
  CUSTOMER_TYPES, CUSTOMER_CATEGORIES,
} from '../../constants';
import { calculateGST, formatCurrency, generateInvoiceNumber } from '../../utils';

// ─── Constants ───────────────────────────────────────────────────────────────
const EMPTY_ITEM = { productId: '', productName: '', qty: 1, price: 0, gstRate: 18, unit: 'pcs' };

const EMPTY_CUSTOMER_FORM = {
  name: '', phone: '', email: '', address: '', city: '',
  state: 'Gujarat', customerType: 'retail', category: 'individual',
};

const DELIVERY_TYPES = {
  IMMEDIATE: 'immediate',
  SCHEDULED: 'scheduled',
};

// ─── Quick Add Customer Dialog ────────────────────────────────────────────────
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
                {CUSTOMER_TYPES.map(t => <MenuItem key={t} value={t} sx={{ textTransform: 'capitalize' }}>{t}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6}>
            <FormControl fullWidth size="small"><InputLabel>Category</InputLabel>
              <Select value={form.category} onChange={set('category')} label="Category">
                {CUSTOMER_CATEGORIES.map(t => <MenuItem key={t} value={t} sx={{ textTransform: 'capitalize' }}>{t}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12}><TextField fullWidth label="Name *" value={form.name} onChange={set('name')} size="small" /></Grid>
          <Grid item xs={6}><TextField fullWidth label="Phone *" value={form.phone} onChange={set('phone')} size="small" /></Grid>
          <Grid item xs={6}><TextField fullWidth label="Email" value={form.email} onChange={set('email')} size="small" /></Grid>
          <Grid item xs={12}><TextField fullWidth label="City" value={form.city} onChange={set('city')} size="small" /></Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={loading}
          startIcon={loading ? <CircularProgress size={16} /> : <Save />}>
          Save Customer
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const CreateSale = () => {
  const { db, userProfile, storeType } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Lookups
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [inventory, setInventory] = useState({});
  const [employees, setEmployees] = useState([]);

  // ── Core form state ──
  const [invoiceType, setInvoiceType] = useState('gst');
  const [companyId, setCompanyId] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [salesperson, setSalesperson] = useState(userProfile?.name || '');
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0]);
  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);
  const [notes, setNotes] = useState('');
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);

  // ── Exchange state ──
  const [hasExchange, setHasExchange] = useState(false);
  const [exchangeItem, setExchangeItem] = useState('');
  const [exchangeValue, setExchangeValue] = useState(0);
  const [exchangeReceived, setExchangeReceived] = useState(false);

  // ── Payment state ──
  const [paymentType, setPaymentType] = useState(PAYMENT_TYPES.FULL);
  const [downPayment, setDownPayment] = useState(0);
  const [emiMonths, setEmiMonths] = useState(0);
  const [emiStartDate, setEmiStartDate] = useState('');
  const [financerName, setFinancerName] = useState('');
  const [paymentRef, setPaymentRef] = useState('');

  // ── Delivery state ──
  const [deliveryType, setDeliveryType] = useState(DELIVERY_TYPES.IMMEDIATE);
  const [deliveryDate, setDeliveryDate] = useState('');

  // All 4 companies shown regardless of store
  const allCompanies = Object.values(COMPANIES);

  // ── Load lookups + existing sale ──
  useEffect(() => {
    if (!db) return;
    loadLookups();
    if (id) loadExistingSale();
  }, [db]);

  const loadLookups = async () => {
    const [custSnap, prodSnap, empSnap] = await Promise.all([
      getDocs(query(collection(db, 'customers'), orderBy('name'))),
      getDocs(query(collection(db, 'products'), orderBy('name'))),
      getDocs(query(collection(db, 'users'), orderBy('name'))),
    ]);
    setCustomers(custSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setProducts(prodSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setEmployees(empSnap.docs.map(d => ({ id: d.id, ...d.data() })));

    const invSnap = await getDocs(collection(db, 'inventory'));
    const invMap = {};
    invSnap.docs.forEach(d => { invMap[d.data().productId] = d.data().stock || 0; });
    setInventory(invMap);
  };

  const loadExistingSale = async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'sales', id));
      if (!snap.exists()) { toast.error('Sale not found'); navigate('/sales'); return; }
      const d = snap.data();
      setInvoiceType(d.invoiceType || 'gst');
      setCompanyId(d.companyId || '');
      setSelectedCustomer(d.customerId ? { id: d.customerId, name: d.customerName, phone: d.customerPhone } : null);
      setSalesperson(d.salesperson || '');
      setSaleDate(d.saleDate || '');
      setItems(d.items || [{ ...EMPTY_ITEM }]);
      setNotes(d.notes || '');
      setHasExchange(d.hasExchange || false);
      setExchangeItem(d.exchangeItem || '');
      setExchangeValue(d.exchangeValue || 0);
      setExchangeReceived(d.exchangeReceived || false);
      setPaymentType(d.paymentType || PAYMENT_TYPES.FULL);
      setDownPayment(d.downPayment || 0);
      setEmiMonths(d.emiMonths || 0);
      setEmiStartDate(d.emiStartDate || '');
      setFinancerName(d.financerName || '');
      setPaymentRef(d.paymentRef || '');
      setDeliveryType(d.deliveryType || DELIVERY_TYPES.IMMEDIATE);
      setDeliveryDate(d.deliveryDate || '');
    } finally {
      setLoading(false);
    }
  };

  // ── Item helpers ──
  const setItemField = (idx, k) => val => {
    setItems(prev => {
      const arr = [...prev];
      arr[idx] = { ...arr[idx], [k]: val };
      if (k === 'productId') {
        const prod = products.find(p => p.id === val);
        if (prod) {
          arr[idx].productName = prod.name;
          arr[idx].price = prod.price;
          arr[idx].gstRate = prod.gstRate || 18;
          arr[idx].unit = prod.unit || 'pcs';
          const stock = inventory[val] || 0;
          if (stock <= 0) toast.warning(`⚠️ ${prod.name} is OUT OF STOCK!`);
          else if (stock < arr[idx].qty) toast.warning(`⚠️ Only ${stock} units of ${prod.name} in stock`);
        }
      }
      if (k === 'qty' && arr[idx].productId) {
        const stock = inventory[arr[idx].productId] || 0;
        if (val > stock) toast.warning(`Only ${stock} in stock for ${arr[idx].productName}`);
      }
      return arr;
    });
  };
  const addItem = () => setItems(p => [...p, { ...EMPTY_ITEM }]);
  const removeItem = idx => setItems(p => p.filter((_, i) => i !== idx));

  // ── Derived calculations ──
  const itemsWithCalc = items.map(it => {
    const subtotal = (parseFloat(it.qty) || 0) * (parseFloat(it.price) || 0);
    const gst = invoiceType === 'gst'
      ? calculateGST(subtotal, it.gstRate)
      : { baseAmount: subtotal, totalTax: 0, cgst: 0, sgst: 0 };
    return { ...it, subtotal, ...gst };
  });

  const subtotal = itemsWithCalc.reduce((s, it) => s + it.subtotal, 0);
  const totalTax = itemsWithCalc.reduce((s, it) => s + (it.totalTax || 0), 0);
  const exchangeDeduction = hasExchange ? (parseFloat(exchangeValue) || 0) : 0;
  const grandTotal = subtotal - exchangeDeduction;
  const balanceDue = grandTotal - (parseFloat(downPayment) || 0);
  const emiAmount = emiMonths > 0 ? parseFloat((balanceDue / emiMonths).toFixed(2)) : 0;

  // ── Quick-add customer ──
  const handleAddNewCustomer = async form => {
    const ref = await addDoc(collection(db, 'customers'), { ...form, createdAt: serverTimestamp() });
    const newCust = { id: ref.id, ...form };
    setCustomers(p => [...p, newCust]);
    setSelectedCustomer(newCust);
    toast.success('Customer added');
  };

  // ── Save ──
  const handleSave = async () => {
    setError('');
    if (!companyId) { setError('Please select a company / firm'); return; }
    if (!selectedCustomer) { setError('Please select a customer'); return; }
    if (items.some(it => !it.productId)) { setError('Please select a product for every item'); return; }
    if (items.some(it => (parseFloat(it.qty) || 0) <= 0)) { setError('Quantity must be greater than 0'); return; }
    if (paymentType === PAYMENT_TYPES.EMI && (!downPayment || !emiMonths || !emiStartDate)) {
      setError('EMI requires down payment, number of months, and start date'); return;
    }
    if ((paymentType === PAYMENT_TYPES.FINANCE || paymentType === PAYMENT_TYPES.BANK_TRANSFER) && (!downPayment || !financerName || !paymentRef)) {
      setError('Finance / Bank Transfer requires down payment, financer name, and payment reference'); return;
    }
    if (deliveryType === DELIVERY_TYPES.SCHEDULED && !deliveryDate) {
      setError('Please set a delivery date for scheduled delivery'); return;
    }

    setSaving(true);
    try {
      const countSnap = await getCountFromServer(collection(db, 'sales'));
      const company = COMPANIES[companyId];
      const invoiceNumber = generateInvoiceNumber(company?.code || 'INV', countSnap.data().count);

      const saleData = {
        invoiceNumber, invoiceType, companyId,
        companyName: company?.name,
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        customerPhone: selectedCustomer.phone,
        salesperson, saleDate,
        items: itemsWithCalc.map(it => ({
          productId: it.productId, productName: it.productName,
          qty: parseFloat(it.qty), price: parseFloat(it.price),
          gstRate: it.gstRate, subtotal: it.subtotal,
          baseAmount: it.baseAmount, totalTax: it.totalTax || 0,
          cgst: it.cgst || 0, sgst: it.sgst || 0, unit: it.unit,
        })),
        subtotal, totalTax, grandTotal,
        // Exchange
        hasExchange, exchangeItem, exchangeValue: exchangeDeduction, exchangeReceived,
        // Payment
        paymentType,
        downPayment: parseFloat(downPayment) || 0,
        emiMonths: parseInt(emiMonths) || 0,
        emiAmount,
        emiStartDate, financerName, paymentRef, balanceDue,
        // Delivery
        deliveryType,
        deliveryDate: deliveryType === DELIVERY_TYPES.SCHEDULED ? deliveryDate : '',
        // Meta
        notes,
      };

      if (isEdit) {
        await updateDoc(doc(db, 'sales', id), { ...saleData, updatedAt: serverTimestamp() });
        toast.success('Sale updated!');
      } else {
        const saleRef = await addDoc(collection(db, 'sales'), { ...saleData, createdAt: serverTimestamp() });

        // Auto-generate EMI installments
        if (paymentType === PAYMENT_TYPES.EMI && emiMonths > 0 && emiStartDate) {
          for (let m = 0; m < emiMonths; m++) {
            const due = new Date(emiStartDate);
            due.setMonth(due.getMonth() + m);
            const dueDateStr = due.toISOString().split('T')[0];
            await addDoc(collection(db, 'emi_installments'), {
              saleId: saleRef.id,
              invoiceNumber: invoiceNumber,
              customerName: selectedCustomer.name,
              customerPhone: selectedCustomer.phone,
              installmentNumber: m + 1,
              dueDate: dueDateStr,
              amount: emiAmount,
              paidAmount: 0,
              status: 'pending',
              payments: [],
              dueDateChanges: [],
              dueDateChangeCount: 0,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        }

        // Deduct from inventory
        for (const it of items) {
          if (!it.productId) continue;
          const invQ = query(collection(db, 'inventory'), where('productId', '==', it.productId));
          const invSnap = await getDocs(invQ);
          if (!invSnap.empty) {
            const invDoc = invSnap.docs[0];
            await updateDoc(doc(db, 'inventory', invDoc.id), {
              stock: Math.max(0, (invDoc.data().stock || 0) - (parseFloat(it.qty) || 0)),
              soldQty: (invDoc.data().soldQty || 0) + (parseFloat(it.qty) || 0),
              updatedAt: serverTimestamp(),
            });
          }
        }
        toast.success('Sale recorded successfully!');
      }
      navigate('/sales');
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
        <IconButton onClick={() => navigate('/sales')}><ArrowBack /></IconButton>
        <Box>
          <Typography variant="h5" fontWeight={700}>{isEdit ? 'Edit Sale' : 'New Sale'}</Typography>
          <Typography variant="body2" color="text.secondary">Record a sale invoice</Typography>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* ── Invoice Type ── */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle2" fontWeight={600} mb={1}>Invoice Type</Typography>
          <Stack direction="row" spacing={2}>
            <FormControlLabel control={<Radio checked={invoiceType === 'gst'} onChange={() => setInvoiceType('gst')} />}
              label={<Box display="flex" alignItems="center" gap={0.5}><Receipt fontSize="small" />GST Invoice</Box>} />
            <FormControlLabel control={<Radio checked={invoiceType === 'non_gst'} onChange={() => setInvoiceType('non_gst')} />}
              label={<Box display="flex" alignItems="center" gap={0.5}><ReceiptLong fontSize="small" />Non-GST Invoice</Box>} />
          </Stack>
        </CardContent>
      </Card>

      {/* ── Sale Details ── */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} mb={2}>Sale Details</Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small" required>
                <InputLabel>Company / Firm *</InputLabel>
                <Select value={companyId} onChange={e => setCompanyId(e.target.value)} label="Company / Firm *">
                  {allCompanies.map(c => (
                    <MenuItem key={c.id} value={c.id}>
                      <Box>
                        <Typography variant="body2">{c.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{c.code} · GST: {c.gstNumber}</Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Sale Date" type="date" value={saleDate}
                onChange={e => setSaleDate(e.target.value)} size="small" InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Salesperson *</InputLabel>
                <Select value={salesperson} onChange={e => setSalesperson(e.target.value)} label="Salesperson *">
                  {employees.map(e => <MenuItem key={e.id} value={e.name}>{e.name} ({e.role})</MenuItem>)}
                  {!employees.find(e => e.name === userProfile?.name) && (
                    <MenuItem value={userProfile?.name}>{userProfile?.name} (Me)</MenuItem>
                  )}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* ── Customer ── */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
            <Typography variant="subtitle1" fontWeight={700}>Customer</Typography>
            <Button startIcon={<PersonAdd />} size="small" onClick={() => setNewCustomerOpen(true)}>New Customer</Button>
          </Box>
          <Autocomplete
            options={customers}
            getOptionLabel={o => `${o.name} - ${o.phone}`}
            value={selectedCustomer}
            onChange={(_, v) => setSelectedCustomer(v)}
            renderInput={params => <TextField {...params} label="Search & Select Customer *" size="small" />}
            isOptionEqualToValue={(o, v) => o.id === v.id}
          />
          {selectedCustomer && (
            <Box sx={{ mt: 1.5, p: 1.5, bgcolor: 'action.hover', borderRadius: 2 }}>
              <Typography variant="body2" fontWeight={600}>{selectedCustomer.name}</Typography>
              <Typography variant="caption" color="text.secondary">{selectedCustomer.phone} • {selectedCustomer.city}</Typography>
              <Chip label={selectedCustomer.customerType} size="small" sx={{ ml: 1, fontSize: 10, textTransform: 'capitalize' }} />
            </Box>
          )}
        </CardContent>
      </Card>

      {/* ── Items ── */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
            <Typography variant="subtitle1" fontWeight={700}>Items</Typography>
            <Button startIcon={<AddCircle />} onClick={addItem} size="small">Add Item</Button>
          </Box>

          {items.map((item, idx) => {
            const stock = inventory[item.productId] ?? null;
            const outOfStock = stock !== null && stock <= 0;
            const lowStock = stock !== null && stock > 0 && stock <= 5;
            const subtotalAmt = (parseFloat(item.qty) || 0) * (parseFloat(item.price) || 0);
            return (
              <Box key={idx} sx={{ mb: 2, p: 2, border: '1px solid', borderColor: outOfStock ? 'error.main' : 'divider', borderRadius: 2 }}>
                {outOfStock && <Alert severity="error" sx={{ mb: 1, py: 0 }}>Out of Stock!</Alert>}
                {lowStock && <Alert severity="warning" sx={{ mb: 1, py: 0 }}>Low stock: only {stock} left</Alert>}
                <Grid container spacing={1.5}>
                  <Grid item xs={12} sm={5}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Product *</InputLabel>
                      <Select value={item.productId} onChange={e => setItemField(idx, 'productId')(e.target.value)} label="Product *">
                        {products.map(p => (
                          <MenuItem key={p.id} value={p.id}>
                            <Box>
                              <Typography variant="body2">{p.name}</Typography>
                              <Typography variant="caption" color={inventory[p.id] <= 0 ? 'error.main' : 'text.secondary'}>
                                Stock: {inventory[p.id] ?? 'N/A'} · {formatCurrency(p.price)}
                              </Typography>
                            </Box>
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={4} sm={2}>
                    <TextField fullWidth label="Qty" type="number" size="small"
                      value={item.qty} onChange={e => setItemField(idx, 'qty')(parseFloat(e.target.value))}
                      inputProps={{ min: 1 }} />
                  </Grid>
                  <Grid item xs={4} sm={2}>
                    <TextField fullWidth label="Price (₹)" type="number" size="small"
                      value={item.price} onChange={e => setItemField(idx, 'price')(parseFloat(e.target.value))}
                      InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                      helperText={invoiceType === 'gst' ? 'Incl. GST' : ''} />
                  </Grid>
                  {invoiceType === 'gst' && (
                    <Grid item xs={4} sm={2}>
                      <FormControl fullWidth size="small">
                        <InputLabel>GST%</InputLabel>
                        <Select value={item.gstRate} onChange={e => setItemField(idx, 'gstRate')(parseFloat(e.target.value))} label="GST%">
                          {GST_SLABS.map(r => <MenuItem key={r} value={r}>{r}%</MenuItem>)}
                        </Select>
                      </FormControl>
                    </Grid>
                  )}
                  <Grid item xs={12} sm={1} display="flex" alignItems="center" justifyContent="center">
                    <IconButton color="error" size="small" onClick={() => removeItem(idx)} disabled={items.length === 1}>
                      <Delete />
                    </IconButton>
                  </Grid>
                </Grid>
                {invoiceType === 'gst' && item.productId && (() => {
                  const g = calculateGST(subtotalAmt, item.gstRate);
                  return (
                    <Box mt={1} display="flex" gap={2} flexWrap="wrap">
                      <Typography variant="caption" color="text.secondary">Base: {formatCurrency(g.baseAmount)}</Typography>
                      <Typography variant="caption" color="text.secondary">CGST ({item.gstRate / 2}%): {formatCurrency(g.cgst)}</Typography>
                      <Typography variant="caption" color="text.secondary">SGST ({item.gstRate / 2}%): {formatCurrency(g.sgst)}</Typography>
                      <Typography variant="caption" fontWeight={700}>Total: {formatCurrency(subtotalAmt)}</Typography>
                    </Box>
                  );
                })()}
              </Box>
            );
          })}
        </CardContent>
      </Card>

      {/* ── Exchange ── */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <FormControlLabel
            control={<Checkbox checked={hasExchange} onChange={e => setHasExchange(e.target.checked)} />}
            label={<Typography fontWeight={600}><SwapHoriz sx={{ mr: 0.5, verticalAlign: 'middle' }} />Exchange Item</Typography>}
          />
          {hasExchange && (
            <Grid container spacing={2} mt={0.5}>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth label="Exchange Item Description" value={exchangeItem}
                  onChange={e => setExchangeItem(e.target.value)} size="small" />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField fullWidth label="Exchange Value (₹)" type="number" value={exchangeValue}
                  onChange={e => setExchangeValue(parseFloat(e.target.value) || 0)} size="small"
                  InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
              </Grid>
              <Grid item xs={12} sm={2} display="flex" alignItems="center">
                <FormControlLabel
                  control={<Checkbox checked={exchangeReceived} onChange={e => setExchangeReceived(e.target.checked)} />}
                  label="Received"
                />
              </Grid>
            </Grid>
          )}
        </CardContent>
      </Card>

      {/* ── Delivery ── */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} mb={2}>
            <LocalShipping sx={{ mr: 1, verticalAlign: 'middle', color: 'primary.main' }} />
            Delivery Status
          </Typography>

          <RadioGroup
            row
            value={deliveryType}
            onChange={e => { setDeliveryType(e.target.value); setDeliveryDate(''); }}
          >
            <FormControlLabel
              value={DELIVERY_TYPES.IMMEDIATE}
              control={<Radio color="success" />}
              label="Delivered"
            />
            <FormControlLabel
              value={DELIVERY_TYPES.SCHEDULED}
              control={<Radio color="warning" />}
              label="Scheduled"
            />
          </RadioGroup>

          {deliveryType === DELIVERY_TYPES.SCHEDULED && (
            <Box mt={2}>
              <TextField
                label="Expected Delivery Date *"
                type="date"
                value={deliveryDate}
                onChange={e => setDeliveryDate(e.target.value)}
                size="small"
                InputLabelProps={{ shrink: true }}
                inputProps={{ min: new Date().toISOString().split('T')[0] }}
                sx={{ width: 240 }}
              />
            </Box>
          )}
        </CardContent>
      </Card>

      {/* ── Payment ── */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} mb={2}>Payment</Typography>
          <FormControl component="fieldset" fullWidth>
            <RadioGroup value={paymentType} onChange={e => setPaymentType(e.target.value)}>
              <Grid container spacing={1}>
                {Object.entries(PAYMENT_LABELS).map(([v, l]) => (
                  <Grid item xs={12} sm={6} key={v}>
                    <Paper variant="outlined" sx={{
                      p: 1.5, cursor: 'pointer', borderRadius: 2,
                      borderColor: paymentType === v ? 'primary.main' : 'divider',
                      bgcolor: paymentType === v ? 'primary.50' : 'transparent',
                    }}>
                      <FormControlLabel value={v} control={<Radio size="small" />}
                        label={<Typography variant="body2">{l}</Typography>} sx={{ m: 0 }} />
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            </RadioGroup>
          </FormControl>

          {/* Payment-specific fields */}
          {(paymentType === PAYMENT_TYPES.EMI || paymentType === PAYMENT_TYPES.FINANCE || paymentType === PAYMENT_TYPES.BANK_TRANSFER) && (
            <Grid container spacing={2} mt={1}>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth label="Down Payment (₹) *" type="number" value={downPayment}
                  onChange={e => setDownPayment(parseFloat(e.target.value) || 0)} size="small"
                  InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
              </Grid>

              {paymentType === PAYMENT_TYPES.EMI && (
                <>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth label="Number of EMI Months *" type="number"
                      value={emiMonths || ''} size="small"
                      onChange={e => setEmiMonths(parseInt(e.target.value) || 0)}
                      inputProps={{ min: 1, max: 120 }}
                      InputProps={{ endAdornment: <InputAdornment position="end">months</InputAdornment> }}
                      helperText={emiMonths > 0 && balanceDue > 0 ? `Monthly EMI = ${formatCurrency(emiAmount)}` : 'Enter months to auto-calculate'}
                    />
                  </Grid>
                  {emiMonths > 0 && balanceDue > 0 && (
                    <Grid item xs={12}>
                      <Box sx={{ p: 1.5, bgcolor: 'primary.50', borderRadius: 2, border: '1px solid', borderColor: 'primary.light', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                        <Box>
                          <Typography variant="caption" color="text.secondary" display="block">Monthly EMI Amount</Typography>
                          <Typography variant="h6" fontWeight={700} color="primary.main">{formatCurrency(emiAmount)}</Typography>
                        </Box>
                        <Typography variant="body2" color="text.secondary">
                          {emiMonths} months × {formatCurrency(emiAmount)} = {formatCurrency(balanceDue)}
                        </Typography>
                      </Box>
                    </Grid>
                  )}
                  <Grid item xs={12} sm={6}>
                    <TextField fullWidth label="EMI Start Date *" type="date" value={emiStartDate}
                      onChange={e => setEmiStartDate(e.target.value)} size="small" InputLabelProps={{ shrink: true }} />
                  </Grid>
                </>
              )}

              {(paymentType === PAYMENT_TYPES.FINANCE || paymentType === PAYMENT_TYPES.BANK_TRANSFER) && (
                <>
                  <Grid item xs={12} sm={6}>
                    <TextField fullWidth label="Financer / Bank Name *" value={financerName}
                      onChange={e => setFinancerName(e.target.value)} size="small" />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField fullWidth label="Payment Ref. Number *" value={paymentRef}
                      onChange={e => setPaymentRef(e.target.value)} size="small" />
                  </Grid>
                </>
              )}
            </Grid>
          )}
        </CardContent>
      </Card>

      {/* ── Notes ── */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <TextField fullWidth label="Notes / Remarks" value={notes}
            onChange={e => setNotes(e.target.value)} multiline rows={2} size="small" />
        </CardContent>
      </Card>

      {/* ── Summary ── */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} mb={2}>Invoice Summary</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box display="flex" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">Subtotal (Incl. Tax)</Typography>
              <Typography variant="body2">{formatCurrency(subtotal)}</Typography>
            </Box>
            {invoiceType === 'gst' && (
              <Box display="flex" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">Total GST</Typography>
                <Typography variant="body2" color="info.main">{formatCurrency(totalTax)}</Typography>
              </Box>
            )}
            {hasExchange && exchangeDeduction > 0 && (
              <Box display="flex" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">Exchange Deduction</Typography>
                <Typography variant="body2" color="error.main">− {formatCurrency(exchangeDeduction)}</Typography>
              </Box>
            )}
            <Divider />
            <Box display="flex" justifyContent="space-between">
              <Typography variant="subtitle1" fontWeight={700}>Grand Total</Typography>
              <Typography variant="subtitle1" fontWeight={700} color="primary">{formatCurrency(grandTotal)}</Typography>
            </Box>
            {(paymentType === PAYMENT_TYPES.EMI || paymentType === PAYMENT_TYPES.FINANCE || paymentType === PAYMENT_TYPES.BANK_TRANSFER) && downPayment > 0 && (
              <>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">Down Payment</Typography>
                  <Typography variant="body2" color="success.main">{formatCurrency(downPayment)}</Typography>
                </Box>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2" fontWeight={600}>Balance Due</Typography>
                  <Typography variant="body2" fontWeight={600} color="error.main">{formatCurrency(balanceDue)}</Typography>
                </Box>
                {paymentType === PAYMENT_TYPES.EMI && emiMonths > 0 && emiAmount > 0 && (
                  <Box display="flex" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">EMI Schedule</Typography>
                    <Typography variant="body2" color="primary.main">{formatCurrency(emiAmount)} × {emiMonths} months</Typography>
                  </Box>
                )}
              </>
            )}
            {/* Delivery summary row */}
            <Divider />
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Typography variant="body2" color="text.secondary">Delivery</Typography>
              {deliveryType === DELIVERY_TYPES.IMMEDIATE
                ? <Chip icon={<CheckCircle sx={{ fontSize: '14px !important' }} />} label="Delivered at sale" color="success" size="small" />
                : <Chip icon={<Schedule sx={{ fontSize: '14px !important' }} />}
                    label={deliveryDate ? `Scheduled: ${new Date(deliveryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}` : 'Scheduled — date TBD'}
                    color="warning" size="small" />
              }
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* ── Actions ── */}
      <Stack direction="row" spacing={2} justifyContent="flex-end">
        <Button variant="outlined" onClick={() => navigate('/sales')} size="large">Cancel</Button>
        <Button variant="contained" size="large" onClick={handleSave} disabled={saving}
          startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <Save />}>
          {isEdit ? 'Update Sale' : 'Save Sale'}
        </Button>
      </Stack>

      <NewCustomerDialog open={newCustomerOpen} onClose={() => setNewCustomerOpen(false)} onSave={handleAddNewCustomer} />
    </Box>
  );
};

export default CreateSale;