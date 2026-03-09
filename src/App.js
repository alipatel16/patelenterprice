// src/App.js  ─── UPDATED v2 — adds checklist-status, salary-report, penalty-settings ───
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
import DeliveryTracking from './pages/Sales/DeliveryTracking';
import ExchangeTracking from './pages/Sales/ExchangeTracking';
import EmiDues from './pages/Sales/EmiDues';
import QuotationsList from './pages/Quotations/QuotationsList';
import CreateQuotation from './pages/Quotations/CreateQuotation';
import QuotationDetail from './pages/Quotations/QuotationDetail';
import GiftInvoiceList from './pages/Gifts/GiftInvoiceList';
import CreateGiftInvoice from './pages/Gifts/CreateGiftInvoice';
import GiftInvoiceDetail from './pages/Gifts/GiftInvoiceDetail';
import GiftSetList from './pages/Gifts/GiftSetList';
import GiftSetForm from './pages/Gifts/GiftSetForm';

// Complaints
import ComplaintList from './pages/Complaints/ComplaintList';
import CreateComplaint from './pages/Complaints/CreateComplaint';
import ComplaintDetail from './pages/Complaints/ComplaintDetail';
import BrandHierarchyList from './pages/Complaints/BrandHierarchyList';
import BrandHierarchyForm from './pages/Complaints/BrandHierarchyForm';

// ── Employee Module ───────────────────────────────────────────────────────────
import EmployeeList from './pages/Employees/EmployeeList';
import EmployeeProfile from './pages/Employees/EmployeeProfile';
import ChecklistTemplateList from './pages/Employees/ChecklistTemplateList';
import ChecklistTemplateForm from './pages/Employees/ChecklistTemplateForm';
import AttendanceTracker from './pages/Employees/AttendanceTracker';
import EmployeeDashboard from './pages/Employees/EmployeeDashboard';
import ChecklistAdminView from './pages/Employees/ChecklistAdminView';
import PenaltySettings from './pages/Employees/PenaltySettings';
import SalaryReport from './pages/Employees/SalaryReport';
import EmployeeSalesReport from './pages/Sales/EmployeeSalesReport';

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
        <Route path="/login"    element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="customers" element={<CustomerList />} />
          <Route path="products"  element={<ProductList />} />
          <Route path="purchases" element={<PurchaseList />} />
          <Route path="inventory" element={<Inventory />} />

          {/* Sales */}
          <Route path="sales"             element={<SalesList />} />
          <Route path="sales/new"         element={<CreateSale />} />
          <Route path="sales/edit/:id"    element={<CreateSale />} />
          <Route path="sales/:id"         element={<SaleDetail />} />
          <Route path="delivery-tracking" element={<DeliveryTracking />} />
          <Route path="exchange-tracking" element={<ExchangeTracking />} />
          <Route path="emi-dues"          element={<EmiDues />} />
          <Route path="employee-sales-report" element={<EmployeeSalesReport />} />

          {/* Quotations */}
          <Route path="quotations"          element={<QuotationsList />} />
          <Route path="quotations/new"      element={<CreateQuotation />} />
          <Route path="quotations/edit/:id" element={<CreateQuotation />} />
          <Route path="quotations/:id"      element={<QuotationDetail />} />

          {/* Gifts */}
          <Route path="gift-invoices"          element={<GiftInvoiceList />} />
          <Route path="gift-invoices/new"      element={<CreateGiftInvoice />} />
          <Route path="gift-invoices/edit/:id" element={<CreateGiftInvoice />} />
          <Route path="gift-invoices/:id"      element={<GiftInvoiceDetail />} />
          <Route path="gift-sets"              element={<GiftSetList />} />
          <Route path="gift-sets/new"          element={<GiftSetForm />} />
          <Route path="gift-sets/edit/:id"     element={<GiftSetForm />} />

          {/* Complaints */}
          <Route path="complaints"               element={<ComplaintList />} />
          <Route path="complaints/new"           element={<CreateComplaint />} />
          <Route path="complaints/edit/:id"      element={<CreateComplaint />} />
          <Route path="complaints/:id"           element={<ComplaintDetail />} />
          <Route path="brand-hierarchy"          element={<BrandHierarchyList />} />
          <Route path="brand-hierarchy/new"      element={<BrandHierarchyForm />} />
          <Route path="brand-hierarchy/edit/:id" element={<BrandHierarchyForm />} />

          {/* ── Employee Module ─────────────────────────────────────── */}
          <Route path="employees"                    element={<EmployeeList />} />
          <Route path="employees/edit/:id"           element={<EmployeeProfile />} />
          <Route path="checklist-templates"          element={<ChecklistTemplateList />} />
          <Route path="checklist-templates/new"      element={<ChecklistTemplateForm />} />
          <Route path="checklist-templates/edit/:id" element={<ChecklistTemplateForm />} />
          <Route path="attendance"                   element={<AttendanceTracker />} />
          <Route path="my-attendance"                element={<EmployeeDashboard />} />
          <Route path="checklist-status"             element={<ChecklistAdminView />} />
          <Route path="penalty-settings"             element={<PenaltySettings />} />
          <Route path="salary-report"                element={<SalaryReport />} />
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