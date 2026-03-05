import React, { useState } from 'react';
import {
  Box, Card, CardContent, TextField, Button, Typography,
  ToggleButton, ToggleButtonGroup, InputAdornment, IconButton,
  Link, CircularProgress, Alert, Divider, MenuItem, Select,
  FormControl, InputLabel, FormHelperText,
} from '@mui/material';
import {
  Email, Lock, Visibility, VisibilityOff, Person,
  ElectricBolt, Chair, AdminPanelSettings, BadgeOutlined,
} from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';
import { getCompaniesByStore } from '../../constants';

const Register = () => {
  const { register } = useAuth();
  const [store, setStore] = useState('electronics');
  const [role, setRole] = useState('employee');
  const [companyId, setCompanyId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const companies = getCompaniesByStore(store);
  const isElectronics = store === 'electronics';

  const handleStoreChange = (_, v) => {
    if (v) { setStore(v); setCompanyId(''); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!name || !email || !password || !companyId) {
      setError('Please fill all required fields'); return;
    }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setLoading(true);
    try {
      await register({ email, password, name, role, store, companyId });
      toast.success('Account created successfully!');
    } catch (err) {
      setError(err.message.includes('auth/email-already-in-use')
        ? 'Email already registered. Please login instead.'
        : err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{
      minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: isElectronics
        ? 'linear-gradient(135deg, #0D47A1 0%, #1976D2 100%)'
        : 'linear-gradient(135deg, #3E2723 0%, #795548 100%)',
      p: 2, py: 4,
    }}>
      <Card sx={{ width: '100%', maxWidth: 460 }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          <Box textAlign="center" mb={3}>
            <Box sx={{
              width: 56, height: 56, borderRadius: '50%',
              background: isElectronics ? '#1565C0' : '#5D4037',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              mx: 'auto', mb: 1.5,
            }}>
              {isElectronics ? <ElectricBolt sx={{ color: '#fff' }} /> : <Chair sx={{ color: '#fff' }} />}
            </Box>
            <Typography variant="h5" fontWeight={700}>Create Account</Typography>
            <Typography variant="body2" color="text.secondary">Patel Enterprise Management</Typography>
          </Box>

          {/* Store Selection */}
          <Typography variant="caption" color="text.secondary" fontWeight={600} mb={0.5} display="block">
            STORE TYPE
          </Typography>
          <ToggleButtonGroup value={store} exclusive onChange={handleStoreChange} fullWidth size="small" sx={{ mb: 2 }}>
            <ToggleButton value="electronics"><ElectricBolt fontSize="small" sx={{ mr: 0.5 }} />Electronics</ToggleButton>
            <ToggleButton value="furniture"><Chair fontSize="small" sx={{ mr: 0.5 }} />Furniture</ToggleButton>
          </ToggleButtonGroup>

          {/* Role Selection */}
          <Typography variant="caption" color="text.secondary" fontWeight={600} mb={0.5} display="block">
            USER ROLE
          </Typography>
          <ToggleButtonGroup value={role} exclusive onChange={(_, v) => v && setRole(v)} fullWidth size="small" sx={{ mb: 2 }}>
            <ToggleButton value="admin"><AdminPanelSettings fontSize="small" sx={{ mr: 0.5 }} />Admin</ToggleButton>
            <ToggleButton value="employee"><BadgeOutlined fontSize="small" sx={{ mr: 0.5 }} />Employee</ToggleButton>
          </ToggleButtonGroup>

          <Divider sx={{ mb: 2 }} />

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <Box component="form" onSubmit={handleSubmit}>
            {/* Company */}
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>Company / Branch *</InputLabel>
              <Select value={companyId} onChange={e => setCompanyId(e.target.value)} label="Company / Branch *">
                {companies.map(c => (
                  <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                ))}
              </Select>
              <FormHelperText>Select the branch you work at</FormHelperText>
            </FormControl>

            <TextField
              fullWidth label="Full Name" value={name}
              onChange={e => setName(e.target.value)} sx={{ mb: 2 }}
              InputProps={{ startAdornment: <InputAdornment position="start"><Person fontSize="small" color="action" /></InputAdornment> }}
            />
            <TextField
              fullWidth label="Email Address" type="email" value={email}
              onChange={e => setEmail(e.target.value)} sx={{ mb: 2 }}
              InputProps={{ startAdornment: <InputAdornment position="start"><Email fontSize="small" color="action" /></InputAdornment> }}
            />
            <TextField
              fullWidth label="Password" type={showPwd ? 'text' : 'password'}
              value={password} onChange={e => setPassword(e.target.value)} sx={{ mb: 2 }}
              InputProps={{
                startAdornment: <InputAdornment position="start"><Lock fontSize="small" color="action" /></InputAdornment>,
                endAdornment: <InputAdornment position="end">
                  <IconButton onClick={() => setShowPwd(p => !p)} size="small">
                    {showPwd ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                  </IconButton>
                </InputAdornment>,
              }}
            />
            <TextField
              fullWidth label="Confirm Password" type={showPwd ? 'text' : 'password'}
              value={confirm} onChange={e => setConfirm(e.target.value)} sx={{ mb: 3 }}
              InputProps={{ startAdornment: <InputAdornment position="start"><Lock fontSize="small" color="action" /></InputAdornment> }}
            />
            <Button type="submit" variant="contained" fullWidth size="large" disabled={loading} sx={{ py: 1.5 }}>
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Create Account'}
            </Button>
          </Box>

          <Box textAlign="center" mt={3}>
            <Typography variant="body2" color="text.secondary">
              Already have an account?{' '}
              <Link component={RouterLink} to="/login" fontWeight={600}>Sign in</Link>
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default Register;
