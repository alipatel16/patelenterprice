import React, { useState, useEffect, useCallback } from "react";
import {
  Box, Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Stack, FormControl, InputLabel, Select,
  MenuItem, Typography, Chip, Alert, Grid,
} from "@mui/material";
import {
  collection, query, where, getDocs, addDoc, updateDoc,
  deleteDoc, doc, orderBy, limit, startAfter, getCountFromServer,
  Timestamp,
} from "firebase/firestore";
import { useAuth } from "../../contexts/AuthContext";
import DataTable from "../../components/Common/DataTable";
import ConfirmDialog from "../../components/Common/ConfirmDialog";
import { useSnackbar } from "notistack";
import dayjs from "dayjs";

const EMPTY_FORM = {
  name: "", phone: "", email: "", address: "", city: "",
  customerType: "retail", category: "individual",
  gstNumber: "", panNumber: "",
};

export default function CustomersPage() {
  const { userProfile, db } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState({ start: null, end: null });
  const [cursors, setCursors] = useState([null]); // page cursors
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filterType, setFilterType] = useState("all");

  const storeCategory = userProfile?.storeCategory;

  const fetchTotal = useCallback(async () => {
    const q = query(collection(db, "customers"), where("storeCategory", "==", storeCategory));
    const snap = await getCountFromServer(q);
    setTotal(snap.data().count);
  }, [storeCategory]);

  const fetchData = useCallback(async (pageNum = 0) => {
    setLoading(true);
    try {
      let q = query(
        collection(db, "customers"),
        where("storeCategory", "==", storeCategory),
        orderBy("createdAt", "desc"),
        limit(rowsPerPage)
      );
      if (pageNum > 0 && cursors[pageNum]) {
        q = query(q, startAfter(cursors[pageNum]));
      }
      const snap = await getDocs(q);
      let data = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Client-side search filter
      if (search) {
        const s = search.toLowerCase();
        data = data.filter(r =>
          r.name?.toLowerCase().includes(s) ||
          r.phone?.includes(s) ||
          r.email?.toLowerCase().includes(s)
        );
      }
      if (filterType !== "all") {
        data = data.filter(r => r.customerType === filterType);
      }
      if (dateRange.start && dateRange.end) {
        data = data.filter(r => {
          const d = r.createdAt?.toDate?.();
          return d >= dateRange.start.toDate() && d <= dateRange.end.toDate();
        });
      }

      // Save next cursor
      if (snap.docs.length > 0) {
        const newCursors = [...cursors];
        newCursors[pageNum + 1] = snap.docs[snap.docs.length - 1];
        setCursors(newCursors);
      }
      setRows(data);
    } finally {
      setLoading(false);
    }
  }, [storeCategory, rowsPerPage, search, filterType, dateRange, cursors]);

  useEffect(() => {
    fetchTotal();
  }, [storeCategory]);

  useEffect(() => {
    setPage(0);
    setCursors([null]);
    fetchData(0);
  }, [search, filterType, dateRange, rowsPerPage, storeCategory]);

  const handlePageChange = (newPage) => {
    setPage(newPage);
    fetchData(newPage);
  };

  const openAdd = () => { setEditRow(null); setForm(EMPTY_FORM); setFormError(""); setDialogOpen(true); };
  const openEdit = (row) => { setEditRow(row); setForm({ ...row }); setFormError(""); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.name || !form.phone) return setFormError("Name and phone are required.");
    setFormError("");
    try {
      if (editRow) {
        await updateDoc(doc(db, "customers", editRow.id), { ...form, updatedAt: Timestamp.now() });
        enqueueSnackbar("Customer updated!", { variant: "success" });
      } else {
        await addDoc(collection(db, "customers"), {
          ...form, storeCategory, createdAt: Timestamp.now(),
        });
        enqueueSnackbar("Customer added!", { variant: "success" });
      }
      setDialogOpen(false);
      fetchTotal();
      fetchData(0);
    } catch (e) {
      setFormError("Failed to save. Please try again.");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteDoc(doc(db, "customers", deleteTarget.id));
      enqueueSnackbar("Customer deleted!", { variant: "success" });
      setDeleteTarget(null);
      fetchTotal();
      fetchData(0);
    } catch {
      enqueueSnackbar("Delete failed.", { variant: "error" });
    }
  };

  const columns = [
    { field: "name", headerName: "Name" },
    { field: "phone", headerName: "Phone" },
    { field: "email", headerName: "Email" },
    { field: "city", headerName: "City" },
    {
      field: "customerType", headerName: "Type",
      renderCell: (r) => (
        <Chip label={r.customerType} size="small"
          color={r.customerType === "wholesale" ? "primary" : "default"} />
      ),
    },
    {
      field: "category", headerName: "Category",
      renderCell: (r) => (
        <Chip label={r.category} size="small" variant="outlined"
          color={r.category === "firm" ? "warning" : "default"} />
      ),
    },
    {
      field: "createdAt", headerName: "Added On",
      renderCell: (r) => r.createdAt?.toDate?.()?.toLocaleDateString?.() || "—",
    },
  ];

  return (
    <Box>
      <DataTable
        title="Customers"
        columns={columns}
        rows={rows}
        total={total}
        page={page}
        rowsPerPage={rowsPerPage}
        onPageChange={handlePageChange}
        onRowsPerPageChange={(r) => setRowsPerPage(r)}
        onSearch={setSearch}
        onDateRange={(s, e) => setDateRange({ start: s, end: e })}
        onAdd={openAdd}
        onEdit={openEdit}
        onDelete={(r) => setDeleteTarget(r)}
        loading={loading}
        addLabel="Add Customer"
        extraFilters={
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Type</InputLabel>
            <Select value={filterType} label="Type" onChange={(e) => setFilterType(e.target.value)}>
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="wholesale">Wholesale</MenuItem>
              <MenuItem value="retail">Retail</MenuItem>
            </Select>
          </FormControl>
        }
      />

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle fontWeight={700}>{editRow ? "Edit Customer" : "Add Customer"}</DialogTitle>
        <DialogContent dividers>
          {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
          <Grid container spacing={2} mt={0.5}>
            <Grid item xs={12} sm={6}>
              <TextField label="Full Name *" fullWidth value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="Phone *" fullWidth value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="Email" fullWidth value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="City" fullWidth value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </Grid>
            <Grid item xs={12}>
              <TextField label="Address" fullWidth multiline rows={2} value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Customer Type</InputLabel>
                <Select value={form.customerType} label="Customer Type"
                  onChange={(e) => setForm({ ...form, customerType: e.target.value })}>
                  <MenuItem value="retail">Retail</MenuItem>
                  <MenuItem value="wholesale">Wholesale</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Category</InputLabel>
                <Select value={form.category} label="Category"
                  onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  <MenuItem value="individual">Individual</MenuItem>
                  <MenuItem value="firm">Firm</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="GST Number" fullWidth value={form.gstNumber}
                onChange={(e) => setForm({ ...form, gstNumber: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="PAN Number" fullWidth value={form.panNumber}
                onChange={(e) => setForm({ ...form, panNumber: e.target.value })} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>
            {editRow ? "Update" : "Add Customer"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Delete */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        message={`Delete customer "${deleteTarget?.name}"?`}
      />
    </Box>
  );
}
