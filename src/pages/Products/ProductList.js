import { addRecord as addDoc, updateRecord as updateDoc, deleteRecord as deleteDoc } from '../../data/writes';
import usePagedCollection from '../../hooks/usePagedCollection';
import QueryStatus from '../../components/QueryStatus';
import { businessListOptions } from '../../utils/businessListQueries';
import { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Card, TextField, InputAdornment,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, Chip, IconButton, Tooltip, Dialog, DialogTitle,
  DialogContent, DialogActions, Grid, MenuItem, Select, FormControl,
  InputLabel, CircularProgress, Alert, useTheme, useMediaQuery,
} from '@mui/material';
import { Add, Edit, Delete, Close, Save } from '@mui/icons-material';
import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';
import { GST_SLABS } from '../../constants';
import { formatCurrency } from '../../utils';
import MonthSearchBar from '../../components/MonthSearchBar';
import { normalizeProduct } from '../../utils/normalizeDoc';

const PAGE_SIZE = 15;

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

  const [searchMonth,     setSearchMonth]     = useState('');
  const [search,          setSearch]          = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing,    setEditing]    = useState(null);
  const [deleteId,   setDeleteId]   = useState(null);

  const handleSearch = setSearch;

  const handleMonthChange = setSearchMonth;

  const { rows, loading, error, total, page, setPage, refresh } = usePagedCollection(
    db, 'products', businessListOptions('products', { search, month: searchMonth })
  );

  const resetAndRefetch = refresh;

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
      <QueryStatus error={error} loading={loading} search={search} />
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
                          {searchMonth && search
                            ? `No products matching "${search}"`
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
        <TablePagination component="div" count={total ?? 0} page={page} rowsPerPage={PAGE_SIZE}
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
