import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Card, CardContent, IconButton, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TablePagination,
  Stack, Tooltip, TextField, InputAdornment, CircularProgress, Divider,
  Alert, Grid,
} from '@mui/material';
import {
  Add, Edit, Delete, Business, Search, AccountTree,
  Settings, Person, Phone, Save,
} from '@mui/icons-material';
import {
  collection, query, orderBy, limit, startAfter, getDocs,
  deleteDoc, doc, getCountFromServer, getDoc, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useMediaQuery, useTheme } from '@mui/material';

const PAGE_SIZE = 10;

// ─── Default Hierarchy Dialog ─────────────────────────────────────────────────
const DefaultHierarchyDialog = ({ open, onClose, db }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (!open || !db) return;
    setFetching(true);
    getDoc(doc(db, 'settings', 'defaultComplaintHandler'))
      .then(snap => {
        if (snap.exists()) {
          const d = snap.data();
          setName(d.name || '');
          setPhone(d.phone || '');
          setEmail(d.email || '');
          setTitle(d.title || '');
        }
      })
      .finally(() => setFetching(false));
  }, [open, db]);

  const handleSave = async () => {
    if (!name.trim() || !phone.trim()) {
      toast.error('Name and phone are required');
      return;
    }
    setLoading(true);
    try {
      await setDoc(doc(db, 'settings', 'defaultComplaintHandler'), {
        name: name.trim(), phone: phone.trim(),
        email: email.trim(), title: title.trim(),
        updatedAt: serverTimestamp(),
      });
      toast.success('Default handler saved');
      onClose();
    } catch (e) {
      toast.error('Failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Settings color="warning" fontSize="small" />
        Default Escalation Handler
      </DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          When all brand escalation levels are exhausted, the complaint is assigned to this person.
        </Alert>
        {fetching ? <CircularProgress size={24} sx={{ display: 'block', mx: 'auto' }} /> : (
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" label="Full Name *" value={name} onChange={e => setName(e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" label="Phone *" value={phone} onChange={e => setPhone(e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" label="Title / Designation" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. National Service Head" />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" label="Email" value={email} onChange={e => setEmail(e.target.value)} type="email" />
            </Grid>
          </Grid>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="outlined">Cancel</Button>
        <Button onClick={handleSave} variant="contained" color="warning" disabled={loading}
          startIcon={loading ? <CircularProgress size={16} /> : <Save />}>
          Save Default Handler
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const BrandHierarchyList = () => {
  const { db } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [cursorMap, setCursorMap] = useState({});
  const [deleteId, setDeleteId] = useState(null);
  const [deleteName, setDeleteName] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [defaultOpen, setDefaultOpen] = useState(false);

  useEffect(() => {
    if (!db) return;
    loadPage();
    // eslint-disable-next-line
  }, [db, page, refreshKey]);

  const loadPage = async () => {
    setLoading(true);
    try {
      const countSnap = await getCountFromServer(collection(db, 'brandHierarchies'));
      setTotal(countSnap.data().count);
      const constraints = [orderBy('brandName'), limit(PAGE_SIZE)];
      if (page > 0 && cursorMap[page]) constraints.push(startAfter(cursorMap[page]));
      const snap = await getDocs(query(collection(db, 'brandHierarchies'), ...constraints));
      if (snap.docs.length > 0) setCursorMap(m => ({ ...m, [page + 1]: snap.docs[snap.docs.length - 1] }));
      setRows(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      toast.error('Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteDoc(doc(db, 'brandHierarchies', deleteId));
      toast.success('Brand hierarchy deleted');
      setDeleteId(null);
      setCursorMap({});
      setPage(0);
      setRefreshKey(k => k + 1);
    } catch (e) {
      toast.error('Delete failed');
    }
  };

  const filtered = search.trim()
    ? rows.filter(r => r.brandName?.toLowerCase().includes(search.toLowerCase()))
    : rows;

  const MobileCard = ({ row }) => (
    <Card elevation={0} sx={{ mb: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start">
          <Box flex={1}>
            <Box display="flex" alignItems="center" gap={1} mb={0.5}>
              <Business fontSize="small" color="error" />
              <Typography variant="body2" fontWeight={700}>{row.brandName}</Typography>
            </Box>
            {row.description && (
              <Typography variant="caption" color="text.secondary" display="block" mb={1}>{row.description}</Typography>
            )}
            <Stack direction="row" spacing={0.5} flexWrap="wrap">
              {(row.levels || []).map((lv, i) => (
                <Chip key={i} label={`L${lv.level}: ${lv.personName}`} size="small"
                  color={i === 0 ? 'primary' : i === 1 ? 'warning' : 'error'} variant="outlined" sx={{ fontSize: 10 }} />
              ))}
            </Stack>
          </Box>
          <Stack direction="row" spacing={0.5} ml={1}>
            <IconButton size="small" onClick={() => navigate(`/brand-hierarchy/edit/${row.id}`)}>
              <Edit fontSize="small" />
            </IconButton>
            <IconButton size="small" color="error" onClick={() => { setDeleteId(row.id); setDeleteName(row.brandName); }}>
              <Delete fontSize="small" />
            </IconButton>
          </Stack>
        </Box>
      </CardContent>
    </Card>
  );

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* Header */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3} flexWrap="wrap" gap={1}>
        <Box display="flex" alignItems="center" gap={1}>
          <AccountTree color="error" />
          <Box>
            <Typography variant="h5" fontWeight={700}>Brand Hierarchy</Typography>
            <Typography variant="caption" color="text.secondary">{total} brands configured</Typography>
          </Box>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Button variant="outlined" color="warning" startIcon={<Settings />}
            onClick={() => setDefaultOpen(true)} size={isMobile ? 'small' : 'medium'}>
            Default Handler
          </Button>
          <Button variant="contained" color="error" startIcon={<Add />}
            onClick={() => navigate('/brand-hierarchy/new')} size={isMobile ? 'small' : 'medium'}>
            Add Brand
          </Button>
        </Stack>
      </Box>

      {/* Search */}
      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 2, p: 2 }}>
        <TextField fullWidth placeholder="Search brand name..."
          value={search} onChange={e => setSearch(e.target.value)} size="small"
          InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
        />
      </Card>

      {isMobile ? (
        <Box>
          {loading ? Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} elevation={0} sx={{ mb: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2, height: 90, bgcolor: 'action.hover' }} />
          )) : filtered.length === 0 ? (
            <Box textAlign="center" py={6}>
              <AccountTree sx={{ fontSize: 52, color: 'text.disabled', mb: 1 }} />
              <Typography color="text.secondary">No brand hierarchies yet</Typography>
              <Button variant="contained" color="error" startIcon={<Add />} sx={{ mt: 2 }}
                onClick={() => navigate('/brand-hierarchy/new')}>
                Add First Brand
              </Button>
            </Box>
          ) : filtered.map(row => <MobileCard key={row.id} row={row} />)}
          {rows.length > 0 && (
            <TablePagination component="div" count={total} page={page}
              onPageChange={(_, p) => { setPage(p); setCursorMap({}); }}
              rowsPerPage={PAGE_SIZE} rowsPerPageOptions={[PAGE_SIZE]}
              sx={{ '.MuiTablePagination-toolbar': { px: 0 } }} />
          )}
        </Box>
      ) : (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell sx={{ fontWeight: 700 }}>Brand</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Escalation Levels</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">Total Levels</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? Array.from({ length: PAGE_SIZE }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j}><Box sx={{ height: 16, bgcolor: 'action.hover', borderRadius: 1 }} /></TableCell>
                    ))}
                  </TableRow>
                )) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                      <AccountTree sx={{ fontSize: 48, color: 'text.disabled', display: 'block', mx: 'auto', mb: 1 }} />
                      <Typography color="text.secondary">No brands configured yet</Typography>
                    </TableCell>
                  </TableRow>
                ) : filtered.map(row => (
                  <TableRow key={row.id} hover>
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Business fontSize="small" color="error" />
                        <Typography variant="body2" fontWeight={700}>{row.brandName}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 200 }}>
                        {row.description || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box display="flex" flexWrap="wrap" gap={0.5}>
                        {(row.levels || []).map((lv, i) => (
                          <Chip key={i}
                            label={`L${lv.level}: ${lv.personName}`}
                            size="small"
                            color={i === 0 ? 'primary' : i === 1 ? 'warning' : 'error'}
                            variant="outlined"
                            sx={{ fontSize: 10 }}
                          />
                        ))}
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <Chip label={(row.levels || []).length} color="default" size="small" />
                    </TableCell>
                    <TableCell align="center">
                      <Stack direction="row" spacing={0.5} justifyContent="center">
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => navigate(`/brand-hierarchy/edit/${row.id}`)}>
                            <Edit fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton size="small" color="error"
                            onClick={() => { setDeleteId(row.id); setDeleteName(row.brandName); }}>
                            <Delete fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination component="div" count={total} page={page}
            onPageChange={(_, p) => { setPage(p); setCursorMap({}); }}
            rowsPerPage={PAGE_SIZE} rowsPerPageOptions={[PAGE_SIZE]} />
        </Card>
      )}

      <Dialog open={!!deleteId} onClose={() => setDeleteId(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Brand Hierarchy?</DialogTitle>
        <DialogContent>
          <Typography>Delete <strong>"{deleteName}"</strong>? Existing complaints using this hierarchy won't be affected.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>

      <DefaultHierarchyDialog open={defaultOpen} onClose={() => setDefaultOpen(false)} db={db} />
    </Box>
  );
};

export default BrandHierarchyList;