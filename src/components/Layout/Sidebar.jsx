import React, { useState } from "react";
import {
  Drawer, Box, List, ListItem, ListItemButton, ListItemIcon,
  ListItemText, Toolbar, Divider, Typography, Chip, Collapse,
  Avatar, useTheme,
} from "@mui/material";
import {
  Dashboard, People, Inventory2, ShoppingCart, PointOfSale,
  Notifications, CreditScore, Store, ExpandLess, ExpandMore,
  Logout, AdminPanelSettings, Person, Build,
} from "@mui/icons-material";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

const DRAWER_WIDTH = 260;

const navItems = [
  { label: "Dashboard", icon: <Dashboard />, path: "/dashboard" },
  { label: "Customers", icon: <People />, path: "/customers" },
  { label: "Products", icon: <Store />, path: "/products" },
  { label: "Purchase", icon: <ShoppingCart />, path: "/purchase" },
  { label: "Inventory", icon: <Inventory2 />, path: "/inventory" },
  { label: "Sales", icon: <PointOfSale />, path: "/sales" },
  { label: "EMI Tracking", icon: <CreditScore />, path: "/emi" },
  { label: "Notifications", icon: <Notifications />, path: "/notifications" },
];

export default function Sidebar({ mobileOpen, onClose, variant = "permanent" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { userProfile, logout, isAdmin } = useAuth();
  const theme = useTheme();

  const handleNav = (path) => {
    navigate(path);
    if (variant === "temporary") onClose?.();
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const categoryLabel = userProfile?.storeCategory === "electronics" ? "Electronics" : "Furniture";
  const categoryColor = userProfile?.storeCategory === "electronics" ? "primary" : "success";

  const drawer = (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", bgcolor: "background.paper" }}>
      {/* Logo area */}
      <Box sx={{ p: 2.5, bgcolor: "primary.main", color: "white" }}>
        <Typography variant="h6" fontWeight={800} letterSpacing={0.5}>
          🏬 StoreMS
        </Typography>
        <Typography variant="caption" sx={{ opacity: 0.8 }}>
          Store Management System
        </Typography>
        <Box mt={1}>
          <Chip
            label={categoryLabel}
            size="small"
            color={categoryColor}
            sx={{ bgcolor: "rgba(255,255,255,0.2)", color: "white", fontWeight: 600, fontSize: 11 }}
          />
        </Box>
      </Box>

      {/* User info */}
      <Box sx={{ px: 2, py: 1.5, display: "flex", alignItems: "center", gap: 1.5,
        borderBottom: "1px solid", borderColor: "divider" }}>
        <Avatar sx={{ bgcolor: "primary.light", width: 36, height: 36, fontSize: 14 }}>
          {userProfile?.name?.[0]?.toUpperCase()}
        </Avatar>
        <Box>
          <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 160 }}>
            {userProfile?.name}
          </Typography>
          <Chip
            icon={isAdmin() ? <AdminPanelSettings sx={{ fontSize: "12px !important" }} /> : <Person sx={{ fontSize: "12px !important" }} />}
            label={isAdmin() ? "Admin" : "Employee"}
            size="small"
            color={isAdmin() ? "warning" : "default"}
            sx={{ height: 18, fontSize: 10, "& .MuiChip-label": { px: 0.8 } }}
          />
        </Box>
      </Box>

      {/* Nav */}
      <List sx={{ flex: 1, py: 1, overflowY: "auto" }}>
        {navItems.map((item) => {
          const active = location.pathname.startsWith(item.path);
          return (
            <ListItem key={item.path} disablePadding sx={{ px: 1, mb: 0.25 }}>
              <ListItemButton
                selected={active}
                onClick={() => handleNav(item.path)}
                sx={{
                  borderRadius: 2,
                  "&.Mui-selected": {
                    bgcolor: "primary.main",
                    color: "white",
                    "& .MuiListItemIcon-root": { color: "white" },
                    "&:hover": { bgcolor: "primary.dark" },
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 36, color: active ? "white" : "text.secondary" }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{ fontSize: 14, fontWeight: active ? 700 : 500 }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>

      {/* Logout */}
      <Divider />
      <Box sx={{ p: 1 }}>
        <ListItemButton onClick={handleLogout} sx={{ borderRadius: 2, color: "error.main" }}>
          <ListItemIcon sx={{ minWidth: 36, color: "error.main" }}><Logout /></ListItemIcon>
          <ListItemText primary="Logout" primaryTypographyProps={{ fontSize: 14, fontWeight: 600 }} />
        </ListItemButton>
      </Box>
    </Box>
  );

  return (
    <>
      {/* Mobile */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: "block", md: "none" },
          "& .MuiDrawer-paper": { width: DRAWER_WIDTH, boxSizing: "border-box" },
        }}
      >
        {drawer}
      </Drawer>
      {/* Desktop */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: "none", md: "block" },
          "& .MuiDrawer-paper": { width: DRAWER_WIDTH, boxSizing: "border-box", border: "none",
            borderRight: "1px solid", borderColor: "divider" },
        }}
        open
      >
        {drawer}
      </Drawer>
    </>
  );
}

export { DRAWER_WIDTH };
