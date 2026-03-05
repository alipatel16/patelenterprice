import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { createTheme, ThemeProvider, CssBaseline } from "@mui/material";
import { SnackbarProvider } from "notistack";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Layout from "./components/Layout/Layout";
import { LoginPage, RegisterPage } from "./pages/Auth/AuthPages";
import Dashboard from "./pages/Dashboard/Dashboard";
import CustomersPage from "./pages/Customers/CustomersPage";
import ProductsPage from "./pages/Products/ProductsPage";
import PurchasePage from "./pages/Purchase/PurchasePage";
import InventoryPage from "./pages/Inventory/InventoryPage";
import SalesListPage from "./pages/Sales/SalesListPage";
import CreateSalePage from "./pages/Sales/CreateSalePage";
import SaleDetailPage from "./pages/Sales/SaleDetailPage";
import EMITrackingPage from "./pages/EMI/EMITrackingPage";
import NotificationsPage from "./pages/Notifications/NotificationsPage";

const theme = createTheme({
  palette: {
    primary: { main: "#1565C0" },
    secondary: { main: "#7B1FA2" },
    success: { main: "#2E7D32" },
    background: { default: "#f5f6fa" },
  },
  typography: {
    fontFamily: '"Poppins", "Roboto", sans-serif',
    h5: { fontWeight: 800 },
    h6: { fontWeight: 700 },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { border: "1px solid #e8eaed" } },
    },
    MuiButton: {
      styleOverrides: { root: { textTransform: "none", fontWeight: 600, borderRadius: 8 } },
    },
    MuiChip: {
      styleOverrides: { root: { fontWeight: 600 } },
    },
  },
});

function ProtectedRoute({ children }) {
  const { currentUser, loading } = useAuth();
  if (loading) return null;
  if (!currentUser) return <Navigate to="/login" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { currentUser } = useAuth();
  if (currentUser) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <SnackbarProvider maxSnack={3} anchorOrigin={{ vertical: "bottom", horizontal: "right" }}>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
              <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
              <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="customers" element={<CustomersPage />} />
                <Route path="products" element={<ProductsPage />} />
                <Route path="purchase" element={<PurchasePage />} />
                <Route path="inventory" element={<InventoryPage />} />
                <Route path="sales" element={<SalesListPage />} />
                <Route path="sales/new" element={<CreateSalePage />} />
                <Route path="sales/:id" element={<SaleDetailPage />} />
                <Route path="emi" element={<EMITrackingPage />} />
                <Route path="notifications" element={<NotificationsPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </SnackbarProvider>
    </ThemeProvider>
  );
}
