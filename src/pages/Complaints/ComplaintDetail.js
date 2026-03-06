import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Card, CardContent, Grid, Chip, Divider,
  IconButton, Alert, CircularProgress, Stack, Paper, TextField,
  Dialog, DialogTitle, DialogContent, DialogActions, MenuItem,
  Select, FormControl, InputLabel, Tab, Tabs, Timeline,
  TimelineItem, TimelineSeparator, TimelineConnector, TimelineContent,
  TimelineDot, TimelineOppositeContent,
} from '@mui/material';
import {
  ArrowBack, Edit, BugReport, AccountTree, Warning,
  ArrowUpward, Person, Business, CheckCircle, History,
  Phone, Assignment, Share,
} from '@mui/icons-material';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';
import { formatDate } from '../../utils';
import { useMediaQuery, useTheme } from '@mui/material';

const STATUS_CONFIG = {
  open:        { label: 'Open',        color: 'error'   },
  in_progress: { label: 'In Progress', color: 'warning' },
  resolved:    { label: 'Resolved',    color: 'success' },
  closed:      { label: 'Closed',      color: 'default' },
};

const StatusChip = ({ status }) => {
  const c = STATUS_CONFIG[status] || STATUS_CONFIG.open;
  return <Chip label={c.label} color={c.color} size="small" />;
};

const isOverdue = (expectedDate, status) => {
  if (!expectedDate || status === 'resolved' || status === 'closed') return false;
  return new Date(expectedDate) < new Date();
};

const TabPanel = ({ children, value, index }) =>
  value === index ? <Box sx={{ pt: 2 }}>{children}</Box> : null;

// ─── Share Complaint ──────────────────────────────────────────────────────────
const buildShareText = (complaint) => {
  const fmtD = d => {
    if (!d) return '—';
    if (d?.toDate) return d.toDate().toLocaleDateString('en-IN');
    return new Date(d).toLocaleDateString('en-IN');
  };
  const lines = [
    `🔔 *Complaint Details*`,
    ``,
    `📋 *Complaint #:* ${complaint.complaintNumber || '—'}`,
    `📅 *Date:* ${fmtD(complaint.createdAt)}`,
    ``,
    `👤 *Customer:* ${complaint.customerName}`,
    `📞 *Phone:* ${complaint.customerPhone || '—'}`,
    ``,
    `📝 *Title:* ${complaint.title}`,
    `🏷 *Category:* ${complaint.category || '—'}`,
    `🏭 *Brand:* ${complaint.brand || '—'}`,
    `📦 *Model:* ${complaint.model || '—'}`,
    `🔢 *Serial No:* ${complaint.serialNumber || '—'}`,
    `🛒 *Purchase Date:* ${fmtD(complaint.purchaseDate)}`,
    ``,
    `❗ *Issue:* ${complaint.reason || '—'}`,
    ``,
    `📌 *Status:* ${STATUS_CONFIG[complaint.status]?.label || complaint.status}`,
    `⏰ *Expected Resolution:* ${fmtD(complaint.expectedResolutionDate)}`,
    ``,
  ];

  if (complaint.assigneeType === 'external') {
    lines.push(`🏢 *Assigned To (External):*`);
    lines.push(`   Level: ${complaint.currentEscalationLevel === 'default' ? 'Default Handler' : `Level ${complaint.currentEscalationLevel}`}`);
    lines.push(`   Person: ${complaint.assignedPersonName || '—'}`);
    lines.push(`   Phone: ${complaint.assignedPersonPhone || '—'}`);
    if (complaint.companyComplaintNumber) lines.push(`   Brand Complaint #: ${complaint.companyComplaintNumber}`);
    if (complaint.companyRecordedDate) lines.push(`   Brand Recorded Date: ${fmtD(complaint.companyRecordedDate)}`);
  } else {
    lines.push(`👤 *Assigned To (Internal):* ${complaint.internalEmployeeName || '—'}`);
    lines.push(`   Phone: ${complaint.internalEmployeePhone || '—'}`);
  }

  if (complaint.notes) {
    lines.push(``, `📎 *Notes:* ${complaint.notes}`);
  }

  return lines.join('\n');
};

const ShareDialog = ({ open, onClose, complaint }) => {
  const text = complaint ? buildShareText(complaint) : '';
  const encodedText = encodeURIComponent(text);

  const handleWhatsApp = () => window.open(`https://wa.me/?text=${encodedText}`, '_blank');
  const handleCopy = () => { navigator.clipboard.writeText(text); toast.success('Copied to clipboard!'); };
  const handleNativeShare = () => {
    if (navigator.share) {
      navigator.share({ title: `Complaint ${complaint?.complaintNumber}`, text }).catch(() => {});
    } else {
      handleCopy();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Share color="primary" fontSize="small" /> Share Complaint
      </DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.50', borderRadius: 2, fontFamily: 'monospace', fontSize: 12,
          whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto', border: '1px solid', borderColor: 'divider' }}>
          {text}
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <Button fullWidth variant="contained"
            sx={{ bgcolor: '#25D366', '&:hover': { bgcolor: '#1ebe57' } }}
            onClick={handleWhatsApp}
            startIcon={<span style={{ fontSize: 16 }}>📱</span>}>
            Share on WhatsApp
          </Button>
          <Button fullWidth variant="outlined" onClick={handleNativeShare}
            startIcon={<Share fontSize="small" />}>
            Share / Other Apps
          </Button>
          <Button fullWidth variant="outlined" onClick={handleCopy}
            startIcon={<span style={{ fontSize: 14 }}>📋</span>}>
            Copy Text
          </Button>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Escalate Dialog ──────────────────────────────────────────────────────────
const EscalateDialog = ({ open, onClose, complaint, brandHierarchy, defaultHandler, onConfirm }) => {
  const [targetLevel, setTargetLevel] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const { userProfile } = useAuth();

  useEffect(() => {
    if (open) {
      const next = (complaint?.currentEscalationLevel || 1) + 1;
      setTargetLevel(next);
      setNote('');
    }
  }, [open, complaint]);

  if (!complaint || !brandHierarchy) return null;

  const levels = brandHierarchy.levels || [];
  const maxLevel = levels.length;
  const isAtMax = complaint.currentEscalationLevel >= maxLevel;
  const nextPerson = isAtMax ? defaultHandler : levels.find(lv => lv.level === targetLevel);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm(targetLevel, nextPerson, note, userProfile?.name || 'Admin', isAtMax);
      onClose();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <ArrowUpward color="error" /> Escalate Complaint
      </DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          {isAtMax
            ? 'All brand levels exhausted. This will escalate to the Default Handler.'
            : `Escalating from Level ${complaint.currentEscalationLevel} to Level ${targetLevel}`}
        </Alert>

        {/* Target level selector */}
        {!isAtMax && levels.length > 0 && (
          <FormControl fullWidth size="small" sx={{ mb: 2 }}>
            <InputLabel>Escalate To</InputLabel>
            <Select value={targetLevel} onChange={e => setTargetLevel(e.target.value)} label="Escalate To">
              {levels.filter(lv => lv.level > (complaint.currentEscalationLevel || 1)).map(lv => (
                <MenuItem key={lv.level} value={lv.level}>
                  <Box>
                    <Typography variant="body2" fontWeight={600}>Level {lv.level}{lv.title ? ` — ${lv.title}` : ''}</Typography>
                    <Typography variant="caption" color="text.secondary">{lv.personName} · {lv.phone}</Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {/* Target person card */}
        {(nextPerson || (isAtMax && defaultHandler)) && (
          <Paper sx={{ p: 2, bgcolor: 'error.50', border: '2px solid', borderColor: 'error.300', borderRadius: 2, mb: 2 }}>
            <Typography variant="caption" color="error.dark" fontWeight={700} display="block" mb={0.5}>
              WILL BE ASSIGNED TO {isAtMax ? '(DEFAULT HANDLER)' : ''}
            </Typography>
            <Box display="flex" alignItems="center" gap={1}>
              <Business color="error" />
              <Box>
                <Typography variant="body2" fontWeight={700}>{nextPerson?.personName || defaultHandler?.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  📞 {nextPerson?.phone || defaultHandler?.phone}
                  {(nextPerson?.title || defaultHandler?.title) ? ` · ${nextPerson?.title || defaultHandler?.title}` : ''}
                </Typography>
              </Box>
            </Box>
          </Paper>
        )}

        <TextField fullWidth size="small" label="Reason for Escalation"
          value={note} onChange={e => setNote(e.target.value)}
          multiline rows={2} placeholder="e.g. Issue not resolved within deadline..." />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="outlined" disabled={loading}>Cancel</Button>
        <Button onClick={handleConfirm} variant="contained" color="error" disabled={loading}
          startIcon={loading ? <CircularProgress size={16} /> : <ArrowUpward />}>
          {isAtMax ? 'Escalate to Default' : 'Escalate'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Status Update Dialog ─────────────────────────────────────────────────────
const StatusDialog = ({ open, onClose, currentStatus, onConfirm }) => {
  const [status, setStatus] = useState(currentStatus);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => { if (open) { setStatus(currentStatus); setNote(''); } }, [open, currentStatus]);
  const handleConfirm = async () => {
    setLoading(true);
    try { await onConfirm(status, note); onClose(); }
    catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Update Status</DialogTitle>
      <DialogContent>
        <FormControl fullWidth size="small" sx={{ mb: 2, mt: 1 }}>
          <InputLabel>New Status</InputLabel>
          <Select value={status} onChange={e => setStatus(e.target.value)} label="New Status">
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <MenuItem key={k} value={k}>{v.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField fullWidth size="small" label="Note (optional)"
          value={note} onChange={e => setNote(e.target.value)}
          multiline rows={2} placeholder="Optional note about this status change..." />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button onClick={handleConfirm} variant="contained" disabled={loading || status === currentStatus}
          startIcon={loading ? <CircularProgress size={16} /> : <CheckCircle />}>
          Update Status
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const ComplaintDetail = () => {
  const { db, userProfile } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [complaint, setComplaint] = useState(null);
  const [brandHierarchy, setBrandHierarchy] = useState(null);
  const [defaultHandler, setDefaultHandler] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'complaints', id));
      if (!snap.exists()) { toast.error('Complaint not found'); navigate('/complaints'); return; }
      const c = { id: snap.id, ...snap.data() };
      setComplaint(c);

      if (c.brandHierarchyId) {
        const bhSnap = await getDoc(doc(db, 'brandHierarchies', c.brandHierarchyId));
        if (bhSnap.exists()) setBrandHierarchy({ id: bhSnap.id, ...bhSnap.data() });
      }

      const defSnap = await getDoc(doc(db, 'settings', 'defaultComplaintHandler'));
      if (defSnap.exists()) setDefaultHandler(defSnap.data());
    } catch (e) {
      toast.error('Failed to load');
    } finally {
      setLoading(false);
    }
  }, [db, id, navigate]);

  useEffect(() => { load(); }, [load]);

  const handleEscalate = async (targetLevel, nextPerson, note, escalatedBy, isDefault) => {
    const newHistory = [...(complaint.escalationHistory || []), {
      level: isDefault ? 'default' : targetLevel,
      personName: nextPerson?.personName || nextPerson?.name || '',
      phone: nextPerson?.phone || '',
      title: nextPerson?.title || (isDefault ? 'Default Handler' : `Level ${targetLevel}`),
      assignedAt: new Date().toISOString(),
      assignedBy: escalatedBy,
      note: note || 'Escalated',
      isDefault,
    }];

    await updateDoc(doc(db, 'complaints', id), {
      currentEscalationLevel: isDefault ? 'default' : targetLevel,
      assignedPersonName: nextPerson?.personName || nextPerson?.name || '',
      assignedPersonPhone: nextPerson?.phone || '',
      assignedPersonTitle: nextPerson?.title || (isDefault ? 'Default Handler' : `Level ${targetLevel}`),
      escalationHistory: newHistory,
      status: 'in_progress',
      updatedAt: serverTimestamp(),
    });
    toast.success(isDefault ? 'Escalated to Default Handler' : `Escalated to Level ${targetLevel}`);
    await load();
  };

  const handleStatusChange = async (newStatus, note) => {
    const newHistory = [...(complaint.escalationHistory || []), {
      type: 'status_change',
      fromStatus: complaint.status,
      toStatus: newStatus,
      note: note || `Status changed to ${newStatus}`,
      changedAt: new Date().toISOString(),
      changedBy: userProfile?.name || 'Admin',
    }];
    await updateDoc(doc(db, 'complaints', id), {
      status: newStatus,
      escalationHistory: newHistory,
      updatedAt: serverTimestamp(),
    });
    toast.success('Status updated');
    await load();
  };

  if (loading) return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh"><CircularProgress /></Box>
  );
  if (!complaint) return null;

  const overdue = isOverdue(complaint.expectedResolutionDate, complaint.status);
  const levels = brandHierarchy?.levels || [];
  const maxLevel = levels.length;
  const isAtMax = complaint.currentEscalationLevel === 'default' || complaint.currentEscalationLevel >= maxLevel;
  const canEscalate = complaint.assigneeType === 'external' && !isAtMax;
  const isExternal = complaint.assigneeType === 'external';

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1000, mx: 'auto' }}>
      {/* Header */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3} flexWrap="wrap" gap={1}>
        <Box display="flex" alignItems="center" gap={1}>
          <IconButton onClick={() => navigate('/complaints')}><ArrowBack /></IconButton>
          <Box>
            <Typography variant="h5" fontWeight={700}>{complaint.complaintNumber}</Typography>
            <Typography variant="body2" color="text.secondary">
              {formatDate(complaint.createdAt?.toDate?.() || complaint.createdAt)} · {complaint.customerName}
            </Typography>
          </Box>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          {canEscalate && (
            <Button variant="outlined" color="error" startIcon={<ArrowUpward />}
              onClick={() => setEscalateOpen(true)} size={isMobile ? 'small' : 'medium'}>
              Escalate
            </Button>
          )}
          <Button variant="outlined" startIcon={<Assignment />}
            onClick={() => setStatusOpen(true)} size={isMobile ? 'small' : 'medium'}>
            Update Status
          </Button>
          <Button variant="outlined" color="success" startIcon={<Share />}
            onClick={() => setShareOpen(true)} size={isMobile ? 'small' : 'medium'}>
            {isMobile ? 'Share' : 'Share'}
          </Button>
          <Button variant="outlined" startIcon={<Edit />}
            onClick={() => navigate(`/complaints/edit/${id}`)} size={isMobile ? 'small' : 'medium'}>
            Edit
          </Button>
        </Stack>
      </Box>

      {overdue && (
        <Alert severity="error" icon={<Warning />} sx={{ mb: 2, borderRadius: 2 }}>
          This complaint is overdue! Expected resolution was {formatDate(complaint.expectedResolutionDate)}.
        </Alert>
      )}

      {/* Status + badges */}
      <Box display="flex" gap={1} mb={2} flexWrap="wrap">
        <StatusChip status={complaint.status} />
        {overdue && <Chip label="⚠ Overdue" color="error" size="small" variant="outlined" />}
        <Chip label={isExternal ? '🏢 External (Brand)' : '👤 Internal'} size="small" variant="outlined"
          color={isExternal ? 'warning' : 'primary'} />
        {isExternal && complaint.currentEscalationLevel && (
          <Chip
            label={complaint.currentEscalationLevel === 'default' ? '🚨 Default Handler' : `Level ${complaint.currentEscalationLevel}`}
            size="small"
            color={complaint.currentEscalationLevel === 'default' ? 'error' : 'warning'}
          />
        )}
      </Box>

      {/* Summary cards */}
      <Grid container spacing={2} mb={2}>
        {[
          { label: 'Customer', value: complaint.customerName, sub: complaint.customerPhone },
          { label: 'Title', value: complaint.title },
          { label: 'Brand / Model', value: complaint.brand || '—', sub: complaint.model },
          { label: 'Expected By', value: formatDate(complaint.expectedResolutionDate), highlight: overdue ? 'error' : null },
        ].map(({ label, value, sub, highlight }) => (
          <Grid item xs={6} sm={3} key={label}>
            <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, height: '100%' }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block">{label}</Typography>
                <Typography variant="body2" fontWeight={700} color={highlight ? `${highlight}.main` : 'text.primary'} noWrap>
                  {value}
                </Typography>
                {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 0 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant={isMobile ? 'fullWidth' : 'standard'}>
          <Tab label="Details" />
          <Tab label="Assignment" />
          <Tab label="History" />
        </Tabs>
      </Box>

      {/* Tab 0: Details */}
      <TabPanel value={tab} index={0}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <CardContent>
                <Typography variant="subtitle2" fontWeight={700} color="text.secondary" gutterBottom>COMPLAINT INFO</Typography>
                {[
                  ['Category', complaint.category || '—'],
                  ['Serial Number', complaint.serialNumber || '—'],
                  ['Purchase Date', formatDate(complaint.purchaseDate)],
                  ...(complaint.assigneeType === 'external' && complaint.companyComplaintNumber
                    ? [['Brand Complaint #', complaint.companyComplaintNumber]] : []),
                  ...(complaint.assigneeType === 'external' && complaint.companyRecordedDate
                    ? [['Brand Recorded Date', formatDate(complaint.companyRecordedDate)]] : []),
                ].map(([k, v]) => (
                  <Box key={k} display="flex" justifyContent="space-between" py={0.5} borderBottom="1px solid" borderColor="divider">
                    <Typography variant="body2" color="text.secondary">{k}</Typography>
                    <Typography variant="body2" fontWeight={600}>{v}</Typography>
                  </Box>
                ))}
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <CardContent>
                <Typography variant="subtitle2" fontWeight={700} color="text.secondary" gutterBottom>ISSUE DESCRIPTION</Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{complaint.reason || '—'}</Typography>
                {complaint.notes && (
                  <>
                    <Divider sx={{ my: 1.5 }} />
                    <Typography variant="subtitle2" fontWeight={700} color="text.secondary" gutterBottom>INTERNAL NOTES</Typography>
                    <Typography variant="body2" color="text.secondary">{complaint.notes}</Typography>
                  </>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </TabPanel>

      {/* Tab 1: Assignment */}
      <TabPanel value={tab} index={1}>
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 2 }}>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={700} mb={2}>Current Assignment</Typography>
            <Paper sx={{
              p: 2.5, borderRadius: 2, border: '2px solid',
              borderColor: isExternal ? 'warning.300' : 'primary.300',
              bgcolor: isExternal ? 'warning.50' : 'primary.50',
            }}>
              <Box display="flex" alignItems="center" gap={1.5}>
                {isExternal ? <Business color="warning" sx={{ fontSize: 32 }} /> : <Person color="primary" sx={{ fontSize: 32 }} />}
                <Box>
                  <Typography variant="body1" fontWeight={700}>
                    {complaint.assignedPersonName || complaint.internalEmployeeName || '—'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    📞 {complaint.assignedPersonPhone || complaint.internalEmployeePhone || '—'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {complaint.assignedPersonTitle || (isExternal ? `Level ${complaint.currentEscalationLevel}` : 'Internal')}
                  </Typography>
                </Box>
              </Box>
            </Paper>

            {/* Escalation flow */}
            {isExternal && brandHierarchy?.levels?.length > 0 && (
              <Box sx={{ mt: 3 }}>
                <Typography variant="subtitle2" fontWeight={700} color="text.secondary" mb={1.5}>ESCALATION FLOW</Typography>
                <Box display="flex" alignItems="center" flexWrap="wrap" gap={1}>
                  {brandHierarchy.levels.map((lv, i) => {
                    const isCurrent = lv.level === complaint.currentEscalationLevel;
                    const isPast = lv.level < (complaint.currentEscalationLevel === 'default' ? 999 : complaint.currentEscalationLevel);
                    return (
                      <React.Fragment key={lv.level}>
                        <Box sx={{
                          px: 1.5, py: 1, borderRadius: 1, border: '2px solid',
                          borderColor: isCurrent ? 'warning.main' : isPast ? 'success.300' : 'grey.300',
                          bgcolor: isCurrent ? 'warning.100' : isPast ? 'success.50' : 'grey.50',
                          minWidth: 90, textAlign: 'center',
                        }}>
                          <Typography variant="caption" fontWeight={700}
                            color={isCurrent ? 'warning.main' : isPast ? 'success.main' : 'text.secondary'} display="block">
                            L{lv.level}{lv.title ? ` · ${lv.title}` : ''}
                          </Typography>
                          <Typography variant="caption" fontWeight={isCurrent ? 700 : 400}>
                            {lv.personName}
                          </Typography>
                          {isCurrent && <Typography display="block" variant="caption" color="warning.dark">← Current</Typography>}
                          {isPast && <Typography display="block" variant="caption" color="success.main">✓ Done</Typography>}
                        </Box>
                        {i < brandHierarchy.levels.length - 1 && <Typography color="text.disabled">→</Typography>}
                      </React.Fragment>
                    );
                  })}
                  <Typography color="text.disabled">→</Typography>
                  <Box sx={{
                    px: 1.5, py: 1, borderRadius: 1, border: '2px solid',
                    borderColor: complaint.currentEscalationLevel === 'default' ? 'error.main' : 'grey.300',
                    bgcolor: complaint.currentEscalationLevel === 'default' ? 'error.100' : 'grey.50',
                    textAlign: 'center', minWidth: 90,
                  }}>
                    <Typography variant="caption" fontWeight={700} color={complaint.currentEscalationLevel === 'default' ? 'error.main' : 'text.secondary'} display="block">
                      Default
                    </Typography>
                    <Typography variant="caption">{defaultHandler?.name || 'Not Set'}</Typography>
                    {complaint.currentEscalationLevel === 'default' && <Typography display="block" variant="caption" color="error.main">← Current</Typography>}
                  </Box>
                </Box>
                {canEscalate && (
                  <Button startIcon={<ArrowUpward />} color="error" variant="outlined"
                    size="small" sx={{ mt: 2 }} onClick={() => setEscalateOpen(true)}>
                    Escalate to Next Level
                  </Button>
                )}
                {isAtMax && (
                  <Alert severity="error" sx={{ mt: 2 }}>
                    Maximum escalation reached. Complaint is with the Default Handler.
                  </Alert>
                )}
              </Box>
            )}
          </CardContent>
        </Card>
      </TabPanel>

      {/* Tab 2: History */}
      <TabPanel value={tab} index={2}>
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={700} mb={2}>Escalation & Activity History</Typography>
            {!(complaint.escalationHistory?.length) ? (
              <Typography color="text.secondary" variant="body2">No history recorded yet.</Typography>
            ) : (
              <Stack spacing={1.5}>
                {[...(complaint.escalationHistory || [])].reverse().map((h, i) => {
                  const isStatusChange = h.type === 'status_change';
                  return (
                    <Box key={i} sx={{
                      p: 2, borderRadius: 2, border: '1px solid',
                      borderColor: isStatusChange ? 'divider' : 'error.200',
                      bgcolor: isStatusChange ? 'grey.50' : 'error.50',
                    }}>
                      <Box display="flex" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={0.5}>
                        <Box display="flex" alignItems="center" gap={1}>
                          {isStatusChange ? <CheckCircle fontSize="small" color="success" /> : <ArrowUpward fontSize="small" color="error" />}
                          <Typography variant="body2" fontWeight={700}>
                            {isStatusChange
                              ? `Status: ${STATUS_CONFIG[h.fromStatus]?.label || h.fromStatus} → ${STATUS_CONFIG[h.toStatus]?.label || h.toStatus}`
                              : h.isDefault
                                ? '🚨 Escalated to Default Handler'
                                : `Assigned to Level ${h.level}${h.title ? ` (${h.title})` : ''}`}
                          </Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          {h.assignedAt || h.changedAt
                            ? formatDate(h.assignedAt || h.changedAt)
                            : '—'
                          }
                        </Typography>
                      </Box>
                      {!isStatusChange && h.personName && (
                        <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                          👤 {h.personName} · 📞 {h.phone}
                        </Typography>
                      )}
                      {h.note && (
                        <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                          💬 {h.note}
                        </Typography>
                      )}
                      {(h.assignedBy || h.changedBy) && (
                        <Typography variant="caption" color="text.disabled" display="block" mt={0.5}>
                          By: {h.assignedBy || h.changedBy}
                        </Typography>
                      )}
                    </Box>
                  );
                })}
              </Stack>
            )}
          </CardContent>
        </Card>
      </TabPanel>

      {/* Dialogs */}
      <EscalateDialog
        open={escalateOpen} onClose={() => setEscalateOpen(false)}
        complaint={complaint} brandHierarchy={brandHierarchy}
        defaultHandler={defaultHandler} onConfirm={handleEscalate}
      />
      <StatusDialog
        open={statusOpen} onClose={() => setStatusOpen(false)}
        currentStatus={complaint.status} onConfirm={handleStatusChange}
      />
      <ShareDialog
        open={shareOpen} onClose={() => setShareOpen(false)}
        complaint={complaint}
      />
    </Box>
  );
};

export default ComplaintDetail;