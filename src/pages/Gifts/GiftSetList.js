import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Card, CardContent, IconButton, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TablePagination,
  Stack, Tooltip, TextField, InputAdornment, CircularProgress,
} from '@mui/material';
import {
  Add, Edit, Delete, CardGiftcard, Search, Inventory2,
} from '@mui/icons-material';
import {
  collection, query, orderBy, limit, startAfter, getDocs,
  deleteDoc, doc, getCountFromServer,
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useMediaQuery, useTheme } from '@mui/material';

const PAGE_SIZE = 10;

const GiftSetList = () => {
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

  useEffect(() => {
    if (!db) return;
    loadPage();
    // eslint-disable-next-line
  }, [db, page, refreshKey]);

  const loadPage = async () => {
    setLoading(true);
    try {
      const countSnap = await getCountFromServer(collection(db, 'giftSets'));
      setTotal(countSnap.data().count);

      const constraints = [orderBy('createdAt', 'desc'), limit(PAGE_SIZE)];
      if (page > 0 && cursorMap[page]) constraints.push(startAfter(cursorMap[page]));

      const snap = await getDocs(query(collection(db, 'giftSets'), ...constraints));
      if (snap.docs.length > 0) {
        setCursorMap(m => ({ ...m, [page + 1]: snap.docs[snap.docs.length - 1] }));
      }
      setRows(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      toast.error('Failed to load gift sets');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteDoc(doc(db, 'giftSets', deleteId));
      toast.success('Gift set deleted');
      setDeleteId(null);
      setCursorMap({});
      setPage(0);
      setRefreshKey(k => k + 1);
    } catch (e) {
      toast.error('Delete failed');
    }
  };

  const filtered = search.trim()
    ? rows.filter(r => r.name?.toLowerCase().includes(search.toLowerCase()))
    : rows;

  const MobileCard = ({ row }) => (
    <Card elevation={0} sx={{ mb: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start">
          <Box flex={1}>
            <Box display="flex" alignItems="center" gap={1} mb={0.5}>
              <CardGiftcard fontSize="small" color="secondary" />
              <Typography variant="body2" fontWeight={700}>{row.name}</Typography>
            </Box>
            {row.description && (
              <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                {row.description}
              </Typography>
            )}
            <Box display="flex" flexWrap="wrap" gap={0.5}>
              {(row.items || []).slice(0, 4).map((it, i) => (
                <Chip
                  key={i}
                  label={`${it.name} ×${it.qty}`}
                  size="small"
                  variant="outlined"
                  color={it.type === 'free' ? 'success' : 'primary'}
                  sx={{ fontSize: 10 }}
                />
              ))}
              {(row.items || []).length > 4 && (
                <Chip label={`+${row.items.length - 4} more`} size="small" variant="outlined" sx={{ fontSize: 10 }} />
              )}
            </Box>
          </Box>
          <Stack direction="row" spacing={0.5} ml={1}>
            <IconButton size="small" onClick={() => navigate(`/gift-sets/edit/${row.id}`)}>
              <Edit fontSize="small" />
            </IconButton>
            <IconButton size="small" color="error" onClick={() => { setDeleteId(row.id); setDeleteName(row.name); }}>
              <Delete fontSize="small" />
            </IconButton>
          </Stack>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          {(row.items || []).length} item{(row.items || []).length !== 1 ? 's' : ''} ·{' '}
          {(row.items || []).filter(i => i.type === 'free').length} free,{' '}
          {(row.items || []).filter(i => i.type === 'paid').length} paid
        </Typography>
      </CardContent>
    </Card>
  );

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* Header */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3} flexWrap="wrap" gap={1}>
        <Box display="flex" alignItems="center" gap={1}>
          <Inventory2 color="secondary" />
          <Box>
            <Typography variant="h5" fontWeight={700}>Gift Sets</Typography>
            <Typography variant="caption" color="text.secondary">{total} sets configured</Typography>
          </Box>
        </Box>
        <Button
          variant="contained"
          color="secondary"
          startIcon={<Add />}
          onClick={() => navigate('/gift-sets/new')}
          size={isMobile ? 'small' : 'medium'}
        >
          New Gift Set
        </Button>
      </Box>

      {/* Search */}
      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 2, p: 2 }}>
        <TextField
          fullWidth
          placeholder="Search gift sets..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          size="small"
          InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
        />
      </Card>

      {/* List */}
      {isMobile ? (
        <Box>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} elevation={0} sx={{ mb: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2, height: 90, bgcolor: 'action.hover' }} />
            ))
          ) : filtered.length === 0 ? (
            <Box textAlign="center" py={6}>
              <CardGiftcard sx={{ fontSize: 52, color: 'text.disabled', mb: 1 }} />
              <Typography color="text.secondary">No gift sets yet</Typography>
              <Button variant="contained" color="secondary" startIcon={<Add />} sx={{ mt: 2 }}
                onClick={() => navigate('/gift-sets/new')}>
                Create First Gift Set
              </Button>
            </Box>
          ) : filtered.map(row => <MobileCard key={row.id} row={row} />)}
          {rows.length > 0 && (
            <TablePagination
              component="div" count={total} page={page}
              onPageChange={(_, p) => { setPage(p); setCursorMap({}); }}
              rowsPerPage={PAGE_SIZE} rowsPerPageOptions={[PAGE_SIZE]}
              sx={{ '.MuiTablePagination-toolbar': { px: 0 } }}
            />
          )}
        </Box>
      ) : (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell sx={{ fontWeight: 700 }}>Set Name</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Items</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">Free</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">Paid</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  Array.from({ length: PAGE_SIZE }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <TableCell key={j}><Box sx={{ height: 16, bgcolor: 'action.hover', borderRadius: 1 }} /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                      <CardGiftcard sx={{ fontSize: 48, color: 'text.disabled', display: 'block', mx: 'auto', mb: 1 }} />
                      <Typography color="text.secondary">No gift sets found</Typography>
                    </TableCell>
                  </TableRow>
                ) : filtered.map(row => (
                  <TableRow key={row.id} hover>
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={1}>
                        <CardGiftcard fontSize="small" color="secondary" />
                        <Typography variant="body2" fontWeight={700}>{row.name}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 200 }}>
                        {row.description || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box display="flex" flexWrap="wrap" gap={0.5}>
                        {(row.items || []).slice(0, 3).map((it, i) => (
                          <Chip key={i} label={`${it.name} ×${it.qty}`} size="small"
                            color={it.type === 'free' ? 'success' : 'primary'} variant="outlined" sx={{ fontSize: 10 }} />
                        ))}
                        {(row.items || []).length > 3 && (
                          <Chip label={`+${row.items.length - 3}`} size="small" variant="outlined" sx={{ fontSize: 10 }} />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <Chip label={(row.items || []).filter(i => i.type === 'free').length}
                        size="small" color="success" />
                    </TableCell>
                    <TableCell align="center">
                      <Chip label={(row.items || []).filter(i => i.type === 'paid').length}
                        size="small" color="primary" />
                    </TableCell>
                    <TableCell align="center">
                      <Stack direction="row" spacing={0.5} justifyContent="center">
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => navigate(`/gift-sets/edit/${row.id}`)}>
                            <Edit fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton size="small" color="error"
                            onClick={() => { setDeleteId(row.id); setDeleteName(row.name); }}>
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
          <TablePagination
            component="div" count={total} page={page}
            onPageChange={(_, p) => { setPage(p); setCursorMap({}); }}
            rowsPerPage={PAGE_SIZE} rowsPerPageOptions={[PAGE_SIZE]}
          />
        </Card>
      )}

      {/* Delete Confirm */}
      <Dialog open={!!deleteId} onClose={() => setDeleteId(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Gift Set?</DialogTitle>
        <DialogContent>
          <Typography>
            Delete <strong>"{deleteName}"</strong>? This will not affect already-raised gift invoices.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default GiftSetList;