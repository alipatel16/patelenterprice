import React, { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { fetchPage } from '../data/query';

// Explicit administrative preview: no automatic scans, writes, or readiness flags.
export default function AdminDataPreview({ db, collectionName, filters = [], renderRow }) {
  const [rows, setRows] = useState([]), [cursor, setCursor] = useState(null);
  const [hasNext, setHasNext] = useState(true), [loading, setLoading] = useState(false), [error, setError] = useState(null);
  const generation = useRef(0), identity = `${collectionName}:${JSON.stringify(filters)}`;
  useEffect(() => {
    generation.current++; setRows([]); setCursor(null); setHasNext(true); setLoading(false); setError(null);
    return () => { generation.current++; };
  }, [db, identity]);
  const preview = async () => {
    const ticket = generation.current;
    setLoading(true); setError(null);
    try {
      const result = await fetchPage(db, collectionName, { filters, sort: [], pageSize: 15, includeTotal: false, cursor });
      if (ticket !== generation.current) return;
      setRows(result.rows); setCursor(result.lastDoc); setHasNext(result.hasNext);
    } catch (failure) { if (ticket === generation.current) setError(failure.message); }
    finally { if (ticket === generation.current) setLoading(false); }
  };
  return <Stack spacing={2}>
    <Button variant="contained" onClick={preview} disabled={!db || loading || !hasNext}>Preview next 15</Button>
    {loading && <CircularProgress size={24} />}
    {error && <Alert severity="error">{error}</Alert>}
    <Typography>Records on this page: {rows.length}</Typography>
    {rows.map(row => <Box key={row.id} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>{renderRow(row)}</Box>)}
    {!hasNext && <Typography color="text.secondary">End of preview.</Typography>}
  </Stack>;
}
