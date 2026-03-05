import React, { useState } from "react";
import {
  Box, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TablePagination, Paper, TextField, IconButton,
  Tooltip, Stack, Typography, InputAdornment, Chip, Button,
  Menu, MenuItem, CircularProgress,
} from "@mui/material";
import {
  Search, FilterList, Edit, Delete, Visibility, MoreVert, Add,
  FileDownload, Refresh,
} from "@mui/icons-material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";

export default function DataTable({
  title,
  columns,
  rows,
  total,
  page,
  rowsPerPage,
  onPageChange,
  onRowsPerPageChange,
  onSearch,
  onDateRange,
  onAdd,
  onEdit,
  onDelete,
  onView,
  loading = false,
  addLabel = "Add New",
  extraFilters,
  extraActions,
  selectable = false,
  rowKey = "id",
}) {
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [anchorEl, setAnchorEl] = useState(null);
  const [activeRow, setActiveRow] = useState(null);

  const handleSearch = (v) => {
    setSearch(v);
    onSearch && onSearch(v);
  };

  const handleDateApply = () => {
    onDateRange && onDateRange(startDate, endDate);
  };

  const handleClearDates = () => {
    setStartDate(null);
    setEndDate(null);
    onDateRange && onDateRange(null, null);
  };

  const handleMenuOpen = (e, row) => {
    setAnchorEl(e.currentTarget);
    setActiveRow(row);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setActiveRow(null);
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box>
        {/* Header */}
        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between"
          alignItems={{ xs: "stretch", sm: "center" }} spacing={2} mb={2}>
          <Typography variant="h6" fontWeight={700} color="primary.main">
            {title}
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {onAdd && (
              <Button variant="contained" startIcon={<Add />} onClick={onAdd}
                size="small" sx={{ borderRadius: 2, whiteSpace: "nowrap" }}>
                {addLabel}
              </Button>
            )}
            {extraActions}
          </Stack>
        </Stack>

        {/* Filters */}
        <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="center" flexWrap="wrap">
            <TextField
              size="small"
              placeholder="Search..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              InputProps={{
                startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment>,
              }}
              sx={{ minWidth: 200, flexGrow: 1 }}
            />
            <DatePicker
              label="From Date"
              value={startDate}
              onChange={setStartDate}
              slotProps={{ textField: { size: "small", sx: { width: 160 } } }}
            />
            <DatePicker
              label="To Date"
              value={endDate}
              onChange={setEndDate}
              slotProps={{ textField: { size: "small", sx: { width: 160 } } }}
            />
            <Button variant="outlined" size="small" onClick={handleDateApply}
              startIcon={<FilterList />} sx={{ borderRadius: 2 }}>
              Apply
            </Button>
            {(startDate || endDate) && (
              <Button size="small" onClick={handleClearDates} color="error"
                startIcon={<Refresh />} sx={{ borderRadius: 2 }}>
                Clear
              </Button>
            )}
            {extraFilters}
          </Stack>
        </Paper>

        {/* Table */}
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          {loading ? (
            <Box display="flex" justifyContent="center" py={6}>
              <CircularProgress />
            </Box>
          ) : (
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {columns.map((col) => (
                    <TableCell key={col.field}
                      sx={{ fontWeight: 700, bgcolor: "primary.main", color: "white",
                        whiteSpace: "nowrap", px: 2, py: 1.5 }}
                      align={col.align || "left"}>
                      {col.headerName}
                    </TableCell>
                  ))}
                  <TableCell sx={{ fontWeight: 700, bgcolor: "primary.main", color: "white",
                    whiteSpace: "nowrap", px: 2 }} align="center">
                    Actions
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columns.length + 1} align="center" sx={{ py: 6 }}>
                      <Typography color="text.secondary">No records found</Typography>
                    </TableCell>
                  </TableRow>
                ) : rows.map((row, idx) => (
                  <TableRow key={row[rowKey] || idx}
                    hover sx={{ "&:last-child td": { borderBottom: 0 } }}>
                    {columns.map((col) => (
                      <TableCell key={col.field} align={col.align || "left"}
                        sx={{ px: 2, py: 1, fontSize: 13 }}>
                        {col.renderCell ? col.renderCell(row) : row[col.field] ?? "—"}
                      </TableCell>
                    ))}
                    <TableCell align="center" sx={{ px: 1 }}>
                      <IconButton size="small" onClick={(e) => handleMenuOpen(e, row)}>
                        <MoreVert fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_, p) => onPageChange(p)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => onRowsPerPageChange(parseInt(e.target.value))}
            rowsPerPageOptions={[10, 25, 50]}
          />
        </TableContainer>

        {/* Row Actions Menu */}
        <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
          {onView && (
            <MenuItem onClick={() => { onView(activeRow); handleMenuClose(); }}>
              <Visibility fontSize="small" sx={{ mr: 1 }} /> View
            </MenuItem>
          )}
          {onEdit && (
            <MenuItem onClick={() => { onEdit(activeRow); handleMenuClose(); }}>
              <Edit fontSize="small" sx={{ mr: 1 }} /> Edit
            </MenuItem>
          )}
          {onDelete && (
            <MenuItem onClick={() => { onDelete(activeRow); handleMenuClose(); }}
              sx={{ color: "error.main" }}>
              <Delete fontSize="small" sx={{ mr: 1 }} /> Delete
            </MenuItem>
          )}
        </Menu>
      </Box>
    </LocalizationProvider>
  );
}
