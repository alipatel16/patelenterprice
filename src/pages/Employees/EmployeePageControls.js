import React from 'react';
import { Box, TextField, TablePagination } from '@mui/material';
import QueryStatus from '../../components/QueryStatus';

export default function EmployeePageControls({ search, setSearch, result }) {
  return <Box sx={{ mb: 2 }}>
    <TextField size="small" label="Search employees" value={search} onChange={e => setSearch(e.target.value)} />
    <QueryStatus error={result.error} loading={result.loading} search={search} />
    <TablePagination component="div" count={result.total ?? -1} page={result.page} rowsPerPage={15} rowsPerPageOptions={[15]} onPageChange={(_, page) => result.setPage(page)} nextIconButtonProps={{ disabled: result.loading || !result.hasNext }} />
  </Box>;
}
