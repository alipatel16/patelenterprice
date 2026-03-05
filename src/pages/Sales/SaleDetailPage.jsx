import React, { useState, useEffect, useRef } from "react";
import {
  Box, Card, CardContent, Grid, Typography, Button, Stack, Chip,
  Divider, Table, TableHead, TableBody, TableRow, TableCell, Paper,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  Alert, CircularProgress,
} from "@mui/material";
import { ArrowBack, Print, Payment, CreditScore } from "@mui/icons-material";
import {
  doc, getDoc, collection, query, where, getDocs, addDoc,
  updateDoc, Timestamp, orderBy,
} from "firebase/firestore";
import { useAuth } from "../../contexts/AuthContext";
import { useNavigate, useParams } from "react-router-dom";
import { useSnackbar } from "notistack";
import { getCompanyById } from "../../config/companies";
import { useReactToPrint } from "react-to-print";
import dayjs from "dayjs";

function InvoicePrint({ sale, company, emiInstallments, paymentHistory }) {
  if (!sale) return null;
  return (
    <Box sx={{ p: 4, fontFamily: "Arial", fontSize: 13, color: "#000", bgcolor: "#fff" }}>
      {/* Header */}
      <Box textAlign="center" mb={3} borderBottom="2px solid #1976d2" pb={2}>
        <Typography variant="h5" fontWeight={800} color="#1976d2">{company?.name}</Typography>
        <Typography variant="body2">{company?.address}, {company?.city}, {company?.state} - {company?.pincode}</Typography>
        <Typography variant="body2">Ph: {company?.phone} | Email: {company?.email}</Typography>
        <Typography variant="body2">GST: {company?.gstNumber} | Web: {company?.website}</Typography>
      </Box>

      {/* Invoice Title */}
      <Stack direction="row" justifyContent="space-between" mb={2}>
        <Box>
          <Typography fontWeight={700} fontSize={16}>
            {sale.isGST ? "TAX INVOICE" : "INVOICE"} #{sale.invoiceNumber}
          </Typography>
          <Typography variant="body2">Date: {sale.createdAt?.toDate?.()?.toLocaleDateString?.()}</Typography>
        </Box>
        <Chip label={sale.paymentStatus?.toUpperCase()} color={
          sale.paymentStatus === "paid" ? "success" : sale.paymentStatus === "pending" ? "warning" : "info"
        } />
      </Stack>

      {/* Customer & Company */}
      <Grid container spacing={2} mb={2}>
        <Grid item xs={6}>
          <Box p={1.5} border="1px solid #ddd" borderRadius={1}>
            <Typography fontWeight={700} mb={0.5}>Bill To:</Typography>
            <Typography fontWeight={600}>{sale.customerName}</Typography>
            <Typography variant="body2">{sale.customerPhone}</Typography>
            <Typography variant="body2">{sale.customerAddress}</Typography>
          </Box>
        </Grid>
        <Grid item xs={6}>
          <Box p={1.5} border="1px solid #ddd" borderRadius={1}>
            <Typography fontWeight={700} mb={0.5}>Payment Info:</Typography>
            <Typography variant="body2">Mode: {sale.paymentMode}</Typography>
            {sale.paymentMode === "emi" && (
              <>
                <Typography variant="body2">EMI: ₹{sale.emiMonthlyAmount?.toFixed(2)} × {sale.emiMonths} months</Typography>
                <Typography variant="body2">Start: {sale.emiStartDate?.toDate?.()?.toLocaleDateString?.()}</Typography>
              </>
            )}
            {sale.paymentMode === "finance" && (
              <>
                <Typography variant="body2">Finance: {sale.financeCompany}</Typography>
                <Typography variant="body2">Ref: {sale.financeRef}</Typography>
              </>
            )}
            {sale.downPayment > 0 && <Typography variant="body2">Down Payment: ₹{sale.downPayment}</Typography>}
          </Box>
        </Grid>
      </Grid>

      {/* Items */}
      <Table size="small" sx={{ mb: 2 }}>
        <TableHead>
          <TableRow sx={{ bgcolor: "#1976d2" }}>
            <TableCell sx={{ color: "#fff", fontWeight: 700 }}>#</TableCell>
            <TableCell sx={{ color: "#fff", fontWeight: 700 }}>Product</TableCell>
            {sale.isGST && <TableCell sx={{ color: "#fff", fontWeight: 700 }}>HSN</TableCell>}
            <TableCell sx={{ color: "#fff", fontWeight: 700 }} align="right">Qty</TableCell>
            <TableCell sx={{ color: "#fff", fontWeight: 700 }} align="right">Price</TableCell>
            {sale.isGST && <TableCell sx={{ color: "#fff", fontWeight: 700 }} align="right">GST%</TableCell>}
            {sale.isGST && <TableCell sx={{ color: "#fff", fontWeight: 700 }} align="right">Tax</TableCell>}
            <TableCell sx={{ color: "#fff", fontWeight: 700 }} align="right">Total</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {(sale.items || []).map((item, i) => (
            <TableRow key={i} sx={{ "&:nth-of-type(even)": { bgcolor: "#f9f9f9" } }}>
              <TableCell>{i + 1}</TableCell>
              <TableCell>{item.productName}</TableCell>
              {sale.isGST && <TableCell>{item.hsnCode}</TableCell>}
              <TableCell align="right">{item.qty}</TableCell>
              <TableCell align="right">₹{item.price?.toFixed(2)}</TableCell>
              {sale.isGST && <TableCell align="right">{item.taxRate}%</TableCell>}
              {sale.isGST && <TableCell align="right">₹{item.taxAmount?.toFixed(2)}</TableCell>}
              <TableCell align="right" sx={{ fontWeight: 600 }}>₹{item.total?.toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Totals */}
      <Box display="flex" justifyContent="flex-end" mb={2}>
        <Box minWidth={260}>
          <Stack direction="row" justifyContent="space-between" py={0.5}>
            <Typography variant="body2">Subtotal:</Typography>
            <Typography variant="body2">₹{sale.subTotal?.toFixed(2)}</Typography>
          </Stack>
          {sale.isGST && (
            <Stack direction="row" justifyContent="space-between" py={0.5}>
              <Typography variant="body2">GST Total:</Typography>
              <Typography variant="body2">₹{sale.totalTax?.toFixed(2)}</Typography>
            </Stack>
          )}
          {sale.exchange && (
            <Stack direction="row" justifyContent="space-between" py={0.5}>
              <Typography variant="body2" color="green">Exchange ({sale.exchange.description}):</Typography>
              <Typography variant="body2" color="green">- ₹{sale.exchangeVal?.toFixed(2)}</Typography>
            </Stack>
          )}
          <Divider />
          <Stack direction="row" justifyContent="space-between" py={0.5}>
            <Typography fontWeight={800}>Grand Total:</Typography>
            <Typography fontWeight={800} color="#1976d2">₹{sale.grandTotal?.toFixed(2)}</Typography>
          </Stack>
          <Stack direction="row" justifyContent="space-between" py={0.5}>
            <Typography variant="body2">Paid:</Typography>
            <Typography variant="body2" color="green">₹{sale.paidAmount?.toFixed(2)}</Typography>
          </Stack>
          {(sale.grandTotal - sale.paidAmount) > 0 && (
            <Stack direction="row" justifyContent="space-between" py={0.5}>
              <Typography variant="body2" color="red">Balance Due:</Typography>
              <Typography variant="body2" color="red">₹{(sale.grandTotal - sale.paidAmount)?.toFixed(2)}</Typography>
            </Stack>
          )}
        </Box>
      </Box>

      {/* Exchange note */}
      {sale.exchange?.enabled && (
        <Alert severity="info" sx={{ mb: 2, py: 0.5 }}>
          Exchange: {sale.exchange.description} | Value: ₹{sale.exchangeVal} |
          Item {sale.exchange.received ? "Received" : "Pending Collection"}
        </Alert>
      )}

      {/* EMI Schedule */}
      {sale.paymentMode === "emi" && emiInstallments?.length > 0 && (
        <Box mt={3}>
          <Typography fontWeight={700} mb={1}>EMI Schedule:</Typography>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: "#e3f2fd" }}>
                <TableCell>Inst #</TableCell>
                <TableCell>Due Date</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell align="right">Paid</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {emiInstallments.map((inst) => (
                <TableRow key={inst.id}>
                  <TableCell>{inst.installmentNumber}</TableCell>
                  <TableCell>{inst.dueDate?.toDate?.()?.toLocaleDateString?.()}</TableCell>
                  <TableCell align="right">₹{inst.amount?.toFixed(2)}</TableCell>
                  <TableCell align="right">₹{inst.paidAmount?.toFixed(2) || "0.00"}</TableCell>
                  <TableCell>
                    <Chip label={inst.status} size="small"
                      color={inst.status === "paid" ? "success" : inst.status === "partial" ? "warning" : "default"} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      {/* Payment History */}
      {paymentHistory?.length > 0 && (
        <Box mt={3}>
          <Typography fontWeight={700} mb={1}>Payment History:</Typography>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: "#f5f5f5" }}>
                <TableCell>Date</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Note</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paymentHistory.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.date?.toDate?.()?.toLocaleDateString?.()}</TableCell>
                  <TableCell align="right">₹{p.amount?.toFixed(2)}</TableCell>
                  <TableCell>{p.note || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      {/* Footer */}
      <Box mt={4} pt={2} borderTop="1px solid #ddd" textAlign="center">
        <Typography variant="caption" color="text.secondary">
          Thank you for your business! | {company?.website}
        </Typography>
      </Box>
    </Box>
  );
}

export default function SaleDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userProfile, db } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const printRef = useRef();
  const [sale, setSale] = useState(null);
  const [company, setCompany] = useState(null);
  const [emiInstallments, setEmiInstallments] = useState([]);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payDialog, setPayDialog] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");

  const handlePrint = useReactToPrint({ content: () => printRef.current });

  useEffect(() => { loadSale(); }, [id]);

  const loadSale = async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, "sales", id));
      if (!snap.exists()) return navigate("/sales");
      const data = { id: snap.id, ...snap.data() };
      setSale(data);
      setCompany(getCompanyById(data.companyId));

      // EMI
      const emiSnap = await getDocs(
        query(collection(db, "emiInstallments"), where("saleId", "==", id), orderBy("installmentNumber"))
      );
      setEmiInstallments(emiSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      // Payment history
      const phSnap = await getDocs(
        query(collection(db, "paymentHistory"), where("saleId", "==", id), orderBy("date", "desc"))
      );
      setPaymentHistory(phSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } finally { setLoading(false); }
  };

  const handleRecordPayment = async () => {
    if (!payAmount || parseFloat(payAmount) <= 0) return;
    try {
      const paid = (sale.paidAmount || 0) + parseFloat(payAmount);
      const status = paid >= sale.grandTotal ? "paid" : "partial";
      await updateDoc(doc(db, "sales", id), {
        paidAmount: paid, paymentStatus: status, updatedAt: Timestamp.now(),
      });
      await addDoc(collection(db, "paymentHistory"), {
        saleId: id, invoiceNumber: sale.invoiceNumber,
        amount: parseFloat(payAmount), note: payNote,
        date: Timestamp.now(), storeCategory: userProfile.storeCategory,
      });
      enqueueSnackbar("Payment recorded!", { variant: "success" });
      setPayDialog(false); setPayAmount(""); setPayNote("");
      loadSale();
    } catch { enqueueSnackbar("Failed.", { variant: "error" }); }
  };

  if (loading) return <Box display="flex" justifyContent="center" py={8}><CircularProgress /></Box>;
  if (!sale) return null;

  const canPay = sale.paymentStatus !== "paid";
  const balance = (sale.grandTotal || 0) - (sale.paidAmount || 0);

  return (
    <Box>
      <Stack direction="row" spacing={2} mb={3} flexWrap="wrap">
        <Button startIcon={<ArrowBack />} onClick={() => navigate("/sales")} variant="outlined" size="small">
          Back to Sales
        </Button>
        <Button startIcon={<Print />} onClick={handlePrint} variant="contained" color="info" size="small">
          Print Invoice
        </Button>
        {canPay && (
          <Button startIcon={<Payment />} onClick={() => setPayDialog(true)} variant="contained" color="success" size="small">
            Record Payment
          </Button>
        )}
        {sale.paymentMode === "emi" && (
          <Button startIcon={<CreditScore />} onClick={() => navigate(`/emi?saleId=${id}`)}
            variant="outlined" color="secondary" size="small">
            EMI Details
          </Button>
        )}
      </Stack>

      {/* Print target */}
      <Box display="none">
        <Box ref={printRef}>
          <InvoicePrint sale={sale} company={company} emiInstallments={emiInstallments} paymentHistory={paymentHistory} />
        </Box>
      </Box>

      {/* Invoice Preview */}
      <Card sx={{ borderRadius: 3 }}>
        <CardContent>
          <InvoicePrint sale={sale} company={company} emiInstallments={emiInstallments} paymentHistory={paymentHistory} />
        </CardContent>
      </Card>

      {/* Pay Dialog */}
      <Dialog open={payDialog} onClose={() => setPayDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle fontWeight={700}>Record Payment</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} mt={1}>
            <Alert severity="info" sx={{ py: 0.5 }}>
              Balance Due: ₹{balance.toFixed(2)}
            </Alert>
            <TextField label="Amount *" type="number" fullWidth
              value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
              inputProps={{ max: balance, min: 0 }} />
            <TextField label="Note" fullWidth value={payNote}
              onChange={(e) => setPayNote(e.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPayDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleRecordPayment}>Record Payment</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
