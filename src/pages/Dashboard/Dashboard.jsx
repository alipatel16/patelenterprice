import React, { useState, useEffect } from "react";
import {
  Box, Grid, Card, CardContent, Typography, Button, Stack,
  Chip, Avatar, Divider, Select, MenuItem, FormControl,
  InputLabel, CircularProgress, IconButton, Tooltip,
} from "@mui/material";
import {
  TrendingUp, People, Inventory2, PointOfSale, ShoppingCart,
  CreditScore, Notifications, Add, ArrowUpward, ArrowDownward,
  Store, AttachMoney,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import {
  collection, query, where, getDocs, orderBy, limit,
  Timestamp,
} from "firebase/firestore";
import { useAuth } from "../../contexts/AuthContext";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs from "dayjs";

function StatCard({ title, value, icon, color, change, prefix = "" }) {
  return (
    <Card sx={{ borderRadius: 3, height: "100%", position: "relative", overflow: "hidden" }}>
      <Box sx={{ position: "absolute", top: -20, right: -20, opacity: 0.08,
        fontSize: 120, color: color }}>
        {icon}
      </Box>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography variant="body2" color="text.secondary" fontWeight={600} mb={0.5}>
              {title}
            </Typography>
            <Typography variant="h4" fontWeight={800} color={color}>
              {prefix}{typeof value === "number" ? value.toLocaleString("en-IN") : value}
            </Typography>
            {change !== undefined && (
              <Chip
                icon={change >= 0 ? <ArrowUpward sx={{ fontSize: 12 }} /> : <ArrowDownward sx={{ fontSize: 12 }} />}
                label={`${Math.abs(change)}% vs last month`}
                size="small"
                color={change >= 0 ? "success" : "error"}
                sx={{ mt: 1, fontSize: 11 }}
              />
            )}
          </Box>
          <Avatar sx={{ bgcolor: `${color}20`, color: color, width: 48, height: 48 }}>
            {icon}
          </Avatar>
        </Stack>
      </CardContent>
    </Card>
  );
}

function QuickActionBtn({ icon, label, color, onClick }) {
  return (
    <Button
      variant="outlined"
      startIcon={icon}
      onClick={onClick}
      fullWidth
      sx={{ py: 1.5, borderRadius: 2, flexDirection: "column",
        gap: 0.5, height: 80, borderColor: color, color: color,
        "&:hover": { bgcolor: `${color}10`, borderColor: color } }}
    >
      <Box sx={{ fontSize: 24 }}>{icon}</Box>
      <Typography variant="caption" fontWeight={600}>{label}</Typography>
    </Button>
  );
}

export default function Dashboard() {
  const { userProfile, db } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalSales: 0, totalRevenue: 0, totalCustomers: 0,
    totalProducts: 0, pendingPayments: 0, pendingEMIs: 0,
  });
  const [period, setPeriod] = useState("today");
  const [customStart, setCustomStart] = useState(null);
  const [customEnd, setCustomEnd] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recentSales, setRecentSales] = useState([]);

  const getDateRange = () => {
    const now = dayjs();
    if (period === "today") return { start: now.startOf("day"), end: now.endOf("day") };
    if (period === "month") return { start: now.startOf("month"), end: now.endOf("month") };
    if (period === "custom" && customStart && customEnd) return { start: customStart, end: customEnd };
    return { start: now.startOf("day"), end: now.endOf("day") };
  };

  useEffect(() => {
    fetchStats();
  }, [period, customStart, customEnd, userProfile]);

  const fetchStats = async () => {
    if (!userProfile) return;
    setLoading(true);
    try {
      const { start, end } = getDateRange();
      const storeCategory = userProfile.storeCategory;

      // Fetch sales in range
      const salesSnap = await getDocs(
        query(collection(db, "sales"),
          where("storeCategory", "==", storeCategory),
          where("createdAt", ">=", Timestamp.fromDate(start.toDate())),
          where("createdAt", "<=", Timestamp.fromDate(end.toDate()))
        )
      );
      const salesData = salesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const revenue = salesData.reduce((s, x) => s + (x.grandTotal || 0), 0);

      // Customers
      const custSnap = await getDocs(
        query(collection(db, "customers"), where("storeCategory", "==", storeCategory))
      );

      // Products
      const prodSnap = await getDocs(
        query(collection(db, "products"), where("storeCategory", "==", storeCategory))
      );

      // Pending payments
      const pendingSnap = await getDocs(
        query(collection(db, "sales"),
          where("storeCategory", "==", storeCategory),
          where("paymentStatus", "in", ["pending", "partial"])
        )
      );

      // EMI upcoming
      const emiSnap = await getDocs(
        query(collection(db, "emiInstallments"),
          where("storeCategory", "==", storeCategory),
          where("status", "==", "pending")
        )
      );

      setStats({
        totalSales: salesData.length,
        totalRevenue: revenue,
        totalCustomers: custSnap.size,
        totalProducts: prodSnap.size,
        pendingPayments: pendingSnap.size,
        pendingEMIs: emiSnap.size,
      });

      // Recent sales
      const recentSnap = await getDocs(
        query(collection(db, "sales"),
          where("storeCategory", "==", storeCategory),
          orderBy("createdAt", "desc"),
          limit(5)
        )
      );
      setRecentSales(recentSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box>
        {/* Header */}
        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between"
          alignItems={{ xs: "stretch", sm: "center" }} spacing={2} mb={3}>
          <Box>
            <Typography variant="h5" fontWeight={800}>
              Good {dayjs().hour() < 12 ? "Morning" : dayjs().hour() < 17 ? "Afternoon" : "Evening"}, {userProfile?.name?.split(" ")[0]} 👋
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Here's what's happening in your store today.
            </Typography>
          </Box>

          <Stack direction="row" spacing={1} flexWrap="wrap">
            <FormControl size="small">
              <Select value={period} onChange={(e) => setPeriod(e.target.value)} sx={{ minWidth: 120 }}>
                <MenuItem value="today">Today</MenuItem>
                <MenuItem value="month">This Month</MenuItem>
                <MenuItem value="custom">Custom Range</MenuItem>
              </Select>
            </FormControl>
            {period === "custom" && (
              <>
                <DatePicker value={customStart} onChange={setCustomStart}
                  slotProps={{ textField: { size: "small", sx: { width: 150 } } }} />
                <DatePicker value={customEnd} onChange={setCustomEnd}
                  slotProps={{ textField: { size: "small", sx: { width: 150 } } }} />
              </>
            )}
          </Stack>
        </Stack>

        {/* Stats */}
        <Grid container spacing={2} mb={3}>
          {[
            { title: "Total Sales", value: stats.totalSales, icon: <PointOfSale />, color: "#1976d2" },
            { title: "Revenue", value: stats.totalRevenue, icon: <AttachMoney />, color: "#2e7d32", prefix: "₹" },
            { title: "Customers", value: stats.totalCustomers, icon: <People />, color: "#ed6c02" },
            { title: "Products", value: stats.totalProducts, icon: <Inventory2 />, color: "#9c27b0" },
            { title: "Pending Payments", value: stats.pendingPayments, icon: <ShoppingCart />, color: "#d32f2f" },
            { title: "Pending EMIs", value: stats.pendingEMIs, icon: <CreditScore />, color: "#0097a7" },
          ].map(s => (
            <Grid item xs={12} sm={6} md={4} lg={2} key={s.title}>
              <StatCard {...s} />
            </Grid>
          ))}
        </Grid>

        <Grid container spacing={3}>
          {/* Quick Actions */}
          <Grid item xs={12} md={4}>
            <Card sx={{ borderRadius: 3 }}>
              <CardContent>
                <Typography variant="subtitle1" fontWeight={700} mb={2}>Quick Actions</Typography>
                <Grid container spacing={1.5}>
                  {[
                    { icon: <Add />, label: "New Sale", color: "#1976d2", path: "/sales/new" },
                    { icon: <People />, label: "Add Customer", color: "#2e7d32", path: "/customers?add=true" },
                    { icon: <ShoppingCart />, label: "New Purchase", color: "#ed6c02", path: "/purchase/new" },
                    { icon: <Store />, label: "Add Product", color: "#9c27b0", path: "/products?add=true" },
                    { icon: <Inventory2 />, label: "View Inventory", color: "#0097a7", path: "/inventory" },
                    { icon: <CreditScore />, label: "EMI Tracking", color: "#d32f2f", path: "/emi" },
                  ].map(a => (
                    <Grid item xs={6} key={a.label}>
                      <QuickActionBtn {...a} onClick={() => navigate(a.path)} />
                    </Grid>
                  ))}
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* Recent Sales */}
          <Grid item xs={12} md={8}>
            <Card sx={{ borderRadius: 3 }}>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                  <Typography variant="subtitle1" fontWeight={700}>Recent Sales</Typography>
                  <Button size="small" onClick={() => navigate("/sales")}>View All</Button>
                </Stack>
                {loading ? (
                  <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
                ) : recentSales.length === 0 ? (
                  <Typography color="text.secondary" textAlign="center" py={4}>No recent sales</Typography>
                ) : recentSales.map(sale => (
                  <Box key={sale.id}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" py={1.5}>
                      <Box>
                        <Typography variant="body2" fontWeight={600}>
                          {sale.invoiceNumber || sale.id.slice(0, 8)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {sale.customerName} • {sale.createdAt?.toDate?.()?.toLocaleDateString?.() || "—"}
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="body2" fontWeight={700}>
                          ₹{(sale.grandTotal || 0).toLocaleString("en-IN")}
                        </Typography>
                        <Chip
                          label={sale.paymentStatus || "paid"}
                          size="small"
                          color={
                            sale.paymentStatus === "paid" ? "success"
                            : sale.paymentStatus === "pending" ? "warning"
                            : "info"
                          }
                        />
                      </Stack>
                    </Stack>
                    <Divider />
                  </Box>
                ))}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>
    </LocalizationProvider>
  );
}
