import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Button, Card, CardContent, Grid, TextField,
  MenuItem, Select, FormControl, InputLabel, Divider, Chip,
  FormControlLabel, Checkbox, Radio, RadioGroup, Alert, Autocomplete,
  CircularProgress, Paper, IconButton, Stack, InputAdornment, Dialog,
  DialogTitle, DialogContent, DialogActions, Table, TableHead,
  TableRow, TableCell, TableBody,
} from '@mui/material';
import {
  ArrowBack, Save, Delete, AddCircle, PersonAdd,
  SwapHoriz, Receipt, ReceiptLong, LocalShipping, Schedule,
  CheckCircle, ViewList,
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

const EMPTY_ITEM = { productId: '', productName: '', qty: 1, price: 0, gstRate: 18, unit: 'pcs' };
const EMPTY_CUSTOMER_FORM = {
  name: '', phone: '', email: '', address: '', city: '',
  state: 'Gujarat', customerType: 'retail', category: 'individual',
};
const DELIVERY_TYPES = { IMMEDIATE: 'immediate', SCHEDULED: 'scheduled' };

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

// ─── Bulk Price Entry Dialog ──────────────────────────────────────────────────
// One total for all items — no per-item split, shows as "Bulk" label on items
const BulkPriceDialog = ({ open, onClose, currentBulk, onApply, onClear }) => {
  const [bulkTotal, setBulkTotal] = useState('');

  useEffect(() => {
    if (open) setBulkTotal(currentBulk > 0 ? String(currentBulk) : '');
  }, [open, currentBulk]);

  const total = parseFloat(bulkTotal) || 0;

  const handleConfirm = () => {
    if (!total || total <= 0) { toast.error('Enter a valid total amount'); return; }
    onApply(total);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <ViewList color="primary" />
          <Box>
            <Typography variant="h6" fontWeight={700}>Bulk Price Entry</Typography>
            <Typography variant="caption" color="text.secondary">Single total for all items</Typography>
          </Box>
        </Box>
      </DialogTitle>
      <DialogContent>
        <TextField
          fullWidth
          label="Total Amount for All Items (₹)"
          type="number"
          value={bulkTotal}
          onChange={e => setBulkTotal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleConfirm()}
          size="small"
          autoFocus
          InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
          placeholder="e.g. 18000"
          sx={{ mt: 1, mb: 1.5 }}
          helperText="This total will be used as-is — no per-item splitting"
        />
        {currentBulk > 0 && (
          <Alert severity="info" sx={{ py: 0.5 }}>
            Current bulk total: <strong>{formatCurrency(currentBulk)}</strong>
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between' }}>
        {currentBulk > 0
          ? <Button onClick={() => { onClear(); onClose(); }} color="error" variant="text" size="small">
              Clear Bulk
            </Button>
          : <Box />
        }
        <Box display="flex" gap={1}>
          <Button onClick={onClose} variant="outlined">Cancel</Button>
          <Button onClick={handleConfirm} variant="contained" startIcon={<CheckCircle />} disabled={!total || total <= 0}>
            Set ₹{total > 0 ? total.toLocaleString('en-IN') : '—'}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const CreateSale = () => {
  const { db, userProfile } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [inventory, setInventory] = useState({});
  const [employees, setEmployees] = useState([]);

  const [invoiceType, setInvoiceType] = useState('gst');
  const [companyId, setCompanyId] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [salesperson, setSalesperson] = useState(userProfile?.name || '');
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0]);
  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);
  const [notes, setNotes] = useState('');
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [bulkEntryOpen, setBulkEntryOpen] = useState(false);
  const [bulkPrice, setBulkPrice] = useState(0); // 0 = not set; >0 = bulk total overrides per-item prices

  const [hasExchange, setHasExchange] = useState(false);
  const [exchangeItem, setExchangeItem] = useState('');
  const [exchangeValue, setExchangeValue] = useState(0);
  const [exchangeReceived, setExchangeReceived] = useState(false);

  const [paymentType, setPaymentType] = useState(PAYMENT_TYPES.FULL);
  const [downPayment, setDownPayment] = useState(0);
  const [emiMonths, setEmiMonths] = useState(0);
  const [emiStartDate, setEmiStartDate] = useState('');
  const [financerName, setFinancerName] = useState('');
  const [paymentRef, setPaymentRef] = useState('');

  const [deliveryType, setDeliveryType] = useState(DELIVERY_TYPES.IMMEDIATE);
  const [deliveryDate, setDeliveryDate] = useState('');

  const dataLoadedRef = useRef(false);
  const allCompanies = Object.values(COMPANIES);

  useEffect(() => {
    if (!db) return;
    loadLookups();
    if (id) loadExistingSale();
    else dataLoadedRef.current = true;
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
      setBulkPrice(d.bulkPrice || 0);
    } finally {
      setLoading(false);
      setTimeout(() => { dataLoadedRef.current = true; }, 100);
    }
  };

  // Clear payment fields when payment type changes (only after initial load)
  const handlePaymentTypeChange = (newType) => {
    if (dataLoadedRef.current && newType !== paymentType) {
      setDownPayment(0);
      setEmiMonths(0);
      setEmiStartDate('');
      setFinancerName('');
      setPaymentRef('');
    }
    setPaymentType(newType);
  };

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

  const handleBulkPriceApply = (total) => {
    setBulkPrice(total);
    toast.success(`Bulk price set to ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(total)}!`);
  };

  const handleBulkPriceClear = () => {
    setBulkPrice(0);
    toast.info('Bulk price cleared');
  };

  const itemsWithCalc = items.map(it => {
    const subtotal = (parseFloat(it.qty) || 0) * (parseFloat(it.price) || 0);
    const gst = invoiceType === 'gst'
      ? calculateGST(subtotal, it.gstRate)
      : { baseAmount: subtotal, totalTax: 0, cgst: 0, sgst: 0 };
    return { ...it, subtotal, ...gst };
  });

  // If bulkPrice is set, it overrides the sum of per-item subtotals
  const subtotal = bulkPrice > 0 ? bulkPrice : itemsWithCalc.reduce((s, it) => s + it.subtotal, 0);
  const totalTax = bulkPrice > 0 ? 0 : itemsWithCalc.reduce((s, it) => s + (it.totalTax || 0), 0);
  const exchangeDeduction = hasExchange ? (parseFloat(exchangeValue) || 0) : 0;
  const grandTotal = subtotal - exchangeDeduction;
  const balanceDue = grandTotal - (parseFloat(downPayment) || 0);
  const emiAmount = emiMonths > 0 ? parseFloat((balanceDue / emiMonths).toFixed(2)) : 0;

  // Build EMI installments array (stored inside sale doc now)
  const buildEmiInstallments = () => {
    if (paymentType !== PAYMENT_TYPES.EMI || emiMonths <= 0 || !emiStartDate) return [];
    const result = [];
    for (let m = 0; m < emiMonths; m++) {
      const due = new Date(emiStartDate);
      due.setMonth(due.getMonth() + m);
      result.push({
        installmentNumber: m + 1,
        dueDate: due.toISOString().split('T')[0],
        amount: emiAmount,
        paidAmount: 0,
        status: 'pending',
        payments: [],
        dueDateChanges: [],
        dueDateChangeCount: 0,
      });
    }
    return result;
  };

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
      const company = COMPANIES[companyId];
      let invoiceNumber;

      if (isEdit) {
        const existingSnap = await getDoc(doc(db, 'sales', id));
        invoiceNumber = existingSnap.data().invoiceNumber;
      } else {
        const countSnap = await getCountFromServer(collection(db, 'sales'));
        invoiceNumber = generateInvoiceNumber(company?.code || 'INV', countSnap.data().count);
      }

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
        hasExchange, exchangeItem, exchangeValue: exchangeDeduction, exchangeReceived,
        paymentType,
        downPayment: parseFloat(downPayment) || 0,
        emiMonths: parseInt(emiMonths) || 0,
        emiAmount,
        emiStartDate, financerName, paymentRef, balanceDue,
        deliveryType,
        deliveryDate: deliveryType === DELIVERY_TYPES.SCHEDULED ? deliveryDate : '',
        isDelivered: deliveryType === DELIVERY_TYPES.IMMEDIATE,
        bulkPrice: bulkPrice || 0,
        notes,
      };

      if (isEdit) {
        const existingSnap = await getDoc(doc(db, 'sales', id));
        const existingData = existingSnap.data();
        const prevPaymentType = existingData.paymentType;

        // ── Determine EMI installments ──
        let emiInstallments;
        if (paymentType === PAYMENT_TYPES.EMI) {
          const prevInstallments = existingData.emiInstallments || [];
          const configChanged =
            parseInt(emiMonths) !== (existingData.emiMonths || 0) ||
            emiStartDate !== (existingData.emiStartDate || '') ||
            Math.abs(emiAmount - (existingData.emiAmount || 0)) > 0.01;

          if (prevPaymentType === PAYMENT_TYPES.EMI && !configChanged && prevInstallments.length > 0) {
            // Keep existing (preserves payment history)
            emiInstallments = prevInstallments;
          } else {
            // Regenerate — config changed or switching to EMI
            emiInstallments = buildEmiInstallments();
          }
        } else {
          emiInstallments = [];
        }

        // ── Reset sale-level payments if payment type changed ──
        const paymentReset = prevPaymentType !== paymentType
          ? {
              salePayments: [],
              totalPaidAmount: 0,
              paymentStatus: paymentType === PAYMENT_TYPES.FULL ? 'paid' : 'unpaid',
            }
          : {};

        await updateDoc(doc(db, 'sales', id), {
          ...saleData,
          emiInstallments,
          ...paymentReset,
          updatedAt: serverTimestamp(),
        });
        toast.success('Sale updated!');
      } else {
        const emiInstallments = buildEmiInstallments();

        await addDoc(collection(db, 'sales'), {
          ...saleData,
          emiInstallments,
          salePayments: [],
          totalPaidAmount: 0,
          paymentStatus: paymentType === PAYMENT_TYPES.FULL ? 'paid' : 'unpaid',
          createdAt: serverTimestamp(),
        });

        // Deduct inventory
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

  // ── Column sizing: gives each field its own column, no overflow ──
  // With GST:    Product(4) | Qty(1) | Price(2) | GST(2) | Amount(2) | Del(1) = 12
  // Without GST: Product(5) | Qty(2) | Price(2)          | Amount(2) | Del(1) = 12
  const withGST = invoiceType === 'gst';

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 900, mx: 'auto' }}>
      <Box display="flex" alignItems="center" gap={2} mb={3}>
        <IconButton onClick={() => navigate('/sales')}><ArrowBack /></IconButton>
        <Box>
          <Typography variant="h5" fontWeight={700}>{isEdit ? 'Edit Sale' : 'New Sale'}</Typography>
          <Typography variant="body2" color="text.secondary">
            {isEdit ? 'Update sale details' : 'Record a new sale transaction'}
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
              <FormControl fullWidth size="small">
                <InputLabel>Invoice Type</InputLabel>
                <Select value={invoiceType} onChange={e => setInvoiceType(e.target.value)} label="Invoice Type">
                  <MenuItem value="gst"><Receipt sx={{ mr: 1, fontSize: 16, verticalAlign: 'middle' }} />GST Invoice</MenuItem>
                  <MenuItem value="non_gst"><ReceiptLong sx={{ mr: 1, fontSize: 16, verticalAlign: 'middle' }} />Non-GST Invoice</MenuItem>
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
              <TextField fullWidth label="Sale Date *" type="date" value={saleDate}
                onChange={e => setSaleDate(e.target.value)} size="small" InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Salesperson</InputLabel>
                <Select value={salesperson} onChange={e => setSalesperson(e.target.value)} label="Salesperson">
                  {employees.map(e => <MenuItem key={e.id} value={e.name}>{e.name}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* ── Customer ── */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="subtitle1" fontWeight={700}>Customer</Typography>
            <Button size="small" startIcon={<PersonAdd />} onClick={() => setNewCustomerOpen(true)}>
              New Customer
            </Button>
          </Box>
          <Autocomplete
            options={customers}
            getOptionLabel={c => `${c.name} — ${c.phone}`}
            value={selectedCustomer}
            onChange={(_, v) => setSelectedCustomer(v)}
            renderInput={params => <TextField {...params} label="Select Customer *" size="small" />}
            isOptionEqualToValue={(o, v) => o.id === v.id}
          />
          {selectedCustomer && (
            <Box sx={{ mt: 1.5, p: 1.5, bgcolor: 'action.hover', borderRadius: 2 }}>
              <Typography variant="body2" fontWeight={600}>{selectedCustomer.name}</Typography>
              <Typography variant="caption" color="text.secondary">{selectedCustomer.phone}</Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* ── Items ── */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
            <Typography variant="subtitle1" fontWeight={700}>Items</Typography>
            <Box display="flex" alignItems="center" gap={1}>
              {bulkPrice > 0 && (
                <Chip
                  label={`Bulk: ${formatCurrency(bulkPrice)}`}
                  color="secondary"
                  size="small"
                  onDelete={handleBulkPriceClear}
                />
              )}
              {items.length >= 2 && (
                <Button
                  size="small"
                  variant={bulkPrice > 0 ? 'contained' : 'outlined'}
                  color="secondary"
                  startIcon={<ViewList />}
                  onClick={() => setBulkEntryOpen(true)}
                >
                  {bulkPrice > 0 ? 'Edit Bulk' : 'Bulk Price'}
                </Button>
              )}
            </Box>
          </Box>

          {items.map((item, idx) => {
            const lineSubtotal = (parseFloat(item.qty) || 0) * (parseFloat(item.price) || 0);
            return (
              <Box
                key={idx}
                sx={{
                  mb: 1.5, p: { xs: 1.5, sm: 1.5 },
                  border: '1px solid', borderColor: 'divider',
                  borderRadius: 2, bgcolor: 'background.paper',
                }}
              >
                <Grid container spacing={1} alignItems="center">
                  {/* Product */}
                  <Grid item xs={12} sm={bulkPrice > 0 ? 8 : (withGST ? 4 : 5)}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Product *</InputLabel>
                      <Select
                        value={item.productId}
                        onChange={e => setItemField(idx, 'productId')(e.target.value)}
                        label="Product *"
                      >
                        {products.map(p => (
                          <MenuItem key={p.id} value={p.id}>
                            <Box>
                              <Typography variant="body2">{p.name}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {formatCurrency(p.price)} · Stock: {inventory[p.id] || 0}
                              </Typography>
                            </Box>
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>

                  {/* Qty */}
                  <Grid item xs={9} sm={bulkPrice > 0 ? 3 : (withGST ? 1 : 2)}>
                    <TextField
                      fullWidth label="Qty" type="number" value={item.qty} size="small"
                      onChange={e => setItemField(idx, 'qty')(parseFloat(e.target.value) || 1)}
                      inputProps={{ min: 0.01, step: 0.01 }}
                    />
                  </Grid>

                  {/* Price — hidden when bulk active */}
                  {bulkPrice === 0 && (
                    <Grid item xs={4} sm={2}>
                      <TextField
                        fullWidth label="Price" type="number" value={item.price} size="small"
                        onChange={e => setItemField(idx, 'price')(parseFloat(e.target.value) || 0)}
                        InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                        inputProps={{ min: 0, step: 0.01 }}
                      />
                    </Grid>
                  )}

                  {/* GST% — only when GST mode and not bulk */}
                  {withGST && bulkPrice === 0 && (
                    <Grid item xs={4} sm={2}>
                      <FormControl fullWidth size="small">
                        <InputLabel>GST %</InputLabel>
                        <Select
                          value={item.gstRate}
                          onChange={e => setItemField(idx, 'gstRate')(e.target.value)}
                          label="GST %"
                        >
                          {GST_SLABS.map(g => <MenuItem key={g} value={g}>{g}%</MenuItem>)}
                        </Select>
                      </FormControl>
                    </Grid>
                  )}

                  {/* Per-item amount — only when NOT bulk */}
                  {bulkPrice === 0 && (
                    <Grid item xs={withGST ? 9 : 7} sm={2}>
                      <Box sx={{ height: '100%', minHeight: 40, display: 'flex', alignItems: 'center', pl: 0.5 }}>
                        <Typography variant="body2" fontWeight={700} color="primary.main" noWrap>
                          {formatCurrency(lineSubtotal)}
                        </Typography>
                      </Box>
                    </Grid>
                  )}

                  {/* Delete */}
                  <Grid item xs={3} sm={1}>
                    <Box display="flex" justifyContent="flex-end" alignItems="center" height="100%">
                      {items.length > 1 ? (
                        <IconButton size="small" color="error" onClick={() => removeItem(idx)}>
                          <Delete fontSize="small" />
                        </IconButton>
                      ) : (
                        <Box sx={{ width: 34 }} />
                      )}
                    </Box>
                  </Grid>
                </Grid>
              </Box>
            );
          })}

          {/* Bulk total summary row */}
          {bulkPrice > 0 && (
            <Box sx={{
              mt: 1, px: 2, py: 1.5,
              bgcolor: 'secondary.50', border: '1px dashed', borderColor: 'secondary.main',
              borderRadius: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <Typography variant="body2" color="text.secondary">
                {items.length} item{items.length > 1 ? 's' : ''} · Bulk total
              </Typography>
              <Typography variant="subtitle1" fontWeight={800} color="secondary.main">
                {formatCurrency(bulkPrice)}
              </Typography>
            </Box>
          )}

          <Box mt={1.5}>
            <Button startIcon={<AddCircle />} onClick={addItem} size="small">Add Item</Button>
          </Box>
        </CardContent>
      </Card>

      {/* ── Exchange ── */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box display="flex" alignItems="center" gap={1} mb={hasExchange ? 2 : 0}>
            <SwapHoriz color={hasExchange ? 'primary' : 'disabled'} />
            <Typography variant="subtitle1" fontWeight={700}>Exchange</Typography>
            <FormControlLabel
              control={<Checkbox checked={hasExchange} onChange={e => {
                setHasExchange(e.target.checked);
                if (!e.target.checked) { setExchangeItem(''); setExchangeValue(0); setExchangeReceived(false); }
              }} />}
              label="Has Exchange Item"
              sx={{ ml: 'auto', mr: 0 }}
            />
          </Box>
          {hasExchange && (
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth label="Exchange Item Description *" value={exchangeItem}
                  onChange={e => setExchangeItem(e.target.value)} size="small"
                  placeholder="e.g. Old Samsung TV 32 inch" />
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField fullWidth label="Exchange Value (₹)" type="number" value={exchangeValue}
                  onChange={e => setExchangeValue(parseFloat(e.target.value) || 0)} size="small"
                  InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
              </Grid>
              <Grid item xs={12} sm={3}>
                <FormControlLabel
                  control={<Checkbox checked={exchangeReceived} onChange={e => setExchangeReceived(e.target.checked)} />}
                  label="Item Received"
                />
              </Grid>
            </Grid>
          )}
        </CardContent>
      </Card>

      {/* ── Delivery ── */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} mb={1}>
            <LocalShipping sx={{ mr: 1, verticalAlign: 'middle', fontSize: 20 }} />
            Delivery
          </Typography>
          <RadioGroup row value={deliveryType}
            onChange={e => { setDeliveryType(e.target.value); setDeliveryDate(''); }}>
            <FormControlLabel value={DELIVERY_TYPES.IMMEDIATE} control={<Radio color="success" />} label="Delivered" />
            <FormControlLabel value={DELIVERY_TYPES.SCHEDULED} control={<Radio color="warning" />} label="Scheduled" />
          </RadioGroup>
          {deliveryType === DELIVERY_TYPES.SCHEDULED && (
            <Box mt={2}>
              <TextField label="Expected Delivery Date *" type="date" value={deliveryDate}
                onChange={e => setDeliveryDate(e.target.value)} size="small"
                InputLabelProps={{ shrink: true }}
                inputProps={{ min: new Date().toISOString().split('T')[0] }}
                sx={{ width: { xs: '100%', sm: 240 } }}
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
            <RadioGroup value={paymentType} onChange={e => handlePaymentTypeChange(e.target.value)}>
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

          {isEdit && paymentType === PAYMENT_TYPES.EMI && (
            <Alert severity="info" sx={{ mt: 2, py: 0.5 }} icon={false}>
              <Typography variant="caption">
                Changing EMI months, start date, or down payment will regenerate installments and clear payment history.
              </Typography>
            </Alert>
          )}

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
                    <TextField fullWidth label="Number of EMI Months *" type="number"
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
            <Divider />
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Typography variant="body2" color="text.secondary">Delivery</Typography>
              {deliveryType === DELIVERY_TYPES.IMMEDIATE
                ? <Chip icon={<CheckCircle sx={{ fontSize: '14px !important' }} />} label="Delivered at sale" color="success" size="small" />
                : <Chip icon={<Schedule sx={{ fontSize: '14px !important' }} />}
                    label={deliveryDate ? `Scheduled: ${deliveryDate}` : 'Scheduled (date TBD)'}
                    color="warning" size="small" />
              }
            </Box>
          </Box>
        </CardContent>
      </Card>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="flex-end">
        <Button variant="outlined" onClick={() => navigate('/sales')} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}
          startIcon={saving ? <CircularProgress size={18} /> : <Save />} size="large">
          {saving ? 'Saving...' : isEdit ? 'Update Sale' : 'Save Sale'}
        </Button>
      </Stack>

      <NewCustomerDialog
        open={newCustomerOpen}
        onClose={() => setNewCustomerOpen(false)}
        onSave={handleAddNewCustomer}
      />
      <BulkPriceDialog
        open={bulkEntryOpen}
        onClose={() => setBulkEntryOpen(false)}
        currentBulk={bulkPrice}
        onApply={handleBulkPriceApply}
        onClear={handleBulkPriceClear}
      />
    </Box>
  );
};

export default CreateSale;