import React, { useState, useEffect } from 'react';
import {
  Box, Grid, Card, CardContent, Typography, Button, Chip,
  ToggleButton, ToggleButtonGroup, Skeleton, Avatar, Divider,
  useTheme, TextField,
} from '@mui/material';
import {
  TrendingUp, People, Inventory2, PointOfSale,
  ShoppingCart, Add, ArrowUpward, ArrowDownward,
  AttachMoney, Pending, LocalShipping,
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

const Dashboard = () => {
  const { db, userProfile, storeType } = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();
  const [range, setRange] = useState('monthly');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalSales: 0, totalCustomers: 0, totalProducts: 0,
    totalPurchases: 0, pendingSales: 0, todaySales: 0,
  });
  const [chartData, setChartData] = useState([]);
  const [customStart, setCustomStart] = useState(dayjs().subtract(7, 'day').format('YYYY-MM-DD'));
  const [customEnd, setCustomEnd] = useState(dayjs().format('YYYY-MM-DD'));

  useEffect(() => {
    if (!db) return;
    fetchStats();
    fetchChartData();
  }, [db, range, customStart, customEnd]);

  const getDateRange = () => {
    const now = dayjs();
    if (range === 'daily') return { start: now.startOf('day'), end: now.endOf('day') };
    if (range === 'monthly') return { start: now.startOf('month'), end: now.endOf('month') };
    if (range === 'custom') return { start: dayjs(customStart), end: dayjs(customEnd) };
    return { start: now.startOf('month'), end: now.endOf('month') };
  };

  const fetchStats = async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange();
      const startTs = Timestamp.fromDate(start.toDate());
      const endTs = Timestamp.fromDate(end.toDate());

      const [custSnap, prodSnap, salesSnap, purchaseSnap, pendingSnap] = await Promise.all([
        getCountFromServer(collection(db, 'customers')),
        getCountFromServer(collection(db, 'products')),
        getDocs(query(collection(db, 'sales'), where('createdAt', '>=', startTs), where('createdAt', '<=', endTs))),
        getCountFromServer(collection(db, 'purchases')),
        getCountFromServer(query(collection(db, 'sales'), where('paymentType', '==', 'pending_payment'))),
      ]);

      const totalSales = salesSnap.docs.reduce((sum, d) => sum + (d.data().grandTotal || 0), 0);

      // Today's sales
      const todayStart = Timestamp.fromDate(dayjs().startOf('day').toDate());
      const todayEnd = Timestamp.fromDate(dayjs().endOf('day').toDate());
      const todaySnap = await getDocs(query(
        collection(db, 'sales'),
        where('createdAt', '>=', todayStart),
        where('createdAt', '<=', todayEnd),
      ));
      const todaySales = todaySnap.docs.reduce((sum, d) => sum + (d.data().grandTotal || 0), 0);

      setStats({
        totalSales,
        totalCustomers: custSnap.data().count,
        totalProducts: prodSnap.data().count,
        totalPurchases: purchaseSnap.data().count,
        pendingSales: pendingSnap.data().count,
        todaySales,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchChartData = async () => {
    try {
      const days = [];
      const today = dayjs();
      for (let i = 6; i >= 0; i--) {
        const day = today.subtract(i, 'day');
        const start = Timestamp.fromDate(day.startOf('day').toDate());
        const end = Timestamp.fromDate(day.endOf('day').toDate());
        const snap = await getDocs(query(
          collection(db, 'sales'),
          where('createdAt', '>=', start),
          where('createdAt', '<=', end),
        ));
        const amount = snap.docs.reduce((s, d) => s + (d.data().grandTotal || 0), 0);
        days.push({ day: day.format('DD MMM'), sales: amount, count: snap.size });
      }
      setChartData(days);
    } catch (err) {
      console.error(err);
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
            <TextField type="date" size="small" value={customEnd} onChange={e => setCustomEnd(e.target.value)} label="To" InputLabelProps={{ shrink: true }} sx={{ width: 150 }} />
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
          <StatCard title="Pending Payments" value={stats.pendingSales} subtitle="invoices pending" icon={<Pending />} color="warning" loading={loading} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Customers" value={stats.totalCustomers} icon={<People />} color="info" loading={loading} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Products" value={stats.totalProducts} icon={<Inventory2 />} color="secondary" loading={loading} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Purchases" value={stats.totalPurchases} icon={<LocalShipping />} color="primary" loading={loading} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Active Sales" value={stats.totalSales > 0 ? '↑' : '-'} subtitle="this period" icon={<PointOfSale />} color="success" loading={loading} />
        </Grid>
      </Grid>

      {/* Chart + Quick Actions */}
      <Grid container spacing={2}>
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} mb={2}>Sales — Last 7 Days</Typography>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => formatCurrency(v)} />
                  <Bar dataKey="sales" fill={theme.palette.primary.main} radius={[4,4,0,0]} name="Sales" />
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
                  <QuickAction label="New Sale" icon={<Add />} color="primary" onClick={() => navigate('/sales/new')} />
                </Grid>
                <Grid item xs={12}>
                  <QuickAction label="Add Customer" icon={<People />} color="info" onClick={() => navigate('/customers')} />
                </Grid>
                <Grid item xs={12}>
                  <QuickAction label="Add Product" icon={<Inventory2 />} color="secondary" onClick={() => navigate('/products')} />
                </Grid>
                <Grid item xs={12}>
                  <QuickAction label="Record Purchase" icon={<ShoppingCart />} color="warning" onClick={() => navigate('/purchases')} />
                </Grid>
                <Grid item xs={12}>
                  <QuickAction label="View Inventory" icon={<Inventory2 />} color="success" onClick={() => navigate('/inventory')} />
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
