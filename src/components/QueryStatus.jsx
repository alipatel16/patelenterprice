import React from 'react';
import { Alert, CircularProgress, Typography } from '@mui/material';
import { searchState } from '../data/search';
export function QueryStatus({ error, loading = false, search = '', sx }) {
  if (error) return <Alert severity="error" sx={sx}>{error.message || String(error)}</Alert>;
  if (searchState(search) === 'short') return <Typography role="status" sx={sx}>Type at least 2 characters to search.</Typography>;
  return loading ? <CircularProgress size={24} aria-label="Loading results" sx={sx} /> : null;
}
export default QueryStatus;
