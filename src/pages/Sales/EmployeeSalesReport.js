// src/pages/Sales/EmployeeSalesReport.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Chip, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, MenuItem, Button, Stack, Alert, Divider, Avatar,
  ToggleButton, ToggleButtonGroup, LinearProgress, IconButton, Tooltip,
  Collapse,
} from '@mui/material';
import {
  BarChart as BarChartIcon, TrendingUp, Person, CalendarMonth,
  Refresh, ExpandMore, ExpandLess, Today, DateRange,
} from '@mui/icons-material';
import {
  collection, query, where, getDocs, orderBy,
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { formatCurrency, formatDate } from '../../utils';
import { PAYMENT_LABELS } from '../../constants';
import { useMediaQuery, useTheme } from '@mui/material';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getTodayStr = () => new Date().toISOString().split('T')[0];

const getMonthRange = (year, month) => {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
};

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const initials = (name = '') =>
  name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');

// ─── Summary Card ─────────────────────────────────────────────────────────────
const SummaryCard = ({ label, value, sub, color = 'primary', icon }) => (
  <Card sx={{ height: '100%' }}>
    <CardContent>
      <Box display="flex" alignItems="flex-start" justifyContent="space-between">
        <Box>
          <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase">
            {label}
          </Typography>
          <Typography variant="h5" fontWeight={800} color={`${color}.main`} mt={0.5}>
            {value}
          </Typography>
          {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
        </Box>
        <Box sx={{ p: 1, borderRadius: 2, bgcolor: `${color}.50`, color: `${color}.main` }}>
          {icon}
        </Box>
      </Box>
    </CardContent>
  </Card>
);

// ─── Employee Row ─────────────────────────────────────────────────────────────
const EmployeeRow = ({ emp, rank, isMobile }) => {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = (emp.sales || []).length > 0;

  return (
    <>
      <TableRow
        hover
        sx={{
          bgcolor: rank === 1 ? 'warning.50' : rank === 2 ? 'grey.50' : 'inherit',
          cursor: hasDetails ? 'pointer' : 'default',
        }}
        onClick={() => hasDetails && setExpanded(e => !e)}
      >
        <TableCell>
          <Box display="flex" alignItems="center" gap={1.5}>
            <Avatar
              sx={{
                width: 32, height: 32, fontSize: 13, fontWeight: 700,
                bgcolor: rank === 1 ? 'warning.main' : rank === 2 ? 'grey.500' : rank === 3 ? 'warning.700' : 'primary.main',
              }}
            >
              {rank <= 3 ? ['🥇','🥈','🥉'][rank - 1] : initials(emp.name)}
            </Avatar>
            <Box>
              <Typography variant="body2" fontWeight={600}>{emp.name}</Typography>
              {!isMobile && emp.email && (
                <Typography variant="caption" color="text.secondary">{emp.email}</Typography>
              )}
            </Box>
          </Box>
        </TableCell>
        <TableCell align="center">
          <Chip label={emp.invoiceCount} color="primary" size="small" />
        </TableCell>
        <TableCell align="right">
          <Typography fontWeight={700} color="success.main">{formatCurrency(emp.totalAmount)}</Typography>
        </TableCell>
        {!isMobile && (
          <TableCell align="right">
            <Typography variant="body2" color="text.secondary">
              {emp.invoiceCount > 0 ? formatCurrency(emp.totalAmount / emp.invoiceCount) : '—'}
            </Typography>
          </TableCell>
        )}
        {!isMobile && (
          <TableCell align="center">
            <Chip
              label={emp.topPaymentType ? (PAYMENT_LABELS[emp.topPaymentType] || emp.topPaymentType) : '—'}
              size="small"
              variant="outlined"
            />
          </TableCell>
        )}
        <TableCell align="center">
          {hasDetails && (
            <IconButton size="small" onClick={e => { e.stopPropagation(); setExpanded(x => !x); }}>
              {expanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
            </IconButton>
          )}
        </TableCell>
      </TableRow>

      {/* Expanded sale details */}
      <TableRow>
        <TableCell colSpan={isMobile ? 4 : 6} sx={{ p: 0, borderBottom: expanded ? undefined : 'none' }}>
          <Collapse in={expanded} timeout="auto" unmountOnExit>
            <Box sx={{ p: 2, bgcolor: 'action.hover' }}>
              <Typography variant="caption" fontWeight={700} color="text.secondary" display="block" mb={1}>
                INDIVIDUAL SALES
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Invoice #</TableCell>
                      <TableCell>Customer</TableCell>
                      <TableCell>Date</TableCell>
                      <TableCell align="right">Amount</TableCell>
                      <TableCell>Payment Type</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(emp.sales || []).map(s => (
                      <TableRow key={s.id} hover>
                        <TableCell>
                          <Typography variant="caption" fontWeight={600}>{s.invoiceNumber}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption">{s.customerName}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption">{formatDate(s.saleDate)}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="caption" fontWeight={700} color="success.main">
                            {formatCurrency(s.grandTotal)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={PAYMENT_LABELS[s.paymentType] || s.paymentType || '—'}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: 10 }}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const EmployeeSalesReport = () => {
  const { db, isAdmin } = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const today = getTodayStr();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // ── Filter mode: 'today' | 'month' | 'custom'
  const [mode, setMode] = useState('month');
  const [selYear, setSelYear] = useState(currentYear);
  const [selMonth, setSelMonth] = useState(currentMonth);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);

  const [employees, setEmployees] = useState([]);
  const [report, setReport] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Redirect non-admin ──
  useEffect(() => {
    if (!isAdmin) { toast.error('Admin access required'); navigate('/dashboard'); }
  }, [isAdmin, navigate]);

  // ── Load employees ──
  useEffect(() => {
    if (!db) return;
    getDocs(query(collection(db, 'users'), where('role', '==', 'employee'), orderBy('name')))
      .then(snap => setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {});
  }, [db]);

  // ── Compute date range ──
  const getRange = useCallback(() => {
    if (mode === 'today') return { start: today, end: today };
    if (mode === 'month') return getMonthRange(selYear, selMonth);
    return { start: dateFrom, end: dateTo };
  }, [mode, today, selYear, selMonth, dateFrom, dateTo]);

  // ── Load sales & build report ──
  const loadReport = useCallback(async () => {
    if (!db || employees.length === 0) return;
    setLoading(true);
    try {
      const { start, end } = getRange();
      if (start > end) { toast.error('Start date must be before end date'); setLoading(false); return; }

      // Fetch all sales in range
      const salesSnap = await getDocs(
        query(
          collection(db, 'sales'),
          where('saleDate', '>=', start),
          where('saleDate', '<=', end),
          orderBy('saleDate', 'desc'),
        )
      );
      const allSales = salesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Build a map: salesperson name → data
      // Note: salesperson field in sale doc stores the name (string), not uid
      // We also need to match against employees by name
      const empMap = {};
      employees.forEach(emp => {
        empMap[emp.name?.toLowerCase()] = {
          id: emp.id,
          name: emp.name,
          email: emp.email,
          companyId: emp.companyId,
          invoiceCount: 0,
          totalAmount: 0,
          sales: [],
          paymentTypeCounts: {},
        };
      });

      // Bucket unmatched sales under "Other / Direct"
      const unmatched = {
        id: '__unmatched__',
        name: 'Other / Direct',
        email: '',
        invoiceCount: 0,
        totalAmount: 0,
        sales: [],
        paymentTypeCounts: {},
      };

      allSales.forEach(sale => {
        const spName = (sale.salesperson || '').toLowerCase().trim();
        const target = empMap[spName] || unmatched;
        target.invoiceCount += 1;
        target.totalAmount += sale.grandTotal || 0;
        target.sales.push(sale);
        const pt = sale.paymentType || 'unknown';
        target.paymentTypeCounts[pt] = (target.paymentTypeCounts[pt] || 0) + 1;
      });

      // Build sorted result
      const rows = [...Object.values(empMap), unmatched]
        .filter(e => e.invoiceCount > 0 || e.id !== '__unmatched__')
        .map(e => ({
          ...e,
          topPaymentType: Object.entries(e.paymentTypeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
        }))
        .sort((a, b) => b.totalAmount - a.totalAmount);

      setReport(rows);
    } catch (e) {
      toast.error('Failed to load report: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [db, employees, getRange]);

  useEffect(() => { loadReport(); }, [loadReport, refreshKey]);

  // ── Summary stats ──
  const totalSales = report.reduce((s, r) => s + r.totalAmount, 0);
  const totalInvoices = report.reduce((s, r) => s + r.invoiceCount, 0);
  const topEmployee = report.find(r => r.id !== '__unmatched__' && r.invoiceCount > 0);
  const { start, end } = getRange();

  const yearOptions = [];
  for (let y = currentYear; y >= currentYear - 4; y--) yearOptions.push(y);

  if (!isAdmin) return null;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100, mx: 'auto' }}>
      {/* Header */}
      <Box display="flex" alignItems={{ xs: 'flex-start', sm: 'center' }}
        flexDirection={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between" gap={2} mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700} display="flex" alignItems="center" gap={1}>
            <BarChartIcon color="primary" />
            Employee Sales Report
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Admin view — track individual employee performance
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={() => setRefreshKey(k => k + 1)} disabled={loading}>
            <Refresh />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Filter Panel */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack spacing={2}>
            {/* Mode toggle */}
            <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
              <Typography variant="body2" fontWeight={600} color="text.secondary">
                Date Range:
              </Typography>
              <ToggleButtonGroup
                value={mode}
                exclusive
                onChange={(_, v) => v && setMode(v)}
                size="small"
              >
                <ToggleButton value="today">
                  <Today fontSize="small" sx={{ mr: 0.5 }} />
                  Today
                </ToggleButton>
                <ToggleButton value="month">
                  <CalendarMonth fontSize="small" sx={{ mr: 0.5 }} />
                  Month
                </ToggleButton>
                <ToggleButton value="custom">
                  <DateRange fontSize="small" sx={{ mr: 0.5 }} />
                  Custom
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {/* Month/Year selectors */}
            {mode === 'month' && (
              <Grid container spacing={2}>
                <Grid item xs={6} sm={4} md={3}>
                  <TextField
                    fullWidth size="small" select label="Month" value={selMonth}
                    onChange={e => setSelMonth(Number(e.target.value))}
                  >
                    {MONTHS.map((m, i) => (
                      <MenuItem key={i + 1} value={i + 1}>{m}</MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={6} sm={4} md={3}>
                  <TextField
                    fullWidth size="small" select label="Year" value={selYear}
                    onChange={e => setSelYear(Number(e.target.value))}
                  >
                    {yearOptions.map(y => (
                      <MenuItem key={y} value={y}>{y}</MenuItem>
                    ))}
                  </TextField>
                </Grid>
              </Grid>
            )}

            {/* Custom date range */}
            {mode === 'custom' && (
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} sm={5} md={4}>
                  <TextField
                    fullWidth size="small" type="date" label="From"
                    value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid item xs={12} sm={5} md={4}>
                  <TextField
                    fullWidth size="small" type="date" label="To"
                    value={dateTo} onChange={e => setDateTo(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ min: dateFrom }}
                  />
                </Grid>
                <Grid item xs={12} sm={2} md={2}>
                  <Button fullWidth variant="contained" onClick={() => setRefreshKey(k => k + 1)}>
                    Apply
                  </Button>
                </Grid>
              </Grid>
            )}

            {/* Active range display */}
            <Box sx={{ p: 1.5, bgcolor: 'primary.50', borderRadius: 2, display: 'inline-flex', alignItems: 'center', gap: 1 }}>
              <CalendarMonth sx={{ fontSize: 16, color: 'primary.main' }} />
              <Typography variant="caption" color="primary.main" fontWeight={600}>
                {mode === 'today'
                  ? `Today — ${formatDate(today)}`
                  : mode === 'month'
                  ? `${MONTHS[selMonth - 1]} ${selYear}`
                  : `${formatDate(start)} → ${formatDate(end)}`}
              </Typography>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={6} sm={3}>
          <SummaryCard
            label="Total Revenue"
            value={formatCurrency(totalSales)}
            sub={`${totalInvoices} invoices`}
            color="success"
            icon={<TrendingUp />}
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <SummaryCard
            label="Total Invoices"
            value={totalInvoices}
            sub="across all employees"
            color="primary"
            icon={<BarChartIcon />}
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <SummaryCard
            label="Top Performer"
            value={topEmployee?.name?.split(' ')[0] || '—'}
            sub={topEmployee ? formatCurrency(topEmployee.totalAmount) : ''}
            color="warning"
            icon={<Person />}
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <SummaryCard
            label="Active Employees"
            value={report.filter(r => r.id !== '__unmatched__' && r.invoiceCount > 0).length}
            sub={`of ${employees.length} total`}
            color="info"
            icon={<Person />}
          />
        </Grid>
      </Grid>

      {/* Report Table */}
      <Card>
        {loading ? (
          <Box>
            <LinearProgress />
            <Box display="flex" justifyContent="center" py={6}>
              <CircularProgress />
            </Box>
          </Box>
        ) : report.length === 0 ? (
          <Box textAlign="center" py={6}>
            <BarChartIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography color="text.secondary">No sales found for the selected period</Typography>
            <Typography variant="caption" color="text.secondary">
              Try changing the date range or check if sales have been recorded
            </Typography>
          </Box>
        ) : (
          <>
            <Box sx={{ p: 2, pb: 0 }}>
              <Typography variant="subtitle2" fontWeight={700} color="text.secondary">
                EMPLOYEE PERFORMANCE BREAKDOWN
              </Typography>
              {!isMobile && (
                <Typography variant="caption" color="text.secondary">
                  Click any row to see individual sales · Sorted by revenue
                </Typography>
              )}
            </Box>
            <TableContainer>
              <Table size={isMobile ? 'small' : 'medium'}>
                <TableHead>
                  <TableRow>
                    <TableCell>Employee</TableCell>
                    <TableCell align="center">Invoices</TableCell>
                    <TableCell align="right">Total Revenue</TableCell>
                    {!isMobile && <TableCell align="right">Avg per Sale</TableCell>}
                    {!isMobile && <TableCell align="center">Top Payment Type</TableCell>}
                    <TableCell align="center">Details</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {report.map((emp, i) => (
                    <EmployeeRow
                      key={emp.id}
                      emp={emp}
                      rank={emp.id !== '__unmatched__' ? i + 1 : 999}
                      isMobile={isMobile}
                    />
                  ))}
                  {/* Totals row */}
                  <TableRow sx={{ bgcolor: 'action.hover', fontWeight: 'bold' }}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={700}>Total</Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Chip label={totalInvoices} size="small" color="primary" />
                    </TableCell>
                    <TableCell align="right">
                      <Typography fontWeight={800} color="success.main">{formatCurrency(totalSales)}</Typography>
                    </TableCell>
                    {!isMobile && (
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={600}>
                          {totalInvoices > 0 ? formatCurrency(totalSales / totalInvoices) : '—'}
                        </Typography>
                      </TableCell>
                    )}
                    {!isMobile && <TableCell />}
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>

            {/* Per-day breakdown (only for month/custom) */}
            {mode !== 'today' && (() => {
              // Build per-day totals across all employees
              const dayMap = {};
              report.forEach(emp => {
                (emp.sales || []).forEach(s => {
                  const d = s.saleDate;
                  if (!dayMap[d]) dayMap[d] = { date: d, total: 0, count: 0 };
                  dayMap[d].total += s.grandTotal || 0;
                  dayMap[d].count += 1;
                });
              });
              const days = Object.values(dayMap).sort((a, b) => b.date.localeCompare(a.date));
              if (days.length === 0) return null;
              return (
                <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="subtitle2" fontWeight={700} color="text.secondary" mb={1}>
                    DAILY BREAKDOWN
                  </Typography>
                  <Grid container spacing={1}>
                    {days.map(day => (
                      <Grid key={day.date} item xs={6} sm={4} md={3}>
                        <Box sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                          <Typography variant="caption" color="text.secondary">{formatDate(day.date)}</Typography>
                          <Typography variant="body2" fontWeight={700} color="success.main">{formatCurrency(day.total)}</Typography>
                          <Typography variant="caption" color="text.secondary">{day.count} sale{day.count !== 1 ? 's' : ''}</Typography>
                        </Box>
                      </Grid>
                    ))}
                  </Grid>
                </Box>
              );
            })()}
          </>
        )}
      </Card>

      {/* Note about matching */}
      <Alert severity="info" sx={{ mt: 2 }} icon={false}>
        <Typography variant="caption">
          Sales are matched to employees by the <strong>Salesperson</strong> name entered during sale creation.
          Make sure salesperson names match employee names exactly for accurate reporting.
        </Typography>
      </Alert>
    </Box>
  );
};

export default EmployeeSalesReport;