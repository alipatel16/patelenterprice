import React, { useState, useEffect } from "react";
import {
  Box, Card, CardContent, Typography, Stack, Chip, Button,
  List, ListItem, ListItemAvatar, Avatar, ListItemText,
  Divider, CircularProgress, Alert,
} from "@mui/material";
import { NotificationsActive, CreditScore, ArrowForward } from "@mui/icons-material";
import {
  collection, query, where, getDocs, orderBy, Timestamp,
} from "firebase/firestore";
import { useAuth } from "../../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";

export default function NotificationsPage() {
  const { userProfile, db } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchNotifications(); }, [userProfile]);

  const fetchNotifications = async () => {
    if (!userProfile) return;
    setLoading(true);
    try {
      const now = new Date();
      const in7 = new Date(); in7.setDate(in7.getDate() + 7);

      const snap = await getDocs(
        query(
          collection(db, "emiInstallments"),
          where("storeCategory", "==", userProfile.storeCategory),
          where("status", "in", ["pending", "partial"]),
          where("dueDate", ">=", Timestamp.fromDate(now)),
          where("dueDate", "<=", Timestamp.fromDate(in7)),
          orderBy("dueDate")
        )
      );

      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Also fetch overdue
      const overdueSnap = await getDocs(
        query(
          collection(db, "emiInstallments"),
          where("storeCategory", "==", userProfile.storeCategory),
          where("status", "in", ["pending", "partial"]),
          where("dueDate", "<", Timestamp.fromDate(now)),
          orderBy("dueDate", "desc")
        )
      );
      const overdue = overdueSnap.docs.map(d => ({ id: d.id, ...d.data(), isOverdue: true }));

      setNotifications([...overdue, ...data]);
    } finally { setLoading(false); }
  };

  const getDaysLabel = (inst) => {
    const due = inst.dueDate?.toDate?.();
    if (!due) return "";
    const diff = dayjs(due).diff(dayjs(), "day");
    if (inst.isOverdue) return `${Math.abs(diff)} days overdue`;
    if (diff === 0) return "Due today";
    return `Due in ${diff} day${diff !== 1 ? "s" : ""}`;
  };

  const getColor = (inst) => {
    if (inst.isOverdue) return "error";
    const diff = dayjs(inst.dueDate?.toDate?.()).diff(dayjs(), "day");
    if (diff <= 2) return "warning";
    return "info";
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={2} mb={3}>
        <NotificationsActive color="primary" />
        <Typography variant="h5" fontWeight={800} color="primary.main">Notifications</Typography>
        <Chip label={`${notifications.length} alerts`} color="error" size="small" />
      </Stack>

      {loading ? (
        <Box display="flex" justifyContent="center" py={8}><CircularProgress /></Box>
      ) : notifications.length === 0 ? (
        <Card sx={{ borderRadius: 3 }}>
          <CardContent sx={{ textAlign: "center", py: 6 }}>
            <Typography variant="h1">✅</Typography>
            <Typography variant="h6" fontWeight={600} mt={2}>All Clear!</Typography>
            <Typography color="text.secondary">No upcoming EMI payments in the next 7 days.</Typography>
          </CardContent>
        </Card>
      ) : (
        <Card sx={{ borderRadius: 3 }}>
          <CardContent sx={{ p: 0 }}>
            <Box px={2} py={1.5} bgcolor="primary.main" color="white" sx={{ borderRadius: "12px 12px 0 0" }}>
              <Typography variant="subtitle2" fontWeight={700}>
                EMI Payment Reminders — Next 7 Days + Overdue
              </Typography>
            </Box>
            <List disablePadding>
              {notifications.map((notif, idx) => (
                <React.Fragment key={notif.id}>
                  <ListItem
                    sx={{ py: 2, px: 2, "&:hover": { bgcolor: "action.hover" }, cursor: "pointer" }}
                    onClick={() => navigate(`/sales/${notif.saleId}`)}
                  >
                    <ListItemAvatar>
                      <Avatar sx={{
                        bgcolor: notif.isOverdue ? "error.light" : "primary.light",
                        color: notif.isOverdue ? "error.dark" : "primary.dark"
                      }}>
                        <CreditScore />
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                          <Typography variant="body1" fontWeight={600}>{notif.customerName}</Typography>
                          <Chip label={`Inst #${notif.installmentNumber}`} size="small" variant="outlined" />
                          <Chip
                            label={getDaysLabel(notif)}
                            size="small"
                            color={getColor(notif)}
                          />
                        </Stack>
                      }
                      secondary={
                        <Stack direction="row" spacing={2} mt={0.5}>
                          <Typography variant="caption">Invoice: {notif.invoiceNumber}</Typography>
                          <Typography variant="caption">
                            Due: {notif.dueDate?.toDate?.()?.toLocaleDateString?.()}
                          </Typography>
                          <Typography variant="caption" fontWeight={600} color="primary.main">
                            Amount: ₹{notif.amount?.toFixed(2)}
                          </Typography>
                          {notif.paidAmount > 0 && (
                            <Typography variant="caption" color="success.main">
                              Paid: ₹{notif.paidAmount?.toFixed(2)}
                            </Typography>
                          )}
                        </Stack>
                      }
                    />
                    <Button
                      size="small"
                      endIcon={<ArrowForward />}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/sales/${notif.saleId}`);
                      }}
                    >
                      View
                    </Button>
                  </ListItem>
                  {idx < notifications.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </List>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
