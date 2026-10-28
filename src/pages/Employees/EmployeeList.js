import usePagedCollection from '../../hooks/usePagedCollection';
import QueryStatus from '../../components/QueryStatus';
import { employeeQuery } from './employeeData';
// src/pages/Employees/EmployeeList.js
import React, { useState } from 'react';
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

import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const PAGE_SIZE = 15;

const EmployeeList = () => {
  const { db, isAdmin } = useAuth();
  const navigate = useNavigate();
  const theme  = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [search, setSearch] = useState('');
  const { rows, loading, total, page, setPage, refresh, error } = usePagedCollection(db, 'users', employeeQuery(search));
  const handleSearch = setSearch;

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
            <IconButton onClick={() => { refresh(); }}>
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

      <QueryStatus error={error} loading={loading} search={search} />
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
              count={total ?? -1}
              page={page}
              onPageChange={(_, p) => { setPage(p); }}
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