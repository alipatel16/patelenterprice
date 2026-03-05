import React, { useState, useEffect } from "react";
import {
  Box, Card, CardContent, Grid, Typography, Button, Stack,
  TextField, FormControl, InputLabel, Select, MenuItem, Divider,
  Autocomplete, Switch, FormControlLabel, Alert, Chip, IconButton,
  InputAdornment, Table, TableHead, TableBody, TableRow, TableCell,
  Paper, Dialog, DialogTitle, DialogContent, DialogActions, Snackbar,
  RadioGroup, Radio, FormLabel, Checkbox,
} from "@mui/material";
import { Add, Delete, ArrowBack, Save, PersonAdd } from "@mui/icons-material";
import {
  collection, query, where, getDocs, addDoc, doc, getDoc,
  Timestamp, updateDoc,
} from "firebase/firestore";
import { useAuth } from "../../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useSnackbar } from "notistack";
import { COMPANIES_LIST } from "../../config/companies";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs from "dayjs";

const EMPTY_CUSTOMER = { name: "", phone: "", email: "", address: "", customerType: "retail", category: "individual" };

export default function CreateSalePage() {
  const { userProfile, db } = useAuth();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const storeCategory = userProfile?.storeCategory;
  const companies = COMPANIES_LIST.filter(c => c.category === storeCategory);

  const [isGST, setIsGST] = useState(true);
  const [companyId, setCompanyId] = useState(companies[0]?.id || "");
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [products, setProducts] = useState([]);
  const [inventory, setInventory] = useState({});
  const [items, setItems] = useState([{ productId: "", productName: "", qty: 1, price: 0, taxRate: 0, taxAmount: 0, total: 0, hsnCode: "" }]);
  const [exchange, setExchange] = useState({ enabled: false, description: "", value: 0, received: false });
  const [payment, setPayment] = useState({
    mode: "paid", // paid | pending | emi | finance | bank_transfer | pay_at_delivery
    downPayment: "",
    emiMonths: 6,
    emiStartDate: dayjs().add(1, "month"),
    financeCompany: "",
    financeRef: "",
  });
  const [delivery, setDelivery] = useState({ status: "delivered", scheduledDate: null });
  const [notes, setNotes] = useState("");
  const [newCustOpen, setNewCustOpen] = useState(false);
  const [newCust, setNewCust] = useState(EMPTY_CUSTOMER);
  const [stockError, setStockError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, [storeCategory]);

  const loadInitialData = async () => {
    const [custSnap, empSnap, prodSnap, invSnap] = await Promise.all([
      getDocs(query(collection(db, "customers"), where("storeCategory", "==", storeCategory))),
      getDocs(query(collection(db, "users"), where("storeCategory", "==", storeCategory))),
      getDocs(query(collection(db, "products"), where("storeCategory", "==", storeCategory))),
      getDocs(query(collection(db, "inventory"), where("storeCategory", "==", storeCategory))),
    ]);
    setCustomers(custSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setEmployees(empSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setProducts(prodSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    const inv = {};
    invSnap.docs.forEach(d => { inv[d.data().productId] = d.data().stock || 0; });
    setInventory(inv);
  };

  const updateItem = (idx, field, value) => {
    const updated = [...items];
    const item = { ...updated[idx], [field]: value };
    if (field === "productId") {
      const prod = products.find(p => p.id === value);
      if (prod) {
        item.productName = prod.name;
        item.price = prod.price;
        item.taxRate = isGST ? (prod.taxRate || 0) : 0;
        item.hsnCode = prod.hsnCode || "";
      }
    }
    const subtotal = (parseFloat(item.qty) || 0) * (parseFloat(item.price) || 0);
    item.taxAmount = isGST ? subtotal * (item.taxRate / 100) : 0;
    item.total = subtotal + item.taxAmount;
    updated[idx] = item;
    setItems(updated);
    setStockError("");
  };

  const subTotal = items.reduce((s, i) => s + ((parseFloat(i.qty) || 0) * (parseFloat(i.price) || 0)), 0);
  const totalTax = isGST ? items.reduce((s, i) => s + (i.taxAmount || 0), 0) : 0;
  const exchangeVal = exchange.enabled ? parseFloat(exchange.value) || 0 : 0;
  const grandTotal = subTotal + totalTax - exchangeVal;
  const emiMonthlyAmount = payment.mode === "emi"
    ? ((grandTotal - (parseFloat(payment.downPayment) || 0)) / (payment.emiMonths || 1))
    : 0;

  const generateInvoiceNumber = () => {
    const company = companies.find(c => c.id === companyId);
    const code = company?.code || "INV";
    const ts = Date.now().toString().slice(-6);
    return `${code}-${ts}`;
  };

  const handleAddNewCustomer = async () => {
    if (!newCust.name || !newCust.phone) return;
    const docRef = await addDoc(collection(db, "customers"), { ...newCust, storeCategory, createdAt: Timestamp.now() });
    const created = { id: docRef.id, ...newCust };
    setCustomers(prev => [...prev, created]);
    setSelectedCustomer(created);
    setNewCustOpen(false);
    setNewCust(EMPTY_CUSTOMER);
  };

  const handleSave = async () => {
    if (!selectedCustomer) return enqueueSnackbar("Please select a customer.", { variant: "warning" });
    if (items.length === 0 || !items[0].productId) return enqueueSnackbar("Add at least one item.", { variant: "warning" });

    // Stock check
    for (const item of items) {
      if (!item.productId) continue;
      const stock = inventory[item.productId] || 0;
      if (parseInt(item.qty) > stock) {
        setStockError(`Insufficient stock for "${item.productName}". Available: ${stock}`);
        return;
      }
    }

    setSaving(true);
    try {
      const invoiceNumber = generateInvoiceNumber();
      const paidAmount = payment.mode === "paid" ? grandTotal
        : payment.mode === "bank_transfer" ? grandTotal
        : parseFloat(payment.downPayment) || 0;

      const saleData = {
        invoiceNumber, storeCategory, companyId,
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        customerPhone: selectedCustomer.phone,
        customerAddress: selectedCustomer.address,
        employeeId: selectedEmployee?.id || null,
        employeeName: selectedEmployee?.name || null,
        isGST, items,
        subTotal, totalTax, exchangeVal,
        grandTotal, paidAmount,
        exchange: exchange.enabled ? exchange : null,
        paymentMode: payment.mode,
        paymentStatus: payment.mode === "paid" || payment.mode === "bank_transfer" ? "paid"
          : payment.mode === "pending" || payment.mode === "pay_at_delivery" ? "pending"
          : payment.mode,
        downPayment: parseFloat(payment.downPayment) || 0,
        emiMonths: payment.mode === "emi" ? payment.emiMonths : null,
        emiMonthlyAmount: payment.mode === "emi" ? emiMonthlyAmount : null,
        emiStartDate: payment.mode === "emi" ? Timestamp.fromDate(payment.emiStartDate.toDate()) : null,
        financeCompany: payment.mode === "finance" ? payment.financeCompany : null,
        financeRef: payment.mode === "finance" ? payment.financeRef : null,
        deliveryStatus: delivery.status,
        scheduledDate: delivery.status === "scheduled" ? Timestamp.fromDate(delivery.scheduledDate.toDate()) : null,
        notes, createdAt: Timestamp.now(),
        createdBy: userProfile.uid,
      };

      const saleRef = await addDoc(collection(db, "sales"), saleData);

      // Deduct inventory
      for (const item of items) {
        if (!item.productId) continue;
        const invSnap = await getDocs(
          query(collection(db, "inventory"), where("productId", "==", item.productId), where("storeCategory", "==", storeCategory))
        );
        if (!invSnap.empty) {
          await updateDoc(doc(db, "inventory", invSnap.docs[0].id), {
            stock: (invSnap.docs[0].data().stock || 0) - parseInt(item.qty),
            updatedAt: Timestamp.now(),
          });
        }
      }

      // Create EMI installments
      if (payment.mode === "emi") {
        const remaining = grandTotal - (parseFloat(payment.downPayment) || 0);
        const instAmount = remaining / payment.emiMonths;
        for (let i = 0; i < payment.emiMonths; i++) {
          const dueDate = payment.emiStartDate.add(i, "month");
          await addDoc(collection(db, "emiInstallments"), {
            saleId: saleRef.id, invoiceNumber, installmentNumber: i + 1,
            amount: instAmount, paidAmount: 0, status: "pending",
            dueDate: Timestamp.fromDate(dueDate.toDate()),
            customerId: selectedCustomer.id, customerName: selectedCustomer.name,
            storeCategory, createdAt: Timestamp.now(),
          });
        }
      }

      enqueueSnackbar("Sale recorded successfully!", { variant: "success" });
      navigate(`/sales/${saleRef.id}`);
    } catch (e) {
      enqueueSnackbar("Failed: " + e.message, { variant: "error" });
    } finally { setSaving(false); }
  };

  const company = companies.find(c => c.id === companyId);

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box>
        <Stack direction="row" alignItems="center" spacing={2} mb={3}>
          <Button startIcon={<ArrowBack />} onClick={() => navigate("/sales")} variant="outlined" size="small">
            Back
          </Button>
          <Typography variant="h5" fontWeight={800} color="primary.main">
            {isGST ? "Create GST Invoice" : "Create Non-GST Invoice"}
          </Typography>
          <FormControlLabel
            control={<Switch checked={isGST} onChange={(e) => setIsGST(e.target.checked)} color="primary" />}
            label={<Chip label={isGST ? "GST" : "Non-GST"} color={isGST ? "primary" : "default"} size="small" />}
          />
        </Stack>

        <Grid container spacing={3}>
          {/* Left column */}
          <Grid item xs={12} lg={8}>
            {/* Company & Customer */}
            <Card sx={{ borderRadius: 3, mb: 3 }}>
              <CardContent>
                <Typography variant="subtitle1" fontWeight={700} mb={2}>Invoice Details</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth>
                      <InputLabel>Company *</InputLabel>
                      <Select value={companyId} label="Company *"
                        onChange={(e) => setCompanyId(e.target.value)}>
                        {companies.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                      </Select>
                    </FormControl>
                    {company && (
                      <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                        GST: {company.gstNumber}
                      </Typography>
                    )}
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth>
                      <InputLabel>Sales Person</InputLabel>
                      <Select value={selectedEmployee?.id || ""} label="Sales Person"
                        onChange={(e) => setSelectedEmployee(employees.find(x => x.id === e.target.value) || null)}>
                        <MenuItem value="">None</MenuItem>
                        {employees.map(e => <MenuItem key={e.id} value={e.id}>{e.name}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12}>
                    <Stack direction="row" spacing={1} alignItems="flex-end">
                      <Autocomplete
                        options={customers}
                        getOptionLabel={(o) => `${o.name} (${o.phone})`}
                        value={selectedCustomer}
                        onChange={(_, v) => setSelectedCustomer(v)}
                        renderInput={(params) => <TextField {...params} label="Select Customer *" />}
                        fullWidth
                      />
                      <Button variant="outlined" startIcon={<PersonAdd />}
                        onClick={() => setNewCustOpen(true)} sx={{ whiteSpace: "nowrap", minWidth: 140 }}>
                        New Customer
                      </Button>
                    </Stack>
                  </Grid>
                  {selectedCustomer && (
                    <Grid item xs={12}>
                      <Alert severity="info" sx={{ py: 0.5 }}>
                        {selectedCustomer.name} | {selectedCustomer.phone} | {selectedCustomer.customerType} | {selectedCustomer.address}
                      </Alert>
                    </Grid>
                  )}
                </Grid>
              </CardContent>
            </Card>

            {/* Items */}
            <Card sx={{ borderRadius: 3, mb: 3 }}>
              <CardContent>
                <Typography variant="subtitle1" fontWeight={700} mb={2}>Items</Typography>
                {stockError && <Alert severity="error" sx={{ mb: 2 }}>{stockError}</Alert>}
                <Paper variant="outlined" sx={{ borderRadius: 2, overflow: "auto" }}>
                  <Table size="small" sx={{ minWidth: 600 }}>
                    <TableHead>
                      <TableRow sx={{ bgcolor: "primary.main" }}>
                        {["Product", "HSN", "Qty", "Price (₹)", isGST ? "Tax %" : "", isGST ? "Tax ₹" : "", "Total", ""].map((h, i) => (
                          <TableCell key={i} sx={{ color: "white", fontWeight: 700, py: 1 }}>{h}</TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {items.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <Autocomplete
                              options={products}
                              getOptionLabel={(o) => o.name || ""}
                              value={products.find(p => p.id === item.productId) || null}
                              onChange={(_, v) => updateItem(idx, "productId", v?.id || "")}
                              renderInput={(params) => (
                                <TextField {...params} size="small" placeholder="Select"
                                  error={item.productId && (inventory[item.productId] || 0) === 0}
                                  helperText={item.productId && inventory[item.productId] !== undefined
                                    ? `Stock: ${inventory[item.productId] || 0}` : ""} />
                              )}
                              sx={{ minWidth: 200 }}
                            />
                          </TableCell>
                          <TableCell><Typography variant="caption">{item.hsnCode || "—"}</Typography></TableCell>
                          <TableCell>
                            <TextField type="number" size="small" value={item.qty}
                              onChange={(e) => updateItem(idx, "qty", e.target.value)}
                              sx={{ width: 70 }} inputProps={{ min: 1 }} />
                          </TableCell>
                          <TableCell>
                            <TextField type="number" size="small" value={item.price}
                              onChange={(e) => updateItem(idx, "price", e.target.value)}
                              sx={{ width: 90 }} />
                          </TableCell>
                          {isGST && (
                            <TableCell>
                              <TextField type="number" size="small" value={item.taxRate}
                                onChange={(e) => updateItem(idx, "taxRate", parseFloat(e.target.value))}
                                sx={{ width: 70 }}
                                InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }} />
                            </TableCell>
                          )}
                          {isGST && (
                            <TableCell>
                              <Typography variant="caption" color="text.secondary">
                                ₹{(item.taxAmount || 0).toFixed(2)}
                              </Typography>
                            </TableCell>
                          )}
                          <TableCell>
                            <Typography fontWeight={600} color="primary.main">
                              ₹{(item.total || 0).toFixed(2)}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <IconButton size="small" color="error"
                              onClick={() => setItems(items.filter((_, i) => i !== idx))}>
                              <Delete fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Paper>
                <Button size="small" startIcon={<Add />} sx={{ mt: 1 }}
                  onClick={() => setItems([...items, { productId: "", productName: "", qty: 1, price: 0, taxRate: 0, taxAmount: 0, total: 0, hsnCode: "" }])}>
                  Add Item
                </Button>
              </CardContent>
            </Card>

            {/* Exchange */}
            <Card sx={{ borderRadius: 3, mb: 3 }}>
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={1} mb={1}>
                  <Switch checked={exchange.enabled} onChange={(e) => setExchange({ ...exchange, enabled: e.target.checked })} />
                  <Typography variant="subtitle1" fontWeight={700}>Exchange</Typography>
                </Stack>
                {exchange.enabled && (
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <TextField label="Exchange Item Description" fullWidth
                        value={exchange.description}
                        onChange={(e) => setExchange({ ...exchange, description: e.target.value })} />
                    </Grid>
                    <Grid item xs={12} sm={3}>
                      <TextField label="Exchange Value" type="number" fullWidth
                        value={exchange.value}
                        onChange={(e) => setExchange({ ...exchange, value: e.target.value })}
                        InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
                    </Grid>
                    <Grid item xs={12} sm={3} sx={{ display: "flex", alignItems: "center" }}>
                      <FormControlLabel
                        control={<Checkbox checked={exchange.received}
                          onChange={(e) => setExchange({ ...exchange, received: e.target.checked })} />}
                        label="Item Received"
                      />
                    </Grid>
                  </Grid>
                )}
              </CardContent>
            </Card>

            {/* Delivery */}
            <Card sx={{ borderRadius: 3, mb: 3 }}>
              <CardContent>
                <Typography variant="subtitle1" fontWeight={700} mb={2}>Delivery</Typography>
                <FormControl>
                  <FormLabel>Delivery Status</FormLabel>
                  <RadioGroup row value={delivery.status}
                    onChange={(e) => setDelivery({ ...delivery, status: e.target.value })}>
                    <FormControlLabel value="delivered" control={<Radio />} label="Delivered" />
                    <FormControlLabel value="scheduled" control={<Radio />} label="Scheduled" />
                    <FormControlLabel value="pending" control={<Radio />} label="Pending" />
                  </RadioGroup>
                </FormControl>
                {delivery.status === "scheduled" && (
                  <Box mt={2}>
                    <DatePicker label="Scheduled Date" value={delivery.scheduledDate}
                      onChange={(d) => setDelivery({ ...delivery, scheduledDate: d })}
                      slotProps={{ textField: { size: "small" } }} />
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Right column - Payment & Summary */}
          <Grid item xs={12} lg={4}>
            {/* Payment */}
            <Card sx={{ borderRadius: 3, mb: 3, position: { lg: "sticky" }, top: { lg: 20 } }}>
              <CardContent>
                <Typography variant="subtitle1" fontWeight={700} mb={2}>Payment</Typography>
                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel>Payment Mode</InputLabel>
                  <Select value={payment.mode} label="Payment Mode"
                    onChange={(e) => setPayment({ ...payment, mode: e.target.value })}>
                    <MenuItem value="paid">Full Payment (Cash)</MenuItem>
                    <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
                    <MenuItem value="pending">Pending Payment</MenuItem>
                    <MenuItem value="pay_at_delivery">Pay at Delivery</MenuItem>
                    <MenuItem value="emi">EMI</MenuItem>
                    <MenuItem value="finance">Finance</MenuItem>
                  </Select>
                </FormControl>

                {(payment.mode === "emi" || payment.mode === "pending" || payment.mode === "finance") && (
                  <TextField label="Down Payment (Optional)" type="number" fullWidth sx={{ mb: 2 }}
                    value={payment.downPayment}
                    onChange={(e) => setPayment({ ...payment, downPayment: e.target.value })}
                    InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
                )}

                {payment.mode === "emi" && (
                  <Stack spacing={2} mb={2}>
                    <TextField label="EMI Months" type="number" fullWidth
                      value={payment.emiMonths}
                      onChange={(e) => setPayment({ ...payment, emiMonths: parseInt(e.target.value) })}
                      inputProps={{ min: 1, max: 60 }} />
                    <DatePicker label="EMI Start Date" value={payment.emiStartDate}
                      onChange={(d) => setPayment({ ...payment, emiStartDate: d })}
                      slotProps={{ textField: { fullWidth: true } }} />
                    <Alert severity="info" sx={{ py: 0.5 }}>
                      Monthly EMI: ₹{emiMonthlyAmount.toFixed(2)}
                    </Alert>
                  </Stack>
                )}

                {payment.mode === "finance" && (
                  <Stack spacing={2} mb={2}>
                    <TextField label="Finance Company Name" fullWidth
                      value={payment.financeCompany}
                      onChange={(e) => setPayment({ ...payment, financeCompany: e.target.value })} />
                    <TextField label="Reference Number (Optional)" fullWidth
                      value={payment.financeRef}
                      onChange={(e) => setPayment({ ...payment, financeRef: e.target.value })} />
                  </Stack>
                )}

                <Divider sx={{ my: 2 }} />

                {/* Summary */}
                <Stack spacing={1}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">Subtotal</Typography>
                    <Typography variant="body2">₹{subTotal.toFixed(2)}</Typography>
                  </Stack>
                  {isGST && (
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">Total Tax (GST)</Typography>
                      <Typography variant="body2">₹{totalTax.toFixed(2)}</Typography>
                    </Stack>
                  )}
                  {exchange.enabled && (
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="success.main">Exchange Deduction</Typography>
                      <Typography variant="body2" color="success.main">- ₹{exchangeVal.toFixed(2)}</Typography>
                    </Stack>
                  )}
                  <Divider />
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="subtitle1" fontWeight={800}>Grand Total</Typography>
                    <Typography variant="subtitle1" fontWeight={800} color="primary.main">
                      ₹{grandTotal.toFixed(2)}
                    </Typography>
                  </Stack>
                  {payment.downPayment && (
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">Down Payment</Typography>
                      <Typography variant="body2">₹{parseFloat(payment.downPayment || 0).toFixed(2)}</Typography>
                    </Stack>
                  )}
                  {payment.mode === "emi" && (
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">Monthly EMI ({payment.emiMonths} months)</Typography>
                      <Typography variant="body2" color="primary.main" fontWeight={600}>
                        ₹{emiMonthlyAmount.toFixed(2)}
                      </Typography>
                    </Stack>
                  )}
                </Stack>

                <TextField label="Notes" multiline rows={2} fullWidth sx={{ mt: 2 }}
                  value={notes} onChange={(e) => setNotes(e.target.value)} />
              </CardContent>
            </Card>

            <Button variant="contained" fullWidth size="large" onClick={handleSave}
              disabled={saving} startIcon={<Save />}
              sx={{ py: 1.5, borderRadius: 2, fontWeight: 700, fontSize: 16 }}>
              {saving ? "Saving..." : "Save Invoice"}
            </Button>
          </Grid>
        </Grid>

        {/* New Customer Dialog */}
        <Dialog open={newCustOpen} onClose={() => setNewCustOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle fontWeight={700}>Quick Add Customer</DialogTitle>
          <DialogContent dividers>
            <Grid container spacing={2} mt={0.5}>
              <Grid item xs={12} sm={6}>
                <TextField label="Name *" fullWidth value={newCust.name}
                  onChange={(e) => setNewCust({ ...newCust, name: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label="Phone *" fullWidth value={newCust.phone}
                  onChange={(e) => setNewCust({ ...newCust, phone: e.target.value })} />
              </Grid>
              <Grid item xs={12}>
                <TextField label="Address" fullWidth value={newCust.address}
                  onChange={(e) => setNewCust({ ...newCust, address: e.target.value })} />
              </Grid>
              <Grid item xs={6}>
                <FormControl fullWidth>
                  <InputLabel>Type</InputLabel>
                  <Select value={newCust.customerType} label="Type"
                    onChange={(e) => setNewCust({ ...newCust, customerType: e.target.value })}>
                    <MenuItem value="retail">Retail</MenuItem>
                    <MenuItem value="wholesale">Wholesale</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6}>
                <FormControl fullWidth>
                  <InputLabel>Category</InputLabel>
                  <Select value={newCust.category} label="Category"
                    onChange={(e) => setNewCust({ ...newCust, category: e.target.value })}>
                    <MenuItem value="individual">Individual</MenuItem>
                    <MenuItem value="firm">Firm</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setNewCustOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={handleAddNewCustomer}>Add Customer</Button>
          </DialogActions>
        </Dialog>
      </Box>
    </LocalizationProvider>
  );
}
