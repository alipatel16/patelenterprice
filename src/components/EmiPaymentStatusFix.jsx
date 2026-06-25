// src/components/EmiPaymentStatusFix.jsx
//
// ─── ONE-TIME MIGRATION: Fix EMI paymentStatus on existing sales ──────────────
//
//  PROBLEM:
//    When all EMI installments are paid, the parent sale document's
//    `paymentStatus` field stays as 'unpaid' because the old
//    handleRecordEmiPayment in SaleDetail.js never updated it.
//
//  THIS COMPONENT:
//    1. Scans all sales where paymentType === 'emi'
//    2. For each, recomputes the correct paymentStatus from emiInstallments[]
//    3. Updates only the docs that are wrong (idempotent — safe to run again)
//    4. Shows scan preview BEFORE writing anything
//
//  HOW TO USE:
//    Step 1 — Add a temporary route in App.js:
//      import EmiPaymentStatusFix from './components/EmiPaymentStatusFix';
//      <Route path="admin/emi-fix" element={<EmiPaymentStatusFix />} />
//    Step 2 — Visit /admin/emi-fix as admin, scan first, then run the fix.
//    Step 3 — Remove the route after running.
//
//  PAYMENT STATUS LOGIC FOR EMI:
//    • 'paid'    — every installment has paidAmount >= amount
//    • 'partial' — at least one installment has paidAmount > 0,
//                  OR a downPayment was collected, but not all are paid
//    • 'unpaid'  — no payments at all (not even downPayment)
//
//  SAFETY:
//    • Only runs writes after you click "Fix Records"
//    • Scan first shows exactly what will change (preview mode)
//    • Processes in batches of 400 (under Firestore 500-op limit)
//    • Idempotent — running twice produces the same result
//    • Admin-only guard
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import {
  Box, Card, CardContent, Typography, Button, LinearProgress,
  Alert, Chip, Stack, Divider, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, CircularProgress,
} from '@mui/material';
import {
  Build, CheckCircle, Error as ErrorIcon, Search,
  AutoFixHigh, Visibility,
} from '@mui/icons-material';
import {
  collection, query, where, getDocs, writeBatch, doc,
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-toastify';
import { formatCurrency } from '../utils';

// ─── Core logic ───────────────────────────────────────────────────────────────

/**
 * Compute the correct paymentStatus for an EMI sale from its installments.
 * Exported so SaleDetail.js can reuse this going forward.
 *
 * @param {Array}  installments  emiInstallments array from the sale doc
 * @param {number} downPayment   sale.downPayment (may be 0 or undefined)
 * @returns {'paid'|'partial'|'unpaid'}
 */
export function computeEmiPaymentStatus(installments = [], downPayment = 0) {
  if (installments.length === 0) {
    // No installments yet — treat downPayment as the only signal
    return downPayment > 0 ? 'partial' : 'unpaid';
  }

  const allPaid = installments.every(
    inst => (inst.paidAmount || 0) >= inst.amount
  );
  if (allPaid) return 'paid';

  const anyPaid =
    installments.some(inst => (inst.paidAmount || 0) > 0) ||
    downPayment > 0;

  return anyPaid ? 'partial' : 'unpaid';
}

/**
 * Compute total amount paid across all installments.
 * Does NOT include downPayment (that's tracked separately).
 *
 * @param {Array} installments
 * @returns {number}
 */
export function computeEmiTotalPaid(installments = []) {
  return installments.reduce((sum, inst) => sum + (inst.paidAmount || 0), 0);
}

// ─── Migration runner ─────────────────────────────────────────────────────────

const BATCH_SIZE = 400; // stay well under Firestore 500-op batch limit

async function scanEmiSales(db) {
  const snap = await getDocs(
    query(collection(db, 'sales'), where('paymentType', '==', 'emi'))
  );

  const toFix   = [];
  const correct = [];

  snap.docs.forEach(docSnap => {
    const data         = docSnap.data();
    const installments = data.emiInstallments || [];
    const downPayment  = data.downPayment || 0;

    const correctStatus  = computeEmiPaymentStatus(installments, downPayment);
    const correctTotal   = computeEmiTotalPaid(installments) + downPayment;
    const currentStatus  = data.paymentStatus || 'unpaid';
    const currentTotal   = data.totalPaidAmount || 0;

    const statusWrong = correctStatus !== currentStatus;
    // Allow small float drift (< ₹1) before flagging totalPaidAmount as wrong
    const totalWrong  = Math.abs(correctTotal - currentTotal) >= 1;

    if (statusWrong || totalWrong) {
      toFix.push({
        id:             docSnap.id,
        invoiceNumber:  data.invoiceNumber  || '—',
        customerName:   data.customerName   || '—',
        grandTotal:     data.grandTotal     || 0,
        instCount:      installments.length,
        paidCount:      installments.filter(i => (i.paidAmount || 0) >= i.amount).length,
        currentStatus,
        correctStatus,
        currentTotal,
        correctTotal,
        statusWrong,
        totalWrong,
      });
    } else {
      correct.push(docSnap.id);
    }
  });

  return { toFix, total: snap.docs.length, correctCount: correct.length };
}

async function fixEmiSales(db, toFix, onProgress) {
  let fixed = 0;

  for (let i = 0; i < toFix.length; i += BATCH_SIZE) {
    const chunk = toFix.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);

    chunk.forEach(item => {
      batch.update(doc(db, 'sales', item.id), {
        paymentStatus:    item.correctStatus,
        totalPaidAmount:  item.correctTotal,
        // Don't touch any other fields — minimal, safe update
      });
    });

    await batch.commit();
    fixed += chunk.length;
    onProgress(Math.round((fixed / toFix.length) * 100));
  }

  return fixed;
}

// ─── Status chip helpers ──────────────────────────────────────────────────────

const StatusLabel = ({ status }) => {
  const map = {
    paid:    { color: 'success', label: 'Paid'    },
    partial: { color: 'warning', label: 'Partial' },
    unpaid:  { color: 'error',   label: 'Unpaid'  },
  };
  const c = map[status] || map.unpaid;
  return <Chip label={c.label} color={c.color} size="small" />;
};

// ─── Component ────────────────────────────────────────────────────────────────

const EmiPaymentStatusFix = () => {
  const { db, isAdmin } = useAuth();

  const [phase,    setPhase]    = useState('idle');       // 'idle'|'scanning'|'scanned'|'fixing'|'done'|'error'
  const [scanResult, setScan]   = useState(null);         // { toFix, total, correctCount }
  const [progress, setProgress] = useState(0);
  const [fixedCount, setFixed]  = useState(0);
  const [errorMsg,  setError]   = useState('');

  if (!isAdmin) {
    return (
      <Box p={4}>
        <Alert severity="error">Admin access required to run this migration.</Alert>
      </Box>
    );
  }

  // ── Step 1: Scan ────────────────────────────────────────────────────────────
  const handleScan = async () => {
    setPhase('scanning');
    setError('');
    setScan(null);
    try {
      const result = await scanEmiSales(db);
      setScan(result);
      setPhase('scanned');
      if (result.toFix.length === 0) {
        toast.success('All EMI records already have correct paymentStatus!');
      }
    } catch (err) {
      setError(err.message);
      setPhase('error');
      toast.error('Scan failed: ' + err.message);
    }
  };

  // ── Step 2: Fix ─────────────────────────────────────────────────────────────
  const handleFix = async () => {
    if (!scanResult || scanResult.toFix.length === 0) return;
    setPhase('fixing');
    setProgress(0);
    try {
      const count = await fixEmiSales(db, scanResult.toFix, pct => setProgress(pct));
      setFixed(count);
      setPhase('done');
      toast.success(`Fixed ${count} EMI sale${count !== 1 ? 's' : ''}!`);
    } catch (err) {
      setError(err.message);
      setPhase('error');
      toast.error('Fix failed: ' + err.message);
    }
  };

  const handleReset = () => {
    setPhase('idle');
    setScan(null);
    setProgress(0);
    setFixed(0);
    setError('');
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 900, mx: 'auto' }}>

      {/* ── Header ── */}
      <Box display="flex" alignItems="center" gap={2} mb={3}>
        <Box sx={{
          width: 48, height: 48, borderRadius: 2,
          bgcolor: 'warning.main',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <AutoFixHigh sx={{ color: '#fff' }} />
        </Box>
        <Box>
          <Typography variant="h5" fontWeight={700}>EMI Payment Status Fix</Typography>
          <Typography variant="body2" color="text.secondary">
            One-time migration — fixes paymentStatus on EMI sales where all installments are paid
          </Typography>
        </Box>
      </Box>

      {/* ── Info Banner ── */}
      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="body2" fontWeight={600} mb={0.5}>What this does</Typography>
        <Typography variant="body2">
          Scans every EMI sale and recomputes <code>paymentStatus</code> from the actual
          installment data. If all installments are paid → marks sale as <strong>Paid</strong>.
          If some are paid → <strong>Partial</strong>. If none → <strong>Unpaid</strong>.
          Also corrects <code>totalPaidAmount</code> if it has drifted.
        </Typography>
        <Typography variant="body2" mt={1}>
          Safe to run multiple times. <strong>Scan first</strong> — it shows exactly what will
          change before any writes happen.
        </Typography>
      </Alert>

      {/* ── Phase: IDLE ── */}
      {phase === 'idle' && (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <CardContent sx={{ textAlign: 'center', py: 5 }}>
            <Search sx={{ fontSize: 56, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" fontWeight={700} mb={1}>
              Start by scanning your EMI sales
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={3}>
              The scan reads all EMI sales and identifies which ones have incorrect paymentStatus.
              No data is written during the scan.
            </Typography>
            <Button
              variant="contained"
              color="warning"
              size="large"
              startIcon={<Visibility />}
              onClick={handleScan}
            >
              Scan EMI Sales
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Phase: SCANNING ── */}
      {phase === 'scanning' && (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <CardContent sx={{ textAlign: 'center', py: 5 }}>
            <CircularProgress color="warning" sx={{ mb: 2 }} />
            <Typography variant="h6" fontWeight={600}>Scanning EMI sales…</Typography>
            <Typography variant="body2" color="text.secondary" mt={1}>
              Reading all EMI records — this may take a few seconds.
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* ── Phase: SCANNED ── */}
      {phase === 'scanned' && scanResult && (
        <Box>
          {/* Summary */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mb={3}>
            {[
              { label: 'Total EMI Sales',      val: scanResult.total,              color: 'text.primary'  },
              { label: 'Already Correct',       val: scanResult.correctCount,       color: 'success.main'  },
              { label: 'Need Fixing',           val: scanResult.toFix.length,       color: scanResult.toFix.length > 0 ? 'error.main' : 'success.main' },
            ].map(s => (
              <Card key={s.label} elevation={0}
                sx={{ flex: 1, border: '1px solid', borderColor: 'divider', borderRadius: 2, textAlign: 'center' }}>
                <CardContent sx={{ py: '14px !important' }}>
                  <Typography variant="h4" fontWeight={800} color={s.color}>{s.val}</Typography>
                  <Typography variant="caption" color="text.secondary">{s.label}</Typography>
                </CardContent>
              </Card>
            ))}
          </Stack>

          {scanResult.toFix.length === 0 ? (
            <Alert severity="success" icon={<CheckCircle />}>
              <Typography fontWeight={700}>All EMI sales already have correct paymentStatus!</Typography>
              <Typography variant="body2" mt={0.5}>
                No fixes needed. You can remove this route from App.js.
              </Typography>
            </Alert>
          ) : (
            <>
              <Alert severity="warning" sx={{ mb: 2 }}>
                <Typography fontWeight={700}>
                  {scanResult.toFix.length} sale{scanResult.toFix.length !== 1 ? 's' : ''} need{scanResult.toFix.length === 1 ? 's' : ''} fixing.
                </Typography>
                <Typography variant="body2" mt={0.5}>
                  Review the table below, then click <strong>Fix Records</strong> to apply corrections.
                </Typography>
              </Alert>

              {/* Preview table */}
              <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 3 }}>
                <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="subtitle2" fontWeight={700}>
                    Records to be fixed — preview
                  </Typography>
                </Box>
                <TableContainer sx={{ maxHeight: 400 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>Invoice / Customer</TableCell>
                        <TableCell align="center">Installments</TableCell>
                        <TableCell align="center">Current Status</TableCell>
                        <TableCell align="center">Correct Status</TableCell>
                        <TableCell align="right">Total Paid</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {scanResult.toFix.map(item => (
                        <TableRow key={item.id} hover>
                          <TableCell>
                            <Typography variant="body2" fontWeight={600} color="primary">
                              {item.invoiceNumber}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {item.customerName}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Typography variant="body2">
                              {item.paidCount}/{item.instCount} paid
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <StatusLabel status={item.currentStatus} />
                          </TableCell>
                          <TableCell align="center">
                            <Box display="flex" alignItems="center" justifyContent="center" gap={0.5}>
                              <StatusLabel status={item.correctStatus} />
                              {item.statusWrong && (
                                <Typography variant="caption" color="success.main" fontWeight={700}>✓ fix</Typography>
                              )}
                            </Box>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2">
                              {formatCurrency(item.correctTotal)}
                              {item.totalWrong && (
                                <Typography variant="caption" color="warning.main" display="block">
                                  was {formatCurrency(item.currentTotal)}
                                </Typography>
                              )}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Card>

              <Stack direction="row" spacing={2}>
                <Button
                  variant="contained"
                  color="error"
                  startIcon={<AutoFixHigh />}
                  onClick={handleFix}
                  size="large"
                >
                  Fix {scanResult.toFix.length} Record{scanResult.toFix.length !== 1 ? 's' : ''}
                </Button>
                <Button variant="outlined" onClick={handleReset}>
                  Re-scan
                </Button>
              </Stack>
            </>
          )}
        </Box>
      )}

      {/* ── Phase: FIXING ── */}
      {phase === 'fixing' && (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <CardContent sx={{ py: 4 }}>
            <Typography variant="h6" fontWeight={600} mb={2}>
              Fixing records… {progress}%
            </Typography>
            <LinearProgress
              variant="determinate"
              value={progress}
              color="error"
              sx={{ height: 10, borderRadius: 5, mb: 1 }}
            />
            <Typography variant="caption" color="text.secondary">
              Writing in batches of {BATCH_SIZE} — do not close this tab.
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* ── Phase: DONE ── */}
      {phase === 'done' && (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'success.main', borderRadius: 2 }}>
          <CardContent sx={{ textAlign: 'center', py: 5 }}>
            <CheckCircle color="success" sx={{ fontSize: 56, mb: 2 }} />
            <Typography variant="h6" fontWeight={700} color="success.main" mb={1}>
              Fixed {fixedCount} record{fixedCount !== 1 ? 's' : ''} successfully!
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={3}>
              All EMI sales now have correct paymentStatus. You can remove this route from App.js.
            </Typography>
            <Stack direction="row" spacing={2} justifyContent="center">
              <Button variant="outlined" onClick={handleReset} startIcon={<Search />}>
                Scan Again to Verify
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* ── Phase: ERROR ── */}
      {phase === 'error' && (
        <Alert severity="error" action={
          <Button color="inherit" size="small" onClick={handleReset}>Retry</Button>
        }>
          <Typography fontWeight={700}>An error occurred</Typography>
          <Typography variant="body2">{errorMsg}</Typography>
        </Alert>
      )}

      <Divider sx={{ my: 3 }} />

      {/* Footer instructions */}
      <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
        <Typography variant="subtitle2" fontWeight={700} mb={1}>
          After running this migration
        </Typography>
        <Stack spacing={0.5}>
          {[
            'Remove the /admin/emi-fix route from App.js',
            'The updated SaleDetail.js now auto-updates paymentStatus on every new EMI payment — this will not drift again',
            'The EmiList page will now correctly show/hide sales based on actual installment data',
          ].map((txt, i) => (
            <Box key={i} display="flex" alignItems="flex-start" gap={1}>
              <CheckCircle sx={{ fontSize: 15, color: 'success.main', mt: 0.3, flexShrink: 0 }} />
              <Typography variant="body2" color="text.secondary">{txt}</Typography>
            </Box>
          ))}
        </Stack>
      </Box>
    </Box>
  );
};

export default EmiPaymentStatusFix;