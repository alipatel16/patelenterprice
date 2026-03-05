import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Button, Card, TextField, InputAdornment,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, Chip, IconButton, Tooltip, Dialog, DialogTitle,
  DialogContent, DialogActions, Grid, MenuItem, Select, FormControl,
  InputLabel, CircularProgress, Alert, Avatar,
} from '@mui/material';
import { Add, Search, Edit, Delete, Business, Close, Save } from '@mui/icons-material';
import {
  collection, query, where, orderBy, limit, startAfter,
  getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
  getCountFromServer,
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';
import { CUSTOMER_TYPES, CUSTOMER_CATEGORIES } from '../../constants';
import { useMediaQuery, useTheme } from '@mui/material';

const EMPTY = {
  name: '', phone: '', email: '', address: '',
  city: '', state: 'Gujarat', pincode: '',
  customerType: 'retail', category: 'individual',
  gstin: '', aadhaar: '',
};
const PAGE_SIZE = 10;

const CustomerFormDialog = ({ open, onClose, onSave, initial }) => {
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setForm(initial || EMPTY); setError(''); }, [initial, open]);
  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }));
  const handleSave = async () => {
    if (!form.name || !form.phone) { setError('Name and phone are required'); return; }
    setLoading(true);
    try { await onSave(form); onClose(); } catch (e) { setError(e.message); } finally { setLoading(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography fontWeight={700}>{initial?.id ? 'Edit Customer' : 'Add New Customer'}</Typography>
        <IconButton onClick={onClose}><Close /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth size="small"><InputLabel>Customer Type</InputLabel>
              <Select value={form.customerType} onChange={set('customerType')} label="Customer Type">
                {CUSTOMER_TYPES.map(t => <MenuItem key={t} value={t} sx={{ textTransform: 'capitalize' }}>{t}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth size="small"><InputLabel>Category</InputLabel>
              <Select value={form.category} onChange={set('category')} label="Category">
                {CUSTOMER_CATEGORIES.map(c => <MenuItem key={c} value={c} sx={{ textTransform: 'capitalize' }}>{c}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12}><TextField fullWidth label="Full Name / Firm Name *" value={form.name} onChange={set('name')} size="small" /></Grid>
          <Grid item xs={12} sm={6}><TextField fullWidth label="Phone *" value={form.phone} onChange={set('phone')} size="small" /></Grid>
          <Grid item xs={12} sm={6}><TextField fullWidth label="Email" value={form.email} onChange={set('email')} size="small" type="email" /></Grid>
          <Grid item xs={12}><TextField fullWidth label="Address" value={form.address} onChange={set('address')} size="small" multiline rows={2} /></Grid>
          <Grid item xs={12} sm={6}><TextField fullWidth label="City" value={form.city} onChange={set('city')} size="small" /></Grid>
          <Grid item xs={12} sm={6}><TextField fullWidth label="Pincode" value={form.pincode} onChange={set('pincode')} size="small" /></Grid>
          {form.category === 'firm' && <Grid item xs={12} sm={6}><TextField fullWidth label="GSTIN" value={form.gstin} onChange={set('gstin')} size="small" /></Grid>}
          {form.category === 'individual' && <Grid item xs={12} sm={6}><TextField fullWidth label="Aadhaar Number" value={form.aadhaar} onChange={set('aadhaar')} size="small" /></Grid>}
        </Grid>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} variant="outlined">Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={loading} startIcon={loading ? <CircularProgress size={16} /> : <Save />}>
          {initial?.id ? 'Update' : 'Add Customer'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const CustomerList = () => {
  const { db } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('all');
  const [cursorMap, setCursorMap] = useState({});   // page index → last Firestore doc
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const searchTimer = useRef(null);

  // Debounce search: only update debouncedSearch after 450 ms of no typing
  const handleSearch = val => {
    setSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(0);
      setCursorMap({});
    }, 450);
  };

  // ── Single effect ── fires once per dep change; `active` flag prevents stale setState
  useEffect(() => {
    if (!db) return;
    let active = true;

    const run = async () => {
      setLoading(true);
      try {
        const constraints = [orderBy('name')];
        if (typeFilter !== 'all') constraints.push(where('customerType', '==', typeFilter));
        if (catFilter !== 'all') constraints.push(where('category', '==', catFilter));
        constraints.push(limit(PAGE_SIZE));
        if (page > 0 && cursorMap[page - 1]) constraints.push(startAfter(cursorMap[page - 1]));

        const snap = await getDocs(query(collection(db, 'customers'), ...constraints));
        let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        if (debouncedSearch.trim()) {
          const s = debouncedSearch.toLowerCase();
          docs = docs.filter(d =>
            d.name?.toLowerCase().includes(s) ||
            d.phone?.includes(s) ||
            d.email?.toLowerCase().includes(s)
          );
        }

        const countFilters = [];
        if (typeFilter !== 'all') countFilters.push(where('customerType', '==', typeFilter));
        if (catFilter !== 'all') countFilters.push(where('category', '==', catFilter));
        const countSnap = await getCountFromServer(query(collection(db, 'customers'), ...countFilters));

        if (!active) return;
        setRows(docs);
        setTotal(countSnap.data().count);
        setCursorMap(prev => ({ ...prev, [page]: snap.docs[snap.docs.length - 1] || null }));
      } catch (err) {
        if (!active) return;
        toast.error('Failed to load customers');
      } finally {
        if (active) setLoading(false);
      }
    };

    run();
    return () => { active = false; };
  }, [db, page, typeFilter, catFilter, debouncedSearch]);

  const resetAndRefetch = () => { setCursorMap({}); setPage(0); };

  const handleSave = async form => {
    if (editing?.id) {
      await updateDoc(doc(db, 'customers', editing.id), { ...form, updatedAt: serverTimestamp() });
      toast.success('Customer updated');
    } else {
      await addDoc(collection(db, 'customers'), { ...form, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      toast.success('Customer added');
    }
    resetAndRefetch();
  };

  const handleDelete = async () => {
    await deleteDoc(doc(db, 'customers', deleteId));
    toast.success('Customer deleted');
    setDeleteId(null);
    resetAndRefetch();
  };

  const handleFilterChange = setter => e => {
    setter(e.target.value);
    setPage(0);
    setCursorMap({});
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2} flexWrap="wrap" gap={1}>
        <Typography variant="h5" fontWeight={700}>Customers</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => { setEditing(null); setDialogOpen(true); }}>
          Add Customer
        </Button>
      </Box>

      <Card sx={{ mb: 2 }}>
        <Box sx={{ p: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            placeholder="Search name, phone, email..." value={search}
            onChange={e => handleSearch(e.target.value)} size="small" sx={{ flex: 1, minWidth: 200 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
          />
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Type</InputLabel>
            <Select value={typeFilter} onChange={handleFilterChange(setTypeFilter)} label="Type">
              <MenuItem value="all">All Types</MenuItem>
              {CUSTOMER_TYPES.map(t => <MenuItem key={t} value={t} sx={{ textTransform: 'capitalize' }}>{t}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Category</InputLabel>
            <Select value={catFilter} onChange={handleFilterChange(setCatFilter)} label="Category">
              <MenuItem value="all">All</MenuItem>
              {CUSTOMER_CATEGORIES.map(c => <MenuItem key={c} value={c} sx={{ textTransform: 'capitalize' }}>{c}</MenuItem>)}
            </Select>
          </FormControl>
        </Box>
      </Card>

      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                {!isMobile && <TableCell>Contact</TableCell>}
                <TableCell>Type</TableCell>
                {!isMobile && <TableCell>Category</TableCell>}
                {!isMobile && <TableCell>City</TableCell>}
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: isMobile ? 3 : 6 }).map((_, j) => (
                        <TableCell key={j}><Box sx={{ height: 20, bgcolor: 'action.hover', borderRadius: 1 }} /></TableCell>
                      ))}
                    </TableRow>
                  ))
                : rows.length === 0
                  ? <TableRow><TableCell colSpan={isMobile ? 3 : 6} align="center" sx={{ py: 4 }}><Typography color="text.secondary">No customers found</Typography></TableCell></TableRow>
                  : rows.map(row => (
                      <TableRow key={row.id} hover>
                        <TableCell>
                          <Box display="flex" alignItems="center" gap={1}>
                            <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.light', fontSize: 14 }}>
                              {row.category === 'firm' ? <Business fontSize="small" /> : row.name?.charAt(0)}
                            </Avatar>
                            <Box>
                              <Typography variant="body2" fontWeight={600}>{row.name}</Typography>
                              {isMobile && <Typography variant="caption" color="text.secondary">{row.phone}</Typography>}
                            </Box>
                          </Box>
                        </TableCell>
                        {!isMobile && (
                          <TableCell>
                            <Typography variant="body2">{row.phone}</Typography>
                            <Typography variant="caption" color="text.secondary">{row.email}</Typography>
                          </TableCell>
                        )}
                        <TableCell>
                          <Chip label={row.customerType} size="small"
                            color={row.customerType === 'wholesale' ? 'primary' : 'default'}
                            sx={{ textTransform: 'capitalize', fontSize: 11 }} />
                        </TableCell>
                        {!isMobile && <TableCell sx={{ textTransform: 'capitalize' }}>{row.category}</TableCell>}
                        {!isMobile && <TableCell>{row.city || '-'}</TableCell>}
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

      <CustomerFormDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onSave={handleSave} initial={editing} />

      <Dialog open={Boolean(deleteId)} onClose={() => setDeleteId(null)} maxWidth="xs">
        <DialogTitle>Delete Customer?</DialogTitle>
        <DialogContent><Typography>This action cannot be undone.</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CustomerList;