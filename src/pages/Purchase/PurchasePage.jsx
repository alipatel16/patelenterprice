import React, { useState, useEffect, useCallback } from "react";
import {
  Box, Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Stack, Typography, Alert, Grid, Chip,
  FormControl, InputLabel, Select, MenuItem, Divider, IconButton,
  InputAdornment, Autocomplete, Table, TableHead, TableBody,
  TableRow, TableCell, Paper,
} from "@mui/material";
import { Add, Delete } from "@mui/icons-material";
import {
  collection, query, where, getDocs, addDoc, updateDoc, deleteDoc,
  doc, orderBy, limit, startAfter, getCountFromServer, Timestamp,
} from "firebase/firestore";
import { useAuth } from "../../contexts/AuthContext";
import DataTable from "../../components/Common/DataTable";
import ConfirmDialog from "../../components/Common/ConfirmDialog";
import { useSnackbar } from "notistack";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs from "dayjs";
import { COMPANIES_LIST } from "../../config/companies";

export default function PurchasePage() {
  const { userProfile, db } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [cursors, setCursors] = useState([null]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [products, setProducts] = useState([]);

  const [form, setForm] = useState({
    supplierName: "", supplierPhone: "", invoiceNumber: "",
    purchaseDate: dayjs(), companyId: "", notes: "",
    items: [{ productId: "", productName: "", qty: 1, price: "", total: 0 }],
  });
  const [formError, setFormError] = useState("");

  const storeCategory = userProfile?.storeCategory;
  const companies = COMPANIES_LIST.filter(c => c.category === storeCategory);

  const fetchProducts = async () => {
    const snap = await getDocs(
      query(collection(db, "products"), where("storeCategory", "==", storeCategory))
    );
    setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const fetchTotal = useCallback(async () => {
    const snap = await getCountFromServer(
      query(collection(db, "purchases"), where("storeCategory", "==", storeCategory))
    );
    setTotal(snap.data().count);
  }, [storeCategory]);

  const fetchData = useCallback(async (pageNum = 0) => {
    setLoading(true);
    try {
      let q = query(
        collection(db, "purchases"),
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
          r.supplierName?.toLowerCase().includes(s) ||
          r.invoiceNumber?.toLowerCase().includes(s)
        );
      }
      if (snap.docs.length > 0) {
        const nc = [...cursors];
        nc[pageNum + 1] = snap.docs[snap.docs.length - 1];
        setCursors(nc);
      }
      setRows(data);
    } finally { setLoading(false); }
  }, [storeCategory, rowsPerPage, search, cursors]);

  useEffect(() => { fetchTotal(); fetchProducts(); }, [storeCategory]);
  useEffect(() => { setPage(0); setCursors([null]); fetchData(0); }, [search, rowsPerPage, storeCategory]);

  const openAdd = () => {
    setEditRow(null);
    setForm({
      supplierName: "", supplierPhone: "", invoiceNumber: "",
      purchaseDate: dayjs(), companyId: companies[0]?.id || "", notes: "",
      items: [{ productId: "", productName: "", qty: 1, price: "", total: 0 }],
    });
    setFormError(""); setDialogOpen(true);
  };

  const openEdit = (row) => {
    setEditRow(row);
    setForm({ ...row, purchaseDate: row.purchaseDate ? dayjs(row.purchaseDate.toDate()) : dayjs() });
    setFormError(""); setDialogOpen(true);
  };

  const updateItem = (idx, field, value) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [field]: value };
    if (field === "qty" || field === "price") {
      items[idx].total = (parseFloat(items[idx].qty) || 0) * (parseFloat(items[idx].price) || 0);
    }
    if (field === "productId") {
      const prod = products.find(p => p.id === value);
      if (prod) { items[idx].productName = prod.name; items[idx].price = prod.price; items[idx].total = prod.price * items[idx].qty; }
    }
    setForm({ ...form, items });
  };

  const grandTotal = form.items.reduce((s, i) => s + (i.total || 0), 0);

  const handleSave = async () => {
    if (!form.supplierName || form.items.length === 0) return setFormError("Supplier and items are required.");
    setFormError("");
    try {
      const payload = {
        ...form,
        grandTotal,
        purchaseDate: Timestamp.fromDate(form.purchaseDate.toDate()),
        storeCategory,
      };
      if (editRow) {
        await updateDoc(doc(db, "purchases", editRow.id), { ...payload, updatedAt: Timestamp.now() });
        // Update inventory
        for (const item of form.items) {
          if (item.productId) {
            const invSnap = await getDocs(
              query(collection(db, "inventory"),
                where("productId", "==", item.productId),
                where("storeCategory", "==", storeCategory)
              )
            );
            if (!invSnap.empty) {
              await updateDoc(doc(db, "inventory", invSnap.docs[0].id), {
                stock: (invSnap.docs[0].data().stock || 0) + parseInt(item.qty),
              });
            }
          }
        }
        enqueueSnackbar("Purchase updated!", { variant: "success" });
      } else {
        await addDoc(collection(db, "purchases"), { ...payload, createdAt: Timestamp.now() });
        // Update/create inventory
        for (const item of form.items) {
          if (!item.productId) continue;
          const invSnap = await getDocs(
            query(collection(db, "inventory"),
              where("productId", "==", item.productId),
              where("storeCategory", "==", storeCategory)
            )
          );
          if (invSnap.empty) {
            await addDoc(collection(db, "inventory"), {
              productId: item.productId, productName: item.productName,
              stock: parseInt(item.qty), storeCategory, updatedAt: Timestamp.now(),
            });
          } else {
            await updateDoc(doc(db, "inventory", invSnap.docs[0].id), {
              stock: (invSnap.docs[0].data().stock || 0) + parseInt(item.qty),
              updatedAt: Timestamp.now(),
            });
          }
        }
        enqueueSnackbar("Purchase recorded & inventory updated!", { variant: "success" });
      }
      setDialogOpen(false); fetchTotal(); fetchData(0);
    } catch (e) { setFormError("Failed: " + e.message); }
  };

  const handleDelete = async () => {
    await deleteDoc(doc(db, "purchases", deleteTarget.id));
    enqueueSnackbar("Purchase deleted!", { variant: "success" });
    setDeleteTarget(null); fetchTotal(); fetchData(0);
  };

  const columns = [
    { field: "invoiceNumber", headerName: "Invoice #" },
    { field: "supplierName", headerName: "Supplier" },
    { field: "supplierPhone", headerName: "Phone" },
    {
      field: "grandTotal", headerName: "Total", align: "right",
      renderCell: (r) => `₹${(r.grandTotal || 0).toLocaleString("en-IN")}`,
    },
    {
      field: "purchaseDate", headerName: "Date",
      renderCell: (r) => r.purchaseDate?.toDate?.()?.toLocaleDateString?.() || "—",
    },
    {
      field: "items", headerName: "Items",
      renderCell: (r) => <Chip label={`${r.items?.length || 0} items`} size="small" />,
    },
  ];

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box>
        <DataTable
          title="Purchase Records"
          columns={columns} rows={rows} total={total}
          page={page} rowsPerPage={rowsPerPage}
          onPageChange={(p) => { setPage(p); fetchData(p); }}
          onRowsPerPageChange={setRowsPerPage}
          onSearch={setSearch}
          onAdd={openAdd}
          onEdit={openEdit}
          onDelete={(r) => setDeleteTarget(r)}
          loading={loading} addLabel="Record Purchase"
        />

        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
          <DialogTitle fontWeight={700}>{editRow ? "Edit Purchase" : "Record Purchase"}</DialogTitle>
          <DialogContent dividers>
            {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
            <Grid container spacing={2} mt={0.5}>
              <Grid item xs={12} sm={6}>
                <TextField label="Supplier Name *" fullWidth value={form.supplierName}
                  onChange={(e) => setForm({ ...form, supplierName: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label="Supplier Phone" fullWidth value={form.supplierPhone}
                  onChange={(e) => setForm({ ...form, supplierPhone: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField label="Invoice Number" fullWidth value={form.invoiceNumber}
                  onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <DatePicker label="Purchase Date" value={form.purchaseDate}
                  onChange={(d) => setForm({ ...form, purchaseDate: d })}
                  slotProps={{ textField: { fullWidth: true } }} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <FormControl fullWidth>
                  <InputLabel>Company</InputLabel>
                  <Select value={form.companyId} label="Company"
                    onChange={(e) => setForm({ ...form, companyId: e.target.value })}>
                    {companies.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            {/* Items */}
            <Typography variant="subtitle2" fontWeight={700} mt={3} mb={1}>Purchase Items</Typography>
            <Paper variant="outlined" sx={{ borderRadius: 2, overflow: "hidden" }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: "grey.100" }}>
                    <TableCell>Product</TableCell>
                    <TableCell width={90}>Qty</TableCell>
                    <TableCell width={120}>Price (₹)</TableCell>
                    <TableCell width={120} align="right">Total</TableCell>
                    <TableCell width={50} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {form.items.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <Autocomplete
                          options={products}
                          getOptionLabel={(o) => o.name || ""}
                          value={products.find(p => p.id === item.productId) || null}
                          onChange={(_, v) => updateItem(idx, "productId", v?.id || "")}
                          renderInput={(params) => <TextField {...params} size="small" placeholder="Select product" />}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <TextField type="number" size="small" value={item.qty}
                          onChange={(e) => updateItem(idx, "qty", e.target.value)}
                          inputProps={{ min: 1 }} />
                      </TableCell>
                      <TableCell>
                        <TextField type="number" size="small" value={item.price}
                          onChange={(e) => updateItem(idx, "price", e.target.value)} />
                      </TableCell>
                      <TableCell align="right">
                        <Typography fontWeight={600}>₹{(item.total || 0).toLocaleString("en-IN")}</Typography>
                      </TableCell>
                      <TableCell>
                        <IconButton size="small" color="error"
                          onClick={() => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) })}>
                          <Delete fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mt={1}>
              <Button size="small" startIcon={<Add />}
                onClick={() => setForm({ ...form, items: [...form.items, { productId: "", productName: "", qty: 1, price: "", total: 0 }] })}>
                Add Item
              </Button>
              <Typography fontWeight={700} fontSize={16}>
                Grand Total: ₹{grandTotal.toLocaleString("en-IN")}
              </Typography>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={handleSave}>{editRow ? "Update" : "Save Purchase"}</Button>
          </DialogActions>
        </Dialog>

        <ConfirmDialog
          open={Boolean(deleteTarget)}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          message={`Delete purchase from "${deleteTarget?.supplierName}"?`}
        />
      </Box>
    </LocalizationProvider>
  );
}
