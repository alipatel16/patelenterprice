// src/pages/Dashboard/Dashboard.js
//
// ─── READ-COUNT FIXES (v2) ────────────────────────────────────────────────────
//
//  v1: Merged 9 queries → max 2 getDocs per load.
//  v2: NO auto-load on mount. Data only fetches when the user clicks
//      "Load Stats". After the first load, changing the date range
//      still triggers a re-fetch automatically (via hasFetchedRef guard).
//
//  Why: Every dashboard visit by every user was burning reads even when
//  users just opened the app and navigated away. Now reads only happen
//  when intentionally requested.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Grid, Card, CardContent, Typography, Button, Chip,
  ToggleButton, ToggleButtonGroup, Skeleton, Avatar, Divider,
  useTheme, TextField, CircularProgress,
} from '@mui/material';
import {
  TrendingUp, People, Inventory2, PointOfSale,
  ShoppingCart, Add, ArrowUpward, ArrowDownward,
  AttachMoney, Pending, LocalShipping, Receipt,
  BarChart as BarChartIcon, Refresh,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  collection, query, where, getDocs,
  Timestamp, getCountFromServer,
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency } from '../../utils';
import dayjs from 'dayjs';

// ─── StatCard ─────────────────────────────────────────────────────────────────

const StatCard = ({ title, value, subtitle, icon, color, trend, loading }) => {
  const theme = useTheme();
  return (
    <Card>
      <CardContent>
        <Box display="flex" alignItems="flex-start" justifyContent="space-between">
          <Box flex={1}>
            <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase">
              {title}
            </Typography>
            {loading ? (
              <Skeleton width={120} height={40} />
            ) : (
              <Typography variant="h4" fontWeight={700} mt={0.5}>{value}</Typography>
            )}
            {subtitle && (
              <Typography variant="caption" color="text.secondary">{subtitle}</Typography>
            )}
            {trend !== undefined && !loading && (
              <Box display="flex" alignItems="center" gap={0.5} mt={0.5}>
                {trend >= 0
                  ? <ArrowUpward sx={{ fontSize: 14, color: 'success.main' }} />
                  : <ArrowDownward sx={{ fontSize: 14, color: 'error.main' }} />}
                <Typography variant="caption" color={trend >= 0 ? 'success.main' : 'error.main'} fontWeight={600}>
                  {Math.abs(trend)}% vs last month
                </Typography>
              </Box>
            )}
          </Box>
          <Avatar sx={{ bgcolor: `${color}.light`, width: 48, height: 48 }}>
            {React.cloneElement(icon, { sx: { color: `${color}.main` } })}
          </Avatar>
        </Box>
      </CardContent>
    </Card>
  );
};

// ─── QuickAction ──────────────────────────────────────────────────────────────

const QuickAction = ({ label, icon, color, onClick }) => (
  <Button
    variant="outlined" fullWidth
    startIcon={icon}
    onClick={onClick}
    sx={{
      py: 1.5, borderRadius: 2, borderColor: `${color}.main`,
      color: `${color}.main`,
      '&:hover': { bgcolor: `${color}.main`, color: '#fff', borderColor: `${color}.main` },
    }}
  >
    {label}
  </Button>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const Dashboard = () => {
  const { db, userProfile, storeType } = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();

  // ── Filter state ────────────────────────────────────────────────────────────
  const [range,       setRange]       = useState('monthly');
  const [customStart, setCustomStart] = useState(dayjs().subtract(7, 'day').format('YYYY-MM-DD'));
  const [customEnd,   setCustomEnd]   = useState(dayjs().format('YYYY-MM-DD'));

  // ── Data state ──────────────────────────────────────────────────────────────
  const [loading,   setLoading]   = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);   // true after first manual load
  const [stats, setStats] = useState({
    totalSales: 0, totalCustomers: 0, totalProducts: 0,
    totalPurchases: 0, pendingSales: 0, todaySales: 0,
    invoiceCount: 0,
  });
  const [chartData, setChartData] = useState([]);

  // Ref tracks whether user has triggered at least one load.
  // Used in the useEffect to gate auto-refetch on range changes.
  // Ref (not state) avoids stale-closure issues in the effect.
  const hasFetchedRef = useRef(false);

  // ── Auto-refetch when range/dates change — but ONLY after first manual load ─
  useEffect(() => {
    if (!db || !hasFetchedRef.current) return;
    fetchAllData();
  }, [db, range, customStart, customEnd]);

  // ── Date range helper ───────────────────────────────────────────────────────
  const getDateRange = () => {
    const now = dayjs();
    if (range === 'daily')   return { start: now.startOf('day'),   end: now.endOf('day')   };
    if (range === 'monthly') return { start: now.startOf('month'), end: now.endOf('month') };
    if (range === 'custom')  return { start: dayjs(customStart),   end: dayjs(customEnd)   };
    return { start: now.startOf('month'), end: now.endOf('month') };
  };

  // ── Fetch — max 2 getDocs ───────────────────────────────────────────────────
  const fetchAllData = async () => {
    if (!db) return;
    hasFetchedRef.current = true;
    setHasLoaded(true);
    setLoading(true);
    try {
      const today     = dayjs();
      const { start, end } = getDateRange();
      const startTs   = Timestamp.fromDate(start.toDate());
      const endTs     = Timestamp.fromDate(end.toDate());

      const chartStart   = today.subtract(6, 'day').startOf('day');
      const chartEnd     = today.endOf('day');
      const chartStartTs = Timestamp.fromDate(chartStart.toDate());
      const chartEndTs   = Timestamp.fromDate(chartEnd.toDate());

      // Count queries (cheap — ~1 read each regardless of collection size)
      const [custSnap, prodSnap, purchaseSnap, pendingSnap] = await Promise.all([
        getCountFromServer(collection(db, 'customers')),
        getCountFromServer(collection(db, 'products')),
        getCountFromServer(collection(db, 'purchases')),
        getCountFromServer(query(collection(db, 'sales'), where('paymentType', '==', 'pending_payment'))),
      ]);

      // Stats query (1 getDocs — reads docs in selected range)
      const salesSnap = await getDocs(query(
        collection(db, 'sales'),
        where('createdAt', '>=', startTs),
        where('createdAt', '<=', endTs),
      ));

      // Chart query — reuse salesSnap if 7-day window is within the stats range
      const chartIsInStatsRange =
        chartStart.valueOf() >= start.valueOf() &&
        chartEnd.valueOf()   <= end.valueOf();

      let chartDocs;
      if (chartIsInStatsRange) {
        chartDocs = salesSnap.docs;
      } else {
        const chartSnap = await getDocs(query(
          collection(db, 'sales'),
          where('createdAt', '>=', chartStartTs),
          where('createdAt', '<=', chartEndTs),
        ));
        chartDocs = chartSnap.docs;
      }

      const totalSales   = salesSnap.docs.reduce((s, d) => s + (d.data().grandTotal || 0), 0);
      const invoiceCount = salesSnap.size;

      const todayKey   = today.format('YYYY-MM-DD');
      const todaySales = chartDocs
        .filter(d => {
          const ts = d.data().createdAt;
          return ts && dayjs(ts.toDate()).format('YYYY-MM-DD') === todayKey;
        })
        .reduce((s, d) => s + (d.data().grandTotal || 0), 0);

      setStats({
        totalSales,
        invoiceCount,
        totalCustomers:  custSnap.data().count,
        totalProducts:   prodSnap.data().count,
        totalPurchases:  purchaseSnap.data().count,
        pendingSales:    pendingSnap.data().count,
        todaySales,
      });

      // Build 7-day chart
      const dayMap = {};
      for (let i = 6; i >= 0; i--) {
        const d = today.subtract(i, 'day');
        dayMap[d.format('YYYY-MM-DD')] = { day: d.format('DD MMM'), sales: 0, count: 0 };
      }
      chartDocs.forEach(doc => {
        const data = doc.data();
        if (!data.createdAt) return;
        const key = dayjs(data.createdAt.toDate()).format('YYYY-MM-DD');
        if (dayMap[key]) {
          dayMap[key].sales += data.grandTotal || 0;
          dayMap[key].count += 1;
        }
      });
      setChartData(Object.values(dayMap));

    } catch (err) {
      console.error('[Dashboard] fetchAllData error:', err);
    } finally {
      setLoading(false);
    }
  };

  const greeting = new Date().getHours() < 12 ? 'Morning'
    : new Date().getHours() < 17 ? 'Afternoon' : 'Evening';

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>

      {/* ── Header ── */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3} flexWrap="wrap" gap={1}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            Good {greeting}, {userProfile?.name?.split(' ')[0]}! 👋
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {storeType === 'electronics' ? 'Electronics' : 'Furniture'} Store Dashboard
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<Add />} onClick={() => navigate('/sales/new')}>
          New Sale
        </Button>
      </Box>

      {/* ── IDLE STATE — before first load ── */}
      {!hasLoaded && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={8}>
            <Card elevation={0} sx={{
              border: '2px dashed', borderColor: 'primary.light',
              borderRadius: 3, textAlign: 'center',
              py: { xs: 5, md: 8 }, px: 3,
              background: 'linear-gradient(135deg, rgba(99,102,241,0.04) 0%, rgba(168,85,247,0.04) 100%)',
            }}>
              <Box sx={{
                width: 72, height: 72, borderRadius: '50%',
                bgcolor: 'primary.50', display: 'flex',
                alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2,
              }}>
                <BarChartIcon sx={{ fontSize: 36, color: 'primary.main' }} />
              </Box>
              <Typography variant="h6" fontWeight={700} mb={1}>
                Dashboard stats not loaded
              </Typography>
              <Typography variant="body2" color="text.secondary" mb={3} sx={{ maxWidth: 360, mx: 'auto' }}>
                Stats and charts are loaded on demand to save Firestore reads.
                Click below to load the current period data.
              </Typography>
              <Button
                variant="contained"
                size="large"
                startIcon={<BarChartIcon />}
                onClick={fetchAllData}
                sx={{ px: 4, py: 1.5, borderRadius: 2, fontWeight: 700 }}
              >
                Load Dashboard Stats
              </Button>
            </Card>
          </Grid>

          {/* Quick actions always visible */}
          <Grid item xs={12} md={4}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="subtitle1" fontWeight={600} mb={2}>Quick Actions</Typography>
                <Grid container spacing={1.5}>
                  {[
                    { label: 'New Sale',         icon: <Add />,          color: 'primary',   path: '/sales/new'   },
                    { label: 'Add Customer',     icon: <People />,       color: 'info',      path: '/customers'   },
                    { label: 'Add Product',      icon: <Inventory2 />,   color: 'secondary', path: '/products'    },
                    { label: 'Record Purchase',  icon: <ShoppingCart />, color: 'warning',   path: '/purchases'   },
                    { label: 'View Inventory',   icon: <Inventory2 />,   color: 'success',   path: '/inventory'   },
                  ].map(a => (
                    <Grid item xs={12} key={a.label}>
                      <QuickAction {...a} onClick={() => navigate(a.path)} />
                    </Grid>
                  ))}
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* ── LOADED STATE — after first load ── */}
      {hasLoaded && (
        <>
          {/* Date range filter */}
          <Box display="flex" alignItems="center" gap={2} mb={3} flexWrap="wrap">
            <ToggleButtonGroup value={range} exclusive onChange={(_, v) => v && setRange(v)} size="small">
              <ToggleButton value="daily">Today</ToggleButton>
              <ToggleButton value="monthly">This Month</ToggleButton>
              <ToggleButton value="custom">Custom</ToggleButton>
            </ToggleButtonGroup>
            {range === 'custom' && (
              <>
                <TextField
                  type="date" size="small" value={customStart}
                  onChange={e => setCustomStart(e.target.value)}
                  label="From" InputLabelProps={{ shrink: true }} sx={{ width: 150 }}
                />
                <TextField
                  type="date" size="small" value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)}
                  label="To" InputLabelProps={{ shrink: true }} sx={{ width: 150 }}
                />
              </>
            )}
            <Button
              size="small" variant="outlined" startIcon={loading ? <CircularProgress size={14} /> : <Refresh />}
              onClick={fetchAllData} disabled={loading}
              sx={{ ml: 'auto' }}
            >
              {loading ? 'Loading…' : 'Refresh'}
            </Button>
          </Box>

          {/* Stat cards */}
          <Grid container spacing={2} mb={3}>
            <Grid item xs={12} sm={6} md={4}>
              <StatCard title="Total Sales" value={formatCurrency(stats.totalSales)}
                icon={<TrendingUp />} color="primary" loading={loading} />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <StatCard title="Today's Sales" value={formatCurrency(stats.todaySales)}
                icon={<AttachMoney />} color="success" loading={loading} />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <StatCard
                title={`Invoices (${range === 'daily' ? 'Today' : range === 'monthly' ? 'This Month' : 'Range'})`}
                value={stats.invoiceCount} icon={<Receipt />} color="info" loading={loading}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <StatCard title="Total Customers" value={stats.totalCustomers}
                icon={<People />} color="secondary" loading={loading} />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <StatCard title="Total Products" value={stats.totalProducts}
                icon={<Inventory2 />} color="warning" loading={loading} />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <StatCard title="Purchases" value={stats.totalPurchases}
                icon={<ShoppingCart />} color="error" loading={loading} />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <StatCard title="Pending Payments" value={stats.pendingSales}
                icon={<Pending />} color="warning" loading={loading} />
            </Grid>
          </Grid>

          {/* Chart + Quick Actions */}
          <Grid container spacing={2}>
            <Grid item xs={12} md={8}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="subtitle1" fontWeight={600} mb={2}>
                    Sales – Last 7 Days
                  </Typography>
                  {loading ? (
                    <Skeleton variant="rectangular" width="100%" height={220} sx={{ borderRadius: 1 }} />
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                        <Tooltip formatter={v => formatCurrency(v)} />
                        <Bar dataKey="sales" fill={theme.palette.primary.main} radius={[4, 4, 0, 0]} name="Sales" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={4}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="subtitle1" fontWeight={600} mb={2}>Quick Actions</Typography>
                  <Grid container spacing={1.5}>
                    {[
                      { label: 'New Sale',         icon: <Add />,          color: 'primary',   path: '/sales/new'   },
                      { label: 'Add Customer',     icon: <People />,       color: 'info',      path: '/customers'   },
                      { label: 'Add Product',      icon: <Inventory2 />,   color: 'secondary', path: '/products'    },
                      { label: 'Record Purchase',  icon: <ShoppingCart />, color: 'warning',   path: '/purchases'   },
                      { label: 'View Inventory',   icon: <Inventory2 />,   color: 'success',   path: '/inventory'   },
                    ].map(a => (
                      <Grid item xs={12} key={a.label}>
                        <QuickAction {...a} onClick={() => navigate(a.path)} />
                      </Grid>
                    ))}
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </>
      )}
    </Box>
  );
};

export default Dashboard;