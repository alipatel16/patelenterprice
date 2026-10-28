import React, { useState } from 'react';
import {
  Box, Typography, Card, CardActionArea, CardContent, Chip,
  Alert, Avatar, Stack, Tooltip,
  TextField, InputAdornment,
  LinearProgress, Collapse, IconButton, Tabs, Tab, Button,
} from '@mui/material';
import {
  Warning, CheckCircle, Schedule, CalendarMonth,
  Search, Receipt, ExpandMore, ExpandLess,
  History, PhoneAndroid, ArrowForwardIos,
} from '@mui/icons-material';
import usePagedCollection from '../../hooks/usePagedCollection';
import QueryStatus from '../../components/QueryStatus';
import { dueFilters, indiaDay } from '../../data/salesQueues';
import { useIndiaDay, useQueueTotals } from '../../hooks/useSalesQueue';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency, formatDate } from '../../utils';
import { useMediaQuery, useTheme } from '@mui/material';

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  review: { label: 'Needs review', color: 'warning', bg: '#fffbeb', border: '#fcd34d', icon: <Warning />, avatarBg: '#d97706' },
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
  const now = new Date(indiaDay());
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
  const remaining = inst.remainingAmount;
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
                  EMI #{inst.installmentNumber}{sale.emiMonths ? `/${sale.emiMonths}` : ''}
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
                {remaining == null ? 'Needs reconciliation' : formatCurrency(remaining)}
              </Typography>
              {isPartial && (
                <Typography variant="caption" color="text.secondary" display="block">
                  of {formatCurrency(inst.amount)}
                </Typography>
              )}
              <Chip
                label={inst.dueDate ? daysLabel(inst.dueDate) : 'Date needs review'}
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

const Section = ({ status, items, summary, onNavigate }) => {
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
            label={summary?.count ?? '—'}
            size="small"
            color={cfg.color}
            sx={{ height: 20, fontSize: 11, fontWeight: 700 }}
          />
        </Box>
        <Box display="flex" alignItems="center" gap={1}>
          <Typography variant="body2" fontWeight={700} color={`${cfg.color}.main`}>
            {summary?.amount == null ? '—' : formatCurrency(summary.amount)}
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
  const todayDate = useIndiaDay();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('overdue');
  const plans = [...['overdue', 'today', 'upcoming', 'review'].map(name => ({ name, filters: dueFilters(name, todayDate), sums: { amount: 'remainingAmount' } })), { name: 'all', filters: [], sums: { amount: 'remainingAmount' } }];
  const view = usePagedCollection(db, 'emiDues', { search, filters: dueFilters(tab, todayDate), sort: [['dueDate', 'asc']], pageSize: 15, requireReady: true });
  const totals = useQueueTotals(db, 'emiDues', plans, search);
  const items = view.rows.map(row => ({ inst: row, sale: row, saleId: row.saleId }));
  const totalOverdue = totals.data?.overdue.count ?? '—';
  const totalToday = totals.data?.today.count ?? '—';
  const totalUpcoming = totals.data?.upcoming.count ?? '—';
  const totalDue = totals.data?.all?.amount;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 800, mx: 'auto' }}>
      {/* Header */}
      <Box mb={3}>
        <Typography variant="h5" fontWeight={700}>EMI Due Tracker</Typography>
        <Typography variant="body2" color="text.secondary">
          {new Date(`${todayDate}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
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
            {totalDue == null ? '—' : formatCurrency(totalDue)}
          </Typography>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            Total Due
          </Typography>
        </Card>
      </Box>

      {totals.data?.review?.count > 0 && <Alert severity="warning" sx={{ mb: 2 }}>{totals.data.review.count} installments need review. Monetary totals include valid amounts only; open Needs Review for details.</Alert>}
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

      <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="fullWidth" sx={{ mb: 2 }}>
        <Tab value="overdue" label="Overdue" /><Tab value="today" label="Due Today" /><Tab value="upcoming" label="Upcoming 7 Days" /><Tab value="review" label="Needs Review" />
      </Tabs>
      <QueryStatus error={view.error || totals.error} loading={view.loading} search={search} />
      {!view.loading && !view.error && !items.length && search.trim().length !== 1 && <Alert severity="info">No matching dues found.</Alert>}
      <Section status={tab} items={items} summary={totals.data?.[tab]} onNavigate={id => navigate(`/sales/${id}`)} />
      <Stack direction="row" justifyContent="flex-end" spacing={1}>
        <Button disabled={view.loading || view.page === 0} onClick={view.previous}>Previous</Button>
        <Chip label={`Page ${view.page + 1} · ${view.total ?? '—'} dues`} />
        <Button disabled={view.loading || !view.hasNext} onClick={view.next}>Next</Button>
      </Stack>
    </Box>
  );
};

export default EmiDues;