
import { Box, TextField, InputAdornment, IconButton, Typography, Chip, Skeleton } from '@mui/material';
import { Search, CalendarMonth, Close } from '@mui/icons-material';

// The month is an optional server predicate; indexed search works across dates.
export default function MonthSearchBar({ selectedMonth, onMonthChange, search, onSearchChange,
  searchPlaceholder = 'Search…', resultCount, loading = false }) {
  const formatMonth = ym => {
    const [year, month] = ym.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  };
  return <Box>
    <Box sx={{ display: 'flex', gap: 1.5, flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'stretch', sm: 'center' } }}>
      <TextField type="month" size="small" label="Month (optional)" value={selectedMonth}
        onChange={e => onMonthChange(e.target.value)} InputLabelProps={{ shrink: true }}
        InputProps={{ startAdornment: <InputAdornment position="start"><CalendarMonth fontSize="small" /></InputAdornment>,
          endAdornment: selectedMonth ? <InputAdornment position="end"><IconButton size="small" aria-label="Clear month" onClick={() => onMonthChange('')}><Close fontSize="small" /></IconButton></InputAdornment> : null }}
        sx={{ minWidth: { xs: '100%', sm: 200 } }} />
      <TextField fullWidth size="small" placeholder={searchPlaceholder} value={search}
        onChange={e => onSearchChange(e.target.value)}
        InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment>,
          endAdornment: search ? <InputAdornment position="end"><IconButton size="small" aria-label="Clear search" onClick={() => onSearchChange('')}><Close fontSize="small" /></IconButton></InputAdornment> : null }} />
    </Box>
    <Box display="flex" alignItems="center" gap={1} mt={0.75} minHeight={20}>
      {selectedMonth && <Chip label={formatMonth(selectedMonth)} size="small" variant="outlined" color="primary" onDelete={() => onMonthChange('')} />}
      {loading ? <Skeleton width={120} height={16} /> : <Typography variant="caption" color="text.secondary">
        {search.trim().length === 1 ? 'Type at least 2 characters to search' : resultCount !== undefined ? `${resultCount} matching records` : 'Search by name, reference or phone; month is optional'}
      </Typography>}
    </Box>
  </Box>;
}
