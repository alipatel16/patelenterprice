// src/components/MonthSearchBar.jsx
//
// A month-scoped search bar. The search field is disabled until the user
// selects a month. This ensures searches are always bounded to a finite
// dataset rather than scanning an ever-growing collection.
//
// Usage:
//   <MonthSearchBar
//     selectedMonth={searchMonth}           // 'YYYY-MM' or ''
//     onMonthChange={setSearchMonth}
//     search={search}
//     onSearchChange={handleSearch}
//     searchPlaceholder="Search by name, phone..."
//     resultCount={total}                    // optional — shows "X results" badge
//     loading={loading}
//   />

import React from 'react';
import {
  Box, TextField, InputAdornment, IconButton, Tooltip,
  Typography, Chip, Skeleton, useTheme, useMediaQuery,
} from '@mui/material';
import {
  Search, CalendarMonth, Close, InfoOutlined,
} from '@mui/icons-material';

const MonthSearchBar = ({
  selectedMonth,
  onMonthChange,
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  resultCount,
  loading = false,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const hasMonth = Boolean(selectedMonth);

  // Format 'YYYY-MM' → 'January 2025' for display
  const formatMonth = (ym) => {
    if (!ym) return '';
    const [y, m] = ym.split('-');
    return new Date(Number(y), Number(m) - 1, 1)
      .toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  };

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          gap: 1.5,
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'stretch', sm: 'center' },
        }}
      >
        {/* ── Month Picker ──────────────────────────────────────────────── */}
        <TextField
          type="month"
          size="small"
          label="Search Month"
          value={selectedMonth}
          onChange={e => {
            onMonthChange(e.target.value);
            // Reset search when month changes
            if (onSearchChange) onSearchChange('');
          }}
          InputLabelProps={{ shrink: true }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <CalendarMonth fontSize="small" color={hasMonth ? 'primary' : 'action'} />
              </InputAdornment>
            ),
            endAdornment: hasMonth ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => { onMonthChange(''); if (onSearchChange) onSearchChange(''); }}>
                  <Close fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : null,
          }}
          sx={{
            minWidth: { xs: '100%', sm: 200 },
            '& input': { cursor: 'pointer' },
          }}
        />

        {/* ── Search Input ──────────────────────────────────────────────── */}
        <Box sx={{ flex: 1, position: 'relative' }}>
          <TextField
            fullWidth
            size="small"
            placeholder={hasMonth ? searchPlaceholder : 'Select a month above to search…'}
            value={search}
            onChange={e => onSearchChange && onSearchChange(e.target.value)}
            disabled={!hasMonth}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search fontSize="small" color={hasMonth ? 'inherit' : 'disabled'} />
                </InputAdornment>
              ),
              endAdornment: search ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => onSearchChange && onSearchChange('')}>
                    <Close fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: hasMonth ? 'background.paper' : 'action.disabledBackground',
              },
            }}
          />
        </Box>
      </Box>

      {/* ── Status row ─────────────────────────────────────────────────── */}
      <Box display="flex" alignItems="center" gap={1} mt={0.75} minHeight={20}>
        {!hasMonth ? (
          <Box display="flex" alignItems="center" gap={0.5}>
            <InfoOutlined sx={{ fontSize: 12, color: 'text.disabled' }} />
            <Typography variant="caption" color="text.disabled">
              {isMobile
                ? 'Pick a month to search across all records'
                : 'Pick a month to search all records in that month — browsing above works without a month selection'}
            </Typography>
          </Box>
        ) : loading ? (
          <Skeleton width={120} height={16} />
        ) : (
          <Box display="flex" alignItems="center" gap={0.75} flexWrap="wrap">
            <Chip
              label={formatMonth(selectedMonth)}
              size="small"
              color="primary"
              variant="outlined"
              icon={<CalendarMonth sx={{ fontSize: '13px !important' }} />}
              onDelete={() => { onMonthChange(''); if (onSearchChange) onSearchChange(''); }}
              sx={{ fontSize: 11 }}
            />
            {resultCount !== undefined && (
              <Typography variant="caption" color="text.secondary">
                {search
                  ? `${resultCount} matching record${resultCount !== 1 ? 's' : ''}`
                  : `${resultCount} record${resultCount !== 1 ? 's' : ''} in this month`}
              </Typography>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default MonthSearchBar;