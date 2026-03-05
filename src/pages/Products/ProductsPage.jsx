import React, { useState, useEffect, useCallback } from "react";
import {
  Box, Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Stack, Typography, Alert, Grid, InputAdornment,
} from "@mui/material";
import {
  collection, query, where, getDocs, addDoc, updateDoc,
  deleteDoc, doc, orderBy, limit, startAfter, getCountFromServer, Timestamp,
} from "firebase/firestore";
import { useAuth } from "../../contexts/AuthContext";
import DataTable from "../../components/Common/DataTable";
import ConfirmDialog from "../../components/Common/ConfirmDialog";
import { useSnackbar } from "notistack";

const EMPTY = {
  name: "", maker: "", description: "", hsnCode: "", price: "",
  taxRate: "", unit: "piece",
};

export default function ProductsPage() {
  const { userProfile, db } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState({ start: null, end: null });
  const [cursors, setCursors] = useState([null]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  const storeCategory = userProfile?.storeCategory;

  const fetchTotal = useCallback(async () => {
    const snap = await getCountFromServer(
      query(collection(db, "products"), where("storeCategory", "==", storeCategory))
    );
    setTotal(snap.data().count);
  }, [storeCategory]);

  const fetchData = useCallback(async (pageNum = 0) => {
    setLoading(true);
    try {
      let q = query(
        collection(db, "products"),
        where("storeCategory", "==", storeCategory),
        orderBy("createdAt", "desc"),
        limit(rowsPerPage)
      );
      if (pageNum > 0 && cursors[pageNum]) q = query(q, startAfter(cursors[pageNum]));
      const snap = await getDocs(q);
      let data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (search) {
        const s = search.toLowerCase();
        data = data.filter(r =>
          r.name?.toLowerCase().includes(s) ||
          r.maker?.toLowerCase().includes(s) ||
          r.hsnCode?.toLowerCase().includes(s)
        );
      }
      if (snap.docs.length > 0) {
        const nc = [...cursors];
        nc[pageNum + 1] = snap.docs[snap.docs.length - 1];
        setCursors(nc);
      }
      setRows(data);
    } finally {
      setLoading(false);
    }
  }, [storeCategory, rowsPerPage, search, cursors]);

  useEffect(() => { fetchTotal(); }, [storeCategory]);
  useEffect(() => {
    setPage(0); setCursors([null]); fetchData(0);
  }, [search, rowsPerPage, storeCategory]);

  const openAdd = () => { setEditRow(null); setForm(EMPTY); setFormError(""); setDialogOpen(true); };
  const openEdit = (row) => { setEditRow(row); setForm({ ...row }); setFormError(""); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.name || !form.price) return setFormError("Name and price are required.");
    setFormError("");
    try {
      const payload = { ...form, price: parseFloat(form.price), taxRate: parseFloat(form.taxRate || 0), storeCategory };
      if (editRow) {
        await updateDoc(doc(db, "products", editRow.id), { ...payload, updatedAt: Timestamp.now() });
        enqueueSnackbar("Product updated!", { variant: "success" });
      } else {
        await addDoc(collection(db, "products"), { ...payload, createdAt: Timestamp.now() });
        enqueueSnackbar("Product added!", { variant: "success" });
      }
      setDialogOpen(false);
      fetchTotal(); fetchData(0);
    } catch { setFormError("Failed to save."); }
  };

  const handleDelete = async () => {
    await deleteDoc(doc(db, "products", deleteTarget.id));
    enqueueSnackbar("Product deleted!", { variant: "success" });
    setDeleteTarget(null);
    fetchTotal(); fetchData(0);
  };

  const columns = [
    { field: "name", headerName: "Product Name" },
    { field: "maker", headerName: "Maker/Brand" },
    { field: "hsnCode", headerName: "HSN Code" },
    {
      field: "price", headerName: "Price", align: "right",
      renderCell: (r) => `₹${(r.price || 0).toLocaleString("en-IN")}`,
    },
    {
      field: "taxRate", headerName: "Tax (%)", align: "center",
      renderCell: (r) => `${r.taxRate || 0}%`,
    },
    { field: "unit", headerName: "Unit" },
    {
      field: "createdAt", headerName: "Added On",
      renderCell: (r) => r.createdAt?.toDate?.()?.toLocaleDateString?.() || "—",
    },
  ];

  return (
    <Box>
      <DataTable
        title="Product Master"
        columns={columns}
        rows={rows}
        total={total}
        page={page}
        rowsPerPage={rowsPerPage}
        onPageChange={(p) => { setPage(p); fetchData(p); }}
        onRowsPerPageChange={(r) => setRowsPerPage(r)}
        onSearch={setSearch}
        onDateRange={(s, e) => setDateRange({ start: s, end: e })}
        onAdd={openAdd}
        onEdit={openEdit}
        onDelete={(r) => setDeleteTarget(r)}
        loading={loading}
        addLabel="Add Product"
      />

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle fontWeight={700}>{editRow ? "Edit Product" : "Add Product"}</DialogTitle>
        <DialogContent dividers>
          {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
          <Grid container spacing={2} mt={0.5}>
            <Grid item xs={12} sm={8}>
              <TextField label="Product Name *" fullWidth value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField label="Unit" fullWidth value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="Maker/Brand" fullWidth value={form.maker}
                onChange={(e) => setForm({ ...form, maker: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="HSN Code" fullWidth value={form.hsnCode}
                onChange={(e) => setForm({ ...form, hsnCode: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="Price *" fullWidth type="number" value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="Tax Rate (%)" fullWidth type="number" value={form.taxRate}
                onChange={(e) => setForm({ ...form, taxRate: e.target.value })}
                InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }} />
            </Grid>
            <Grid item xs={12}>
              <TextField label="Description" fullWidth multiline rows={3} value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>{editRow ? "Update" : "Add Product"}</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        message={`Delete product "${deleteTarget?.name}"?`}
      />
    </Box>
  );
}
