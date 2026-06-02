// src/components/DataMigrationUtil.jsx
//
// ─── ONE-TIME MIGRATION: backfill nameLower on existing docs ──────────────────
//
// Run this ONCE after deploying FirestoreAutocomplete.
// After this migration, every existing customer and product will have the
// 'nameLower' field required for on-demand search to work correctly.
//
// HOW TO USE:
//   Option A — Add a temporary route in App.js:
//     <Route path="admin/migrate" element={<DataMigrationUtil />} />
//   Then visit /admin/migrate as an admin. Remove the route after running.
//
//   Option B — Add a button to your settings page:
//     import DataMigrationUtil from '../components/DataMigrationUtil';
//     // Render it inside your admin settings
//
// SAFETY:
//   • Only UPDATES existing docs — never deletes or creates.
//   • Safe to run multiple times (idempotent).
//   • Processes in batches of 400 (under the Firestore 500-op batch limit).
//   • Shows progress per collection.
//   • Only available in the UI (no accidental CLI runs).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import {
  Box, Card, CardContent, Typography, Button,
  LinearProgress, Alert, Chip, Stack, Divider,
} from '@mui/material';
import { Build, CheckCircle, Error as ErrorIcon } from '@mui/icons-material';
import {
  collection, getDocs, writeBatch, doc,
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-toastify';

const BATCH_SIZE = 400; // stay well under Firestore 500-op batch limit

// ─── Migration runner ─────────────────────────────────────────────────────────

const migrateCollection = async (db, collectionName, getFields, onProgress) => {
  const snap = await getDocs(collection(db, collectionName));
  const total = snap.docs.length;
  let processed = 0;
  let skipped   = 0;
  let updated   = 0;

  // Process in batches
  for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
    const chunk = snap.docs.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);

    for (const docSnap of chunk) {
      const data        = docSnap.data();
      const extraFields = getFields(data);

      // Skip docs that already have ALL the required fields set correctly
      const alreadyDone = Object.entries(extraFields).every(
        ([key, val]) => data[key] === val
      );
      if (alreadyDone) { skipped++; continue; }

      batch.update(doc(db, collectionName, docSnap.id), extraFields);
      updated++;
    }

    await batch.commit();
    processed += chunk.length;
    onProgress(Math.round((processed / total) * 100));
  }

  return { total, updated, skipped };
};

// ─── Component ────────────────────────────────────────────────────────────────

const MIGRATIONS = [
  {
    id:             'customers',
    label:          'Customers',
    collectionName: 'customers',
    getFields:      (d) => ({
      nameLower: (d.name || '').toLowerCase().trim(),
    }),
  },
  {
    id:             'products',
    label:          'Products',
    collectionName: 'products',
    getFields:      (d) => ({
      nameLower:  (d.name   || '').toLowerCase().trim(),
      makerLower: (d.maker  || '').toLowerCase().trim(),
    }),
  },
];

const DataMigrationUtil = () => {
  const { db, isAdmin } = useAuth();

  const [status,   setStatus]   = useState({});  // { [id]: 'idle'|'running'|'done'|'error' }
  const [progress, setProgress] = useState({});  // { [id]: 0-100 }
  const [results,  setResults]  = useState({});  // { [id]: { total, updated, skipped } }
  const [error,    setError]    = useState({});  // { [id]: string }

  if (!isAdmin) {
    return (
      <Box p={4}>
        <Alert severity="error">Admin access required to run migrations.</Alert>
      </Box>
    );
  }

  const runMigration = async (mig) => {
    setStatus(s    => ({ ...s, [mig.id]: 'running' }));
    setProgress(p  => ({ ...p, [mig.id]: 0         }));
    setError(e     => ({ ...e, [mig.id]: ''         }));
    setResults(r   => ({ ...r, [mig.id]: null       }));

    try {
      const result = await migrateCollection(
        db,
        mig.collectionName,
        mig.getFields,
        (pct) => setProgress(p => ({ ...p, [mig.id]: pct })),
      );
      setResults(r => ({ ...r, [mig.id]: result  }));
      setStatus(s  => ({ ...s, [mig.id]: 'done'  }));
      toast.success(`${mig.label} migration complete — ${result.updated} updated, ${result.skipped} skipped`);
    } catch (err) {
      setError(e  => ({ ...e, [mig.id]: err.message }));
      setStatus(s => ({ ...s, [mig.id]: 'error'     }));
      toast.error(`${mig.label} migration failed: ${err.message}`);
    }
  };

  const runAll = async () => {
    for (const mig of MIGRATIONS) {
      if (status[mig.id] !== 'done') {
        await runMigration(mig);
      }
    }
  };

  const allDone = MIGRATIONS.every(m => status[m.id] === 'done');

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 720, mx: 'auto' }}>
      {/* Header */}
      <Box display="flex" alignItems="center" gap={2} mb={3}>
        <Build color="warning" />
        <Box>
          <Typography variant="h5" fontWeight={700}>Search Index Migration</Typography>
          <Typography variant="body2" color="text.secondary">
            One-time setup to enable on-demand search. Run once, then remove this page.
          </Typography>
        </Box>
      </Box>

      <Alert severity="info" sx={{ mb: 3 }}>
        This adds a <strong>nameLower</strong> field to existing customers and products.
        Safe to run multiple times. Does NOT delete any data.
        Reads: ~800 docs total. Writes: only docs missing the field.
      </Alert>

      {/* Run All button */}
      <Button
        variant="contained"
        color="warning"
        size="large"
        onClick={runAll}
        disabled={allDone || MIGRATIONS.some(m => status[m.id] === 'running')}
        fullWidth
        sx={{ mb: 3 }}
      >
        {allDone ? '✅ All migrations complete' : 'Run All Migrations'}
      </Button>

      {/* Per-collection cards */}
      <Stack spacing={2}>
        {MIGRATIONS.map(mig => {
          const s   = status[mig.id]   || 'idle';
          const pct = progress[mig.id] || 0;
          const res = results[mig.id];
          const err = error[mig.id];

          return (
            <Card key={mig.id} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <CardContent>
                <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Typography fontWeight={700}>{mig.label}</Typography>
                    <Chip
                      label={s === 'idle' ? 'Not run' : s === 'running' ? `${pct}%` : s === 'done' ? 'Done' : 'Error'}
                      color={s === 'done' ? 'success' : s === 'error' ? 'error' : s === 'running' ? 'warning' : 'default'}
                      size="small"
                      icon={s === 'done' ? <CheckCircle sx={{ fontSize: '14px !important' }} /> : s === 'error' ? <ErrorIcon sx={{ fontSize: '14px !important' }} /> : undefined}
                    />
                  </Box>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => runMigration(mig)}
                    disabled={s === 'running'}
                  >
                    {s === 'done' ? 'Re-run' : 'Run'}
                  </Button>
                </Box>

                {s === 'running' && (
                  <LinearProgress variant="determinate" value={pct} sx={{ mt: 1, borderRadius: 1 }} />
                )}

                {res && s === 'done' && (
                  <Box display="flex" gap={2} mt={1}>
                    <Typography variant="caption" color="text.secondary">Total: {res.total}</Typography>
                    <Typography variant="caption" color="success.main">Updated: {res.updated}</Typography>
                    <Typography variant="caption" color="text.secondary">Skipped (already done): {res.skipped}</Typography>
                  </Box>
                )}

                {err && (
                  <Alert severity="error" sx={{ mt: 1 }}>{err}</Alert>
                )}
              </CardContent>
            </Card>
          );
        })}
      </Stack>

      <Divider sx={{ my: 3 }} />

      <Alert severity="success">
        <strong>After running:</strong> Remove this page/route from your app.
        All new saves automatically include the <code>nameLower</code> field
        (via <code>normalizeCustomer()</code> / <code>normalizeProduct()</code>).
      </Alert>
    </Box>
  );
};

export default DataMigrationUtil;