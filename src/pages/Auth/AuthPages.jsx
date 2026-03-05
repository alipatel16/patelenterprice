import React, { useState } from "react";
import {
  Box, Card, CardContent, TextField, Button, Typography,
  Stack, Alert, InputAdornment, IconButton, Link,
  FormControl, InputLabel, Select, MenuItem, ToggleButtonGroup,
  ToggleButton,
} from "@mui/material";
import { Visibility, VisibilityOff, ElectricalServices, Chair } from "@mui/icons-material";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { COMPANIES_LIST } from "../../config/companies";

// ── Shared store-type selector ────────────────────────────────────────────────
function StoreTypeToggle({ value, onChange }) {
  return (
    <ToggleButtonGroup
      value={value}
      exclusive
      onChange={(_, v) => v && onChange(v)}
      fullWidth
      sx={{ mb: 0.5 }}
    >
      <ToggleButton value="electronics" sx={{ gap: 1, py: 1.2, fontWeight: 700 }}>
        <ElectricalServices fontSize="small" />
        Electronics
      </ToggleButton>
      <ToggleButton value="furniture" sx={{ gap: 1, py: 1.2, fontWeight: 700 }}>
        <Chair fontSize="small" />
        Furniture
      </ToggleButton>
    </ToggleButtonGroup>
  );
}

// ── LOGIN PAGE ────────────────────────────────────────────────────────────────
export function LoginPage() {
  const [form, setForm]     = useState({ email: "", password: "", storeCategory: "electronics" });
  const [showPass, setShowPass] = useState(false);
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const { login }           = useAuth();
  const navigate            = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(form.email, form.password, form.storeCategory);
      navigate("/dashboard");
    } catch (err) {
      setError(
        err.code === "auth/user-not-found" || err.code === "auth/wrong-password"
          ? "Invalid email or password."
          : err.code === "auth/invalid-credential"
          ? "Invalid credentials. Make sure you selected the correct store type."
          : "Login failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #1565C0 0%, #7B1FA2 100%)",
      }}
    >
      <Card sx={{ width: "100%", maxWidth: 430, mx: 2, borderRadius: 3, boxShadow: 12 }}>
        <CardContent sx={{ p: 4 }}>
          <Box textAlign="center" mb={3}>
            <Typography variant="h3">🏬</Typography>
            <Typography variant="h5" fontWeight={800}>Welcome Back</Typography>
            <Typography variant="body2" color="text.secondary">Sign in to Store Management</Typography>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <form onSubmit={handleSubmit}>
            <Stack spacing={2.5}>
              {/* Store type — determines which Firebase to authenticate against */}
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={600} mb={0.5} display="block">
                  Select Your Store *
                </Typography>
                <StoreTypeToggle
                  value={form.storeCategory}
                  onChange={(v) => setForm({ ...form, storeCategory: v })}
                />
              </Box>

              <TextField
                label="Email"
                type="email"
                fullWidth
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />

              <TextField
                label="Password"
                fullWidth
                required
                type={showPass ? "text" : "password"}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowPass(!showPass)} edge="end">
                        {showPass ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              <Button
                type="submit"
                variant="contained"
                fullWidth
                size="large"
                disabled={loading}
                sx={{ py: 1.4, borderRadius: 2, fontWeight: 700, fontSize: 15 }}
              >
                {loading ? "Signing in…" : "Sign In"}
              </Button>
            </Stack>
          </form>

          <Box textAlign="center" mt={2.5}>
            <Typography variant="body2">
              Don't have an account?{" "}
              <Link component={RouterLink} to="/register" fontWeight={700}>Register</Link>
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

// ── REGISTER PAGE ─────────────────────────────────────────────────────────────
export function RegisterPage() {
  const [form, setForm] = useState({
    name: "", email: "", password: "", confirmPassword: "",
    role: "employee", storeCategory: "electronics", companyId: "",
  });
  const [showPass, setShowPass]   = useState(false);
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(false);
  const { register }              = useAuth();
  const navigate                  = useNavigate();

  const filteredCompanies = COMPANIES_LIST.filter((c) => c.category === form.storeCategory);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirmPassword) return setError("Passwords do not match.");
    if (!form.companyId) return setError("Please select a company.");
    setLoading(true);
    try {
      await register(form);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #11998e 0%, #1565C0 100%)",
        py: 4,
      }}
    >
      <Card sx={{ width: "100%", maxWidth: 490, mx: 2, borderRadius: 3, boxShadow: 12 }}>
        <CardContent sx={{ p: 4 }}>
          <Box textAlign="center" mb={3}>
            <Typography variant="h3">🏬</Typography>
            <Typography variant="h5" fontWeight={800}>Create Account</Typography>
            <Typography variant="body2" color="text.secondary">Store Management System</Typography>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <form onSubmit={handleSubmit}>
            <Stack spacing={2.5}>
              {/* Store type first — affects company list and which Firebase is used */}
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={600} mb={0.5} display="block">
                  Select Your Store *
                </Typography>
                <StoreTypeToggle
                  value={form.storeCategory}
                  onChange={(v) => setForm({ ...form, storeCategory: v, companyId: "" })}
                />
              </Box>

              <TextField
                label="Full Name"
                fullWidth
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />

              <TextField
                label="Email"
                type="email"
                fullWidth
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />

              <FormControl fullWidth required>
                <InputLabel>Company</InputLabel>
                <Select
                  value={form.companyId}
                  label="Company"
                  onChange={(e) => setForm({ ...form, companyId: e.target.value })}
                >
                  {filteredCompanies.map((c) => (
                    <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl fullWidth required>
                <InputLabel>Role</InputLabel>
                <Select
                  value={form.role}
                  label="Role"
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                >
                  <MenuItem value="admin">Admin</MenuItem>
                  <MenuItem value="employee">Employee</MenuItem>
                </Select>
              </FormControl>

              <TextField
                label="Password"
                fullWidth
                required
                type={showPass ? "text" : "password"}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowPass(!showPass)} edge="end">
                        {showPass ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              <TextField
                label="Confirm Password"
                fullWidth
                required
                type="password"
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
              />

              <Button
                type="submit"
                variant="contained"
                fullWidth
                size="large"
                disabled={loading}
                color="success"
                sx={{ py: 1.4, borderRadius: 2, fontWeight: 700, fontSize: 15 }}
              >
                {loading ? "Creating Account…" : "Create Account"}
              </Button>
            </Stack>
          </form>

          <Box textAlign="center" mt={2.5}>
            <Typography variant="body2">
              Already have an account?{" "}
              <Link component={RouterLink} to="/login" fontWeight={700}>Sign In</Link>
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
