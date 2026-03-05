import React, { useState, useEffect, useCallback } from "react";
import {
  Box, Chip, Typography, Button, Stack, FormControl, InputLabel,
  Select, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Alert, Divider,
} from "@mui/material";
import { Receipt, Payment } from "@mui/icons-material";
import {
  collection, query, where, getDocs, addDoc, updateDoc, deleteDoc,
  doc, orderBy, limit, startAfter, getCountFromServer, Timestamp,
} from "firebase/firestore";
import { useAuth } from "../../contexts/AuthContext";
import DataTable from "../../components/Common/DataTable";
import ConfirmDialog from "../../components/Common/ConfirmDialog";
import { useSnackbar } from "notistack";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";

const PAYMENT_STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "paid", label: "Paid (Full)" },
  { value: "pending", label: "Pending" },
  { value: "partial", label: "Partial" },
  { value: "emi", label: "EMI" },
  { value: "finance", label: "Finance" },
];

export default function SalesListPage() {
  const { userProfile, db } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [cursors, setCursors] = useState([null]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [paymentDialog, setPaymentDialog] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [dateRange, setDateRange] = useState({ start: null, end: null });

  const storeCategory = userProfile?.storeCategory;

  const fetchTotal = useCallback(async () => {
    const q = statusFilter !== "all"
      ? query(collection(db, "sales"), where("storeCategory", "==", storeCategory),
          where("paymentStatus", "==", statusFilter))
      : query(collection(db, "sales"), where("storeCategory", "==", storeCategory));
    const snap = await getCountFromServer(q);
    setTotal(snap.data().count);
  }, [storeCategory, statusFilter]);

  const fetchData = useCallback(async (pageNum = 0) => {
    setLoading(true);
    try {
      let q = query(
        collection(db, "sales"),
        where("storeCategory", "==", storeCategory),
        orderBy("createdAt", "desc"),
        limit(rowsPerPage)
      );
      if (pageNum > 0 && cursors[pageNum]) q = query(q, startAfter(cursors[pageNum]));
      const snap = await getDocs(q);
      let data = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      if (statusFilter !== "all") data = data.filter(r => r.paymentStatus === statusFilter);
      if (search) {
        const s = search.toLowerCase();
        data = data.filter(r =>
          r.invoiceNumber?.toLowerCase().includes(s) ||
          r.customerName?.toLowerCase().includes(s) ||
          r.customerPhone?.includes(s)
        );
      }
      if (dateRange.start && dateRange.end) {
        data = data.filter(r => {
          const d = r.createdAt?.toDate?.();
          return d >= dateRange.start.toDate() && d <= dateRange.end.toDate();
        });
      }

      if (snap.docs.length > 0) {
        const nc = [...cursors];
        nc[pageNum + 1] = snap.docs[snap.docs.length - 1];
        setCursors(nc);
      }
      setRows(data);
    } finally { setLoading(false); }
  }, [storeCategory, rowsPerPage, search, statusFilter, dateRange, cursors]);

  useEffect(() => { fetchTotal(); }, [storeCategory, statusFilter]);
  useEffect(() => { setPage(0); setCursors([null]); fetchData(0); }, [search, statusFilter, rowsPerPage, storeCategory, dateRange]);

  const handleDelete = async () => {
    await deleteDoc(doc(db, "sales", deleteTarget.id));
    enqueueSnackbar("Sale deleted!", { variant: "success" });
    setDeleteTarget(null); fetchTotal(); fetchData(0);
  };

  const handleRecordPayment = async () => {
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) return;
    try {
      const sale = paymentDialog;
      const paid = (sale.paidAmount || 0) + parseFloat(paymentAmount);
      const status = paid >= sale.grandTotal ? "paid" : "partial";

      await updateDoc(doc(db, "sales", sale.id), {
        paidAmount: paid, paymentStatus: status, updatedAt: Timestamp.now(),
      });

      // Log payment
      await addDoc(collection(db, "paymentHistory"), {
        saleId: sale.id, invoiceNumber: sale.invoiceNumber,
        amount: parseFloat(paymentAmount), note: paymentNote,
        date: Timestamp.now(), storeCategory,
      });

      enqueueSnackbar("Payment recorded!", { variant: "success" });
      setPaymentDialog(null); setPaymentAmount(""); setPaymentNote("");
      fetchData(page);
    } catch { enqueueSnackbar("Failed.", { variant: "error" }); }
  };

  const statusColor = (s) => {
    if (s === "paid") return "success";
    if (s === "pending") return "warning";
    if (s === "emi") return "info";
    if (s === "finance") return "secondary";
    if (s === "partial") return "error";
    return "default";
  };

  const columns = [
    { field: "invoiceNumber", headerName: "Invoice #" },
    { field: "customerName", headerName: "Customer" },
    { field: "customerPhone", headerName: "Phone" },
    {
      field: "grandTotal", headerName: "Amount", align: "right",
      renderCell: (r) => `₹${(r.grandTotal || 0).toLocaleString("en-IN")}`,
    },
    {
      field: "paidAmount", headerName: "Paid", align: "right",
      renderCell: (r) => `₹${(r.paidAmount || 0).toLocaleString("en-IN")}`,
    },
    {
      field: "paymentStatus", headerName: "Status",
      renderCell: (r) => <Chip label={r.paymentStatus || "paid"} size="small" color={statusColor(r.paymentStatus)} />,
    },
    {
      field: "deliveryStatus", headerName: "Delivery",
      renderCell: (r) => <Chip label={r.deliveryStatus || "delivered"} size="small" variant="outlined" />,
    },
    {
      field: "createdAt", headerName: "Date",
      renderCell: (r) => r.createdAt?.toDate?.()?.toLocaleDateString?.() || "—",
    },
  ];

  const canRecordPayment = (row) =>
    row.paymentStatus === "pending" || row.paymentStatus === "partial" ||
    row.paymentStatus === "emi" || row.paymentStatus === "finance";

  return (
    <Box>
      <DataTable
        title="Sales"
        columns={columns} rows={rows} total={total}
        page={page} rowsPerPage={rowsPerPage}
        onPageChange={(p) => { setPage(p); fetchData(p); }}
        onRowsPerPageChange={setRowsPerPage}
        onSearch={setSearch}
        onDateRange={(s, e) => setDateRange({ start: s, end: e })}
        onAdd={() => navigate("/sales/new")}
        onView={(r) => navigate(`/sales/${r.id}`)}
        onDelete={(r) => setDeleteTarget(r)}
        loading={loading}
        addLabel="New Sale"
        extraFilters={
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Payment Status</InputLabel>
            <Select value={statusFilter} label="Payment Status"
              onChange={(e) => setStatusFilter(e.target.value)}>
              {PAYMENT_STATUS_OPTIONS.map(o => (
                <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        }
        extraActions={
          null
        }
      />

      {/* Record Payment Dialog */}
      <Dialog open={Boolean(paymentDialog)} onClose={() => setPaymentDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle fontWeight={700}>Record Payment</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} mt={1}>
            <Typography variant="body2">
              Invoice: <strong>{paymentDialog?.invoiceNumber}</strong>
            </Typography>
            <Typography variant="body2">
              Total: ₹{(paymentDialog?.grandTotal || 0).toLocaleString("en-IN")} |
              Paid: ₹{(paymentDialog?.paidAmount || 0).toLocaleString("en-IN")} |
              Pending: ₹{((paymentDialog?.grandTotal || 0) - (paymentDialog?.paidAmount || 0)).toLocaleString("en-IN")}
            </Typography>
            <TextField
              label="Payment Amount *"
              type="number"
              fullWidth
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              inputProps={{ max: (paymentDialog?.grandTotal || 0) - (paymentDialog?.paidAmount || 0) }}
            />
            <TextField label="Note (optional)" fullWidth value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPaymentDialog(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleRecordPayment} startIcon={<Payment />}>
            Record Payment
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        message={`Delete invoice "${deleteTarget?.invoiceNumber}"?`}
      />
    </Box>
  );
}
