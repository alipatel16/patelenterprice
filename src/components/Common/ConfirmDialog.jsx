import React from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogContentText,
  DialogActions, Button,
} from "@mui/material";
import { WarningAmber } from "@mui/icons-material";

export default function ConfirmDialog({ open, title, message, onConfirm, onCancel }) {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, color: "error.main" }}>
        <WarningAmber /> {title || "Confirm Delete"}
      </DialogTitle>
      <DialogContent>
        <DialogContentText>
          {message || "Are you sure you want to delete this record? This action cannot be undone."}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} variant="outlined">Cancel</Button>
        <Button onClick={onConfirm} variant="contained" color="error">Delete</Button>
      </DialogActions>
    </Dialog>
  );
}
