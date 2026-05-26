// src/pages/Inventory/Inventory.js
//
// SEARCH STRATEGY
// ───────────────
// Inventory has one document per product (bounded collection — grows only
// when new products are added, never from transactions). The page ALREADY
// fetches every document to compute the summary cards (out-of-stock count,
// low-stock count). We simply reuse that full load for search + in-memory
// pagination, eliminating the broken cursor-based client-side filter.
//
// No month picker is needed here — it's a catalog/stock-level view, not
// a transactional list.

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Box, Typography, Card, TextField, InputAdornment,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, Chip, LinearProgress, Grid, Paper,
} from '@mui/material';
import { Search, Inventory2, Warning, CheckCircle, Error, Clear } from '@mui/icons-material';
import {
  collection, getDocs, orderBy, query,
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';
import { useMediaQuery, useTheme } from '@mui/material';
import { InputAdornment as IA, IconButton } from '@mui/material';

const PAGE_SIZE = 10;

// ─── Sub-components ───────────────────────────────────────────────────────────
const StockChip = ({ stock }) => {
  if (stock <= 0)
    return <Chip icon={<Error fontSize="small" />}    label="Out of Stock" color="error"   size="small" />;
  if (stock <= 5)
    return <Chip icon={<Warning fontSize="small" />}  label="Low Stock"    color="warning" size="small" />;
  return   <Chip icon={<CheckCircle fontSize="small" />} label="In Stock"  color="success" size="small" />;
};

const SummaryCard = ({ title, value, color, icon }) => (
  <Paper elevation={0} sx={{ p: 2, textAlign: 'center', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
    <Box sx={{ color: `${color}.main`, mb: 0.5 }}>{icon}</Box>
    <Typography variant="h4" fontWeight={700} color={`${color}.main`}>{value}</Typography>
    <Typography variant="caption" color="text.secondary">{title}</Typography>
  </Paper>
);

// ─── Main Component ───────────────────────────────────────────────────────────
const Inventory = () => {
  const { db }   = useAuth();
  const theme    = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // All inventory docs loaded once (one-doc-per-product, bounded)
  const [allDocs,  setAllDocs]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [summary,  setSummary]  = useState({ totalItems: 0, outOfStock: 0, lowStock: 0 });

  // Search + pagination (in-memory)
  const [page,           setPage]           = useState(0);
  const [search,         setSearch]         = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimer = useRef(null);

  const handleSearch = val => {
    setSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(0);
    }, 350);
  };

  // ── Load all inventory docs ───────────────────────────────────────────────
  // One fetch covers everything: summary cards + paginated table + search.
  // This is correct for a catalog-style collection (one doc per product).
  useEffect(() => {
    if (!db) return;
    let active = true;

    const run = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(
          query(collection(db, 'inventory'), orderBy('productName'))
        );
        if (!active) return;

        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        setAllDocs(docs);
        setSummary({
          totalItems:  docs.length,
          outOfStock:  docs.filter(d => (d.stock || 0) <= 0).length,
          lowStock:    docs.filter(d => (d.stock || 0) > 0 && (d.stock || 0) <= 5).length,
        });
      } catch (err) {
        if (!active) return;
        toast.error('Failed to load inventory');
      } finally {
        if (active) setLoading(false);
      }
    };

    run();
    return () => { active = false; };
  }, [db]);

  // ── Derived: filter + paginate in memory ─────────────────────────────────
  const filtered = useMemo(() => {
    if (!debouncedSearch.trim()) return allDocs;
    const s = debouncedSearch.toLowerCase();
    return allDocs.filter(d => d.productName?.toLowerCase().includes(s));
  }, [allDocs, debouncedSearch]);

  // Reset to page 0 when search changes
  useEffect(() => { setPage(0); }, [debouncedSearch]);

  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>

      {/* ── Header ── */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2} flexWrap="wrap" gap={1}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Inventory</Typography>
          <Typography variant="caption" color="text.secondary">
            {debouncedSearch
              ? `${filtered.length} of ${allDocs.length} products`
              : `${allDocs.length} products`}
          </Typography>
        </Box>
      </Box>

      {/* ── Summary Cards ── */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={4}>
          <SummaryCard
            title="Total Products" value={summary.totalItems}
            color="primary" icon={<Inventory2 />}
          />
        </Grid>
        <Grid item xs={4}>
          <SummaryCard
            title="Out of Stock" value={summary.outOfStock}
            color="error" icon={<Error />}
          />
        </Grid>
        <Grid item xs={4}>
          <SummaryCard
            title="Low Stock" value={summary.lowStock}
            color="warning" icon={<Warning />}
          />
        </Grid>
      </Grid>

      {/* ── Search ── */}
      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 2 }}>
        <Box sx={{ p: 2 }}>
          <TextField
            fullWidth
            placeholder="Search product name…"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            size="small"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: search ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => handleSearch('')}>
                    <Clear fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
          />
        </Box>
      </Card>

      {/* ── Table ── */}
      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
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
                ? Array.from({ length: PAGE_SIZE }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: isMobile ? 5 : 6 }).map((_, j) => (
                        <TableCell key={j}>
                          <Box sx={{ height: 20, bgcolor: 'action.hover', borderRadius: 1 }} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : pageRows.length === 0
                  ? (
                    <TableRow>
                      <TableCell colSpan={isMobile ? 5 : 6} align="center" sx={{ py: 6 }}>
                        <Typography color="text.secondary">
                          {debouncedSearch
                            ? `No products matching "${debouncedSearch}"`
                            : 'No inventory records. Add purchases to populate.'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )
                  : pageRows.map(row => {
                      const stock     = row.stock     || 0;
                      const purchased = row.purchasedQty || 0;
                      const pct       = purchased > 0 ? Math.max(0, (stock / purchased) * 100) : 0;
                      return (
                        <TableRow key={row.id} hover>
                          <TableCell>
                            <Typography variant="body2" fontWeight={600}>{row.productName}</Typography>
                          </TableCell>
                          <TableCell align="center">{purchased}</TableCell>
                          <TableCell align="center">{row.soldQty || 0}</TableCell>
                          <TableCell align="center">
                            <Typography
                              fontWeight={700}
                              color={stock <= 0 ? 'error.main' : stock <= 5 ? 'warning.main' : 'success.main'}
                            >
                              {stock}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <StockChip stock={stock} />
                          </TableCell>
                          {!isMobile && (
                            <TableCell sx={{ minWidth: 120 }}>
                              <LinearProgress
                                variant="determinate" value={Math.min(pct, 100)}
                                color={stock <= 0 ? 'error' : stock <= 5 ? 'warning' : 'success'}
                                sx={{ height: 6, borderRadius: 3 }}
                              />
                              <Typography variant="caption" color="text.secondary">
                                {pct.toFixed(0)}% remaining
                              </Typography>
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
          component="div"
          count={filtered.length}
          page={page}
          rowsPerPage={PAGE_SIZE}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPageOptions={[PAGE_SIZE]}
        />
      </Card>
    </Box>
  );
};

export default Inventory;