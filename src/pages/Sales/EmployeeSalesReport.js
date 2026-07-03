// src/pages/Sales/EmployeeSalesReport.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Chip, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, MenuItem, Button, Stack, Alert, Avatar, LinearProgress,
  IconButton, Collapse, Divider,
  ToggleButton, ToggleButtonGroup, useTheme, useMediaQuery,
} from '@mui/material';
import {
  TrendingUp, Person, CalendarMonth, Refresh,
  ExpandMore, ExpandLess, Today, DateRange, EmojiEvents,
  ReceiptLong, AttachMoney, Groups,
} from '@mui/icons-material';
import {
  collection, query, where, getDocs, orderBy,
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { formatCurrency, formatDate } from '../../utils';
import { PAYMENT_LABELS } from '../../constants';

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

// ─── Rank config ──────────────────────────────────────────────────────────────
const RANK_CONFIG = [
  { emoji: '🥇', bg: '#fef3c7', border: '#f59e0b', avatarBg: '#f59e0b' },
  { emoji: '🥈', bg: '#f3f4f6', border: '#9ca3af', avatarBg: '#6b7280' },
  { emoji: '🥉', bg: '#fef9f0', border: '#d97706', avatarBg: '#b45309' },
];

// ─── Stat chip ────────────────────────────────────────────────────────────────
const StatChip = ({ icon, label, value, color }) => (
  <Box sx={{
    display: 'flex', alignItems: 'center', gap: 1.5,
    px: 2, py: 1.5, borderRadius: 2,
    border: '1px solid', borderColor: `${color}.light`,
    bgcolor: `${color}.50`, flex: 1, minWidth: 130,
  }}>
    <Box sx={{
      width: 36, height: 36, borderRadius: '50%',
      bgcolor: `${color}.main`, display: 'flex',
      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      {React.cloneElement(icon, { sx: { fontSize: 18, color: '#fff' } })}
    </Box>
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" noWrap>
        {label}
      </Typography>
      <Typography variant="body1" fontWeight={800} color={`${color}.main`} noWrap>
        {value}
      </Typography>
    </Box>
  </Box>
);

// ─── Mobile Employee Card ─────────────────────────────────────────────────────
const EmployeeMobileCard = ({ emp, rank, totalRevenue }) => {
  const [open, setOpen] = useState(false);
  const cfg = RANK_CONFIG[rank - 1];
  const pct = totalRevenue > 0 ? Math.round((emp.totalAmount / totalRevenue) * 100) : 0;
  const hasSales = emp.sales.length > 0;

  return (
    <Card elevation={0} sx={{
      mb: 1.5,
      border: '1.5px solid',
      borderColor: cfg ? cfg.border : 'divider',
      bgcolor: cfg ? cfg.bg : 'background.paper',
      borderRadius: 2,
    }}>
      <CardContent sx={{ pb: '12px !important', pt: 1.5, px: 2 }}>
        {/* Top row: rank + name + revenue */}
        <Box display="flex" alignItems="center" gap={1.5}>
          <Avatar sx={{
            width: 38, height: 38, fontSize: 14, fontWeight: 700, flexShrink: 0,
            bgcolor: cfg ? cfg.avatarBg : 'primary.main',
          }}>
            {cfg ? cfg.emoji : initials(emp.name)}
          </Avatar>
          <Box flex={1} minWidth={0}>
            <Typography variant="body2" fontWeight={700} noWrap>{emp.name}</Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {emp.invoiceCount} invoice{emp.invoiceCount !== 1 ? 's' : ''}
              {emp.invoiceCount > 0 && ` · avg ${formatCurrency(emp.totalAmount / emp.invoiceCount)}`}
            </Typography>
          </Box>
          <Box textAlign="right" flexShrink={0}>
            <Typography variant="subtitle2" fontWeight={800} color="success.main">
              {formatCurrency(emp.totalAmount)}
            </Typography>
            <Typography variant="caption" color="text.secondary">{pct}% of total</Typography>
          </Box>
        </Box>

        {/* Progress bar */}
        {totalRevenue > 0 && (
          <LinearProgress
            variant="determinate"
            value={pct}
            sx={{ mt: 1.5, height: 5, borderRadius: 3,
              bgcolor: cfg ? 'rgba(0,0,0,0.08)' : 'grey.200',
              '& .MuiLinearProgress-bar': {
                bgcolor: cfg ? cfg.avatarBg : 'primary.main',
                borderRadius: 3,
              }
            }}
          />
        )}

        {/* Expand button */}
        {hasSales && (
          <Box mt={1} display="flex" justifyContent="flex-end">
            <Button
              size="small"
              variant="text"
              endIcon={open ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
              onClick={() => setOpen(o => !o)}
              sx={{ fontSize: 11, color: 'text.secondary', minWidth: 0, p: '2px 6px' }}
            >
              {open ? 'Hide' : 'View'} sales
            </Button>
          </Box>
        )}

        {/* Expanded sales */}
        <Collapse in={open} unmountOnExit>
          <Divider sx={{ my: 1 }} />
          <Stack spacing={0.75}>
            {emp.sales.map(s => (
              <Box key={s.id} sx={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                py: 0.75, px: 1, bgcolor: 'background.paper', borderRadius: 1,
                border: '1px solid', borderColor: 'divider',
              }}>
                <Box minWidth={0}>
                  <Typography variant="caption" fontWeight={700} color="primary" display="block" noWrap>
                    {s.invoiceNumber}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {s.customerName} · {formatDate(s.saleDate)}
                  </Typography>
                </Box>
                <Typography variant="caption" fontWeight={700} color="success.main" flexShrink={0} ml={1}>
                  {formatCurrency(s.grandTotal)}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Collapse>
      </CardContent>
    </Card>
  );
};

// ─── Desktop Employee Row ─────────────────────────────────────────────────────
const EmployeeDesktopRow = ({ emp, rank, totalRevenue }) => {
  const [open, setOpen] = useState(false);
  const cfg = RANK_CONFIG[rank - 1];
  const pct = totalRevenue > 0 ? Math.round((emp.totalAmount / totalRevenue) * 100) : 0;
  const hasSales = emp.sales.length > 0;

  return (
    <>
      <TableRow
        hover
        sx={{
          bgcolor: cfg ? `${cfg.bg}` : 'inherit',
          cursor: hasSales ? 'pointer' : 'default',
          '& td': { borderBottom: '1px solid', borderColor: 'divider' },
        }}
        onClick={() => hasSales && setOpen(o => !o)}
      >
        {/* Rank + Name */}
        <TableCell>
          <Box display="flex" alignItems="center" gap={1.5}>
            <Avatar sx={{
              width: 36, height: 36, fontSize: 14, fontWeight: 700,
              bgcolor: cfg ? cfg.avatarBg : 'primary.main',
            }}>
              {cfg ? cfg.emoji : initials(emp.name)}
            </Avatar>
            <Box>
              <Typography variant="body2" fontWeight={700}>{emp.name}</Typography>
              {emp.email && (
                <Typography variant="caption" color="text.secondary">{emp.email}</Typography>
              )}
            </Box>
          </Box>
        </TableCell>

        {/* Revenue bar */}
        <TableCell sx={{ width: 180 }}>
          <Box>
            <Box display="flex" justifyContent="space-between" mb={0.5}>
              <Typography variant="body2" fontWeight={700} color="success.main">
                {formatCurrency(emp.totalAmount)}
              </Typography>
              <Typography variant="caption" color="text.secondary">{pct}%</Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={pct}
              sx={{
                height: 6, borderRadius: 3,
                bgcolor: 'grey.200',
                '& .MuiLinearProgress-bar': {
                  bgcolor: cfg ? cfg.avatarBg : 'primary.main',
                  borderRadius: 3,
                }
              }}
            />
          </Box>
        </TableCell>

        {/* Invoices */}
        <TableCell align="center">
          <Chip
            label={emp.invoiceCount}
            size="small"
            color={emp.invoiceCount > 0 ? 'primary' : 'default'}
            sx={{ fontWeight: 700, minWidth: 36 }}
          />
        </TableCell>

        {/* Avg per sale */}
        <TableCell align="right">
          <Typography variant="body2" color="text.secondary">
            {emp.invoiceCount > 0 ? formatCurrency(emp.totalAmount / emp.invoiceCount) : '—'}
          </Typography>
        </TableCell>

        {/* Expand */}
        <TableCell align="center" width={48}>
          {hasSales && (
            <IconButton size="small" onClick={e => { e.stopPropagation(); setOpen(o => !o); }}>
              {open ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
            </IconButton>
          )}
        </TableCell>
      </TableRow>

      {/* Expanded sales */}
      <TableRow>
        <TableCell colSpan={5} sx={{ p: 0, border: 'none' }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ px: 2, py: 1.5, bgcolor: 'grey.50', borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="caption" fontWeight={700} color="text.secondary" display="block" mb={1}>
                INDIVIDUAL SALES — {emp.name.toUpperCase()}
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Invoice #</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Customer</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Date</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: 11 }} align="right">Amount</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Payment</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {emp.sales.map(s => (
                      <TableRow key={s.id} hover>
                        <TableCell>
                          <Typography variant="caption" fontWeight={600} color="primary">
                            {s.invoiceNumber}
                          </Typography>
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

// ─── Zero-sale employees section ──────────────────────────────────────────────
const ZeroSalesBadge = ({ employees }) => {
  if (employees.length === 0) return null;
  return (
    <Box sx={{ px: 2, py: 1.5, borderTop: '1px dashed', borderColor: 'divider' }}>
      <Typography variant="caption" color="text.disabled" fontWeight={600} display="block" mb={1}>
        NO SALES IN THIS PERIOD
      </Typography>
      <Box display="flex" flexWrap="wrap" gap={1}>
        {employees.map(e => (
          <Chip
            key={e.id}
            avatar={<Avatar sx={{ bgcolor: 'grey.400', fontSize: 11 }}>{initials(e.name)}</Avatar>}
            label={e.name}
            size="small"
            variant="outlined"
            sx={{ color: 'text.disabled', borderColor: 'divider' }}
          />
        ))}
      </Box>
    </Box>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const EmployeeSalesReport = () => {
  const { db, isAdmin } = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const today = getTodayStr();
  const currentYear  = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // ── Filters ─────────────────────────────────────────────────────────────────
  // Default: today (per user request)
  const [mode,     setMode]     = useState('today');
  const [selYear,  setSelYear]  = useState(currentYear);
  const [selMonth, setSelMonth] = useState(currentMonth);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo,   setDateTo]   = useState(today);

  // ── Data ────────────────────────────────────────────────────────────────────
  const [employees, setEmployees] = useState([]);
  const [report,    setReport]    = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [loaded,    setLoaded]    = useState(false);  // has at least one fetch completed

  // Guard: prevent double-fires while employees is loading
  const empLoadedRef = useRef(false);

  // Admin guard
  useEffect(() => {
    if (!isAdmin) { toast.error('Admin access required'); navigate('/dashboard'); }
  }, [isAdmin, navigate]);

  // Load employees once
  useEffect(() => {
    if (!db) return;
    getDocs(query(collection(db, 'users'), where('role', '==', 'employee'), orderBy('name')))
      .then(snap => {
        setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        empLoadedRef.current = true;
      })
      .catch(() => {});
  }, [db]);

  // ── Compute active date range ────────────────────────────────────────────────
  const getRange = useCallback(() => {
    if (mode === 'today')  return { start: today, end: today };
    if (mode === 'month')  return getMonthRange(selYear, selMonth);
    return { start: dateFrom, end: dateTo };
  }, [mode, today, selYear, selMonth, dateFrom, dateTo]);

  // ── Fetch & aggregate ────────────────────────────────────────────────────────
  const loadReport = useCallback(async () => {
    if (!db || !empLoadedRef.current) return;
    const { start, end } = getRange();
    if (start > end) { toast.error('Start date must be before end date'); return; }

    setLoading(true);
    try {
      const salesSnap = await getDocs(
        query(
          collection(db, 'sales'),
          where('saleDate', '>=', start),
          where('saleDate', '<=', end),
          orderBy('saleDate', 'desc'),
        )
      );
      const allSales = salesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Build lookup: employee name (lowercase) → employee data
      const empMap = {};
      employees.forEach(emp => {
        empMap[(emp.name || '').toLowerCase().trim()] = {
          id:             emp.id,
          name:           emp.name,
          email:          emp.email || '',
          invoiceCount:   0,
          totalAmount:    0,
          sales:          [],
        };
      });

      // Bucket for sales with no matching employee
      const unmatched = {
        id: '__other__', name: 'Other / Direct',
        email: '', invoiceCount: 0, totalAmount: 0, sales: [],
      };

      allSales.forEach(sale => {
        const key = (sale.salesperson || '').toLowerCase().trim();
        const bucket = empMap[key] || unmatched;
        bucket.invoiceCount  += 1;
        bucket.totalAmount   += sale.grandTotal || 0;
        bucket.sales.push(sale);
      });

      // Build ranked list: only employees, sorted by revenue desc
      const rankedEmployees = Object.values(empMap)
        .sort((a, b) => b.totalAmount - a.totalAmount);

      // Append unmatched only if it has sales
      const rows = unmatched.invoiceCount > 0
        ? [...rankedEmployees, unmatched]
        : rankedEmployees;

      setReport(rows);
      setLoaded(true);
    } catch (e) {
      toast.error('Failed to load: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [db, employees, getRange]);

  // Auto-load when employees ready OR filters change (except custom — wait for Apply)
  useEffect(() => {
    if (employees.length === 0) return;
    if (mode !== 'custom') loadReport();
  }, [employees, mode, selYear, selMonth]);

  // ── Derived stats ────────────────────────────────────────────────────────────
  const totalRevenue  = report.reduce((s, r) => s + r.totalAmount, 0);
  const totalInvoices = report.reduce((s, r) => s + r.invoiceCount, 0);
  const activeEmps    = report.filter(r => r.id !== '__other__' && r.invoiceCount > 0);
  const zeroEmps      = report.filter(r => r.id !== '__other__' && r.invoiceCount === 0);
  const topPerformer  = activeEmps[0];
  const { start, end } = getRange();

  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

  const periodLabel =
    mode === 'today' ? `Today — ${formatDate(today)}`
    : mode === 'month' ? `${MONTHS[selMonth - 1]} ${selYear}`
    : `${formatDate(start)} → ${formatDate(end)}`;

  if (!isAdmin) return null;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1000, mx: 'auto' }}>

      {/* ── Header ── */}
      <Box display="flex" alignItems={{ xs: 'flex-start', sm: 'center' }}
        flexDirection={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between" gap={1.5} mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700} display="flex" alignItems="center" gap={1}>
            <EmojiEvents color="warning" />
            Employee Sales Report
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {periodLabel}
          </Typography>
        </Box>
        <IconButton onClick={loadReport} disabled={loading} size="small" sx={{ border: '1px solid', borderColor: 'divider' }}>
          {loading ? <CircularProgress size={18} /> : <Refresh fontSize="small" />}
        </IconButton>
      </Box>

      {/* ── Filter controls ── */}
      <Card elevation={0} sx={{ mb: 2.5, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <CardContent sx={{ pb: '14px !important', pt: 1.5, px: 2 }}>
          <Stack spacing={1.5}>
            {/* Mode toggle */}
            <ToggleButtonGroup
              value={mode} exclusive
              onChange={(_, v) => v && setMode(v)}
              size="small"
              fullWidth={isMobile}
            >
              <ToggleButton value="today" sx={{ gap: 0.5, fontSize: 13 }}>
                <Today fontSize="small" />
                Today
              </ToggleButton>
              <ToggleButton value="month" sx={{ gap: 0.5, fontSize: 13 }}>
                <CalendarMonth fontSize="small" />
                This Month
              </ToggleButton>
              <ToggleButton value="custom" sx={{ gap: 0.5, fontSize: 13 }}>
                <DateRange fontSize="small" />
                Custom
              </ToggleButton>
            </ToggleButtonGroup>

            {/* Month + Year pickers */}
            {mode === 'month' && (
              <Grid container spacing={1.5}>
                <Grid item xs={6} sm={4}>
                  <TextField fullWidth size="small" select label="Month" value={selMonth}
                    onChange={e => setSelMonth(Number(e.target.value))}>
                    {MONTHS.map((m, i) => (
                      <MenuItem key={i + 1} value={i + 1}>{m}</MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <TextField fullWidth size="small" select label="Year" value={selYear}
                    onChange={e => setSelYear(Number(e.target.value))}>
                    {yearOptions.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
                  </TextField>
                </Grid>
              </Grid>
            )}

            {/* Custom date range */}
            {mode === 'custom' && (
              <Grid container spacing={1.5} alignItems="center">
                <Grid item xs={12} sm={4}>
                  <TextField fullWidth size="small" type="date" label="From"
                    value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField fullWidth size="small" type="date" label="To"
                    value={dateTo} onChange={e => setDateTo(e.target.value)}
                    InputLabelProps={{ shrink: true }} inputProps={{ min: dateFrom }} />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Button fullWidth variant="contained" onClick={loadReport} disabled={loading}>
                    {loading ? 'Loading…' : 'Apply'}
                  </Button>
                </Grid>
              </Grid>
            )}
          </Stack>
        </CardContent>
      </Card>

      {/* ── Summary stats ── */}
      {loaded && !loading && (
        <Box
          sx={{
            display: 'flex', gap: 1.5, mb: 2.5,
            overflowX: 'auto', pb: 0.5,
            // hide scrollbar on mobile
            '&::-webkit-scrollbar': { display: 'none' },
          }}
        >
          <StatChip
            icon={<AttachMoney />}
            label="Total Revenue"
            value={formatCurrency(totalRevenue)}
            color="success"
          />
          <StatChip
            icon={<ReceiptLong />}
            label="Invoices"
            value={totalInvoices}
            color="primary"
          />
          <StatChip
            icon={<EmojiEvents />}
            label="Top Performer"
            value={topPerformer?.name?.split(' ')[0] || '—'}
            color="warning"
          />
          <StatChip
            icon={<Groups />}
            label="Active"
            value={`${activeEmps.length}/${employees.length}`}
            color="info"
          />
        </Box>
      )}

      {/* ── Loading ── */}
      {loading && (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <LinearProgress />
          <Box display="flex" justifyContent="center" py={6}>
            <CircularProgress />
          </Box>
        </Card>
      )}

      {/* ── Empty state ── */}
      {loaded && !loading && totalInvoices === 0 && (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <Box textAlign="center" py={6} px={2}>
            <EmojiEvents sx={{ fontSize: 52, color: 'text.disabled', mb: 1.5 }} />
            <Typography variant="h6" fontWeight={700} color="text.secondary" mb={0.5}>
              No sales recorded
            </Typography>
            <Typography variant="body2" color="text.disabled">
              {mode === 'today'
                ? 'No sales have been made today yet.'
                : `No sales found for ${periodLabel}.`}
            </Typography>
          </Box>
        </Card>
      )}

      {/* ── Mobile: Card list ── */}
      {loaded && !loading && isMobile && activeEmps.length > 0 && (
        <Box>
          {/* Active employees */}
          {activeEmps.map((emp, i) => (
            <EmployeeMobileCard key={emp.id} emp={emp} rank={i + 1} totalRevenue={totalRevenue} />
          ))}

          {/* Unmatched if any */}
          {report.find(r => r.id === '__other__' && r.invoiceCount > 0) && (() => {
            const other = report.find(r => r.id === '__other__');
            return (
              <EmployeeMobileCard key="other" emp={other} rank={999} totalRevenue={totalRevenue} />
            );
          })()}

          {/* Zero employees */}
          {zeroEmps.length > 0 && (
            <Box sx={{ mt: 1, p: 2, border: '1px dashed', borderColor: 'divider', borderRadius: 2 }}>
              <Typography variant="caption" color="text.disabled" fontWeight={600} display="block" mb={1}>
                NO SALES IN THIS PERIOD
              </Typography>
              <Box display="flex" flexWrap="wrap" gap={1}>
                {zeroEmps.map(e => (
                  <Chip key={e.id} label={e.name} size="small" variant="outlined"
                    sx={{ color: 'text.disabled', borderColor: 'divider' }} />
                ))}
              </Box>
            </Box>
          )}
        </Box>
      )}

      {/* ── Desktop: Table ── */}
      {loaded && !loading && !isMobile && activeEmps.length > 0 && (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
            <Typography variant="caption" fontWeight={700} color="text.secondary">
              LEADERBOARD — {periodLabel.toUpperCase()} · click row to expand individual sales
            </Typography>
          </Box>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell sx={{ fontWeight: 700 }}>Employee</TableCell>
                  <TableCell sx={{ fontWeight: 700, width: 200 }}>Revenue</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">Invoices</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Avg / Sale</TableCell>
                  <TableCell width={48} />
                </TableRow>
              </TableHead>
              <TableBody>
                {/* Ranked active employees */}
                {activeEmps.map((emp, i) => (
                  <EmployeeDesktopRow key={emp.id} emp={emp} rank={i + 1} totalRevenue={totalRevenue} />
                ))}

                {/* Unmatched */}
                {report.find(r => r.id === '__other__' && r.invoiceCount > 0) && (() => {
                  const other = report.find(r => r.id === '__other__');
                  return <EmployeeDesktopRow key="other" emp={other} rank={999} totalRevenue={totalRevenue} />;
                })()}

                {/* Totals row */}
                <TableRow sx={{ bgcolor: 'grey.50', '& td': { borderTop: '2px solid', borderColor: 'primary.light' } }}>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700}>Total</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={800} color="success.main">
                      {formatCurrency(totalRevenue)}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Chip label={totalInvoices} size="small" color="primary" sx={{ fontWeight: 700 }} />
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" color="text.secondary">
                      {totalInvoices > 0 ? formatCurrency(totalRevenue / totalInvoices) : '—'}
                    </Typography>
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>

          {/* Zero-sale employees */}
          <ZeroSalesBadge employees={zeroEmps} />
        </Card>
      )}

      {/* Matching note */}
      {loaded && (
        <Alert severity="info" sx={{ mt: 2 }} icon={false}>
          <Typography variant="caption">
            Sales are matched to employees by the <strong>Salesperson</strong> name entered on the sale.
            Names must match exactly — e.g. "Rahul" ≠ "Rahul Kumar".
          </Typography>
        </Alert>
      )}
    </Box>
  );
};

export default EmployeeSalesReport;