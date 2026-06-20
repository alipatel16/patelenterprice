// src/pages/Purchase/PurchaseList.js
//
// SEARCH STRATEGY
// No month selected  →  server-side cursor pagination, search disabled.
// Month selected     →  fetch all purchases in that month (by createdAt),
//                        filter by supplierName / invoiceNumber in memory.
//
// FIX: products for the purchase form dialog are no longer bulk-fetched at
//      all. Same on-demand search pattern as CreateSale — FirestoreAutocomplete
//      queries Firestore only as the user types a product name (≤15 results
//      per keystroke), instead of loading the entire products collection on
//      every page visit.

import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Button, Card, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TablePagination, Chip,
  IconButton, Stack, TextField, InputAdornment, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, Grid, Alert,
  Divider, useTheme, useMediaQuery,
} from '@mui/material';
import { Add, Edit, Delete, Close, Save } from '@mui/icons-material';
import {
  collection, query, orderBy, limit, startAfter, getDocs,
  addDoc, updateDoc, deleteDoc, doc, getDoc, serverTimestamp,
  getCountFromServer, where, Timestamp,
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';
import { formatCurrency, formatDate } from '../../utils';
import {
  applyNewPurchaseInventory, applyInventoryDeltas, reversePurchaseInventory,
} from '../../utils/inventoryUtils';
import MonthSearchBar from '../../components/MonthSearchBar';
// FIX: on-demand product search — same component CreateSale uses.
import FirestoreAutocomplete from '../../components/FirestoreAutocomplete';

const PAGE_SIZE = 10;

const getMonthBounds = (yearMonth) => {
  const [y, m] = yearMonth.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    start: new Date(y, m - 1, 1, 0, 0, 0, 0),
    end:   new Date(y, m - 1, lastDay, 23, 59, 59, 999),
  };
};

// ─── Purchase Form Dialog ─────────────────────────────────────────────────────
// FIX: each item's productObj holds the full product doc (UI-only — stripped
// before saving) so FirestoreAutocomplete can display the selected product's
// name without needing the full products list loaded.
const EMPTY_PURCHASE = {
  supplierName: '', supplierGst: '', invoiceNumber: '', invoiceDate: '',
  items: [{ productId: '', productName: '', qty: 1, price: 0, gstRate: 18, productObj: null }],
};

const PurchaseFormDialog = ({ open, onClose, onSave, initial, db }) => {
  const [form, setForm] = useState(EMPTY_PURCHASE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initial) {
      // FIX: reconstruct productObj from saved item fields so
      // FirestoreAutocomplete shows the correct product name when editing
      // an existing purchase, without fetching the full products collection.
      const items = (initial.items || []).map(it => ({
        ...it,
        productObj: it.productId
          ? { id: it.productId, name: it.productName, price: it.price, gstRate: it.gstRate }
          : null,
      }));
      setForm({ ...EMPTY_PURCHASE, ...initial, items: items.length ? items : EMPTY_PURCHASE.items });
    } else {
      setForm(EMPTY_PURCHASE);
    }
    setError('');
  }, [initial, open]);

  const setField = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  // FIX: supports two call signatures, same pattern as CreateSale's setItemField:
  //   setItem(idx, 'qty')(newQty)       — single field (existing behavior)
  //   setItem(idx)({ productId, ... })  — multi-field (used by FirestoreAutocomplete onChange)
  const setItem = (idx, k) => (val) => {
    setForm(p => {
      const items = [...p.items];
      if (k === undefined) {
        items[idx] = { ...items[idx], ...val };
        return { ...p, items };
      }
      items[idx] = { ...items[idx], [k]: val };
      return { ...p, items };
    });
  };

  const addItem = () => setForm(p => ({ ...p, items: [...p.items, { productId: '', productName: '', qty: 1, price: 0, gstRate: 18, productObj: null }] }));
  const removeItem = idx => setForm(p => ({ ...p, items: p.items.filter((_, i) => i !== idx) }));
  const grandTotal = form.items.reduce((sum, it) => sum + (parseFloat(it.qty) || 0) * (parseFloat(it.price) || 0), 0);

  const handleSave = async () => {
    if (!form.supplierName || form.items.some(it => !it.productName || !it.qty || !it.price)) {
      setError('Please fill all required fields'); return;
    }
    setSaving(true);
    try {
      // FIX: strip the UI-only productObj field before saving to Firestore —
      // same pattern as CreateSale's buildSaleData, so the saved purchase doc
      // only contains the real fields (productId, productName, qty, price, gstRate).
      const cleanItems = form.items.map(({ productObj, ...rest }) => rest);
      await onSave({ ...form, items: cleanItems, grandTotal });
      onClose();
    }
    catch (e) { setError(e.message); } finally { setSaving(false); }
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
          <Grid item xs={12} sm={6}><TextField fullWidth label="Supplier Name *" value={form.supplierName} onChange={setField('supplierName')} size="small" /></Grid>
          <Grid item xs={12} sm={6}><TextField fullWidth label="Supplier GST" value={form.supplierGst} onChange={setField('supplierGst')} size="small" /></Grid>
          <Grid item xs={12} sm={6}><TextField fullWidth label="Invoice Number" value={form.invoiceNumber} onChange={setField('invoiceNumber')} size="small" /></Grid>
          <Grid item xs={12} sm={6}><TextField fullWidth label="Invoice Date" type="date" value={form.invoiceDate} onChange={setField('invoiceDate')} size="small" InputLabelProps={{ shrink: true }} /></Grid>
        </Grid>
        <Divider sx={{ my: 2 }} />
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
          <Typography fontWeight={600}>Items</Typography>
          <Button size="small" startIcon={<Add />} onClick={addItem}>Add Item</Button>
        </Box>
        {form.items.map((item, idx) => (
          <Box key={idx} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* FIX: replaced <Select> populated from a bulk-loaded products[]
                array with on-demand FirestoreAutocomplete — same component
                and pattern used in CreateSale's item rows. */}
            <Box sx={{ minWidth: 200, flex: '1 1 200px' }}>
              <FirestoreAutocomplete
                db={db}
                collectionName="products"
                noPhoneSearch
                size="small"
                value={item.productObj || null}
                onChange={(_, v) => {
                  setItem(idx)({
                    productId:   v?.id    || '',
                    productName: v?.name  || '',
                    price:       v?.price ?? 0,
                    gstRate:     v?.gstRate ?? 18,
                    productObj:  v || null,
                  });
                }}
                label="Product"
                getOptionLabel={p => p.name || ''}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                renderOption={(props, p) => (
                  <Box component="li" {...props} key={p.id}>
                    <Box>
                      <Typography variant="body2">{p.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        ₹{p.price}{p.maker ? ` · ${p.maker}` : ''}
                      </Typography>
                    </Box>
                  </Box>
                )}
              />
            </Box>
            <TextField size="small" label="Qty" type="number" value={item.qty} onChange={e => setItem(idx, 'qty')(e.target.value)} sx={{ width: 70 }} />
            <TextField size="small" label="Price" type="number" value={item.price} onChange={e => setItem(idx, 'price')(e.target.value)} sx={{ width: 100 }} />
            <TextField size="small" label="GST %" type="number" value={item.gstRate} onChange={e => setItem(idx, 'gstRate')(e.target.value)} sx={{ width: 70 }} />
            <IconButton size="small" color="error" onClick={() => removeItem(idx)} disabled={form.items.length === 1}><Delete fontSize="small" /></IconButton>
          </Box>
        ))}
        <Box textAlign="right" mt={1}>
          <Typography variant="subtitle2">Grand Total: {formatCurrency(grandTotal)}</Typography>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} variant="outlined">Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={saving} startIcon={saving ? <CircularProgress size={16} /> : <Save />}>
          {initial?.id ? 'Update Purchase' : 'Save Purchase'}
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

  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(0);
  const [cursorMap, setCursorMap] = useState({});
  const [refreshKey, setRefreshKey] = useState(0);

  const [searchMonth,     setSearchMonth]     = useState('');
  const [search,          setSearch]          = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimer = useRef(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing,    setEditing]    = useState(null);
  const [deleteId,   setDeleteId]   = useState(null);

  const handleSearch = val => {
    setSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setDebouncedSearch(val); setPage(0); }, 400);
  };

  const handleMonthChange = val => {
    setSearchMonth(val); setSearch(''); setDebouncedSearch(''); setPage(0); setCursorMap({});
  };

  useEffect(() => {
    if (!db) return;
    let active = true;
    const run = async () => {
      setLoading(true);
      try {
        // ── MONTH SEARCH MODE ────────────────────────────────────────────
        if (searchMonth) {
          const { start, end } = getMonthBounds(searchMonth);
          const snap = await getDocs(query(
            collection(db, 'purchases'),
            where('createdAt', '>=', Timestamp.fromDate(start)),
            where('createdAt', '<=', Timestamp.fromDate(end)),
            orderBy('createdAt', 'desc'),
          ));
          if (!active) return;
          let all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          if (debouncedSearch.trim()) {
            const s = debouncedSearch.toLowerCase();
            all = all.filter(r =>
              r.supplierName?.toLowerCase().includes(s) ||
              r.invoiceNumber?.toLowerCase().includes(s)
            );
          }
          setTotal(all.length);
          setRows(all.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE));
          return;
        }

        // ── NORMAL CURSOR PAGINATION ─────────────────────────────────────
        const constraints = [orderBy('createdAt', 'desc'), limit(PAGE_SIZE)];
        if (page > 0 && cursorMap[page - 1]) constraints.push(startAfter(cursorMap[page - 1]));

        const [snap, countSnap] = await Promise.all([
          getDocs(query(collection(db, 'purchases'), ...constraints)),
          getCountFromServer(collection(db, 'purchases')),
        ]);
        if (!active) return;
        setRows(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setTotal(countSnap.data().count);
        if (snap.docs.length > 0) setCursorMap(prev => ({ ...prev, [page]: snap.docs[snap.docs.length - 1] }));

      } catch (err) {
        if (!active) return;
        toast.error('Failed to load purchases');
      } finally {
        if (active) setLoading(false);
      }
    };
    run();
    return () => { active = false; };
  }, [db, page, searchMonth, debouncedSearch, refreshKey]);

  const resetAndRefetch = () => { setCursorMap({}); setPage(0); setRefreshKey(k => k + 1); };

  const handleSave = async (form) => {
    try {
      if (editing?.id) {
        const oldSnap = await getDoc(doc(db, 'purchases', editing.id));
        const oldItems = oldSnap.exists() ? (oldSnap.data().items || []) : [];
        await applyInventoryDeltas(db, oldItems, form.items || [], 'purchase');
        await updateDoc(doc(db, 'purchases', editing.id), { ...form, updatedAt: serverTimestamp() });
        toast.success('Purchase updated & inventory reconciled');
      } else {
        await addDoc(collection(db, 'purchases'), { ...form, createdAt: serverTimestamp() });
        await applyNewPurchaseInventory(db, form.items || []);
        toast.success('Purchase recorded & inventory updated');
      }
      resetAndRefetch();
    } catch (e) {
      toast.error('Failed to save purchase: ' + e.message);
      throw e;
    }
  };

  const handleDelete = async () => {
    try {
      const snap = await getDoc(doc(db, 'purchases', deleteId));
      if (snap.exists()) await reversePurchaseInventory(db, snap.data().items || []);
      await deleteDoc(doc(db, 'purchases', deleteId));
      toast.success('Purchase deleted & inventory updated');
      setDeleteId(null);
      resetAndRefetch();
    } catch (e) { toast.error('Failed to delete purchase: ' + e.message); }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2} flexWrap="wrap" gap={1}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Purchases</Typography>
          <Typography variant="caption" color="text.secondary">
            {searchMonth ? `${total} results` : `${total} total purchases`}
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<Add />}
          onClick={() => { setEditing(null); setDialogOpen(true); }}
          size={isMobile ? 'small' : 'medium'}>
          Record Purchase
        </Button>
      </Box>

      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 2, p: 2 }}>
        <MonthSearchBar
          selectedMonth={searchMonth} onMonthChange={handleMonthChange}
          search={search} onSearchChange={handleSearch}
          searchPlaceholder="Search by supplier or invoice number…"
          resultCount={searchMonth ? total : undefined} loading={loading}
        />
      </Card>

      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell>Supplier</TableCell>
                {!isMobile && <TableCell>Invoice #</TableCell>}
                {!isMobile && <TableCell>Date</TableCell>}
                <TableCell>Items</TableCell>
                <TableCell>Total</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading
                ? Array.from({ length: PAGE_SIZE }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: isMobile ? 4 : 6 }).map((_, j) => (
                        <TableCell key={j}><Box sx={{ height: 18, bgcolor: 'action.hover', borderRadius: 1 }} /></TableCell>
                      ))}
                    </TableRow>
                  ))
                : rows.length === 0
                  ? (
                    <TableRow>
                      <TableCell colSpan={isMobile ? 4 : 6} align="center" sx={{ py: 6 }}>
                        <Typography color="text.secondary">
                          {searchMonth && debouncedSearch
                            ? `No purchases matching "${debouncedSearch}"`
                            : searchMonth ? 'No purchases in this month'
                            : 'No purchases found'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )
                  : rows.map(row => (
                      <TableRow key={row.id} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>{row.supplierName}</Typography>
                          {isMobile && <Typography variant="caption" color="text.secondary">{row.invoiceNumber || '-'}</Typography>}
                        </TableCell>
                        {!isMobile && <TableCell>{row.invoiceNumber || '-'}</TableCell>}
                        {!isMobile && <TableCell><Typography variant="caption">{formatDate(row.invoiceDate || row.createdAt)}</Typography></TableCell>}
                        <TableCell><Chip label={`${row.items?.length || 0} items`} size="small" variant="outlined" /></TableCell>
                        <TableCell><Typography variant="body2" fontWeight={600}>{formatCurrency(row.grandTotal)}</Typography></TableCell>
                        <TableCell align="right">
                          <IconButton size="small" onClick={() => { setEditing(row); setDialogOpen(true); }}>
                            <Edit fontSize="small" />
                          </IconButton>
                          <IconButton size="small" color="error" onClick={() => setDeleteId(row.id)}>
                            <Delete fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))
              }
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination component="div" count={total} page={page} rowsPerPage={PAGE_SIZE}
          onPageChange={(_, p) => setPage(p)} rowsPerPageOptions={[PAGE_SIZE]} />
      </Card>

      <PurchaseFormDialog
        open={dialogOpen} onClose={() => { setDialogOpen(false); setEditing(null); }}
        onSave={handleSave} initial={editing} db={db}
      />
      <Dialog open={Boolean(deleteId)} onClose={() => setDeleteId(null)} maxWidth="xs">
        <DialogTitle>Delete Purchase?</DialogTitle>
        <DialogContent><Typography>This will reverse inventory changes. Cannot be undone.</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PurchaseList;