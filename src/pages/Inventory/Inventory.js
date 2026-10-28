import usePagedCollection from '../../hooks/usePagedCollection';
import QueryStatus from '../../components/QueryStatus';
import { businessListOptions } from '../../utils/businessListQueries';
import { fetchAggregate, subscribeInvalidation } from '../../data/query';
import { useState, useEffect } from 'react';
import {
  Box, Typography, Card, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TablePagination, Chip,
  LinearProgress, Grid, Paper,
} from '@mui/material';
import { Inventory2, Warning, CheckCircle, Error } from '@mui/icons-material';

import { useAuth } from '../../contexts/AuthContext';

import { useMediaQuery, useTheme } from '@mui/material';
import MonthSearchBar from '../../components/MonthSearchBar';

const PAGE_SIZE = 15;

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

  const [summary, setSummary] = useState({ totalItems: 0, outOfStock: 0, lowStock: 0 });
  const [summaryError, setSummaryError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchMonth, setSearchMonth] = useState('');
  const [search, setSearch] = useState('');
  const isMonthMode = Boolean(searchMonth);
  const handleSearch = setSearch;
  const handleMonthChange = setSearchMonth;
  const { rows: displayRows, total: displayTotal, loading, error, page, setPage } = usePagedCollection(
    db, 'inventory', businessListOptions('inventory', { search, month: searchMonth })
  );
  useEffect(() => subscribeInvalidation(db, names => {
    if (!names || names.includes('inventory')) setRefreshKey(key => key + 1);
  }), [db]);
  useEffect(() => {
    if (!db) return;
    let active = true;
    setSummaryError(null);
    Promise.all([
      fetchAggregate(db, 'inventory'),
      fetchAggregate(db, 'inventory', { filters: [['stock', '<=', 0]] }),
      fetchAggregate(db, 'inventory', { filters: [['stock', '>', 0], ['stock', '<=', 5]] }),
    ]).then(([total, out, low]) => {
      if (active) setSummary({ totalItems: total.count, outOfStock: out.count, lowStock: low.count });
    }).catch(e => { if (active) setSummaryError(e); });
    return () => { active = false; };
  }, [db, refreshKey]);

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <QueryStatus error={error || summaryError} loading={loading} search={search} />

      {/* ── Header ── */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2} flexWrap="wrap" gap={1}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Inventory</Typography>
          <Typography variant="caption" color="text.secondary">
            {isMonthMode
              ? `${displayTotal} of ${summary.totalItems} products`
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
                          {isMonthMode && search
                            ? `No products matching "${search}"`
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
          count={displayTotal ?? 0}
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
