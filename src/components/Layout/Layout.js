// src/components/Layout/Layout.js  ─── v2: grouped + sorted nav ───
import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Box, Drawer, AppBar, Toolbar, Typography, IconButton,
  List, ListItem, ListItemButton, ListItemIcon, ListItemText,
  Avatar, Menu, MenuItem, Divider, useTheme, useMediaQuery,
  Chip, Tooltip, Collapse,
} from '@mui/material';
import {
  Menu as MenuIcon, Dashboard, People, Inventory2,
  ShoppingCart, PointOfSale, Storefront, Logout,
  AccountCircle, ElectricBolt, Chair, ChevronLeft,
  LocalShipping, AdminPanelSettings, SwapHoriz, CreditScore,
  Description, CardGiftcard, BugReport, Badge, CalendarMonth,
  Checklist, PersonPin, AccountTree, Payments, ExpandMore,
  ExpandLess, TaskAlt, MonetizationOn, Settings,
  BarChart,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';

const DRAWER_WIDTH = 248;

/**
 * Nav groups — order here is the final sidebar order.
 * adminOnly: true  → only admin sees this item
 * employeeOnly: true → only employees see (not admin)
 * Each item must also exist in ALL_PAGES in employeeConstants for access-control
 */
const NAV_GROUPS = [
  {
    groupLabel: null, // no heading — top-level single items
    items: [
      { path: '/dashboard', label: 'Dashboard', icon: <Dashboard />, adminOnly: false },
    ],
  },
  {
    groupLabel: 'SALES & CUSTOMERS',
    items: [
      { path: '/customers',          label: 'Customers',         icon: <People />,         adminOnly: false },
      { path: '/sales',              label: 'Sales',             icon: <PointOfSale />,    adminOnly: false },
      { path: '/delivery-tracking',  label: 'Delivery',          icon: <LocalShipping />,  adminOnly: false },
      { path: '/exchange-tracking',  label: 'Exchange',          icon: <SwapHoriz />,      adminOnly: false },
      { path: '/emi-dues',           label: 'EMI Dues',          icon: <CreditScore />,    adminOnly: false },
      { path: '/quotations',         label: 'Quotations',        icon: <Description />,    adminOnly: false },
      { path: '/employee-sales-report', label: 'Employee Sales Report', icon: <BarChart />, adminOnly: true },
    ],
  },
  {
    groupLabel: 'INVENTORY',
    items: [
      { path: '/products',           label: 'Products',          icon: <Storefront />,     adminOnly: false },
      { path: '/purchases',          label: 'Purchases',         icon: <ShoppingCart />,   adminOnly: false },
      { path: '/inventory',          label: 'Inventory',         icon: <Inventory2 />,     adminOnly: false },
    ],
  },
  {
    groupLabel: 'GIFTS & COMPLAINTS',
    items: [
      { path: '/gift-invoices',      label: 'Gift Invoices',     icon: <CardGiftcard />,   adminOnly: false },
      { path: '/gift-sets',          label: 'Gift Sets',         icon: <CardGiftcard />,   adminOnly: false },
      { path: '/complaints',         label: 'Complaints',        icon: <BugReport />,      adminOnly: false },
      { path: '/brand-hierarchy',    label: 'Brand Hierarchy',   icon: <AccountTree />,    adminOnly: true  },
    ],
  },
  {
    groupLabel: 'EMPLOYEE MANAGEMENT',
    adminGroupOnly: true,  // collapse entire section for non-admins
    items: [
      { path: '/employees',           label: 'Employees',          icon: <Badge />,          adminOnly: true },
      { path: '/attendance',          label: 'Attendance',         icon: <CalendarMonth />,  adminOnly: true },
      { path: '/checklist-status',    label: 'Checklist Status',   icon: <TaskAlt />,        adminOnly: true },
      { path: '/checklist-templates', label: 'Checklist Templates',icon: <Checklist />,      adminOnly: true },
      { path: '/salary-report',       label: 'Salary Report',      icon: <MonetizationOn />, adminOnly: true },
      { path: '/penalty-settings',    label: 'Penalty Settings',   icon: <Settings />,       adminOnly: true },
    ],
  },
  {
    groupLabel: 'MY WORKSPACE',
    items: [
      { path: '/my-attendance', label: 'My Attendance',   icon: <PersonPin />, adminOnly: false, employeeOnly: true },
    ],
  },
];

// Flatten for quick lookup
const ALL_NAV = NAV_GROUPS.flatMap(g => g.items);

const Layout = () => {
  const theme    = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl,   setAnchorEl]   = useState(null);
  // collapsed groups (by groupLabel)
  const [collapsed, setCollapsed] = useState({});

  const { userProfile, storeType, logout, isAdmin } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();

  const isElectronics = storeType === 'electronics';

  const isVisible = (item) => {
    if (isAdmin) return !item.employeeOnly;
    if (item.adminOnly) return false;
    // employeeOnly items (e.g. My Attendance) are always visible to employees
    // regardless of the allowed-pages restriction — they are core work tools
    if (item.employeeOnly) return true;
    const allowed = userProfile?.allowedPages;
    if (allowed && allowed.length > 0) return allowed.includes(item.path);
    return true;
  };

  const toggleGroup = (label) =>
    setCollapsed(prev => ({ ...prev, [label]: !prev[label] }));

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleNav = (path) => {
    navigate(path);
    if (isMobile) setMobileOpen(false);
  };

  const currentPageLabel = () => {
    const match = ALL_NAV.find(n =>
      location.pathname === n.path || location.pathname.startsWith(n.path + '/')
    );
    return match?.label || 'Dashboard';
  };

  const drawerContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Brand Header */}
      <Box sx={{
        p: 2,
        background: isElectronics
          ? 'linear-gradient(135deg, #1565c0 0%, #0d47a1 100%)'
          : 'linear-gradient(135deg, #4a148c 0%, #311b92 100%)',
        color: 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <Box display="flex" alignItems="center" gap={1.5}>
          {isElectronics ? <ElectricBolt sx={{ fontSize: 26 }} /> : <Chair sx={{ fontSize: 26 }} />}
          <Box>
            <Typography variant="subtitle2" fontWeight={700} lineHeight={1.2}>
              {isElectronics ? 'Electronics' : 'Furniture'}
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.75, fontSize: 11 }}>
              Patel Enterprise
            </Typography>
          </Box>
        </Box>
        <Box display="flex" alignItems="center" gap={0.5}>
          <Chip
            size="small"
            label={isAdmin ? 'Admin' : 'Staff'}
            icon={isAdmin
              ? <AdminPanelSettings sx={{ fontSize: '12px !important', color: 'white !important' }} />
              : <AccountCircle sx={{ fontSize: '12px !important', color: 'white !important' }} />
            }
            sx={{
              bgcolor: 'rgba(255,255,255,0.15)',
              color: 'white',
              borderColor: 'rgba(255,255,255,0.4)',
              border: '1px solid',
              fontSize: 10, height: 22,
              '& .MuiChip-icon': { ml: 0.5 },
            }}
          />
          {isMobile && (
            <IconButton onClick={() => setMobileOpen(false)} sx={{ color: 'white', p: 0.5 }} size="small">
              <ChevronLeft fontSize="small" />
            </IconButton>
          )}
        </Box>
      </Box>

      {/* Nav Groups */}
      <Box sx={{ flex: 1, overflowY: 'auto', py: 1 }}>
        {NAV_GROUPS.map((group, gi) => {
          // Filter items
          const visibleItems = group.items.filter(isVisible);
          if (visibleItems.length === 0) return null;

          const isCollapsed = !!collapsed[group.groupLabel];

          return (
            <Box key={gi}>
              {/* Group Label */}
              {group.groupLabel && (
                <Box
                  display="flex" alignItems="center" justifyContent="space-between"
                  onClick={() => toggleGroup(group.groupLabel)}
                  sx={{
                    px: 2, pt: gi === 0 ? 1 : 1.5, pb: 0.5, cursor: 'pointer',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}>
                  <Typography variant="caption" fontWeight={700} color="text.disabled"
                    sx={{ fontSize: 10, letterSpacing: 0.8 }}>
                    {group.groupLabel}
                  </Typography>
                  {isCollapsed
                    ? <ExpandMore sx={{ fontSize: 14, color: 'text.disabled' }} />
                    : <ExpandLess sx={{ fontSize: 14, color: 'text.disabled' }} />
                  }
                </Box>
              )}

              <Collapse in={!isCollapsed} timeout="auto">
                <List disablePadding>
                  {visibleItems.map(item => {
                    const active =
                      location.pathname === item.path ||
                      location.pathname.startsWith(item.path + '/');
                    return (
                      <ListItem key={item.path} disablePadding>
                        <ListItemButton
                          selected={active}
                          onClick={() => handleNav(item.path)}
                          sx={{
                            mx: 1, borderRadius: 1, mb: 0.25, py: 0.75,
                            minHeight: 40,
                            '&.Mui-selected': {
                              bgcolor: isElectronics ? 'primary.100' : 'secondary.100',
                              color:   isElectronics ? 'primary.main' : 'secondary.main',
                              '& .MuiListItemIcon-root': {
                                color: isElectronics ? 'primary.main' : 'secondary.main',
                              },
                            },
                          }}>
                          <ListItemIcon sx={{ minWidth: 34, '& svg': { fontSize: 20 } }}>
                            {item.icon}
                          </ListItemIcon>
                          <ListItemText
                            primary={item.label}
                            primaryTypographyProps={{ fontSize: 13.5, fontWeight: active ? 700 : 400 }}
                          />
                        </ListItemButton>
                      </ListItem>
                    );
                  })}
                </List>
              </Collapse>

              {/* Divider after each group */}
              {group.groupLabel && <Divider sx={{ mx: 2, mt: 1 }} />}
            </Box>
          );
        })}
      </Box>

      {/* User Footer */}
      <Divider />
      <Box sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0 }}>
        <Avatar sx={{ width: 34, height: 34, bgcolor: 'primary.main', fontSize: 14 }}>
          {(userProfile?.name || 'U')[0].toUpperCase()}
        </Avatar>
        <Box flex={1} minWidth={0}>
          <Typography variant="body2" fontWeight={600} noWrap>{userProfile?.name}</Typography>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: 11 }}>
            {userProfile?.email}
          </Typography>
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
    <Box sx={{ display: 'flex', height: '100vh' }}>
      {/* Mobile Drawer */}
      {isMobile ? (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{ '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' } }}>
          {drawerContent}
        </Drawer>
      ) : (
        <Drawer
          variant="permanent"
          sx={{
            width: DRAWER_WIDTH, flexShrink: 0,
            '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
          }}>
          {drawerContent}
        </Drawer>
      )}

      {/* Main Content */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Mobile Top Bar */}
        {isMobile && (
          <AppBar position="static" elevation={1}
            sx={{ bgcolor: isElectronics ? 'primary.main' : 'secondary.main', flexShrink: 0 }}>
            <Toolbar variant="dense" sx={{ minHeight: 52 }}>
              <IconButton edge="start" color="inherit" onClick={() => setMobileOpen(true)} sx={{ mr: 1 }}>
                <MenuIcon />
              </IconButton>
              <Typography variant="subtitle1" fontWeight={700} sx={{ flex: 1 }} noWrap>
                {currentPageLabel()}
              </Typography>
              <IconButton color="inherit" size="small" onClick={e => setAnchorEl(e.currentTarget)}>
                <Avatar sx={{ width: 28, height: 28, fontSize: 12, bgcolor: 'rgba(255,255,255,0.25)' }}>
                  {(userProfile?.name || 'U')[0].toUpperCase()}
                </Avatar>
              </IconButton>
            </Toolbar>
          </AppBar>
        )}

        {/* Page Content */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <Outlet />
        </Box>
      </Box>

      {/* Mobile user context menu */}
      <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={() => setAnchorEl(null)}>
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="body2" fontWeight={600}>{userProfile?.name}</Typography>
          <Typography variant="caption" color="text.secondary">{userProfile?.email}</Typography>
        </Box>
        <Divider />
        <MenuItem onClick={handleLogout}>
          <Logout fontSize="small" sx={{ mr: 1 }} /> Logout
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default Layout;