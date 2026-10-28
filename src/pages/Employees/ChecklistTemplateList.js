import usePagedCollection from '../../hooks/usePagedCollection';
import QueryStatus from '../../components/QueryStatus';
import { deleteRecord as deleteDoc } from '../../data/writes';
// src/pages/Employees/ChecklistTemplateList.js
import React, { useState } from 'react';
import {
  Box, Typography, Card, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TablePagination,
  Chip, IconButton, Button, CircularProgress, Stack,
  Dialog, DialogTitle, DialogContent, DialogActions, Tooltip,
  useTheme, useMediaQuery,
} from '@mui/material';
import { Add, Edit, Delete, Checklist, Refresh } from '@mui/icons-material';
import { doc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';
import { DAYS_OF_WEEK } from './employeeConstants';

const PAGE_SIZE = 15;

const occurrenceLabel = (t) => {
  if (t.occurrenceType === 'daily')   return { label: 'Daily',   color: 'success' };
  if (t.occurrenceType === 'weekly') {
    const day = DAYS_OF_WEEK.find(d => d.value === t.dayOfWeek)?.label || '';
    return { label: `Every ${day}`, color: 'primary' };
  }
  if (t.occurrenceType === 'monthly') return { label: `Monthly (Day ${t.dayOfMonth})`, color: 'warning' };
  return { label: t.occurrenceType, color: 'default' };
};

const ChecklistTemplateList = () => {
  const { db } = useAuth();
  const navigate = useNavigate();
  const theme    = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const { rows, loading, total, page, setPage, refresh, error } = usePagedCollection(db, 'checklistTemplates', { sort: [['title', 'asc']], pageSize: 15 });
  const [deleteId,  setDeleteId]  = useState(null);
  const [deleteTitle, setDeleteTitle] = useState('');
  const [deleting,  setDeleting]  = useState(false);

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'checklistTemplates', deleteId));
      toast.success('Template deleted');
      setDeleteId(null);
      setPage(0);
      refresh();
    } catch (e) {
      toast.error('Delete failed: ' + e.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <QueryStatus error={error} loading={loading} />
      {/* Header */}
      <Box display="flex" alignItems={{ xs: 'flex-start', sm: 'center' }}
        flexDirection={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between" gap={2} mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Checklist Templates</Typography>
          <Typography variant="body2" color="text.secondary">
            Define recurring checklists assigned to employees
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Tooltip title="Refresh">
            <IconButton onClick={() => { setPage(0); refresh();  }}>
              <Refresh />
            </IconButton>
          </Tooltip>
          <Button variant="contained" startIcon={<Add />}
            onClick={() => navigate('/checklist-templates/new')} size={isMobile ? 'small' : 'medium'}>
            New Template
          </Button>
        </Stack>
      </Box>

      <Card>
        {loading ? (
          <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
        ) : rows.length === 0 ? (
          <Box textAlign="center" py={6}>
            <Checklist sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography color="text.secondary" mb={2}>No checklist templates yet</Typography>
            <Button variant="contained" startIcon={<Add />}
              onClick={() => navigate('/checklist-templates/new')}>
              Create First Template
            </Button>
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table size={isMobile ? 'small' : 'medium'}>
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.50' }}>
                    <TableCell>Title</TableCell>
                    {!isMobile && <TableCell>Description</TableCell>}
                    <TableCell>Occurrence</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map(row => {
                    const occ = occurrenceLabel(row);
                    return (
                      <TableRow key={row.id} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>{row.title}</Typography>
                          {isMobile && (
                            <Typography variant="caption" color="text.secondary" display="block">
                              {row.description || '—'}
                            </Typography>
                          )}
                        </TableCell>
                        {!isMobile && (
                          <TableCell>
                            <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 250 }}>
                              {row.description || '—'}
                            </Typography>
                          </TableCell>
                        )}
                        <TableCell>
                          <Chip label={occ.label} color={occ.color} size="small" />
                        </TableCell>
                        <TableCell align="center">
                          <Stack direction="row" spacing={0.5} justifyContent="center">
                            <Tooltip title="Edit">
                              <IconButton size="small"
                                onClick={() => navigate(`/checklist-templates/edit/${row.id}`)}>
                                <Edit fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete">
                              <IconButton size="small" color="error"
                                onClick={() => { setDeleteId(row.id); setDeleteTitle(row.title); }}>
                                <Delete fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div" count={total ?? -1} page={page}
              onPageChange={(_, p) => { setPage(p); if (p === 0) refresh(); }}
              rowsPerPage={PAGE_SIZE} rowsPerPageOptions={[PAGE_SIZE]}
            />
          </>
        )}
      </Card>

      {/* Delete Confirm */}
      <Dialog open={!!deleteId} onClose={() => setDeleteId(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Template?</DialogTitle>
        <DialogContent>
          <Typography>
            Delete <strong>"{deleteTitle}"</strong>? Employees with this checklist assigned won't
            generate new instances, but existing records are kept.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained" disabled={deleting}>
            {deleting ? <CircularProgress size={16} /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ChecklistTemplateList;