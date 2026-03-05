import React, { useState } from "react";
import {
  Box, AppBar, Toolbar, IconButton, Typography, Badge,
  Avatar, Tooltip, useScrollTrigger, Slide,
} from "@mui/material";
import { Menu, Notifications, AccountCircle } from "@mui/icons-material";
import { Outlet, useNavigate } from "react-router-dom";
import Sidebar, { DRAWER_WIDTH } from "./Sidebar";
import { useAuth } from "../../contexts/AuthContext";

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { userProfile } = useAuth();
  const navigate = useNavigate();

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "#f5f6fa" }}>
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column",
        width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
        ml: { md: `${DRAWER_WIDTH}px` } }}>
        {/* AppBar */}
        <AppBar position="sticky" elevation={0}
          sx={{ bgcolor: "white", color: "text.primary",
            borderBottom: "1px solid", borderColor: "divider" }}>
          <Toolbar sx={{ gap: 1 }}>
            <IconButton
              edge="start"
              onClick={() => setMobileOpen(true)}
              sx={{ display: { md: "none" } }}
            >
              <Menu />
            </IconButton>

            <Typography variant="subtitle1" fontWeight={700} sx={{ flexGrow: 1 }} color="primary.main">
              {userProfile?.storeCategory === "electronics" ? "⚡ Electronics Store" : "🪑 Furniture Store"}
            </Typography>

            <Tooltip title="Notifications">
              <IconButton onClick={() => navigate("/notifications")}>
                <Badge badgeContent={3} color="error">
                  <Notifications />
                </Badge>
              </IconButton>
            </Tooltip>

            <Tooltip title={userProfile?.name}>
              <Avatar sx={{ bgcolor: "primary.main", width: 32, height: 32, fontSize: 13,
                cursor: "pointer" }}>
                {userProfile?.name?.[0]?.toUpperCase()}
              </Avatar>
            </Tooltip>
          </Toolbar>
        </AppBar>

        {/* Page content */}
        <Box sx={{ flex: 1, p: { xs: 2, sm: 3 }, overflowY: "auto" }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
