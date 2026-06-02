// src/pages/Dashboard/Dashboard.js
//
// ─── READ-COUNT FIXES ─────────────────────────────────────────────────────────
//
//  BEFORE: fetchStats (2 getDocs) + fetchChartData (7 getDocs in a loop) =
//          9 Firestore queries per dashboard load, each reading full sales
//          documents.  With 20 users × 3 visits = 60 dashboard loads/day,
//          that consumed ≈ 9 × 30 docs × 60 = 16 200 reads/day just from
//          the dashboard.
//
//  AFTER:  fetchAllData — ONE merged function with AT MOST 2 getDocs:
//            • salesSnap  — stats range (createdAt ≥ start, ≤ end)
//            • chartSnap  — last 7 days (only if NOT already covered by
//                           salesSnap, e.g. when range is "monthly" early
//                           in the month the chart window IS inside the
//                           stats window — zero extra reads needed)
//          getCountFromServer calls remain (they cost 0 reads on Spark).
//          todaySales is derived from chartSnap in memory — no 3rd query.
//
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import {
  Box, Grid, Card, CardContent, Typography, Button, Chip,
  ToggleButton, ToggleButtonGroup, Skeleton, Avatar, Divider,
  useTheme, TextField,
} from '@mui/material';
import {
  TrendingUp, People, Inventory2, PointOfSale,
  ShoppingCart, Add, ArrowUpward, ArrowDownward,
  AttachMoney, Pending, LocalShipping, Receipt,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import {
  collection, query, where, getDocs, orderBy,
  Timestamp, getCountFromServer,
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency } from '../../utils';
import dayjs from 'dayjs';

// ─── Sub-components (unchanged) ───────────────────────────────────────────────

const StatCard = ({ title, value, subtitle, icon, color, trend, loading }) => {
  const theme = useTheme();
  return (
    <Card>
      <CardContent>
        <Box display="flex" alignItems="flex-start" justifyContent="space-between">
          <Box>
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
            {trend !== undefined && (
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
  const [range, setRange] = useState('monthly');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalSales: 0, totalCustomers: 0, totalProducts: 0,
    totalPurchases: 0, pendingSales: 0, todaySales: 0,
    invoiceCount: 0,
  });
  const [chartData, setChartData] = useState([]);
  const [customStart, setCustomStart] = useState(dayjs().subtract(7, 'day').format('YYYY-MM-DD'));
  const [customEnd, setCustomEnd]     = useState(dayjs().format('YYYY-MM-DD'));

  useEffect(() => {
    if (!db) return;
    fetchAllData();
  }, [db, range, customStart, customEnd]);

  const getDateRange = () => {
    const now = dayjs();
    if (range === 'daily')   return { start: now.startOf('day'),   end: now.endOf('day')   };
    if (range === 'monthly') return { start: now.startOf('month'), end: now.endOf('month') };
    if (range === 'custom')  return { start: dayjs(customStart),   end: dayjs(customEnd)   };
    return { start: now.startOf('month'), end: now.endOf('month') };
  };

  // ─── COMBINED DATA FETCH ───────────────────────────────────────────────────
  // Max 2 getDocs instead of the old 9 (2 stats + 7 chart).
  // getCountFromServer is FREE on every Firestore plan.
  const fetchAllData = async () => {
    setLoading(true);
    try {
      const today     = dayjs();
      const { start, end } = getDateRange();
      const startTs   = Timestamp.fromDate(start.toDate());
      const endTs     = Timestamp.fromDate(end.toDate());

      // 7-day window for the bar chart
      const chartStart = today.subtract(6, 'day').startOf('day');
      const chartEnd   = today.endOf('day');
      const chartStartTs = Timestamp.fromDate(chartStart.toDate());
      const chartEndTs   = Timestamp.fromDate(chartEnd.toDate());

      // ── Free count queries (0 read cost) ─────────────────────────────
      const [custSnap, prodSnap, purchaseSnap, pendingSnap] = await Promise.all([
        getCountFromServer(collection(db, 'customers')),
        getCountFromServer(collection(db, 'products')),
        getCountFromServer(collection(db, 'purchases')),
        getCountFromServer(query(collection(db, 'sales'), where('paymentType', '==', 'pending_payment'))),
      ]);

      // ── Stats query (1 getDocs) ───────────────────────────────────────
      const salesSnap = await getDocs(query(
        collection(db, 'sales'),
        where('createdAt', '>=', startTs),
        where('createdAt', '<=', endTs),
      ));

      // ── Chart query (0 or 1 getDocs) ─────────────────────────────────
      // If the 7-day chart window is FULLY contained within the already-
      // fetched stats window, reuse salesSnap docs — 0 extra reads.
      const chartIsInStatsRange =
        chartStart.valueOf() >= start.valueOf() &&
        chartEnd.valueOf()   <= end.valueOf();

      let chartDocs;
      if (chartIsInStatsRange) {
        chartDocs = salesSnap.docs;  // free reuse
      } else {
        const chartSnap = await getDocs(query(
          collection(db, 'sales'),
          where('createdAt', '>=', chartStartTs),
          where('createdAt', '<=', chartEndTs),
        ));
        chartDocs = chartSnap.docs;
      }

      // ── Derive stats from salesSnap ───────────────────────────────────
      const totalSales   = salesSnap.docs.reduce((s, d) => s + (d.data().grandTotal || 0), 0);
      const invoiceCount = salesSnap.size;

      // ── Derive today's sales from chartDocs in memory (no 3rd query) ─
      const todayKey = today.format('YYYY-MM-DD');
      const todaySales = chartDocs
        .filter(d => {
          const ts = d.data().createdAt;
          return ts && dayjs(ts.toDate()).format('YYYY-MM-DD') === todayKey;
        })
        .reduce((s, d) => s + (d.data().grandTotal || 0), 0);

      setStats({
        totalSales,
        invoiceCount,
        totalCustomers: custSnap.data().count,
        totalProducts:  prodSnap.data().count,
        totalPurchases: purchaseSnap.data().count,
        pendingSales:   pendingSnap.data().count,
        todaySales,
      });

      // ── Build 7-day chart from chartDocs in memory ───────────────────
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

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* Header */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3} flexWrap="wrap" gap={1}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'}, {userProfile?.name?.split(' ')[0]}! 👋
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {storeType === 'electronics' ? 'Electronics' : 'Furniture'} Store Dashboard
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<Add />} onClick={() => navigate('/sales/new')}>
          New Sale
        </Button>
      </Box>

      {/* Date Range Filter */}
      <Box display="flex" alignItems="center" gap={2} mb={3} flexWrap="wrap">
        <ToggleButtonGroup value={range} exclusive onChange={(_, v) => v && setRange(v)} size="small">
          <ToggleButton value="daily">Today</ToggleButton>
          <ToggleButton value="monthly">This Month</ToggleButton>
          <ToggleButton value="custom">Custom</ToggleButton>
        </ToggleButtonGroup>
        {range === 'custom' && (
          <>
            <TextField type="date" size="small" value={customStart} onChange={e => setCustomStart(e.target.value)} label="From" InputLabelProps={{ shrink: true }} sx={{ width: 150 }} />
            <TextField type="date" size="small" value={customEnd}   onChange={e => setCustomEnd(e.target.value)}   label="To"   InputLabelProps={{ shrink: true }} sx={{ width: 150 }} />
          </>
        )}
      </Box>

      {/* Stat Cards */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard title="Total Sales" value={formatCurrency(stats.totalSales)} icon={<TrendingUp />} color="primary" loading={loading} />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard title="Today's Sales" value={formatCurrency(stats.todaySales)} icon={<AttachMoney />} color="success" loading={loading} />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard title={`Invoices (${range === 'daily' ? 'Today' : range === 'monthly' ? 'This Month' : 'Range'})`} value={stats.invoiceCount} icon={<Receipt />} color="info" loading={loading} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Total Customers" value={stats.totalCustomers} icon={<People />} color="secondary" loading={loading} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Total Products" value={stats.totalProducts} icon={<Inventory2 />} color="warning" loading={loading} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Purchases" value={stats.totalPurchases} icon={<ShoppingCart />} color="error" loading={loading} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Pending Payments" value={stats.pendingSales} icon={<Pending />} color="warning" loading={loading} />
        </Grid>
      </Grid>

      {/* Chart + Quick Actions */}
      <Grid container spacing={2}>
        <Grid item xs={12} md={8}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} mb={2}>Sales – Last 7 Days</Typography>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => formatCurrency(v)} />
                  <Bar dataKey="sales" fill={theme.palette.primary.main} radius={[4, 4, 0, 0]} name="Sales" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} mb={2}>Quick Actions</Typography>
              <Grid container spacing={1.5}>
                <Grid item xs={12}>
                  <QuickAction label="New Sale"        icon={<Add />}        color="primary"   onClick={() => navigate('/sales/new')}  />
                </Grid>
                <Grid item xs={12}>
                  <QuickAction label="Add Customer"    icon={<People />}     color="info"      onClick={() => navigate('/customers')}  />
                </Grid>
                <Grid item xs={12}>
                  <QuickAction label="Add Product"     icon={<Inventory2 />} color="secondary" onClick={() => navigate('/products')}   />
                </Grid>
                <Grid item xs={12}>
                  <QuickAction label="Record Purchase" icon={<ShoppingCart />} color="warning" onClick={() => navigate('/purchases')}  />
                </Grid>
                <Grid item xs={12}>
                  <QuickAction label="View Inventory"  icon={<Inventory2 />} color="success"   onClick={() => navigate('/inventory')}  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;