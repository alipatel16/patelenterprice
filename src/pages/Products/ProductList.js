// src/pages/Products/ProductList.js
//
// SEARCH STRATEGY
// No month selected  →  server-side cursor pagination, search disabled.
// Month selected     →  fetch all products added in that month, search in memory.

import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Button, Card, TextField, InputAdornment,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, Chip, IconButton, Tooltip, Dialog, DialogTitle,
  DialogContent, DialogActions, Grid, MenuItem, Select, FormControl,
  InputLabel, CircularProgress, Alert, useTheme, useMediaQuery,
} from '@mui/material';
import { Add, Edit, Delete, Close, Save } from '@mui/icons-material';
import {
  collection, query, orderBy, limit, startAfter, getDocs,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp, getCountFromServer,
  where, Timestamp,
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';
import { GST_SLABS } from '../../constants';
import { formatCurrency } from '../../utils';
import MonthSearchBar from '../../components/MonthSearchBar';
import { normalizeProduct } from '../../utils/normalizeDoc';

const PAGE_SIZE = 10;

const getMonthBounds = (yearMonth) => {
  const [y, m] = yearMonth.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    start: new Date(y, m - 1, 1, 0, 0, 0, 0),
    end:   new Date(y, m - 1, lastDay, 23, 59, 59, 999),
  };
};

const EMPTY = { name: '', maker: '', description: '', hsnCode: '', price: '', gstRate: 18, category: '', unit: 'pcs' };

const ProductFormDialog = ({ open, onClose, onSave, initial }) => {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setForm(initial || EMPTY); setError(''); }, [initial, open]);
  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }));
  const handleSave = async () => {
    if (!form.name || !form.price) { setError('Product name and price are required'); return; }
    if (isNaN(parseFloat(form.price))) { setError('Price must be a valid number'); return; }
    setSaving(true);
    try { await onSave({ ...form, price: parseFloat(form.price) }); onClose(); }
    catch (e) { setError(e.message); } finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography fontWeight={700}>{initial?.id ? 'Edit Product' : 'Add New Product'}</Typography>
        <IconButton onClick={onClose}><Close /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Grid container spacing={2}>
          <Grid item xs={12}><TextField fullWidth label="Product Name *" value={form.name} onChange={set('name')} size="small" /></Grid>
          <Grid item xs={12} sm={6}><TextField fullWidth label="Maker / Brand" value={form.maker} onChange={set('maker')} size="small" /></Grid>
          <Grid item xs={12} sm={6}><TextField fullWidth label="Category" value={form.category} onChange={set('category')} size="small" /></Grid>
          <Grid item xs={12}><TextField fullWidth label="Description" value={form.description} onChange={set('description')} size="small" multiline rows={2} /></Grid>
          <Grid item xs={12} sm={6}><TextField fullWidth label="HSN Code" value={form.hsnCode} onChange={set('hsnCode')} size="small" /></Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Unit" value={form.unit} onChange={set('unit')} size="small" select>
              {['pcs', 'set', 'kg', 'meter', 'box'].map(u => <MenuItem key={u} value={u}>{u}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="MRP / Price (₹) *" value={form.price} onChange={set('price')} size="small" type="number"
              InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth size="small">
              <InputLabel>GST Rate</InputLabel>
              <Select value={form.gstRate} onChange={set('gstRate')} label="GST Rate">
                {GST_SLABS.map(r => <MenuItem key={r} value={r}>{r}%</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} variant="outlined">Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={saving} startIcon={saving ? <CircularProgress size={16} /> : <Save />}>
          {initial?.id ? 'Update' : 'Add Product'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const ProductList = () => {
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
            collection(db, 'products'),
            where('createdAt', '>=', Timestamp.fromDate(start)),
            where('createdAt', '<=', Timestamp.fromDate(end)),
            orderBy('createdAt', 'desc'),
          ));
          if (!active) return;
          let all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          if (debouncedSearch.trim()) {
            const s = debouncedSearch.toLowerCase();
            all = all.filter(r =>
              r.name?.toLowerCase().includes(s)     ||
              r.maker?.toLowerCase().includes(s)    ||
              r.hsnCode?.includes(s)                ||
              r.category?.toLowerCase().includes(s)
            );
          }
          setTotal(all.length);
          setRows(all.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE));
          return;
        }

        // ── NORMAL CURSOR PAGINATION ─────────────────────────────────────
        const constraints = [orderBy('name'), limit(PAGE_SIZE)];
        if (page > 0 && cursorMap[page - 1]) constraints.push(startAfter(cursorMap[page - 1]));

        const [snap, countSnap] = await Promise.all([
          getDocs(query(collection(db, 'products'), ...constraints)),
          getCountFromServer(collection(db, 'products')),
        ]);
        if (!active) return;
        setRows(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setTotal(countSnap.data().count);
        if (snap.docs.length > 0) setCursorMap(prev => ({ ...prev, [page]: snap.docs[snap.docs.length - 1] }));

      } catch (err) {
        if (!active) return;
        toast.error('Failed to load products');
      } finally {
        if (active) setLoading(false);
      }
    };
    run();
    return () => { active = false; };
  }, [db, page, searchMonth, debouncedSearch, refreshKey]);

  const resetAndRefetch = () => { setCursorMap({}); setPage(0); setRefreshKey(k => k + 1); };

  const handleSave = async form => {
    if (editing?.id) {
      await updateDoc(doc(db, 'products', editing.id), { ...normalizeProduct(form), updatedAt: serverTimestamp() });
      toast.success('Product updated');
    } else {
      await addDoc(collection(db, 'products'), { ...normalizeProduct(form), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      toast.success('Product added');
    }
    resetAndRefetch();
  };

  const handleDelete = async () => {
    try {
      await deleteDoc(doc(db, 'products', deleteId));
      toast.success('Product deleted');
      setDeleteId(null);
      resetAndRefetch();
    } catch (e) { toast.error('Delete failed: ' + e.message); }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2} flexWrap="wrap" gap={1}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Products</Typography>
          <Typography variant="caption" color="text.secondary">
            {searchMonth ? `${total} results` : `${total} total products`}
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<Add />}
          onClick={() => { setEditing(null); setDialogOpen(true); }}
          size={isMobile ? 'small' : 'medium'}>
          Add Product
        </Button>
      </Box>

      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 2, p: 2 }}>
        <MonthSearchBar
          selectedMonth={searchMonth} onMonthChange={handleMonthChange}
          search={search} onSearchChange={handleSearch}
          searchPlaceholder="Search by name, brand, HSN or category…"
          resultCount={searchMonth ? total : undefined} loading={loading}
        />
      </Card>

      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell>Name</TableCell>
                {!isMobile && <TableCell>Maker</TableCell>}
                {!isMobile && <TableCell>HSN</TableCell>}
                <TableCell>Price</TableCell>
                {!isMobile && <TableCell>GST</TableCell>}
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading
                ? Array.from({ length: PAGE_SIZE }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: isMobile ? 3 : 6 }).map((_, j) => (
                        <TableCell key={j}><Box sx={{ height: 18, bgcolor: 'action.hover', borderRadius: 1 }} /></TableCell>
                      ))}
                    </TableRow>
                  ))
                : rows.length === 0
                  ? (
                    <TableRow>
                      <TableCell colSpan={isMobile ? 3 : 6} align="center" sx={{ py: 6 }}>
                        <Typography color="text.secondary">
                          {searchMonth && debouncedSearch
                            ? `No products matching "${debouncedSearch}"`
                            : searchMonth ? 'No products added in this month'
                            : 'No products found'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )
                  : rows.map(row => (
                      <TableRow key={row.id} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>{row.name}</Typography>
                          {isMobile && <Typography variant="caption" color="text.secondary">{row.category}</Typography>}
                        </TableCell>
                        {!isMobile && <TableCell>{row.maker || '-'}</TableCell>}
                        {!isMobile && <TableCell><Typography variant="caption">{row.hsnCode || '-'}</Typography></TableCell>}
                        <TableCell><Typography variant="body2" fontWeight={600}>{formatCurrency(row.price)}</Typography></TableCell>
                        {!isMobile && <TableCell><Chip label={`${row.gstRate}%`} size="small" variant="outlined" /></TableCell>}
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
                    ))
              }
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination component="div" count={total} page={page} rowsPerPage={PAGE_SIZE}
          onPageChange={(_, p) => setPage(p)} rowsPerPageOptions={[PAGE_SIZE]} />
      </Card>

      <ProductFormDialog
        open={dialogOpen} onClose={() => { setDialogOpen(false); setEditing(null); }}
        onSave={handleSave} initial={editing}
      />
      <Dialog open={Boolean(deleteId)} onClose={() => setDeleteId(null)} maxWidth="xs">
        <DialogTitle>Delete Product?</DialogTitle>
        <DialogContent><Typography>This action cannot be undone.</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ProductList;