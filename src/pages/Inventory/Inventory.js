// src/pages/Inventory/Inventory.js
//
// ─── READ STRATEGY ────────────────────────────────────────────────────────────
//
//  BEFORE: getDocs(all) on every visit → ~200 reads every time anyone opens
//          this page.
//
//  AFTER:
//   • Summary cards  → getCountFromServer × 3 (0 Firestore reads on Spark plan)
//   • List view      → cursor-based server-side pagination, 10 docs per page
//   • Search         → same month-type search as ProductList / PurchaseList:
//                      select a month → fetch only that month's docs (by
//                      createdAt) → filter by product name in memory.
//                      No fixed doc cap — bounded by however many products
//                      were actually added in that month.
//
//  Net reads on a typical page open with no search: 10 (was ~200).
//
// ⚠️  INDEX NOTE:
//   The summary count queries use where('stock', ...) which requires auto-created
//   single-field indexes on 'stock'. These should exist automatically, but if the
//   summary cards show 0 and the browser console shows an index error, click the
//   auto-create URL that Firestore logs there.
//
// ⚠️  ASSUMPTION: inventory docs have a `createdAt` field (serverTimestamp),
//   same as every other collection in this app (products, customers, sales,
//   purchases). If your inventory docs are created without this field (check
//   applyNewPurchaseInventory / applyNewSaleInventory in inventoryUtils.js),
//   month search will return 0 results until that field is added there.

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Box, Typography, Card, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TablePagination, Chip,
  LinearProgress, Grid, Paper,
} from '@mui/material';
import { Inventory2, Warning, CheckCircle, Error } from '@mui/icons-material';
import {
  collection, query, where, orderBy, limit, startAfter, getDocs,
  getCountFromServer, Timestamp,
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';
import { useMediaQuery, useTheme } from '@mui/material';
import MonthSearchBar from '../../components/MonthSearchBar';

const PAGE_SIZE = 10;

const getMonthBounds = (yearMonth) => {
  const [y, m] = yearMonth.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    start: new Date(y, m - 1, 1, 0, 0, 0, 0),
    end:   new Date(y, m - 1, lastDay, 23, 59, 59, 999),
  };
};

// ─── Sub-components ───────────────────────────────────────────────────────────
const StockChip = ({ stock }) => {
  if (stock <= 0)
    return <Chip icon={<Error fontSize="small" />}        label="Out of Stock" color="error"   size="small" />;
  if (stock <= 5)
    return <Chip icon={<Warning fontSize="small" />}      label="Low Stock"    color="warning" size="small" />;
  return   <Chip icon={<CheckCircle fontSize="small" />}  label="In Stock"     color="success" size="small" />;
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

  // ── Summary card state (loaded via getCountFromServer — free) ─────────
  const [summary, setSummary] = useState({ totalItems: 0, outOfStock: 0, lowStock: 0 });
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Paginated list state ──────────────────────────────────────────────
  const [pageRows,   setPageRows]   = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(0);
  const [cursorMap,  setCursorMap]  = useState({});

  // ── Month + Search state (same pattern as ProductList / PurchaseList) ──
  const [searchMonth,     setSearchMonth]     = useState('');
  const [search,          setSearch]          = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [monthDocs,       setMonthDocs]       = useState([]);
  const searchTimer = useRef(null);

  const isMonthMode = Boolean(searchMonth);

  const handleSearch = val => {
    setSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(0);
    }, 350);
  };

  const handleMonthChange = val => {
    setSearchMonth(val);
    setSearch('');
    setDebouncedSearch('');
    setPage(0);
    setCursorMap({});
    if (!val) setMonthDocs([]);
  };

  // ── Effect 1: Summary counts — 0 Firestore reads on Spark plan ───────
  // getCountFromServer is free and doesn't count against daily read quota.
  useEffect(() => {
    if (!db) return;
    Promise.all([
      getCountFromServer(collection(db, 'inventory')),
      getCountFromServer(query(collection(db, 'inventory'), where('stock', '<=', 0))),
      getCountFromServer(query(collection(db, 'inventory'), where('stock', '>', 0), where('stock', '<=', 5))),
    ])
      .then(([totalSnap, outSnap, lowSnap]) => {
        const totalCount = totalSnap.data().count;
        setSummary({
          totalItems: totalCount,
          outOfStock: outSnap.data().count,
          lowStock:   lowSnap.data().count,
        });
        // Also seed total for pagination (paginated mode only)
        if (!isMonthMode) setTotal(totalCount);
      })
      .catch(err => {
        // If this fails, Firestore needs a single-field index on 'stock'.
        // Check the browser console for an auto-create URL — one click fixes it.
        console.warn('[Inventory] summary count query failed:', err.message);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, refreshKey]);

  // ── Effect 2: Page data (paginated) OR month-search fetch ────────────
  useEffect(() => {
    if (!db) return;
    let active = true;

    const run = async () => {
      setLoading(true);
      try {
        if (isMonthMode) {
          // ── MONTH SEARCH MODE ────────────────────────────────────────
          // Fetch only docs created in the selected month — same pattern
          // as ProductList/PurchaseList. No fixed cap; bounded by however
          // many products were actually added that month.
          const { start, end } = getMonthBounds(searchMonth);
          const snap = await getDocs(query(
            collection(db, 'inventory'),
            where('createdAt', '>=', Timestamp.fromDate(start)),
            where('createdAt', '<=', Timestamp.fromDate(end)),
            orderBy('createdAt', 'desc'),
          ));
          if (!active) return;
          setMonthDocs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } else {
          // ── PAGINATED MODE ───────────────────────────────────────────
          // 10 reads per page — uses cursor from the previous page.
          const constraints = [orderBy('productName'), limit(PAGE_SIZE)];
          if (page > 0 && cursorMap[page - 1]) {
            constraints.push(startAfter(cursorMap[page - 1]));
          }

          const snap = await getDocs(query(collection(db, 'inventory'), ...constraints));
          if (!active) return;

          const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          if (snap.docs.length > 0) {
            setCursorMap(prev => ({ ...prev, [page]: snap.docs[snap.docs.length - 1] }));
          }
          setPageRows(docs);
        }
      } catch (err) {
        if (!active) return;
        toast.error('Failed to load inventory');
      } finally {
        if (active) setLoading(false);
      }
    };

    run();
    return () => { active = false; };
    // cursorMap intentionally excluded — updating it inside the effect must not
    // trigger a re-run (standard cursor pagination pattern).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, page, searchMonth, debouncedSearch, refreshKey]);

  // ── Derived: in-memory name filter for month mode ─────────────────────
  const monthFiltered = useMemo(() => {
    if (!isMonthMode) return [];
    if (!debouncedSearch.trim()) return monthDocs;
    const s = debouncedSearch.toLowerCase();
    return monthDocs.filter(d => d.productName?.toLowerCase().includes(s));
  }, [monthDocs, debouncedSearch, isMonthMode]);

  // What the table actually renders + the correct total for pagination
  const displayRows  = isMonthMode
    ? monthFiltered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
    : pageRows;
  const displayTotal = isMonthMode ? monthFiltered.length : total;

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>

      {/* ── Header ── */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2} flexWrap="wrap" gap={1}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Inventory</Typography>
          <Typography variant="caption" color="text.secondary">
            {isMonthMode
              ? `${monthFiltered.length} of ${summary.totalItems} products`
              : `${summary.totalItems} products`}
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

      {/* ── Month + Search (same component as Products / Purchases) ── */}
      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 2, p: 2 }}>
        <MonthSearchBar
          selectedMonth={searchMonth} onMonthChange={handleMonthChange}
          search={search} onSearchChange={handleSearch}
          searchPlaceholder="Search product name…"
          resultCount={isMonthMode ? displayTotal : undefined} loading={loading}
        />
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
                : displayRows.length === 0
                  ? (
                    <TableRow>
                      <TableCell colSpan={isMobile ? 5 : 6} align="center" sx={{ py: 6 }}>
                        <Typography color="text.secondary">
                          {isMonthMode && debouncedSearch
                            ? `No products matching "${debouncedSearch}"`
                            : isMonthMode
                            ? 'No products added in this month'
                            : 'No inventory records. Add purchases to populate.'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )
                  : displayRows.map(row => {
                      const stock     = row.stock        || 0;
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
          count={displayTotal}
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