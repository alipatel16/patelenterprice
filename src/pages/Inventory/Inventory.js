import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Card, TextField, InputAdornment,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, Chip, LinearProgress, Grid, Paper,
} from '@mui/material';
import { Search, Inventory2, Warning, CheckCircle, Error } from '@mui/icons-material';
import {
  collection, query, orderBy, limit, startAfter, getDocs, getCountFromServer,
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';
import { useMediaQuery, useTheme } from '@mui/material';

const PAGE_SIZE = 10;

const StockChip = ({ stock }) => {
  if (stock <= 0) return <Chip icon={<Error fontSize="small" />} label="Out of Stock" color="error" size="small" />;
  if (stock <= 5) return <Chip icon={<Warning fontSize="small" />} label="Low Stock" color="warning" size="small" />;
  return <Chip icon={<CheckCircle fontSize="small" />} label="In Stock" color="success" size="small" />;
};

const SummaryCard = ({ title, value, color, icon }) => (
  <Paper sx={{ p: 2, textAlign: 'center' }}>
    <Box sx={{ color: `${color}.main`, mb: 1 }}>{icon}</Box>
    <Typography variant="h4" fontWeight={700} color={`${color}.main`}>{value}</Typography>
    <Typography variant="caption" color="text.secondary">{title}</Typography>
  </Paper>
);

const Inventory = () => {
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
  const [summary, setSummary] = useState({ totalItems: 0, outOfStock: 0, lowStock: 0 });
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

  // Single effect with active-flag cancellation
  useEffect(() => {
    if (!db) return;
    let active = true;

    const run = async () => {
      setLoading(true);
      try {
        const constraints = [orderBy('productName'), limit(PAGE_SIZE)];
        if (page > 0 && cursorMap[page - 1]) constraints.push(startAfter(cursorMap[page - 1]));

        const snap = await getDocs(query(collection(db, 'inventory'), ...constraints));
        let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        if (debouncedSearch.trim()) {
          const s = debouncedSearch.toLowerCase();
          docs = docs.filter(d => d.productName?.toLowerCase().includes(s));
        }

        const countSnap = await getCountFromServer(collection(db, 'inventory'));

        // Summary from full collection
        const allSnap = await getDocs(collection(db, 'inventory'));
        const all = allSnap.docs.map(d => d.data());
        const summaryData = {
          totalItems: all.length,
          outOfStock: all.filter(d => (d.stock || 0) <= 0).length,
          lowStock: all.filter(d => (d.stock || 0) > 0 && (d.stock || 0) <= 5).length,
        };

        if (!active) return;
        setRows(docs);
        setTotal(countSnap.data().count);
        setSummary(summaryData);
        setCursorMap(prev => ({ ...prev, [page]: snap.docs[snap.docs.length - 1] || null }));
      } catch (err) {
        if (!active) return;
        toast.error('Failed to load inventory');
      } finally {
        if (active) setLoading(false);
      }
    };

    run();
    return () => { active = false; };
  }, [db, page, debouncedSearch]);

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Typography variant="h5" fontWeight={700} mb={2}>Inventory</Typography>

      <Grid container spacing={2} mb={3}>
        <Grid item xs={4}><SummaryCard title="Total Products" value={summary.totalItems} color="primary" icon={<Inventory2 />} /></Grid>
        <Grid item xs={4}><SummaryCard title="Out of Stock" value={summary.outOfStock} color="error" icon={<Error />} /></Grid>
        <Grid item xs={4}><SummaryCard title="Low Stock" value={summary.lowStock} color="warning" icon={<Warning />} /></Grid>
      </Grid>

      <Card sx={{ mb: 2 }}>
        <Box sx={{ p: 2 }}>
          <TextField fullWidth placeholder="Search product name..."
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
                <TableCell>Product</TableCell>
                <TableCell align="center">Purchased</TableCell>
                <TableCell align="center">Sold</TableCell>
                <TableCell align="center">Stock</TableCell>
                <TableCell>Status</TableCell>
                {!isMobile && <TableCell>Level</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: isMobile ? 5 : 6 }).map((_, j) => (
                      <TableCell key={j}><Box sx={{ height: 20, bgcolor: 'action.hover', borderRadius: 1 }} /></TableCell>
                    ))}</TableRow>
                  ))
                : rows.length === 0
                  ? <TableRow><TableCell colSpan={isMobile ? 5 : 6} align="center" sx={{ py: 4 }}><Typography color="text.secondary">No inventory records. Add purchases to populate.</Typography></TableCell></TableRow>
                  : rows.map(row => {
                      const stock = row.stock || 0;
                      const purchased = row.purchasedQty || 0;
                      const pct = purchased > 0 ? Math.max(0, (stock / purchased) * 100) : 0;
                      return (
                        <TableRow key={row.id} hover>
                          <TableCell><Typography variant="body2" fontWeight={600}>{row.productName}</Typography></TableCell>
                          <TableCell align="center">{purchased}</TableCell>
                          <TableCell align="center">{row.soldQty || 0}</TableCell>
                          <TableCell align="center">
                            <Typography fontWeight={700} color={stock <= 0 ? 'error.main' : stock <= 5 ? 'warning.main' : 'success.main'}>{stock}</Typography>
                          </TableCell>
                          <TableCell><StockChip stock={stock} /></TableCell>
                          {!isMobile && (
                            <TableCell sx={{ minWidth: 120 }}>
                              <LinearProgress variant="determinate" value={pct}
                                color={stock <= 0 ? 'error' : stock <= 5 ? 'warning' : 'success'}
                                sx={{ height: 6, borderRadius: 3 }} />
                              <Typography variant="caption" color="text.secondary">{pct.toFixed(0)}% remaining</Typography>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })
              }
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div" count={total} page={page} rowsPerPage={PAGE_SIZE}
          onPageChange={(_, p) => setPage(p)} rowsPerPageOptions={[PAGE_SIZE]}
        />
      </Card>
    </Box>
  );
};

export default Inventory;