import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Button, Card, TextField, InputAdornment,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, Chip, IconButton, Tooltip, Dialog, DialogTitle,
  DialogContent, DialogActions, Grid, MenuItem, Select, FormControl,
  InputLabel, CircularProgress, Alert,
} from '@mui/material';
import { Add, Search, Edit, Delete, Close, Save } from '@mui/icons-material';
import {
  collection, query, orderBy, limit, startAfter, getDocs,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp, getCountFromServer,
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';
import { GST_SLABS } from '../../constants';
import { formatCurrency } from '../../utils';
import { useMediaQuery, useTheme } from '@mui/material';

const EMPTY = { name: '', maker: '', description: '', hsnCode: '', price: '', gstRate: 18, category: '', unit: 'pcs' };
const PAGE_SIZE = 10;

const ProductFormDialog = ({ open, onClose, onSave, initial }) => {
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setForm(initial || EMPTY); setError(''); }, [initial, open]);
  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }));
  const handleSave = async () => {
    if (!form.name || !form.price) { setError('Product name and price are required'); return; }
    if (isNaN(parseFloat(form.price))) { setError('Price must be a valid number'); return; }
    setLoading(true);
    try { await onSave({ ...form, price: parseFloat(form.price) }); onClose(); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
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
        <Button onClick={handleSave} variant="contained" disabled={loading} startIcon={loading ? <CircularProgress size={16} /> : <Save />}>
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

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [cursorMap, setCursorMap] = useState({});
  const [refreshKey, setRefreshKey] = useState(0); // ← forces re-fetch after CRUD
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const searchTimer = useRef(null);

  const handleSearch = val => {
    setSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(0);
      setCursorMap({});
    }, 450);
  };

  useEffect(() => {
    if (!db) return;
    let active = true;

    const run = async () => {
      setLoading(true);
      try {
        const constraints = [orderBy('name'), limit(PAGE_SIZE)];
        if (page > 0 && cursorMap[page - 1]) constraints.push(startAfter(cursorMap[page - 1]));

        const snap = await getDocs(query(collection(db, 'products'), ...constraints));
        let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        if (debouncedSearch.trim()) {
          const s = debouncedSearch.toLowerCase();
          docs = docs.filter(d =>
            d.name?.toLowerCase().includes(s) ||
            d.maker?.toLowerCase().includes(s) ||
            d.hsnCode?.includes(s) ||
            d.category?.toLowerCase().includes(s)
          );
        }

        const countSnap = await getCountFromServer(collection(db, 'products'));

        if (!active) return;
        setRows(docs);
        setTotal(countSnap.data().count);
        setCursorMap(prev => ({ ...prev, [page]: snap.docs[snap.docs.length - 1] || null }));
      } catch (err) {
        if (!active) return;
        console.error('ProductList fetch error:', err);
        toast.error('Failed to load products');
      } finally {
        if (active) setLoading(false);
      }
    };

    run();
    return () => { active = false; };
  }, [db, page, debouncedSearch, refreshKey]); // refreshKey in deps

  // On CRUD: reset page & cursor, then bump refreshKey to guarantee effect re-runs
  const resetAndRefetch = () => {
    setCursorMap({});
    setPage(0);
    setRefreshKey(k => k + 1);
  };

  const handleSave = async form => {
    if (editing?.id) {
      await updateDoc(doc(db, 'products', editing.id), { ...form, updatedAt: serverTimestamp() });
      toast.success('Product updated');
    } else {
      await addDoc(collection(db, 'products'), { ...form, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      toast.success('Product added');
    }
    resetAndRefetch();
  };

  const handleDelete = async () => {
    await deleteDoc(doc(db, 'products', deleteId));
    toast.success('Product deleted');
    setDeleteId(null);
    resetAndRefetch();
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2} flexWrap="wrap" gap={1}>
        <Typography variant="h5" fontWeight={700}>Product Master</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => { setEditing(null); setDialogOpen(true); }}>
          Add Product
        </Button>
      </Box>

      <Card sx={{ mb: 2 }}>
        <Box sx={{ p: 2 }}>
          <TextField fullWidth placeholder="Search product name, maker, HSN, category..."
            value={search} onChange={e => handleSearch(e.target.value)} size="small"
            InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
          />
        </Box>
      </Card>

      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Product Name</TableCell>
                {!isMobile && <TableCell>Maker</TableCell>}
                {!isMobile && <TableCell>HSN Code</TableCell>}
                <TableCell>Price</TableCell>
                <TableCell>GST</TableCell>
                {!isMobile && <TableCell>Category</TableCell>}
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: isMobile ? 4 : 7 }).map((_, j) => (
                      <TableCell key={j}><Box sx={{ height: 20, bgcolor: 'action.hover', borderRadius: 1 }} /></TableCell>
                    ))}</TableRow>
                  ))
                : rows.length === 0
                  ? <TableRow><TableCell colSpan={isMobile ? 4 : 7} align="center" sx={{ py: 4 }}><Typography color="text.secondary">No products found</Typography></TableCell></TableRow>
                  : rows.map(row => (
                      <TableRow key={row.id} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>{row.name}</Typography>
                          {isMobile && <Typography variant="caption" color="text.secondary">{row.maker}</Typography>}
                        </TableCell>
                        {!isMobile && <TableCell>{row.maker || '-'}</TableCell>}
                        {!isMobile && <TableCell>{row.hsnCode || '-'}</TableCell>}
                        <TableCell><Typography fontWeight={600} color="success.main">{formatCurrency(row.price)}</Typography></TableCell>
                        <TableCell><Chip label={`${row.gstRate}%`} size="small" color="info" /></TableCell>
                        {!isMobile && <TableCell>{row.category || '-'}</TableCell>}
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
        <TablePagination
          component="div" count={total} page={page} rowsPerPage={PAGE_SIZE}
          onPageChange={(_, p) => setPage(p)} rowsPerPageOptions={[PAGE_SIZE]}
        />
      </Card>

      <ProductFormDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onSave={handleSave} initial={editing} />

      <Dialog open={Boolean(deleteId)} onClose={() => setDeleteId(null)} maxWidth="xs">
        <DialogTitle>Delete Product?</DialogTitle>
        <DialogContent><Typography>This will also affect inventory. Continue?</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ProductList;