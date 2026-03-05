import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Card, TextField, InputAdornment,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, Chip, IconButton, Tooltip, Dialog, DialogTitle,
  DialogContent, DialogActions, Grid, MenuItem, Select, FormControl,
  InputLabel, CircularProgress, Alert, Autocomplete, Divider,
} from '@mui/material';
import {
  Add, Search, Edit, Delete, Close, Save, AddCircle, RemoveCircle,
} from '@mui/icons-material';
import {
  collection, query, orderBy, limit, startAfter, getDocs,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
  getCountFromServer, where,
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';
import { formatCurrency, formatDate, calculateGST, debounce } from '../../utils';
import { useMediaQuery, useTheme } from '@mui/material';

const EMPTY_PURCHASE = {
  supplierName: '', supplierGst: '', invoiceNumber: '',
  invoiceDate: new Date().toISOString().split('T')[0],
  items: [{ productId: '', productName: '', qty: 1, price: 0, gstRate: 18 }],
  notes: '',
};

const PurchaseFormDialog = ({ open, onClose, onSave, initial, products }) => {
  const [form, setForm] = useState(EMPTY_PURCHASE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setForm(initial ? { ...EMPTY_PURCHASE, ...initial } : EMPTY_PURCHASE); setError(''); }, [initial, open]);

  const setField = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const setItem = (idx, k) => (val) => {
    setForm(p => {
      const items = [...p.items];
      items[idx] = { ...items[idx], [k]: val };
      if (k === 'productId') {
        const prod = products.find(pr => pr.id === val);
        if (prod) { items[idx].productName = prod.name; items[idx].price = prod.price; items[idx].gstRate = prod.gstRate; }
      }
      return { ...p, items };
    });
  };

  const addItem = () => setForm(p => ({ ...p, items: [...p.items, { productId: '', productName: '', qty: 1, price: 0, gstRate: 18 }] }));
  const removeItem = (idx) => setForm(p => ({ ...p, items: p.items.filter((_, i) => i !== idx) }));

  const grandTotal = form.items.reduce((sum, it) => sum + (parseFloat(it.qty) || 0) * (parseFloat(it.price) || 0), 0);

  const handleSave = async () => {
    if (!form.supplierName || form.items.some(it => !it.productName || !it.qty || !it.price)) {
      setError('Please fill all required fields'); return;
    }
    setLoading(true);
    try {
      await onSave({ ...form, grandTotal });
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography fontWeight={700}>{initial?.id ? 'Edit Purchase' : 'Record Purchase'}</Typography>
        <IconButton onClick={onClose}><Close /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Grid container spacing={2} mb={2}>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Supplier Name *" value={form.supplierName} onChange={setField('supplierName')} size="small" />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Supplier GSTIN" value={form.supplierGst} onChange={setField('supplierGst')} size="small" />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Invoice Number" value={form.invoiceNumber} onChange={setField('invoiceNumber')} size="small" />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Invoice Date" type="date" value={form.invoiceDate} onChange={setField('invoiceDate')} size="small" InputLabelProps={{ shrink: true }} />
          </Grid>
        </Grid>

        <Divider sx={{ mb: 2 }} />
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
          <Typography variant="subtitle2" fontWeight={600}>Items</Typography>
          <Button startIcon={<AddCircle />} size="small" onClick={addItem}>Add Item</Button>
        </Box>

        {form.items.map((item, idx) => (
          <Box key={idx} sx={{ mb: 1.5, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <Grid container spacing={1.5} alignItems="center">
              <Grid item xs={12} sm={5}>
                <FormControl fullWidth size="small">
                  <InputLabel>Product</InputLabel>
                  <Select value={item.productId} onChange={e => setItem(idx, 'productId')(e.target.value)} label="Product">
                    {products.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={4} sm={2}>
                <TextField fullWidth label="Qty" type="number" value={item.qty}
                  onChange={e => setItem(idx, 'qty')(parseFloat(e.target.value))} size="small" />
              </Grid>
              <Grid item xs={4} sm={2}>
                <TextField fullWidth label="Price (₹)" type="number" value={item.price}
                  onChange={e => setItem(idx, 'price')(parseFloat(e.target.value))} size="small" />
              </Grid>
              <Grid item xs={4} sm={2}>
                <TextField fullWidth label="GST%" type="number" value={item.gstRate}
                  onChange={e => setItem(idx, 'gstRate')(parseFloat(e.target.value))} size="small" />
              </Grid>
              <Grid item xs={12} sm={1} sx={{ display: 'flex', justifyContent: 'center' }}>
                <IconButton color="error" size="small" onClick={() => removeItem(idx)} disabled={form.items.length === 1}>
                  <RemoveCircle />
                </IconButton>
              </Grid>
            </Grid>
            <Typography variant="caption" color="text.secondary" mt={0.5} display="block">
              Amount: {formatCurrency((item.qty || 0) * (item.price || 0))}
            </Typography>
          </Box>
        ))}

        <Box textAlign="right" mt={2}>
          <Typography variant="subtitle1" fontWeight={700}>Grand Total: {formatCurrency(grandTotal)}</Typography>
        </Box>

        <TextField fullWidth label="Notes" value={form.notes} onChange={setField('notes')} size="small" multiline rows={2} sx={{ mt: 2 }} />
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} variant="outlined">Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={loading} startIcon={loading ? <CircularProgress size={16} /> : <Save />}>
          {initial?.id ? 'Update' : 'Save Purchase'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const PurchaseList = () => {
  const { db } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage] = useState(10);
  const [search, setSearch] = useState('');
  const [lastDocs, setLastDocs] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [products, setProducts] = useState([]);

  useEffect(() => {
    if (db) fetchProducts();
  }, [db]);

  const fetchProducts = async () => {
    const snap = await getDocs(query(collection(db, 'products'), orderBy('name')));
    setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const fetchPurchases = useCallback(async (pg = 0) => {
    if (!db) return;
    setLoading(true);
    try {
      const constraints = [orderBy('createdAt', 'desc'), limit(rowsPerPage)];
      if (pg > 0 && lastDocs[pg - 1]) constraints.push(startAfter(lastDocs[pg - 1]));
      const q = query(collection(db, 'purchases'), ...constraints);
      const snap = await getDocs(q);
      let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (search.trim()) {
        const s = search.toLowerCase();
        docs = docs.filter(d => d.supplierName?.toLowerCase().includes(s) || d.invoiceNumber?.includes(s));
      }
      const countSnap = await getCountFromServer(collection(db, 'purchases'));
      setTotal(countSnap.data().count);
      setRows(docs);
      setLastDocs(prev => { const arr = [...prev]; arr[pg] = snap.docs[snap.docs.length - 1]; return arr; });
    } catch (err) {
      toast.error('Failed to load purchases');
    } finally {
      setLoading(false);
    }
  }, [db, page, search, rowsPerPage]);

  useEffect(() => { fetchPurchases(page); }, [page]);

  // FIX: trigger a fresh fetch when search changes (debounced)
  const debouncedFetch = useCallback(debounce(() => { setPage(0); fetchPurchases(0); }, 400), [fetchPurchases]);
  useEffect(() => { debouncedFetch(); }, [search]);

  const handleSave = async (form) => {
    if (editing?.id) {
      await updateDoc(doc(db, 'purchases', editing.id), { ...form, updatedAt: serverTimestamp() });
      toast.success('Purchase updated');
    } else {
      // Save purchase and update inventory
      const purchaseRef = await addDoc(collection(db, 'purchases'), { ...form, createdAt: serverTimestamp() });
      // Update inventory for each item
      for (const item of form.items) {
        if (!item.productId) continue;
        const invQuery = query(collection(db, 'inventory'), where('productId', '==', item.productId));
        const invSnap = await getDocs(invQuery);
        if (invSnap.empty) {
          await addDoc(collection(db, 'inventory'), {
            productId: item.productId,
            productName: item.productName,
            stock: item.qty,
            purchasedQty: item.qty,
            soldQty: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          const invDoc = invSnap.docs[0];
          await updateDoc(doc(db, 'inventory', invDoc.id), {
            stock: (invDoc.data().stock || 0) + item.qty,
            purchasedQty: (invDoc.data().purchasedQty || 0) + item.qty,
            updatedAt: serverTimestamp(),
          });
        }
      }
      toast.success('Purchase recorded & inventory updated');
    }
    fetchPurchases(page);
  };

  const handleDelete = async () => {
    await deleteDoc(doc(db, 'purchases', deleteId));
    toast.success('Purchase deleted');
    setDeleteId(null);
    fetchPurchases(page);
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2} flexWrap="wrap" gap={1}>
        <Typography variant="h5" fontWeight={700}>Purchases</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => { setEditing(null); setDialogOpen(true); }}>
          Record Purchase
        </Button>
      </Box>

      <Card sx={{ mb: 2 }}>
        <Box sx={{ p: 2 }}>
          <TextField
            fullWidth placeholder="Search supplier, invoice..."
            value={search} onChange={e => setSearch(e.target.value)} size="small"
            InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
          />
        </Box>
      </Card>

      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Supplier</TableCell>
                {!isMobile && <TableCell>Invoice #</TableCell>}
                {!isMobile && <TableCell>Date</TableCell>}
                <TableCell>Items</TableCell>
                <TableCell>Total</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: isMobile ? 4 : 6 }).map((_, j) => (
                    <TableCell key={j}><Box sx={{ height: 20, bgcolor: 'action.hover', borderRadius: 1 }} /></TableCell>
                  ))}</TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={isMobile ? 4 : 6} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">No purchases recorded</Typography>
                </TableCell></TableRow>
              ) : rows.map(row => (
                <TableRow key={row.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{row.supplierName}</Typography>
                    {isMobile && <Typography variant="caption" color="text.secondary">{formatDate(row.invoiceDate)}</Typography>}
                  </TableCell>
                  {!isMobile && <TableCell>{row.invoiceNumber || '-'}</TableCell>}
                  {!isMobile && <TableCell>{formatDate(row.invoiceDate)}</TableCell>}
                  <TableCell>{row.items?.length || 0} items</TableCell>
                  <TableCell><Typography fontWeight={600} color="error.main">{formatCurrency(row.grandTotal)}</Typography></TableCell>
                  <TableCell align="right">
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={() => { setEditing(row); setDialogOpen(true); }}>
                        <Edit fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton size="small" color="error" onClick={() => setDeleteId(row.id)}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div" count={total} page={page} rowsPerPage={rowsPerPage}
          onPageChange={(_, p) => setPage(p)} rowsPerPageOptions={[10]}
        />
      </Card>

      <PurchaseFormDialog
        open={dialogOpen} onClose={() => setDialogOpen(false)}
        onSave={handleSave} initial={editing} products={products}
      />

      <Dialog open={Boolean(deleteId)} onClose={() => setDeleteId(null)} maxWidth="xs">
        <DialogTitle>Delete Purchase?</DialogTitle>
        <DialogContent><Typography>This action cannot be undone.</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PurchaseList;