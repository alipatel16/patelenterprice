import React, { useState } from 'react';
import {
  Box, Card, CardContent, TextField, Button, Typography,
  ToggleButton, ToggleButtonGroup, InputAdornment, IconButton,
  Link, CircularProgress, Alert, Divider,
} from '@mui/material';
import {
  Email, Lock, Visibility, VisibilityOff,
  ElectricBolt, Chair,
} from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';

const Login = () => {
  const { login } = useAuth();
  const [store, setStore] = useState('electronics');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email || !password) { setError('Please fill all fields'); return; }
    setLoading(true);
    try {
      await login({ email, password, store });
      toast.success('Welcome back!');
    } catch (err) {
      setError(err.message.includes('auth/') 
        ? 'Invalid email or password. Please try again.'
        : err.message);
    } finally {
      setLoading(false);
    }
  };

  const isElectronics = store === 'electronics';

  return (
    <Box sx={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: isElectronics
        ? 'linear-gradient(135deg, #0D47A1 0%, #1565C0 50%, #1976D2 100%)'
        : 'linear-gradient(135deg, #3E2723 0%, #5D4037 50%, #795548 100%)',
      p: 2,
    }}>
      <Card sx={{ width: '100%', maxWidth: 420, overflow: 'visible' }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          {/* Logo & Title */}
          <Box textAlign="center" mb={3}>
            <Box sx={{
              width: 64, height: 64, borderRadius: '50%',
              background: isElectronics ? '#1565C0' : '#5D4037',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              mx: 'auto', mb: 2, boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
            }}>
              {isElectronics
                ? <ElectricBolt sx={{ color: '#fff', fontSize: 32 }} />
                : <Chair sx={{ color: '#fff', fontSize: 32 }} />}
            </Box>
            <Typography variant="h5" fontWeight={700}>Patel Enterprise</Typography>
            <Typography variant="body2" color="text.secondary">Showroom Management System</Typography>
          </Box>

          {/* Store Toggle */}
          <Box mb={3}>
            <Typography variant="caption" color="text.secondary" mb={1} display="block" fontWeight={600}>
              SELECT STORE
            </Typography>
            <ToggleButtonGroup
              value={store} exclusive
              onChange={(_, v) => v && setStore(v)}
              fullWidth size="small"
            >
              <ToggleButton value="electronics" sx={{ py: 1 }}>
                <ElectricBolt fontSize="small" sx={{ mr: 0.5 }} /> Electronics
              </ToggleButton>
              <ToggleButton value="furniture" sx={{ py: 1 }}>
                <Chair fontSize="small" sx={{ mr: 0.5 }} /> Furniture
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Divider sx={{ mb: 3 }} />

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth label="Email Address" type="email"
              value={email} onChange={e => setEmail(e.target.value)}
              sx={{ mb: 2 }}
              InputProps={{
                startAdornment: <InputAdornment position="start"><Email fontSize="small" color="action" /></InputAdornment>,
              }}
            />
            <TextField
              fullWidth label="Password"
              type={showPwd ? 'text' : 'password'}
              value={password} onChange={e => setPassword(e.target.value)}
              sx={{ mb: 3 }}
              InputProps={{
                startAdornment: <InputAdornment position="start"><Lock fontSize="small" color="action" /></InputAdornment>,
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setShowPwd(p => !p)} edge="end" size="small">
                      {showPwd ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <Button
              type="submit" variant="contained" fullWidth size="large"
              disabled={loading}
              sx={{ py: 1.5, fontSize: '1rem' }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Sign In'}
            </Button>
          </Box>

          <Box textAlign="center" mt={3}>
            <Typography variant="body2" color="text.secondary">
              Don't have an account?{' '}
              <Link component={RouterLink} to="/register" fontWeight={600}>
                Register here
              </Link>
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default Login;
