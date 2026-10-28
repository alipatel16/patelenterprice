import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Grid, Card, CardContent, Typography, Button, Alert,
  ToggleButton, ToggleButtonGroup, Skeleton, Avatar,
  useTheme, TextField, CircularProgress,
} from '@mui/material';
import {
  TrendingUp, People, Inventory2,
  ShoppingCart, Add, ArrowUpward, ArrowDownward,
  AttachMoney, Pending, Receipt,
  BarChart as BarChartIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency } from '../../utils';
import { dashboardDate, loadDashboard } from '../../data/dashboard';
import { invalidateCollections, subscribeInvalidation } from '../../data/query';

const DASHBOARD_COLLECTIONS = ['sales', 'customers', 'products', 'purchases'];

// ─── StatCard ─────────────────────────────────────────────────────────────────

const StatCard = ({ title, value, subtitle, icon, color, trend, loading }) => {
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
  const { db, user, userProfile, storeType } = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();

  const [range, setRange] = useState('daily');
  const [customStart, setCustomStart] = useState(() => dashboardDate(new Date(), -7));
  const [customEnd, setCustomEnd] = useState(() => dashboardDate());
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const revision = useRef(0);
  const hasLoaded = result !== null;
  const stats = result?.stats;
  const chartData = result?.chartData || [];

  // A filter edit clears the previous result; only Load starts a request.
  useEffect(() => {
    revision.current++;
    setResult(null); setError(null); setLoading(false);
  }, [range, customStart, customEnd]);

  useEffect(() => {
    revision.current++;
    setRange('daily'); setResult(null); setError(null); setLoading(false);
    return () => { revision.current++; };
  }, [db, storeType, user?.uid, userProfile?.role]);

  useEffect(() => subscribeInvalidation(db, names => {
    if (names && !names.some(name => DASHBOARD_COLLECTIONS.includes(name))) return;
    revision.current++;
    setResult(null); setError(null); setLoading(false);
    if (!names) setRange('daily');
  }), [db]);

  // Today and the seven-day chart become stale at India midnight, even if
  // the browser is suspended. Expire the display without issuing any reads.
  useEffect(() => {
    let displayedDay = dashboardDate();
    let timer;
    const checkDay = () => {
      const today = dashboardDate();
      if (today !== displayedDay) {
        displayedDay = today;
        revision.current++;
        setResult(null); setError(null); setLoading(false);
      }
      clearTimeout(timer);
      const nextMidnight = new Date(`${today}T00:00:00+05:30`).getTime() + 86400000;
      timer = setTimeout(checkDay, Math.max(1, nextMidnight - Date.now()));
    };
    checkDay();
    window.addEventListener('focus', checkDay);
    document.addEventListener('visibilitychange', checkDay);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', checkDay);
      document.removeEventListener('visibilitychange', checkDay);
    };
  }, [db]);

  const fetchAllData = async () => {
    if (!db) return;
    // An explicit refresh bypasses the shared 60-second cache, while the
    // selected day and matching chart bucket still share the same aggregates.
    invalidateCollections(db, DASHBOARD_COLLECTIONS);
    const request = ++revision.current;
    setLoading(true); setError(null);
    try {
      const next = await loadDashboard(db, { range, start: customStart, end: customEnd });
      if (request === revision.current) setResult(next);
    } catch (failure) {
      if (request === revision.current) setError(failure.message || 'Dashboard could not load. Please try again.');
    } finally {
      if (request === revision.current) setLoading(false);
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
          size="small" variant="outlined" startIcon={loading ? <CircularProgress size={14} /> : <BarChartIcon />}
          onClick={fetchAllData} disabled={loading || !db}
          sx={{ ml: 'auto' }}
        >
          {loading ? 'Loading…' : 'Load Dashboard Stats'}
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
      {result && (
        <Typography variant="caption" color="text.secondary" display="block" mb={2}>
          Last refreshed: {new Intl.DateTimeFormat('en-IN', {
            timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short',
          }).format(result.refreshedAt)} IST
        </Typography>
      )}

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
                Use Load Dashboard Stats above to load the selected period.
              </Typography>
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