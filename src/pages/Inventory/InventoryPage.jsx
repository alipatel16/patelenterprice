import React, { useState, useEffect, useCallback } from "react";
import {
  Box, Chip, Typography, Dialog, DialogTitle, DialogContent,
  DialogActions, Button, TextField, Alert, Grid, Stack,
} from "@mui/material";
import {
  collection, query, where, getDocs, updateDoc, doc,
  orderBy, limit, startAfter, getCountFromServer, Timestamp,
} from "firebase/firestore";
import { useAuth } from "../../contexts/AuthContext";
import DataTable from "../../components/Common/DataTable";
import { useSnackbar } from "notistack";

export default function InventoryPage() {
  const { userProfile, db } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [cursors, setCursors] = useState([null]);
  const [editRow, setEditRow] = useState(null);
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustNote, setAdjustNote] = useState("");

  const storeCategory = userProfile?.storeCategory;

  const fetchTotal = useCallback(async () => {
    const snap = await getCountFromServer(
      query(collection(db, "inventory"), where("storeCategory", "==", storeCategory))
    );
    setTotal(snap.data().count);
  }, [storeCategory]);

  const fetchData = useCallback(async (pageNum = 0) => {
    setLoading(true);
    try {
      let q = query(
        collection(db, "inventory"),
        where("storeCategory", "==", storeCategory),
        orderBy("productName"),
        limit(rowsPerPage)
      );
      if (pageNum > 0 && cursors[pageNum]) q = query(q, startAfter(cursors[pageNum]));
      const snap = await getDocs(q);
      let data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (search) {
        const s = search.toLowerCase();
        data = data.filter(r => r.productName?.toLowerCase().includes(s));
      }
      if (snap.docs.length > 0) {
        const nc = [...cursors];
        nc[pageNum + 1] = snap.docs[snap.docs.length - 1];
        setCursors(nc);
      }
      setRows(data);
    } finally { setLoading(false); }
  }, [storeCategory, rowsPerPage, search, cursors]);

  useEffect(() => { fetchTotal(); }, [storeCategory]);
  useEffect(() => { setPage(0); setCursors([null]); fetchData(0); }, [search, rowsPerPage, storeCategory]);

  const handleAdjust = async () => {
    if (!adjustQty) return;
    try {
      const newStock = Math.max(0, (editRow.stock || 0) + parseInt(adjustQty));
      await updateDoc(doc(db, "inventory", editRow.id), {
        stock: newStock, updatedAt: Timestamp.now(),
        lastAdjustNote: adjustNote,
      });
      enqueueSnackbar("Stock adjusted!", { variant: "success" });
      setEditRow(null); setAdjustQty(""); setAdjustNote("");
      fetchData(page);
    } catch { enqueueSnackbar("Failed.", { variant: "error" }); }
  };

  const getStockStatus = (stock) => {
    if (stock <= 0) return { label: "Out of Stock", color: "error" };
    if (stock <= 5) return { label: "Low Stock", color: "warning" };
    return { label: "In Stock", color: "success" };
  };

  const columns = [
    { field: "productName", headerName: "Product Name" },
    {
      field: "stock", headerName: "Current Stock", align: "center",
      renderCell: (r) => (
        <Typography fontWeight={700} color={r.stock <= 0 ? "error.main" : r.stock <= 5 ? "warning.main" : "success.main"}>
          {r.stock || 0}
        </Typography>
      ),
    },
    {
      field: "status", headerName: "Status",
      renderCell: (r) => {
        const s = getStockStatus(r.stock);
        return <Chip label={s.label} color={s.color} size="small" />;
      },
    },
    {
      field: "updatedAt", headerName: "Last Updated",
      renderCell: (r) => r.updatedAt?.toDate?.()?.toLocaleDateString?.() || "—",
    },
    { field: "lastAdjustNote", headerName: "Last Note" },
  ];

  return (
    <Box>
      <DataTable
        title="Inventory"
        columns={columns} rows={rows} total={total}
        page={page} rowsPerPage={rowsPerPage}
        onPageChange={(p) => { setPage(p); fetchData(p); }}
        onRowsPerPageChange={setRowsPerPage}
        onSearch={setSearch}
        onEdit={(r) => { setEditRow(r); setAdjustQty(""); setAdjustNote(""); }}
        loading={loading}
      />

      {/* Adjust Dialog */}
      <Dialog open={Boolean(editRow)} onClose={() => setEditRow(null)} maxWidth="xs" fullWidth>
        <DialogTitle fontWeight={700}>Adjust Stock: {editRow?.productName}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} mt={1}>
            <Typography variant="body2">
              Current Stock: <strong>{editRow?.stock || 0}</strong>
            </Typography>
            <TextField
              label="Adjustment (+/-)"
              type="number"
              fullWidth
              value={adjustQty}
              onChange={(e) => setAdjustQty(e.target.value)}
              helperText="Use positive to add, negative to subtract"
            />
            <TextField
              label="Note (optional)"
              fullWidth
              value={adjustNote}
              onChange={(e) => setAdjustNote(e.target.value)}
            />
            {adjustQty && (
              <Typography variant="body2" color="primary.main" fontWeight={600}>
                New Stock: {Math.max(0, (editRow?.stock || 0) + parseInt(adjustQty || 0))}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditRow(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleAdjust}>Apply Adjustment</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
