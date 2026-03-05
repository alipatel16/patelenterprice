import React, { useMemo } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import getTheme from './theme';
import Layout from './components/Layout/Layout';
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import Dashboard from './pages/Dashboard/Dashboard';
import CustomerList from './pages/Customers/CustomerList';
import ProductList from './pages/Products/ProductList';
import PurchaseList from './pages/Purchase/PurchaseList';
import Inventory from './pages/Inventory/Inventory';
import SalesList from './pages/Sales/SalesList';
import CreateSale from './pages/Sales/CreateSale';
import SaleDetail from './pages/Sales/SaleDetail';

const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? children : <Navigate to="/login" replace />;
};

const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/dashboard" replace /> : children;
};

const AppContent = () => {
  const { storeType } = useAuth();
  const theme = useMemo(() => getTheme(storeType || 'electronics'), [storeType]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} />
      <Routes>
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="customers" element={<CustomerList />} />
          <Route path="products" element={<ProductList />} />
          <Route path="purchases" element={<PurchaseList />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="sales" element={<SalesList />} />
          <Route path="sales/new" element={<CreateSale />} />
          <Route path="sales/edit/:id" element={<CreateSale />} />
          <Route path="sales/:id" element={<SaleDetail />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </ThemeProvider>
  );
};

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  </BrowserRouter>
);

export default App;