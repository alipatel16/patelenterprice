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
  addDoc, updateDoc, deleteDoc, doc, getDoc, serverTimestamp,
  getCountFromServer,
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';
import { formatCurrency, formatDate, debounce } from '../../utils';
import { useMediaQuery, useTheme } from '@mui/material';
import {
  applyInventoryDeltas,
  applyNewPurchaseInventory,
  reversePurchaseInventory,
} from '../../utils/inventoryUtils';

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
        <IconButton onClick={onClose} size="small"><Close /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Supplier Name *" value={form.supplierName} onChange={setField('supplierName')} size="small" />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Supplier GST" value={form.supplierGst} onChange={setField('supplierGst')} size="small" />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Invoice Number" value={form.invoiceNumber} onChange={setField('invoiceNumber')} size="small" />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Invoice Date" type="date" value={form.invoiceDate} onChange={setField('invoiceDate')} size="small" InputLabelProps={{ shrink: true }} />
          </Grid>
        </Grid>

        <Divider sx={{ my: 2 }} />
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
          <Typography fontWeight={600}>Items</Typography>
          <Button size="small" startIcon={<AddCircle />} onClick={addItem}>Add Item</Button>
        </Box>

        {form.items.map((it, idx) => (
          <Grid container spacing={1} key={idx} sx={{ mb: 1 }} alignItems="center">
            <Grid item xs={12} sm={4}>
              <Autocomplete
                size="small"
                options={products}
                getOptionLabel={p => p.name || ''}
                value={products.find(p => p.id === it.productId) || null}
                onChange={(_, v) => setItem(idx, 'productId')(v?.id || '')}
                renderInput={params => <TextField {...params} label="Product *" />}
              />
            </Grid>
            <Grid item xs={4} sm={2}>
              <TextField fullWidth size="small" label="Qty *" type="number" value={it.qty}
                onChange={e => setItem(idx, 'qty')(parseFloat(e.target.value) || 0)} />
            </Grid>
            <Grid item xs={4} sm={2}>
              <TextField fullWidth size="small" label="Price *" type="number" value={it.price}
                onChange={e => setItem(idx, 'price')(parseFloat(e.target.value) || 0)} />
            </Grid>
            <Grid item xs={4} sm={2}>
              <FormControl fullWidth size="small">
                <InputLabel>GST%</InputLabel>
                <Select value={it.gstRate} onChange={e => setItem(idx, 'gstRate')(e.target.value)} label="GST%">
                  {[0, 5, 12, 18, 28].map(r => <MenuItem key={r} value={r}>{r}%</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={2} sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
              <Typography variant="body2" fontWeight={600} sx={{ mr: 1 }}>
                {formatCurrency((it.qty || 0) * (it.price || 0))}
              </Typography>
              {form.items.length > 1 && (
                <IconButton size="small" color="error" onClick={() => removeItem(idx)}>
                  <RemoveCircle fontSize="small" />
                </IconButton>
              )}
            </Grid>
          </Grid>
        ))}

        <Box mt={2} textAlign="right">
          <Typography variant="h6" fontWeight={700}>Grand Total: {formatCurrency(grandTotal)}</Typography>
        </Box>

        <TextField fullWidth label="Notes" value={form.notes} onChange={setField('notes')} size="small" multiline rows={2} sx={{ mt: 2 }} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={loading}
          startIcon={loading ? <CircularProgress size={16} /> : <Save />}>
          {initial?.id ? 'Update' : 'Save Purchase'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

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

  const debouncedFetch = useCallback(debounce(() => { setPage(0); fetchPurchases(0); }, 400), [fetchPurchases]);
  useEffect(() => { debouncedFetch(); }, [search]);

  // ── EDIT: pure delta (newQty − oldQty). CREATE: add new stock ─────────────
  const handleSave = async (form) => {
    try {
      if (editing?.id) {
        // Read old items from Firestore (source of truth — not UI state)
        const oldSnap = await getDoc(doc(db, 'purchases', editing.id));
        const oldItems = oldSnap.exists() ? (oldSnap.data().items || []) : [];

        // Apply NET delta only. If qty unchanged → delta = 0 → no write.
        await applyInventoryDeltas(db, oldItems, form.items || [], 'purchase');
        await updateDoc(doc(db, 'purchases', editing.id), { ...form, updatedAt: serverTimestamp() });
        toast.success('Purchase updated & inventory reconciled');
      } else {
        await addDoc(collection(db, 'purchases'), { ...form, createdAt: serverTimestamp() });
        await applyNewPurchaseInventory(db, form.items || []);
        toast.success('Purchase recorded & inventory updated');
      }
      fetchPurchases(page);
    } catch (e) {
      toast.error('Failed to save purchase: ' + e.message);
      throw e; // re-throw so dialog shows error
    }
  };

  // ── DELETE: reverse all stock this purchase added ─────────────────────────
  const handleDelete = async () => {
    try {
      const purchaseSnap = await getDoc(doc(db, 'purchases', deleteId));
      if (purchaseSnap.exists()) {
        await reversePurchaseInventory(db, purchaseSnap.data().items || []);
      }
      await deleteDoc(doc(db, 'purchases', deleteId));
      toast.success('Purchase deleted & inventory updated');
      setDeleteId(null);
      fetchPurchases(page);
    } catch (e) {
      toast.error('Failed to delete purchase: ' + e.message);
    }
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
                <TableRow>
                  <TableCell colSpan={isMobile ? 4 : 6} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">No purchases recorded</Typography>
                  </TableCell>
                </TableRow>
              ) : rows.map(row => (
                <TableRow key={row.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{row.supplierName}</Typography>
                    {isMobile && <Typography variant="caption" color="text.secondary">{formatDate(row.invoiceDate)}</Typography>}
                  </TableCell>
                  {!isMobile && <TableCell>{row.invoiceNumber || '-'}</TableCell>}
                  {!isMobile && <TableCell>{formatDate(row.invoiceDate)}</TableCell>}
                  <TableCell>{row.items?.length || 0} items</TableCell>
                  <TableCell>
                    <Typography fontWeight={600} color="error.main">{formatCurrency(row.grandTotal)}</Typography>
                  </TableCell>
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
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        initial={editing}
        products={products}
      />

      <Dialog open={Boolean(deleteId)} onClose={() => setDeleteId(null)} maxWidth="xs">
        <DialogTitle>Delete Purchase?</DialogTitle>
        <DialogContent>
          <Typography>This will delete the purchase and reverse its inventory quantities. This action cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PurchaseList;