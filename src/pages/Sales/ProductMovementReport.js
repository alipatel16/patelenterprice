// src/pages/Sales/ProductMovementReport.js
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Chip, Stack,
  CircularProgress, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TablePagination, TextField, InputAdornment,
  ToggleButtonGroup, ToggleButton, LinearProgress, Avatar,
  IconButton, useTheme, useMediaQuery, Divider, Collapse,
} from '@mui/material';
import {
  TrendingUp, TrendingDown, TrendingFlat, Search, Refresh,
  Inventory2, ArrowBack, DateRange, Clear,
} from '@mui/icons-material';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { formatCurrency } from '../../utils';

const PAGE_SIZE = 15;

const toInputDate = d => d ? d.toISOString().split('T')[0] : '';

const DATE_PRESETS = [
  { label: 'Today',        getDates: () => { const d = new Date(); return [d, d]; } },
  { label: 'Yesterday',    getDates: () => { const d = new Date(); d.setDate(d.getDate()-1); return [d, d]; } },
  { label: 'Last 7 Days',  getDates: () => { const e = new Date(); const s = new Date(); s.setDate(s.getDate()-6); return [s, e]; } },
  { label: 'Last 30 Days', getDates: () => { const e = new Date(); const s = new Date(); s.setDate(s.getDate()-29); return [s, e]; } },
  { label: 'This Month',   getDates: () => { const n = new Date(); return [new Date(n.getFullYear(), n.getMonth(), 1), new Date(n.getFullYear(), n.getMonth()+1, 0)]; } },
  { label: 'Last Month',   getDates: () => { const n = new Date(); return [new Date(n.getFullYear(), n.getMonth()-1, 1), new Date(n.getFullYear(), n.getMonth(), 0)]; } },
];

// ── Movement classification thresholds ────────────────────────────────────────
const FAST_THRESHOLD = 15;  // soldQty >= 15  → Fast Moving
const SLOW_MAX       = 4;   // soldQty 1–4    → Slow Moving
// soldQty === 0              → Dead Stock
// everything else            → Moderate

const MOVEMENT = {
  fast:     { label: 'Fast Moving', color: 'success', short: 'Fast', icon: <TrendingUp  sx={{ fontSize: 14 }} /> },
  moderate: { label: 'Moderate',    color: 'info',    short: 'Mod',  icon: <TrendingFlat sx={{ fontSize: 14 }} /> },
  slow:     { label: 'Slow Moving', color: 'warning', short: 'Slow', icon: <TrendingDown sx={{ fontSize: 14 }} /> },
  dead:     { label: 'Dead Stock',  color: 'error',   short: 'Dead', icon: <TrendingDown sx={{ fontSize: 14 }} /> },
};

const classifyMovement = (soldQty = 0) => {
  if (soldQty === 0)             return 'dead';
  if (soldQty <= SLOW_MAX)       return 'slow';
  if (soldQty >= FAST_THRESHOLD) return 'fast';
  return 'moderate';
};

// ── Sold-qty progress bar ─────────────────────────────────────────────────────
const SoldBar = ({ value, max }) => {
  const pct   = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const color = pct >= 70 ? 'success' : pct >= 30 ? 'info' : pct > 0 ? 'warning' : 'error';
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 110 }}>
      <LinearProgress
        variant="determinate" value={pct} color={color}
        sx={{ flex: 1, height: 6, borderRadius: 3 }}
      />
      <Typography variant="caption" fontWeight={700} sx={{ minWidth: 28, textAlign: 'right' }}>
        {value}
      </Typography>
    </Box>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────
const ProductMovementReport = () => {
  const { db } = useAuth();
  const navigate        = useNavigate();
  const theme           = useTheme();
  const isMobile        = useMediaQuery(theme.breakpoints.down('sm'));

  // Full aggregated list (loaded once, all in memory)
  const [allProducts, setAllProducts] = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [refreshKey,  setRefreshKey]  = useState(0);

  // UI controls
  const [page,    setPage]    = useState(0);
  const [filter,  setFilter]  = useState('all');
  const [search,  setSearch]  = useState('');
  const [dSearch, setDSearch] = useState('');
  const searchTimer = useRef(null);

  // Date range filter
  const [dateFrom,     setDateFrom]     = useState('');
  const [dateTo,       setDateTo]       = useState('');
  const [activePreset, setActivePreset] = useState('');
  const [showDate,     setShowDate]     = useState(false);

  // ── Debounce search ──────────────────────────────────────────────────────────
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDSearch(search);
      setPage(0);
    }, 350);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  // ── Load & aggregate from sales (ground truth) ───────────────────────────────
  //
  //  WHY NOT inventory.soldQty?
  //  inventoryUtils.js only updates soldQty when an inventory record already
  //  exists for that productId. If a product was sold before any purchase was
  //  recorded (no inventory doc), soldQty is silently skipped → wrong totals.
  //
  //  APPROACH:
  //  1. Fetch sales (optionally filtered by saleDate range) → aggregate items[]
  //  2. Fetch inventory → merge in current stock & purchasedQty
  //  3. Also surface inventory products with 0 sales in the period (dead stock)
  //  4. Sort by soldQty desc; pagination is a client-side slice
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!db) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        // Build sales query — filter by saleDate (string "YYYY-MM-DD") if set
        const salesConstraints = [];
        if (dateFrom) salesConstraints.push(where('saleDate', '>=', dateFrom));
        if (dateTo)   salesConstraints.push(where('saleDate', '<=', dateTo));

        const salesQuery = salesConstraints.length > 0
          ? query(collection(db, 'sales'), ...salesConstraints)
          : collection(db, 'sales');

        const [salesSnap, invSnap] = await Promise.all([
          getDocs(salesQuery),
          getDocs(collection(db, 'inventory')),
        ]);

        // ── inventory map: productId → { stock, purchasedQty } ────────────────
        const invMap = {};
        invSnap.docs.forEach(d => {
          const data = d.data();
          if (data.productId) {
            invMap[data.productId] = {
              stock:        data.stock        || 0,
              purchasedQty: data.purchasedQty || 0,
            };
          }
        });

        // ── aggregate sales items: productId → { name, soldQty, revenue } ─────
        const agg = {};

        salesSnap.docs.forEach(d => {
          const items = d.data().items || [];
          items.forEach(item => {
            const pid = item.productId;
            if (!pid) return;

            const qty   = parseFloat(item.qty)   || 0;
            const price = parseFloat(item.price) || 0;

            if (!agg[pid]) {
              agg[pid] = { productId: pid, productName: item.productName || '—', soldQty: 0, revenue: 0 };
            }
            agg[pid].soldQty += qty;
            agg[pid].revenue += qty * price;
            if (!agg[pid].productName || agg[pid].productName === '—') {
              agg[pid].productName = item.productName || '—';
            }
          });
        });

        // ── include inventory products with 0 sales in the selected period ─────
        invSnap.docs.forEach(d => {
          const data = d.data();
          const pid  = data.productId;
          if (!pid || agg[pid]) return;
          agg[pid] = { productId: pid, productName: data.productName || '—', soldQty: 0, revenue: 0 };
        });

        // ── merge stock info ───────────────────────────────────────────────────
        const merged = Object.values(agg).map(p => ({
          ...p,
          stock:        invMap[p.productId]?.stock        ?? 0,
          purchasedQty: invMap[p.productId]?.purchasedQty ?? 0,
        }));

        // Sort: soldQty desc; ties → productName asc
        merged.sort((a, b) =>
          b.soldQty !== a.soldQty
            ? b.soldQty - a.soldQty
            : (a.productName || '').localeCompare(b.productName || '')
        );

        if (!active) return;
        setAllProducts(merged);
      } catch (e) {
        if (!active) return;
        toast.error('Failed to load report: ' + e.message);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [db, refreshKey, dateFrom, dateTo]);

  // ── Derived: filter + search applied in-memory; pagination is a slice ────────
  const filtered = useMemo(() => {
    let list = allProducts;
    if (filter === 'fast') list = list.filter(p => p.soldQty >= FAST_THRESHOLD);
    else if (filter === 'slow') list = list.filter(p => p.soldQty >= 1 && p.soldQty <= SLOW_MAX);
    else if (filter === 'dead') list = list.filter(p => p.soldQty === 0);

    if (dSearch.trim()) {
      const s = dSearch.toLowerCase();
      list = list.filter(p => p.productName?.toLowerCase().includes(s));
    }
    return list;
  }, [allProducts, filter, dSearch]);

  // Reset page when filter/search changes
  useEffect(() => { setPage(0); }, [filter, dSearch]);

  const pageRows   = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const maxSold    = allProducts.length > 0 ? (allProducts[0].soldQty || 1) : 1;
  const rankOffset = page * PAGE_SIZE;

  const summary = useMemo(() => ({
    total: allProducts.length,
    fast:  allProducts.filter(p => p.soldQty >= FAST_THRESHOLD).length,
    slow:  allProducts.filter(p => p.soldQty >= 1 && p.soldQty <= SLOW_MAX).length,
    dead:  allProducts.filter(p => p.soldQty === 0).length,
  }), [allProducts]);

  const SUMMARY_CARDS = [
    { label: 'Total Products', val: summary.total, color: 'primary.main' },
    { label: 'Fast Moving',    val: summary.fast,  color: 'success.main' },
    { label: 'Slow Moving',    val: summary.slow,  color: 'warning.main' },
    { label: 'Dead Stock',     val: summary.dead,  color: 'error.main'   },
  ];

  const hasDateFilter = dateFrom || dateTo;

  const applyPreset = (preset) => {
    const [start, end] = preset.getDates();
    setDateFrom(toInputDate(start));
    setDateTo(toInputDate(end));
    setActivePreset(preset.label);
    setPage(0);
  };

  const clearDateRange = () => {
    setDateFrom('');
    setDateTo('');
    setActivePreset('');
    setPage(0);
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <Box display="flex" alignItems="center" gap={1} mb={0.5}>
        <IconButton size="small" onClick={() => navigate('/sales')} sx={{ mr: 0.5 }}>
          <ArrowBack fontSize="small" />
        </IconButton>
        <Box flex={1}>
          <Typography variant="h5" fontWeight={700}>Product Movement Report</Typography>
          <Typography variant="body2" color="text.secondary">
            {hasDateFilter
              ? `Sales from ${dateFrom || '…'} to ${dateTo || '…'} · ${loading ? '…' : allProducts.length} products`
              : `All-time · ${loading ? '…' : allProducts.length} products`
            }
          </Typography>
        </Box>
        <IconButton size="small" onClick={() => { setPage(0); setRefreshKey(k => k + 1); }}>
          <Refresh fontSize="small" />
        </IconButton>
      </Box>

      {/* ── Summary Cards ────────────────────────────────────────────────────── */}
      <Grid container spacing={2} sx={{ mt: 1, mb: 3 }}>
        {SUMMARY_CARDS.map(c => (
          <Grid item xs={6} sm={3} key={c.label}>
            <Card sx={{ border: '1px solid', borderColor: c.color, textAlign: 'center' }}>
              <CardContent sx={{ py: '10px !important', px: 1 }}>
                {loading
                  ? <CircularProgress size={20} sx={{ my: 0.5 }} />
                  : <Typography variant="h4" fontWeight={800} color={c.color}>{c.val}</Typography>
                }
                <Typography variant="caption" color="text.secondary" display="block">
                  {c.label}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* ── Filters ──────────────────────────────────────────────────────────── */}
      <Card sx={{ mb: 2 }}>
        <Box sx={{ p: 2, pb: 1 }}>
          <TextField
            fullWidth size="small"
            placeholder="Search product name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
        </Box>

        <Box sx={{ px: 2, pb: 1.5, overflowX: 'auto' }}>
          <ToggleButtonGroup
            value={filter} exclusive size="small"
            onChange={(_, val) => { if (val) setFilter(val); }}
          >
            <ToggleButton value="all">All ({summary.total})</ToggleButton>
            <ToggleButton value="fast" sx={{ color: 'success.main' }}>
              <TrendingUp fontSize="small" sx={{ mr: 0.5 }} />
              Fast ({summary.fast})
            </ToggleButton>
            <ToggleButton value="slow" sx={{ color: 'warning.main' }}>
              <TrendingDown fontSize="small" sx={{ mr: 0.5 }} />
              Slow ({summary.slow})
            </ToggleButton>
            <ToggleButton value="dead" sx={{ color: 'error.main' }}>
              Dead ({summary.dead})
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* Threshold legend */}
        <Box sx={{ px: 2, pb: 1.5 }}>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {[
              { label: `Fast ≥ ${FAST_THRESHOLD} sold`,                       color: 'success' },
              { label: `Moderate ${SLOW_MAX + 1}–${FAST_THRESHOLD - 1} sold`, color: 'info'    },
              { label: `Slow 1–${SLOW_MAX} sold`,                             color: 'warning' },
              { label: 'Dead 0 sold',                                          color: 'error'   },
            ].map(l => (
              <Chip key={l.label} label={l.label} color={l.color} size="small"
                variant="outlined" sx={{ fontSize: 10, height: 20 }} />
            ))}
          </Stack>
        </Box>

        {/* Date range toggle button */}
        <Box sx={{ px: 2, pb: 1 }}>
          <Chip
            icon={<DateRange fontSize="small" />}
            label={
              hasDateFilter
                ? (activePreset || `${dateFrom || '…'} → ${dateTo || '…'}`)
                : 'Filter by Date Range'
            }
            onClick={() => setShowDate(p => !p)}
            onDelete={hasDateFilter ? clearDateRange : undefined}
            color={hasDateFilter ? 'primary' : 'default'}
            variant={hasDateFilter ? 'filled' : 'outlined'}
            sx={{ cursor: 'pointer' }}
          />
        </Box>

        {/* Collapsible date range panel */}
        <Collapse in={showDate}>
          <Box sx={{
            mx: 2, mb: 2, p: 1.5, borderRadius: 2,
            border: '1px solid', borderColor: hasDateFilter ? 'primary.300' : 'divider',
            bgcolor: hasDateFilter ? 'primary.50' : 'grey.50',
          }}>
            {/* Date inputs */}
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 1.5 }}>
              <TextField
                size="small" type="date" label="From"
                value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setActivePreset(''); setPage(0); }}
                InputLabelProps={{ shrink: true }}
                inputProps={{ max: dateTo || undefined }}
                sx={{ flex: 1, minWidth: 140 }}
              />
              <TextField
                size="small" type="date" label="To"
                value={dateTo}
                onChange={e => { setDateTo(e.target.value); setActivePreset(''); setPage(0); }}
                InputLabelProps={{ shrink: true }}
                inputProps={{ min: dateFrom || undefined }}
                sx={{ flex: 1, minWidth: 140 }}
              />
            </Box>

            {/* Quick presets */}
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
              {DATE_PRESETS.map(p => (
                <Chip
                  key={p.label}
                  label={p.label}
                  size="small"
                  variant={activePreset === p.label ? 'filled' : 'outlined'}
                  color={activePreset === p.label ? 'primary' : 'default'}
                  onClick={() => applyPreset(p)}
                  sx={{ cursor: 'pointer', fontSize: 11 }}
                />
              ))}
            </Box>
          </Box>
        </Collapse>

        {/* Active date strip shown when panel collapsed */}
        {hasDateFilter && !showDate && (
          <Box sx={{
            mx: 2, mb: 1.5, px: 1.5, py: 0.75,
            bgcolor: 'primary.50', borderRadius: 1,
            border: '1px solid', borderColor: 'primary.100',
            display: 'flex', alignItems: 'center', gap: 1,
          }}>
            <DateRange fontSize="small" color="primary" />
            <Typography variant="caption" color="primary.main" fontWeight={600}>
              {activePreset || `${dateFrom || '…'} → ${dateTo || '…'}`}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              · {allProducts.filter(p => p.soldQty > 0).length} products sold
            </Typography>
            <IconButton size="small" onClick={clearDateRange} sx={{ ml: 'auto', p: 0.25 }}>
              <Clear fontSize="small" />
            </IconButton>
          </Box>
        )}
      </Card>

      {/* ── Table ────────────────────────────────────────────────────────────── */}
      <Card>
        <TableContainer>
          <Table size={isMobile ? 'small' : 'medium'}>
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell sx={{ width: 48, fontWeight: 700 }}>#</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Product</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{isMobile ? 'Sold' : 'Units Sold'}</TableCell>
                {!isMobile && <TableCell sx={{ fontWeight: 700 }}>Revenue</TableCell>}
                {!isMobile && <TableCell sx={{ fontWeight: 700 }}>In Stock</TableCell>}
                {!isMobile && <TableCell sx={{ fontWeight: 700 }}>Purchased</TableCell>}
                <TableCell sx={{ fontWeight: 700 }}>Movement</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: isMobile ? 4 : 7 }).map((_, j) => (
                      <TableCell key={j}>
                        <Box sx={{ height: 18, bgcolor: 'action.hover', borderRadius: 1 }} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isMobile ? 4 : 7} align="center" sx={{ py: 5 }}>
                    <Inventory2 sx={{ fontSize: 40, color: 'text.disabled', mb: 1, display: 'block', mx: 'auto' }} />
                    <Typography color="text.secondary">
                      {dSearch ? 'No products match your search' : 'No products found'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((row, idx) => {
                  const globalRank = rankOffset + idx + 1;
                  const mv         = MOVEMENT[classifyMovement(row.soldQty)];
                  const isTopThree = globalRank <= 3 && filter === 'all' && !dSearch;

                  return (
                    <TableRow
                      key={row.productId}
                      hover
                      sx={isTopThree ? {
                        bgcolor:
                          globalRank === 1 ? 'warning.50' :
                          globalRank === 2 ? 'grey.50'    : 'background.paper',
                      } : {}}
                    >
                      {/* Rank */}
                      <TableCell>
                        {isTopThree ? (
                          <Avatar sx={{
                            width: 26, height: 26, fontSize: 12, fontWeight: 800,
                            bgcolor:
                              globalRank === 1 ? '#f59e0b' :
                              globalRank === 2 ? '#9ca3af' : '#b45309',
                          }}>
                            {globalRank}
                          </Avatar>
                        ) : (
                          <Typography variant="body2" color="text.secondary" fontWeight={500}>
                            {globalRank}
                          </Typography>
                        )}
                      </TableCell>

                      {/* Product name */}
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{row.productName}</Typography>
                        {isMobile && (
                          <Typography variant="caption" color="text.secondary">
                            Stock: {row.stock} · {formatCurrency(row.revenue)}
                          </Typography>
                        )}
                      </TableCell>

                      {/* Sold qty bar */}
                      <TableCell>
                        <SoldBar value={row.soldQty} max={maxSold} />
                      </TableCell>

                      {/* Revenue */}
                      {!isMobile && (
                        <TableCell>
                          <Typography variant="body2" color="success.main" fontWeight={600}>
                            {formatCurrency(row.revenue)}
                          </Typography>
                        </TableCell>
                      )}

                      {/* Stock */}
                      {!isMobile && (
                        <TableCell>
                          <Chip
                            label={row.stock}
                            size="small"
                            color={row.stock === 0 ? 'error' : row.stock <= 3 ? 'warning' : 'default'}
                            variant={row.stock === 0 ? 'filled' : 'outlined'}
                            sx={{ minWidth: 40, fontWeight: 700 }}
                          />
                        </TableCell>
                      )}

                      {/* Purchased */}
                      {!isMobile && (
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">
                            {row.purchasedQty}
                          </Typography>
                        </TableCell>
                      )}

                      {/* Movement chip */}
                      <TableCell>
                        <Chip
                          icon={mv.icon}
                          label={isMobile ? mv.short : mv.label}
                          color={mv.color}
                          size="small"
                          sx={{ fontSize: isMobile ? 9 : 11 }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Divider />

        <TablePagination
          component="div"
          count={filtered.length}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={PAGE_SIZE}
          rowsPerPageOptions={[PAGE_SIZE]}
        />
      </Card>
    </Box>
  );
};

export default ProductMovementReport;