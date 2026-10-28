import React, { useState } from 'react';
import { Alert, Box, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { withSearchFields } from '../data/search';
import AdminDataPreview from './AdminDataPreview';
const collections = ['customers', 'products', 'inventory', 'purchases', 'sales', 'quotations', 'giftInvoices', 'giftSets', 'brandHierarchies', 'complaints', 'users', 'checklistTemplates'];
export default function DataMigrationUtil() {
  const { db, isAdmin } = useAuth();
  const [collectionName, setCollectionName] = useState('customers');
  if (!isAdmin) return <Alert severity="error">Admin access required.</Alert>;
  return <Box sx={{ p: 3, maxWidth: 760, mx: 'auto' }}><Stack spacing={2}>
    <Typography variant="h5">Search setup preview</Typography>
    <Alert severity="info">Preview 15 records at a time. Complete setup uses the verified backup, a saved checkpoint and an explicit read/write budget. This preview does not change records or enable incomplete search.</Alert>
    <TextField select label="Collection" value={collectionName} onChange={event => setCollectionName(event.target.value)}>{collections.map(name => <MenuItem key={name} value={name}>{name}</MenuItem>)}</TextField>
    <AdminDataPreview db={db} collectionName={collectionName} renderRow={row => {
      let text;
      try { const next = withSearchFields(collectionName, row); text = `${next.searchTokens.length} search tokens; ${row.searchVersion === 2 ? 'already indexed' : 'setup required'}`; }
      catch (_) { text = 'Needs review before search setup.'; }
      return <><Typography>{row.name || row.customerName || row.productName || row.title || row.id}</Typography><Typography variant="body2">{text}</Typography></>;
    }} />
    <Typography variant="body2" color="text.secondary">Use the documented migration tool for complete setup. Live setup and index deployment require the separate rollout step.</Typography>
  </Stack></Box>;
}
