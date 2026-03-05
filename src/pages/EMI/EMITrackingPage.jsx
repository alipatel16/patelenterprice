import React, { useState, useEffect, useCallback } from "react";
import {
  Box, Card, CardContent, Typography, Stack, Chip, Button, Grid,
  LinearProgress, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Alert, Divider, Table, TableHead, TableBody,
  TableRow, TableCell, Paper, CircularProgress,
} from "@mui/material";
import { Payment, CreditScore } from "@mui/icons-material";
import {
  collection, query, where, getDocs, doc, updateDoc,
  addDoc, Timestamp, orderBy, limit, startAfter, getCountFromServer,
} from "firebase/firestore";
import { useAuth } from "../../contexts/AuthContext";
import DataTable from "../../components/Common/DataTable";
import { useSnackbar } from "notistack";
import { useNavigate, useSearchParams } from "react-router-dom";
import dayjs from "dayjs";

export default function EMITrackingPage() {
  const { userProfile, db } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focusSaleId = searchParams.get("saleId");

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [cursors, setCursors] = useState([null]);
  const [payDialog, setPayDialog] = useState(null);
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [saleDetails, setSaleDetails] = useState(null);

  const storeCategory = userProfile?.storeCategory;

  const fetchTotal = useCallback(async () => {
    const q = focusSaleId
      ? query(collection(db, "emiInstallments"), where("saleId", "==", focusSaleId))
      : query(collection(db, "emiInstallments"), where("storeCategory", "==", storeCategory));
    const snap = await getCountFromServer(q);
    setTotal(snap.data().count);
  }, [storeCategory, focusSaleId]);

  const fetchData = useCallback(async (pageNum = 0) => {
    setLoading(true);
    try {
      let q = focusSaleId
        ? query(collection(db, "emiInstallments"), where("saleId", "==", focusSaleId), orderBy("installmentNumber"))
        : query(collection(db, "emiInstallments"), where("storeCategory", "==", storeCategory), orderBy("dueDate"), limit(rowsPerPage));

      if (!focusSaleId && pageNum > 0 && cursors[pageNum]) q = query(q, startAfter(cursors[pageNum]));
      const snap = await getDocs(q);
      let data = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      if (search) {
        const s = search.toLowerCase();
        data = data.filter(r =>
          r.customerName?.toLowerCase().includes(s) ||
          r.invoiceNumber?.toLowerCase().includes(s)
        );
      }

      if (snap.docs.length > 0 && !focusSaleId) {
        const nc = [...cursors];
        nc[pageNum + 1] = snap.docs[snap.docs.length - 1];
        setCursors(nc);
      }
      setRows(data);
    } finally { setLoading(false); }
  }, [storeCategory, rowsPerPage, search, cursors, focusSaleId]);

  const fetchSaleDetails = async () => {
    if (!focusSaleId) return;
    const snap = await getDocs(
      query(collection(db, "emiInstallments"), where("saleId", "==", focusSaleId))
    );
    const insts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const totalAmt = insts.reduce((s, i) => s + (i.amount || 0), 0);
    const paidAmt = insts.reduce((s, i) => s + (i.paidAmount || 0), 0);
    const paidInsts = insts.filter(i => i.status === "paid").length;
    setSaleDetails({ totalAmt, paidAmt, paidInsts, totalInsts: insts.length, insts });
  };

  useEffect(() => { fetchTotal(); fetchSaleDetails(); }, [storeCategory, focusSaleId]);
  useEffect(() => { setPage(0); setCursors([null]); fetchData(0); }, [search, rowsPerPage, storeCategory, focusSaleId]);

  const handlePay = async () => {
    if (!payAmount || parseFloat(payAmount) <= 0) return;
    try {
      const inst = payDialog;
      const paid = (inst.paidAmount || 0) + parseFloat(payAmount);
      const status = paid >= inst.amount ? "paid" : "partial";

      await updateDoc(doc(db, "emiInstallments", inst.id), {
        paidAmount: paid, status, updatedAt: Timestamp.now(),
      });

      await addDoc(collection(db, "emiPayments"), {
        installmentId: inst.id, saleId: inst.saleId,
        invoiceNumber: inst.invoiceNumber, installmentNumber: inst.installmentNumber,
        amount: parseFloat(payAmount), note: payNote,
        date: Timestamp.now(), storeCategory,
      });

      enqueueSnackbar("EMI payment recorded!", { variant: "success" });
      setPayDialog(null); setPayAmount(""); setPayNote("");
      fetchData(page); fetchSaleDetails();
    } catch { enqueueSnackbar("Failed.", { variant: "error" }); }
  };

  const isOverdue = (inst) =>
    inst.status !== "paid" && inst.dueDate?.toDate?.() < new Date();

  const isUpcoming = (inst) => {
    const due = inst.dueDate?.toDate?.();
    const now = new Date();
    const in7 = new Date(); in7.setDate(in7.getDate() + 7);
    return inst.status !== "paid" && due >= now && due <= in7;
  };

  const columns = [
    { field: "invoiceNumber", headerName: "Invoice #" },
    { field: "customerName", headerName: "Customer" },
    {
      field: "installmentNumber", headerName: "Inst #", align: "center",
      renderCell: (r) => <Chip label={`#${r.installmentNumber}`} size="small" variant="outlined" />,
    },
    {
      field: "dueDate", headerName: "Due Date",
      renderCell: (r) => {
        const due = r.dueDate?.toDate?.();
        const overdue = isOverdue(r);
        const upcoming = isUpcoming(r);
        return (
          <Typography variant="body2" color={overdue ? "error.main" : upcoming ? "warning.main" : "text.primary"}
            fontWeight={overdue || upcoming ? 600 : 400}>
            {due?.toLocaleDateString?.() || "—"}
            {overdue && " ⚠️"} {upcoming && " 🔔"}
          </Typography>
        );
      },
    },
    {
      field: "amount", headerName: "Amount", align: "right",
      renderCell: (r) => `₹${(r.amount || 0).toFixed(2)}`,
    },
    {
      field: "paidAmount", headerName: "Paid", align: "right",
      renderCell: (r) => `₹${(r.paidAmount || 0).toFixed(2)}`,
    },
    {
      field: "progress", headerName: "Progress",
      renderCell: (r) => {
        const pct = Math.min(100, ((r.paidAmount || 0) / (r.amount || 1)) * 100);
        return (
          <Box sx={{ minWidth: 80 }}>
            <LinearProgress variant="determinate" value={pct}
              color={pct >= 100 ? "success" : pct > 0 ? "warning" : "error"} sx={{ borderRadius: 1 }} />
            <Typography variant="caption">{pct.toFixed(0)}%</Typography>
          </Box>
        );
      },
    },
    {
      field: "status", headerName: "Status",
      renderCell: (r) => (
        <Chip
          label={isOverdue(r) ? "OVERDUE" : r.status}
          size="small"
          color={r.status === "paid" ? "success" : isOverdue(r) ? "error" : r.status === "partial" ? "warning" : "default"}
        />
      ),
    },
  ];

  return (
    <Box>
      {focusSaleId && saleDetails && (
        <Grid container spacing={2} mb={3}>
          {[
            { label: "Total Amount", value: `₹${saleDetails.totalAmt.toFixed(2)}`, color: "primary.main" },
            { label: "Paid Amount", value: `₹${saleDetails.paidAmt.toFixed(2)}`, color: "success.main" },
            { label: "Pending Amount", value: `₹${(saleDetails.totalAmt - saleDetails.paidAmt).toFixed(2)}`, color: "error.main" },
            { label: "Installments Paid", value: `${saleDetails.paidInsts} / ${saleDetails.totalInsts}`, color: "info.main" },
          ].map(s => (
            <Grid item xs={6} sm={3} key={s.label}>
              <Card sx={{ borderRadius: 2, textAlign: "center" }}>
                <CardContent sx={{ py: 2 }}>
                  <Typography variant="body2" color="text.secondary">{s.label}</Typography>
                  <Typography variant="h6" fontWeight={800} color={s.color}>{s.value}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      <DataTable
        title={focusSaleId ? "EMI Installments" : "EMI Tracking"}
        columns={columns} rows={rows} total={total}
        page={page} rowsPerPage={rowsPerPage}
        onPageChange={(p) => { setPage(p); fetchData(p); }}
        onRowsPerPageChange={setRowsPerPage}
        onSearch={setSearch}
        onView={(r) => navigate(`/sales/${r.saleId}`)}
        loading={loading}
        extraActions={
          focusSaleId && (
            <Button variant="outlined" size="small" onClick={() => navigate("/emi")}>
              View All EMIs
            </Button>
          )
        }
      />

      {/* Pay button in row - we handle via row actions */}
      {rows.filter(r => r.status !== "paid").map(r => null)}

      {/* Payment Dialog */}
      <Dialog open={Boolean(payDialog)} onClose={() => setPayDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle fontWeight={700}>Record EMI Payment - Inst #{payDialog?.installmentNumber}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} mt={1}>
            <Typography variant="body2">
              Total: ₹{payDialog?.amount?.toFixed(2)} | Paid: ₹{payDialog?.paidAmount?.toFixed(2) || "0"} |
              Remaining: ₹{((payDialog?.amount || 0) - (payDialog?.paidAmount || 0)).toFixed(2)}
            </Typography>
            <Alert severity="info" sx={{ py: 0.5 }}>
              Partial payment is allowed. Installment is fully paid only at 100%.
            </Alert>
            <TextField label="Amount *" type="number" fullWidth
              value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            <TextField label="Note" fullWidth value={payNote}
              onChange={(e) => setPayNote(e.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPayDialog(null)}>Cancel</Button>
          <Button variant="contained" onClick={handlePay} startIcon={<Payment />}>
            Record Payment
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
