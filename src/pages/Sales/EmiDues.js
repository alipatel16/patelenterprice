import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Card, CardActionArea, CardContent, Chip, Divider,
  CircularProgress, Alert, Avatar, Stack, Badge, Tooltip,
  TextField, InputAdornment, ToggleButtonGroup, ToggleButton,
  LinearProgress, Collapse, IconButton,
} from '@mui/material';
import {
  Warning, CheckCircle, Schedule, CalendarMonth,
  Search, Person, Receipt, ExpandMore, ExpandLess,
  History, PhoneAndroid, ArrowForwardIos,
} from '@mui/icons-material';
import {
  collection, query, where, orderBy, getDocs, limit, startAfter,
} from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { PAYMENT_TYPES } from '../../constants';
import { formatCurrency, formatDate } from '../../utils';
import { useMediaQuery, useTheme } from '@mui/material';

const TODAY = new Date().toISOString().split('T')[0];
const PAGE_SIZE = 25; // sales loaded per batch

// ─── Classify an installment ────────────────────────────────────────────────

const classifyInst = (inst) => {
  if ((inst.paidAmount || 0) >= inst.amount) return 'paid';
  if (inst.dueDate < TODAY) return 'overdue';
  if (inst.dueDate === TODAY) return 'today';
  return 'upcoming';
};

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  overdue: {
    label: 'Overdue',
    color: 'error',
    bg: '#fff5f5',
    border: '#fca5a5',
    icon: <Warning />,
    avatarBg: '#dc2626',
  },
  today: {
    label: 'Due Today',
    color: 'warning',
    bg: '#fffbeb',
    border: '#fcd34d',
    icon: <Schedule />,
    avatarBg: '#d97706',
  },
  upcoming: {
    label: 'Upcoming',
    color: 'info',
    bg: '#f0f9ff',
    border: '#93c5fd',
    icon: <CalendarMonth />,
    avatarBg: '#2563eb',
  },
};

// ─── Days label helper ────────────────────────────────────────────────────────

const daysLabel = (dueDate) => {
  const due = new Date(dueDate);
  const now = new Date(TODAY);
  const diff = Math.round((due - now) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  return `in ${diff}d`;
};

// ─── Single installment row card ──────────────────────────────────────────────

const InstCard = ({ inst, sale, status, onClick }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const cfg = STATUS_CONFIG[status];
  const hasDueDateChange = (inst.dueDateChangeCount || 0) > 0;
  const remaining = inst.amount - (inst.paidAmount || 0);
  const isPartial = (inst.paidAmount || 0) > 0;

  return (
    <Card
      elevation={0}
      sx={{
        mb: 1,
        border: '1.5px solid',
        borderColor: cfg.border,
        bgcolor: cfg.bg,
        borderRadius: 2,
        transition: 'all 0.15s ease',
        '&:hover': { transform: 'translateY(-1px)', boxShadow: '0 4px 16px rgba(0,0,0,0.10)' },
      }}
    >
      <CardActionArea onClick={onClick} sx={{ borderRadius: 2 }}>
        <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
          <Box display="flex" alignItems="center" gap={1.5}>
            {/* Avatar */}
            <Avatar
              sx={{
                width: 38, height: 38, flexShrink: 0,
                bgcolor: cfg.avatarBg, fontSize: 14, fontWeight: 700,
              }}
            >
              {sale.customerName?.charAt(0)?.toUpperCase() || '?'}
            </Avatar>

            {/* Main info */}
            <Box flex={1} minWidth={0}>
              <Box display="flex" alignItems="center" gap={0.75} flexWrap="wrap">
                <Typography variant="body2" fontWeight={700} noWrap>
                  {sale.customerName}
                </Typography>
                {hasDueDateChange && (
                  <Tooltip title={`Due date changed ${inst.dueDateChangeCount} time${inst.dueDateChangeCount > 1 ? 's' : ''}`}>
                    <Chip
                      icon={<History sx={{ fontSize: '12px !important' }} />}
                      label={`Rescheduled ×${inst.dueDateChangeCount}`}
                      size="small"
                      color="warning"
                      variant="outlined"
                      sx={{ height: 18, fontSize: 10, '& .MuiChip-label': { px: 0.5 } }}
                    />
                  </Tooltip>
                )}
                {isPartial && (
                  <Chip
                    label="Partial"
                    size="small"
                    color="secondary"
                    variant="outlined"
                    sx={{ height: 18, fontSize: 10 }}
                  />
                )}
              </Box>
              <Box display="flex" alignItems="center" gap={1} mt={0.25} flexWrap="wrap">
                <Typography variant="caption" color="text.secondary">
                  <Receipt sx={{ fontSize: 11, verticalAlign: 'middle', mr: 0.25 }} />
                  {sale.invoiceNumber}
                </Typography>
                <Typography variant="caption" color="text.secondary">·</Typography>
                <Typography variant="caption" color="text.secondary">
                  EMI #{inst.installmentNumber}/{sale.emiMonths}
                </Typography>
                {!isMobile && sale.customerPhone && (
                  <>
                    <Typography variant="caption" color="text.secondary">·</Typography>
                    <Typography variant="caption" color="text.secondary">
                      <PhoneAndroid sx={{ fontSize: 11, verticalAlign: 'middle', mr: 0.25 }} />
                      {sale.customerPhone}
                    </Typography>
                  </>
                )}
              </Box>
              {isPartial && (
                <Box mt={0.5}>
                  <LinearProgress
                    variant="determinate"
                    value={(inst.paidAmount / inst.amount) * 100}
                    sx={{ height: 4, borderRadius: 2, bgcolor: 'rgba(0,0,0,0.08)' }}
                    color="warning"
                  />
                </Box>
              )}
            </Box>

            {/* Right side: amount + date */}
            <Box textAlign="right" flexShrink={0}>
              <Typography variant="body2" fontWeight={800} color={`${cfg.color}.main`}>
                {formatCurrency(remaining)}
              </Typography>
              {isPartial && (
                <Typography variant="caption" color="text.secondary" display="block">
                  of {formatCurrency(inst.amount)}
                </Typography>
              )}
              <Chip
                label={daysLabel(inst.dueDate)}
                size="small"
                color={cfg.color}
                sx={{ mt: 0.25, height: 18, fontSize: 10 }}
              />
              {!isMobile && (
                <Typography variant="caption" color="text.secondary" display="block" mt={0.25}>
                  {formatDate(inst.dueDate)}
                </Typography>
              )}
            </Box>

            <ArrowForwardIos sx={{ fontSize: 12, color: 'text.disabled', flexShrink: 0 }} />
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
};

// ─── Section with collapsible header ─────────────────────────────────────────

const Section = ({ status, items, onNavigate }) => {
  const [open, setOpen] = useState(true);
  const cfg = STATUS_CONFIG[status];
  if (!items.length) return null;

  return (
    <Box mb={2}>
      {/* Section header */}
      <Box
        display="flex" alignItems="center" justifyContent="space-between"
        sx={{
          px: 2, py: 1, mb: 1,
          bgcolor: cfg.bg,
          border: '1px solid', borderColor: cfg.border,
          borderRadius: 2, cursor: 'pointer',
        }}
        onClick={() => setOpen(o => !o)}
      >
        <Box display="flex" alignItems="center" gap={1}>
          <Box sx={{ color: `${cfg.color}.main`, display: 'flex' }}>{cfg.icon}</Box>
          <Typography variant="subtitle2" fontWeight={700} color={`${cfg.color}.main`}>
            {cfg.label}
          </Typography>
          <Chip
            label={items.length}
            size="small"
            color={cfg.color}
            sx={{ height: 20, fontSize: 11, fontWeight: 700 }}
          />
        </Box>
        <Box display="flex" alignItems="center" gap={1}>
          <Typography variant="body2" fontWeight={700} color={`${cfg.color}.main`}>
            {formatCurrency(items.reduce((s, i) => s + (i.inst.amount - (i.inst.paidAmount || 0)), 0))}
          </Typography>
          <IconButton size="small">
            {open ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
          </IconButton>
        </Box>
      </Box>

      <Collapse in={open}>
        {items.map((item, idx) => (
          <InstCard
            key={`${item.saleId}-${item.inst.installmentNumber}`}
            inst={item.inst}
            sale={item.sale}
            status={status}
            onClick={() => onNavigate(item.saleId)}
          />
        ))}
      </Collapse>
    </Box>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const EmiDues = () => {
  const { db } = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [allLoaded, setAllLoaded] = useState(false);
  const [lastDoc, setLastDoc] = useState(null);
  const [search, setSearch] = useState('');

  // Flat list of {inst, sale, saleId, status}
  const [dueItems, setDueItems] = useState([]);

  // ── Load sales batch ──
  const loadBatch = useCallback(async (cursor = null) => {
    const isFirst = !cursor;
    if (isFirst) setLoading(true); else setLoadingMore(true);

    try {
      let q = query(
        collection(db, 'sales'),
        where('paymentType', '==', PAYMENT_TYPES.EMI),
        orderBy('saleDate', 'desc'),
        limit(PAGE_SIZE),
      );
      if (cursor) q = query(q, startAfter(cursor));

      const snap = await getDocs(q);

      if (snap.empty || snap.docs.length < PAGE_SIZE) setAllLoaded(true);

      const newItems = [];
      snap.docs.forEach(d => {
        const sale = { id: d.id, ...d.data() };
        const installments = sale.emiInstallments || [];
        installments.forEach(inst => {
          const status = classifyInst(inst);
          if (status === 'paid') return; // skip fully paid
          newItems.push({ inst, sale, saleId: d.id, status });
        });
      });

      setDueItems(prev => isFirst ? newItems : [...prev, ...newItems]);
      if (snap.docs.length > 0) setLastDoc(snap.docs[snap.docs.length - 1]);
    } catch (e) {
      console.error('[EmiDues] Load error:', e);
    } finally {
      if (isFirst) setLoading(false); else setLoadingMore(false);
    }
  }, [db]);

  useEffect(() => {
    if (db) loadBatch();
  }, [db]);

  // ── Filter by search ──
  const filtered = dueItems.filter(item => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      item.sale.customerName?.toLowerCase().includes(s) ||
      item.sale.customerPhone?.includes(s) ||
      item.sale.invoiceNumber?.toLowerCase().includes(s)
    );
  });

  // ── Sort each group by dueDate ascending ──
  const sortByDate = arr => [...arr].sort((a, b) => a.inst.dueDate.localeCompare(b.inst.dueDate));

  const overdue  = sortByDate(filtered.filter(i => i.status === 'overdue'));
  const today    = sortByDate(filtered.filter(i => i.status === 'today'));
  const upcoming = sortByDate(filtered.filter(i => i.status === 'upcoming'));

  const totalDue = filtered.reduce((s, i) => s + (i.inst.amount - (i.inst.paidAmount || 0)), 0);

  // ── Summary counts ──
  const totalOverdue  = dueItems.filter(i => i.status === 'overdue').length;
  const totalToday    = dueItems.filter(i => i.status === 'today').length;
  const totalUpcoming = dueItems.filter(i => i.status === 'upcoming').length;

  if (loading) return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
      <CircularProgress />
    </Box>
  );

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 800, mx: 'auto' }}>
      {/* Header */}
      <Box mb={3}>
        <Typography variant="h5" fontWeight={700}>EMI Due Tracker</Typography>
        <Typography variant="body2" color="text.secondary">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </Typography>
      </Box>

      {/* Summary chips */}
      <Box display="flex" gap={1.5} mb={3} flexWrap="wrap">
        {[
          { label: 'Overdue', count: totalOverdue, color: 'error' },
          { label: 'Due Today', count: totalToday, color: 'warning' },
          { label: 'Upcoming', count: totalUpcoming, color: 'info' },
        ].map(({ label, count, color }) => (
          <Card
            key={label}
            elevation={0}
            sx={{
              flex: '1 1 80px',
              border: '1.5px solid',
              borderColor: count > 0 ? `${color}.main` : 'divider',
              borderRadius: 2,
              bgcolor: count > 0 ? `${color}.50` : 'background.paper',
              textAlign: 'center',
              py: 1.5, px: 1,
            }}
          >
            <Typography variant="h5" fontWeight={800} color={count > 0 ? `${color}.main` : 'text.disabled'}>
              {count}
            </Typography>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              {label}
            </Typography>
          </Card>
        ))}
        <Card
          elevation={0}
          sx={{
            flex: '1 1 100px',
            border: '1.5px solid', borderColor: 'divider',
            borderRadius: 2, textAlign: 'center', py: 1.5, px: 1,
          }}
        >
          <Typography variant="h6" fontWeight={800} color="text.primary">
            {formatCurrency(totalDue)}
          </Typography>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            Total Due
          </Typography>
        </Card>
      </Box>

      {/* Search */}
      <TextField
        fullWidth
        placeholder="Search by customer, phone or invoice..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        size="small"
        sx={{ mb: 2.5 }}
        InputProps={{
          startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment>,
        }}
      />

      {/* No results */}
      {!overdue.length && !today.length && !upcoming.length && (
        <Alert severity="success" sx={{ borderRadius: 2 }}>
          {search
            ? 'No results match your search.'
            : 'All EMI installments are up to date! No pending dues found.'
          }
        </Alert>
      )}

      {/* Overdue */}
      <Section status="overdue" items={overdue} onNavigate={id => navigate(`/sales/${id}`)} />

      {/* Due today */}
      <Section status="today" items={today} onNavigate={id => navigate(`/sales/${id}`)} />

      {/* Upcoming */}
      <Section status="upcoming" items={upcoming} onNavigate={id => navigate(`/sales/${id}`)} />

      {/* Load more */}
      {!allLoaded && (
        <Box textAlign="center" mt={2}>
          <Chip
            label={loadingMore ? 'Loading...' : 'Load more sales'}
            onClick={() => !loadingMore && loadBatch(lastDoc)}
            disabled={loadingMore}
            icon={loadingMore ? <CircularProgress size={14} /> : undefined}
            variant="outlined"
            clickable
          />
        </Box>
      )}

      {allLoaded && dueItems.length > 0 && (
        <Typography variant="caption" color="text.disabled" display="block" textAlign="center" mt={2}>
          All EMI sales loaded
        </Typography>
      )}
    </Box>
  );
};

export default EmiDues;