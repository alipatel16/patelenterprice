import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Box, Drawer, AppBar, Toolbar, Typography, IconButton,
  List, ListItem, ListItemButton, ListItemIcon, ListItemText,
  Avatar, Menu, MenuItem, Divider, useTheme, useMediaQuery,
  Chip, Tooltip,
} from '@mui/material';
import {
  Menu as MenuIcon, Dashboard, People, Inventory2,
  ShoppingCart, PointOfSale, Storefront, Logout,
  AccountCircle, ElectricBolt, Chair, ChevronLeft,
  LocalShipping, AdminPanelSettings, SwapHoriz, CreditScore,
  Description, CardGiftcard, BugReport,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { COMPANIES } from '../../constants';

const DRAWER_WIDTH = 240;

const NAV_ITEMS = [
  { path: '/dashboard',          label: 'Dashboard',         icon: <Dashboard /> },
  { path: '/customers',          label: 'Customers',         icon: <People /> },
  { path: '/products',           label: 'Products',          icon: <Storefront /> },
  { path: '/purchases',          label: 'Purchases',         icon: <ShoppingCart /> },
  { path: '/inventory',          label: 'Inventory',         icon: <Inventory2 /> },
  { path: '/sales',              label: 'Sales',             icon: <PointOfSale /> },
  { path: '/delivery-tracking',  label: 'Delivery Tracking', icon: <LocalShipping /> },
  { path: '/exchange-tracking',  label: 'Exchange Tracking', icon: <SwapHoriz /> },
  { path: '/emi-dues',           label: 'EMI Dues',          icon: <CreditScore /> },
  { path: '/quotations',         label: 'Quotations',        icon: <Description /> },
  { path: '/gift-invoices',      label: 'Gift Invoices',     icon: <CardGiftcard /> },
  { path: '/complaints',         label: 'Complaints',        icon: <BugReport /> },
];

const Layout = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const { userProfile, storeType, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const company = COMPANIES[userProfile?.companyId] || null;
  const isElectronics = storeType === 'electronics';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Determine if a nav item is active, accounting for sub-routes
  const isNavActive = (path) => {
    if (path === '/sales') {
      return location.pathname === '/sales' || location.pathname.startsWith('/sales/');
    }
    if (path === '/gift-invoices') {
      return location.pathname.startsWith('/gift-invoices') || location.pathname.startsWith('/gift-sets');
    }
    if (path === '/complaints') {
      return location.pathname.startsWith('/complaints') || location.pathname.startsWith('/brand-hierarchy');
    }
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const drawerContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Branding */}
      <Box sx={{
        p: 2, background: theme.palette.primary.main,
        color: '#fff', display: 'flex', alignItems: 'center', gap: 1.5,
      }}>
        <Box sx={{
          width: 40, height: 40, borderRadius: '50%',
          background: 'rgba(255,255,255,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {isElectronics ? <ElectricBolt /> : <Chair />}
        </Box>
        <Box>
          <Typography variant="subtitle2" fontWeight={700} lineHeight={1.2}>
            {isElectronics ? 'Electronics' : 'Furniture'}
          </Typography>
          <Typography variant="caption" sx={{ opacity: 0.8 }}>
            Management System
          </Typography>
        </Box>
        {isMobile && (
          <IconButton onClick={() => setMobileOpen(false)} sx={{ ml: 'auto', color: '#fff' }}>
            <ChevronLeft />
          </IconButton>
        )}
      </Box>

      {/* Company badge */}
      {company && (
        <Box sx={{ px: 2, py: 1.5, bgcolor: 'action.hover' }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>BRANCH</Typography>
          <Typography variant="body2" fontWeight={600} noWrap>{company.name}</Typography>
          <Chip label={company.code} size="small" color="primary" sx={{ mt: 0.5, height: 18, fontSize: 10 }} />
        </Box>
      )}

      <Divider />

      {/* Nav Items */}
      <List sx={{ flex: 1, py: 1, overflowY: 'auto' }}>
        {NAV_ITEMS.map(({ path, label, icon }) => {
          const isActive = isNavActive(path);
          return (
            <ListItem key={path} disablePadding sx={{ px: 1, mb: 0.5 }}>
              <ListItemButton
                onClick={() => { navigate(path); if (isMobile) setMobileOpen(false); }}
                selected={isActive}
                sx={{
                  borderRadius: 2,
                  '&.Mui-selected': {
                    bgcolor: `${theme.palette.primary.main}18`,
                    color: theme.palette.primary.main,
                    '& .MuiListItemIcon-root': { color: theme.palette.primary.main },
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 40 }}>{icon}</ListItemIcon>
                <ListItemText
                  primary={label}
                  primaryTypographyProps={{ fontSize: 14, fontWeight: isActive ? 600 : 400 }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>

      <Divider />

      {/* User info */}
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Avatar sx={{ width: 36, height: 36, bgcolor: theme.palette.primary.main, fontSize: 14 }}>
          {userProfile?.name?.charAt(0)?.toUpperCase() || 'U'}
        </Avatar>
        <Box flex={1} minWidth={0}>
          <Typography variant="body2" fontWeight={600} noWrap>{userProfile?.name}</Typography>
          <Chip
            label={userProfile?.role}
            size="small"
            icon={userProfile?.role === 'admin'
              ? <AdminPanelSettings sx={{ fontSize: '12px !important' }} />
              : undefined}
            color={userProfile?.role === 'admin' ? 'primary' : 'default'}
            sx={{ height: 18, fontSize: 10, mt: 0.25 }}
          />
        </Box>
        <Tooltip title="Logout">
          <IconButton size="small" onClick={handleLogout}>
            <Logout fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* Mobile AppBar */}
      {isMobile && (
        <AppBar position="fixed" sx={{ zIndex: theme.zIndex.drawer + 1 }}>
          <Toolbar>
            <IconButton color="inherit" edge="start" onClick={() => setMobileOpen(true)} sx={{ mr: 2 }}>
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" fontWeight={700} noWrap>
              {isElectronics ? 'Electronics' : 'Furniture'} ERP
            </Typography>
            <Box flex={1} />
            <IconButton color="inherit" onClick={e => setAnchorEl(e.currentTarget)}>
              <AccountCircle />
            </IconButton>
          </Toolbar>
        </AppBar>
      )}

      {/* Sidebar */}
      {isMobile ? (
        <Drawer
          variant="temporary" open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{ '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' } }}
        >
          {drawerContent}
        </Drawer>
      ) : (
        <Drawer
          variant="permanent"
          sx={{
            width: DRAWER_WIDTH, flexShrink: 0,
            '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
          }}
        >
          {drawerContent}
        </Drawer>
      )}

      {/* Main content */}
      <Box component="main" sx={{
        flexGrow: 1, minWidth: 0,
        mt: isMobile ? 8 : 0,
        bgcolor: 'background.default',
        minHeight: '100vh',
      }}>
        <Outlet />
      </Box>

      {/* Mobile user menu */}
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        <MenuItem disabled>
          <Typography variant="body2">{userProfile?.name}</Typography>
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleLogout}><Logout fontSize="small" sx={{ mr: 1 }} /> Logout</MenuItem>
      </Menu>
    </Box>
  );
};

export default Layout;