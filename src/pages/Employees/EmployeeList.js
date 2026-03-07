// src/pages/Employees/EmployeeList.js
import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Card, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TablePagination,
  Chip, IconButton, Stack, TextField, InputAdornment,
  Avatar, CircularProgress, Button, Tooltip, useTheme, useMediaQuery,
} from '@mui/material';
import {
  Search, Edit, PersonAdd, Refresh, Badge,
  CheckCircle, Block,
} from '@mui/icons-material';
import {
  collection, query, orderBy, limit, startAfter,
  getDocs, where, getCountFromServer,
} from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';

const PAGE_SIZE = 10;

const EmployeeList = () => {
  const { db, isAdmin } = useAuth();
  const navigate = useNavigate();
  const theme  = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(0);
  const [search,  setSearch]  = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [cursorMap, setCursorMap] = useState({});
  const [refreshKey, setRefreshKey] = useState(0);
  const searchTimer = useRef(null);

  const handleSearch = (val) => {
    setSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(0);
      setCursorMap({});
    }, 450);
  };

  // Count
  useEffect(() => {
    if (!db) return;
    const countQuery = query(collection(db, 'users'), where('role', '==', 'employee'));
    getCountFromServer(countQuery)
      .then(s => setTotal(s.data().count))
      .catch(() => {});
  }, [db, refreshKey]);

  // Load page
  useEffect(() => {
    if (!db) return;
    const load = async () => {
      setLoading(true);
      try {
        let q;
        if (page === 0) {
          q = query(
            collection(db, 'users'),
            where('role', '==', 'employee'),
            orderBy('name'),
            limit(PAGE_SIZE)
          );
        } else {
          const cursor = cursorMap[page - 1];
          if (!cursor) return;
          q = query(
            collection(db, 'users'),
            where('role', '==', 'employee'),
            orderBy('name'),
            startAfter(cursor),
            limit(PAGE_SIZE)
          );
        }
        const snap = await getDocs(q);
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data(), _snap: d }));
        if (snap.docs.length > 0) {
          setCursorMap(prev => ({ ...prev, [page]: snap.docs[snap.docs.length - 1] }));
        }
        // Client-side search filter (name/email/phone) — for full server-side search you'd need Algolia
        const filtered = debouncedSearch
          ? docs.filter(e =>
              (e.name   || '').toLowerCase().includes(debouncedSearch.toLowerCase()) ||
              (e.email  || '').toLowerCase().includes(debouncedSearch.toLowerCase()) ||
              (e.phone  || '').toLowerCase().includes(debouncedSearch.toLowerCase())
            )
          : docs;
        setRows(filtered);
      } catch (e) {
        toast.error('Failed to load employees: ' + e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line
  }, [db, page, debouncedSearch, refreshKey]);

  const roleColor = (role) => role === 'admin' ? 'error' : 'primary';

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* Header */}
      <Box display="flex" alignItems={{ xs: 'flex-start', sm: 'center' }}
        flexDirection={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between" gap={2} mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Employees</Typography>
          <Typography variant="body2" color="text.secondary">
            Manage team members, roles, and access
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Tooltip title="Refresh">
            <IconButton onClick={() => { setPage(0); setCursorMap({}); setRefreshKey(k => k + 1); }}>
              <Refresh />
            </IconButton>
          </Tooltip>
          {isAdmin && (
            <Button variant="contained" startIcon={<PersonAdd />}
              onClick={() => navigate('/employees/new')} size={isMobile ? 'small' : 'medium'}>
              Add Employee
            </Button>
          )}
        </Stack>
      </Box>

      {/* Search */}
      <Card sx={{ mb: 2, p: 2 }}>
        <TextField fullWidth size="small" placeholder="Search by name, email, or phone…"
          value={search} onChange={e => handleSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }}
        />
      </Card>

      {/* Table */}
      <Card>
        {loading ? (
          <Box display="flex" justifyContent="center" py={6}>
            <CircularProgress />
          </Box>
        ) : rows.length === 0 ? (
          <Box textAlign="center" py={6}>
            <Badge sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography color="text.secondary">No employees found</Typography>
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table size={isMobile ? 'small' : 'medium'}>
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.50' }}>
                    <TableCell>Employee</TableCell>
                    {!isMobile && <TableCell>Phone</TableCell>}
                    {!isMobile && <TableCell>Department</TableCell>}
                    <TableCell>Role</TableCell>
                    <TableCell>Access</TableCell>
                    {isAdmin && <TableCell align="center">Actions</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map(emp => (
                    <TableRow key={emp.id} hover>
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={1.5}>
                          <Avatar sx={{ width: 36, height: 36, bgcolor: 'primary.main', fontSize: 14 }}>
                            {(emp.name || '?')[0].toUpperCase()}
                          </Avatar>
                          <Box>
                            <Typography variant="body2" fontWeight={600}>{emp.name}</Typography>
                            <Typography variant="caption" color="text.secondary">{emp.email}</Typography>
                            {isMobile && (
                              <Typography variant="caption" display="block" color="text.secondary">
                                {emp.phone || '—'}
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      </TableCell>
                      {!isMobile && (
                        <TableCell>
                          <Typography variant="body2">{emp.phone || '—'}</Typography>
                        </TableCell>
                      )}
                      {!isMobile && (
                        <TableCell>
                          <Typography variant="body2">{emp.department || '—'}</Typography>
                        </TableCell>
                      )}
                      <TableCell>
                        <Chip label={emp.role} color={roleColor(emp.role)} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell>
                        {emp.allowedPages?.length > 0 ? (
                          <Chip icon={<CheckCircle sx={{ fontSize: 14 }} />}
                            label={`${emp.allowedPages.length} pages`}
                            color="success" size="small" variant="outlined" />
                        ) : (
                          <Chip icon={<Block sx={{ fontSize: 14 }} />}
                            label="All Access" color="default" size="small" variant="outlined" />
                        )}
                      </TableCell>
                      {isAdmin && (
                        <TableCell align="center">
                          <Tooltip title="Edit Profile">
                            <IconButton size="small"
                              onClick={() => navigate(`/employees/edit/${emp.id}`)}>
                              <Edit fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={total}
              page={page}
              onPageChange={(_, p) => { setPage(p); if (p === 0) setCursorMap({}); }}
              rowsPerPage={PAGE_SIZE}
              rowsPerPageOptions={[PAGE_SIZE]}
            />
          </>
        )}
      </Card>
    </Box>
  );
};

export default EmployeeList;