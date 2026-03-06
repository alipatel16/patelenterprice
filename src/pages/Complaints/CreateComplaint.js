import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Card, CardContent, Grid, TextField,
  MenuItem, Select, FormControl, InputLabel, Alert, Autocomplete,
  CircularProgress, IconButton, Stack, Chip, RadioGroup,
  FormControlLabel, Radio, Paper,
} from '@mui/material';
import {
  ArrowBack, Save, PersonAdd, Person, Business,
} from '@mui/icons-material';
import {
  collection, query, orderBy, getDocs, addDoc, updateDoc, doc,
  serverTimestamp, getDoc, getCountFromServer,
} from 'firebase/firestore';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';
import { generateInvoiceNumber } from '../../utils';
import { Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';

const COMPLAINT_CATEGORIES = [
  'Television', 'Refrigerator', 'Washing Machine', 'Air Conditioner',
  'Microwave', 'Mixer/Grinder', 'Water Purifier', 'Geyser',
  'Laptop/Computer', 'Mobile Phone', 'Furniture', 'Other',
];

const EMPTY_CUSTOMER_FORM = {
  name: '', phone: '', email: '', address: '', city: '',
  state: 'Gujarat', customerType: 'retail', category: 'individual',
};

const NewCustomerDialog = ({ open, onClose, onSave }) => {
  const [form, setForm] = useState(EMPTY_CUSTOMER_FORM);
  const [loading, setLoading] = useState(false);
  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }));
  useEffect(() => { if (open) setForm(EMPTY_CUSTOMER_FORM); }, [open]);
  const handleSave = async () => {
    if (!form.name || !form.phone) { toast.error('Name & phone required'); return; }
    setLoading(true);
    try { await onSave(form); onClose(); } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Quick Add Customer</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} mt={0}>
          {[['name', 'Full Name *', 12], ['phone', 'Phone *', 6], ['email', 'Email', 6], ['city', 'City', 6], ['address', 'Address', 6]]
            .map(([k, label, xs]) => (
              <Grid item xs={xs} key={k}>
                <TextField fullWidth label={label} size="small" value={form[k]} onChange={set(k)} />
              </Grid>
            ))}
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={loading}
          startIcon={loading ? <CircularProgress size={16} /> : <PersonAdd />}>
          Add Customer
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const CreateComplaint = () => {
  const { db, userProfile } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [customers, setCustomers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [brandHierarchies, setBrandHierarchies] = useState([]);

  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [reason, setReason] = useState('');
  const [expectedResolutionDate, setExpectedResolutionDate] = useState('');
  const [status, setStatus] = useState('open');
  const [notes, setNotes] = useState('');

  const [assigneeType, setAssigneeType] = useState('external');
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [selectedBrandHierarchy, setSelectedBrandHierarchy] = useState(null);
  // FIX 1: 'default' string is valid alongside 1, 2, 3...
  const [currentEscalationLevel, setCurrentEscalationLevel] = useState(1);

  // FIX 2: External-only fields
  const [companyComplaintNumber, setCompanyComplaintNumber] = useState('');
  const [companyRecordedDate, setCompanyRecordedDate] = useState('');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);

  useEffect(() => {
    if (!db) return;
    // FIX 4: Load lookups first sequentially, THEN load existing
    const init = async () => {
      const [custSnap, empSnap, bhSnap] = await Promise.all([
        getDocs(query(collection(db, 'customers'), orderBy('name'))),
        getDocs(query(collection(db, 'users'), orderBy('name'))),
        getDocs(query(collection(db, 'brandHierarchies'), orderBy('brandName'))),
      ]);
      const loadedBH = bhSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setCustomers(custSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setEmployees(empSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setBrandHierarchies(loadedBH);
      // FIX 4: pass loadedBH directly — don't rely on state not yet committed
      if (id) await loadExisting(loadedBH);
    };
    init();
    // eslint-disable-next-line
  }, [db]);

  const loadExisting = async (loadedBH) => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'complaints', id));
      if (!snap.exists()) { toast.error('Complaint not found'); navigate('/complaints'); return; }
      const d = snap.data();

      setSelectedCustomer(d.customerId
        ? { id: d.customerId, name: d.customerName, phone: d.customerPhone }
        : null);
      setTitle(d.title || '');
      setCategory(d.category || '');
      setBrand(d.brand || '');
      setModel(d.model || '');
      setSerialNumber(d.serialNumber || '');
      setPurchaseDate(d.purchaseDate || '');
      setReason(d.reason || '');
      setExpectedResolutionDate(d.expectedResolutionDate || '');
      setStatus(d.status || 'open');
      setNotes(d.notes || '');
      setAssigneeType(d.assigneeType || 'external');

      if (d.internalEmployeeId) {
        setSelectedEmployee({
          id: d.internalEmployeeId,
          name: d.internalEmployeeName,
          phone: d.internalEmployeePhone,
        });
      }

      // FIX 4: find full hierarchy object (with levels) from the already-loaded list
      if (d.brandHierarchyId) {
        const fullBH = loadedBH.find(bh => bh.id === d.brandHierarchyId) || null;
        setSelectedBrandHierarchy(fullBH);
        // FIX 1: preserve 'default' value correctly (d.currentEscalationLevel could be 'default' string or number)
        setCurrentEscalationLevel(d.currentEscalationLevel ?? 1);
      }

      // FIX 2: restore external fields
      setCompanyComplaintNumber(d.companyComplaintNumber || '');
      setCompanyRecordedDate(d.companyRecordedDate || '');
    } catch (e) {
      toast.error('Failed to load complaint');
    } finally {
      setLoading(false);
    }
  };

  const handleBrandHierarchySelect = (bh) => {
    setSelectedBrandHierarchy(bh);
    if (bh) {
      setBrand(bh.brandName);
      setCurrentEscalationLevel(1);
      if (!title) setTitle(`${bh.brandName} Service Complaint`);
    } else {
      setCurrentEscalationLevel(1);
    }
  };

  const getCurrentAssignedPerson = () => {
    if (!selectedBrandHierarchy?.levels || currentEscalationLevel === 'default') return null;
    return selectedBrandHierarchy.levels.find(lv => lv.level === currentEscalationLevel) || null;
  };

  const handleAddNewCustomer = async form => {
    const ref = await addDoc(collection(db, 'customers'), { ...form, createdAt: serverTimestamp() });
    const newCust = { id: ref.id, ...form };
    setCustomers(p => [...p, newCust]);
    setSelectedCustomer(newCust);
    toast.success('Customer added');
  };

  const buildAssigneeData = () => {
    if (assigneeType === 'internal') {
      return {
        assigneeType: 'internal',
        internalEmployeeId: selectedEmployee?.id || '',
        internalEmployeeName: selectedEmployee?.name || '',
        internalEmployeePhone: selectedEmployee?.phone || '',
        brandHierarchyId: null,
        currentEscalationLevel: null,
        assignedPersonName: selectedEmployee?.name || '',
        assignedPersonPhone: selectedEmployee?.phone || '',
        assignedPersonTitle: 'Internal Service',
        companyComplaintNumber: '',
        companyRecordedDate: '',
      };
    }
    const person = getCurrentAssignedPerson();
    const isDefault = currentEscalationLevel === 'default';
    return {
      assigneeType: 'external',
      internalEmployeeId: null,
      internalEmployeeName: '',
      internalEmployeePhone: '',
      brandHierarchyId: selectedBrandHierarchy?.id || null,
      currentEscalationLevel,
      assignedPersonName: isDefault ? '(Default Handler)' : (person?.personName || ''),
      assignedPersonPhone: isDefault ? '' : (person?.phone || ''),
      assignedPersonTitle: isDefault ? 'Default Handler' : (person?.title || `Level ${currentEscalationLevel}`),
      companyComplaintNumber: companyComplaintNumber.trim(),
      companyRecordedDate: companyRecordedDate,
    };
  };

  const handleSave = async () => {
    setError('');
    if (!selectedCustomer) { setError('Please select a customer'); return; }
    if (!title.trim()) { setError('Complaint title is required'); return; }
    if (!reason.trim()) { setError('Please describe the reason/issue'); return; }
    if (assigneeType === 'internal' && !selectedEmployee) { setError('Please select an internal employee'); return; }
    if (assigneeType === 'external' && !selectedBrandHierarchy) { setError('Please select a brand hierarchy'); return; }

    setSaving(true);
    try {
      const assigneeData = buildAssigneeData();
      const complaintData = {
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        customerPhone: selectedCustomer.phone || '',
        title: title.trim(),
        category,
        brand: brand.trim(),
        model: model.trim(),
        serialNumber: serialNumber.trim(),
        purchaseDate,
        reason: reason.trim(),
        expectedResolutionDate,
        status,
        notes: notes.trim(),
        ...assigneeData,
      };

      if (isEdit) {
        await updateDoc(doc(db, 'complaints', id), { ...complaintData, updatedAt: serverTimestamp() });
        toast.success('Complaint updated!');
        navigate(`/complaints/${id}`);
      } else {
        const count = (await getCountFromServer(collection(db, 'complaints'))).data().count;
        const complaintNumber = generateInvoiceNumber('CMP', count);
        const escalationHistory = [{
          level: assigneeType === 'external' ? currentEscalationLevel : null,
          personName: complaintData.assignedPersonName,
          phone: complaintData.assignedPersonPhone,
          title: complaintData.assignedPersonTitle,
          assignedAt: new Date().toISOString(),
          assignedBy: userProfile?.name || 'System',
          note: 'Initial assignment',
        }];
        await addDoc(collection(db, 'complaints'), {
          ...complaintData, complaintNumber, escalationHistory, createdAt: serverTimestamp(),
        });
        toast.success('Complaint logged!');
        navigate('/complaints');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Box display="flex" justifyContent="center" pt={8}><CircularProgress /></Box>;

  const currentPerson = getCurrentAssignedPerson();
  const levels = selectedBrandHierarchy?.levels || [];

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100, mx: 'auto' }}>
      <Box display="flex" alignItems="center" gap={2} mb={3}>
        <IconButton onClick={() => navigate('/complaints')}><ArrowBack /></IconButton>
        <Box>
          <Typography variant="h5" fontWeight={700}>{isEdit ? 'Edit Complaint' : 'Log New Complaint'}</Typography>
          <Typography variant="body2" color="text.secondary">Track and manage service complaints</Typography>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Customer */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="subtitle1" fontWeight={700}>Customer Info</Typography>
            <Button size="small" startIcon={<PersonAdd />} onClick={() => setNewCustomerOpen(true)}>New Customer</Button>
          </Box>
          <Autocomplete options={customers}
            getOptionLabel={o => o.name ? `${o.name}${o.phone ? ` — ${o.phone}` : ''}` : ''}
            value={selectedCustomer} onChange={(_, v) => setSelectedCustomer(v)}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderInput={params => <TextField {...params} label="Select Customer *" size="small" placeholder="Search..." />}
            renderOption={(props, o) => (
              <Box component="li" {...props}>
                <Typography variant="body2" fontWeight={600}>{o.name}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>{o.phone} · {o.city}</Typography>
              </Box>
            )}
          />
          {selectedCustomer && (
            <Box sx={{ mt: 1.5, p: 1.5, bgcolor: 'error.50', borderRadius: 1, border: '1px solid', borderColor: 'error.200' }}>
              <Typography variant="caption">📞 {selectedCustomer.phone}{selectedCustomer.address ? ` · ${selectedCustomer.address}` : ''}</Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Complaint Details */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} mb={2}>Complaint Details</Typography>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField fullWidth size="small" label="Complaint Title *" value={title}
                onChange={e => setTitle(e.target.value)} placeholder="Auto-populated from brand or enter manually..." />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Category</InputLabel>
                <Select value={category} onChange={e => setCategory(e.target.value)} label="Category">
                  {COMPLAINT_CATEGORIES.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" label="Brand" value={brand}
                onChange={e => setBrand(e.target.value)} placeholder="e.g. Samsung, LG..."
                helperText="Auto-filled when brand hierarchy is selected" />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth size="small" label="Model" value={model}
                onChange={e => setModel(e.target.value)} placeholder="e.g. UA43T5300" />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth size="small" label="Serial Number" value={serialNumber}
                onChange={e => setSerialNumber(e.target.value)} placeholder="Serial / IMEI number" />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth size="small" label="Purchase Date" type="date"
                value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)}
                InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" label="Expected Resolution Date" type="date"
                value={expectedResolutionDate} onChange={e => setExpectedResolutionDate(e.target.value)}
                InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Status</InputLabel>
                <Select value={status} onChange={e => setStatus(e.target.value)} label="Status">
                  <MenuItem value="open">Open</MenuItem>
                  <MenuItem value="in_progress">In Progress</MenuItem>
                  <MenuItem value="resolved">Resolved</MenuItem>
                  <MenuItem value="closed">Closed</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth size="small" label="Reason / Issue Description *"
                value={reason} onChange={e => setReason(e.target.value)}
                multiline rows={3} placeholder="Describe the problem in detail..." />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Assignment */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} mb={2}>Assignment</Typography>
          <RadioGroup row value={assigneeType} onChange={e => setAssigneeType(e.target.value)} sx={{ mb: 2 }}>
            <FormControlLabel value="internal" control={<Radio color="primary" />}
              label={<Box display="flex" alignItems="center" gap={0.5}><Person fontSize="small" />Internal Employee</Box>} />
            <FormControlLabel value="external" control={<Radio color="warning" />}
              label={<Box display="flex" alignItems="center" gap={0.5}><Business fontSize="small" />External (Brand Hierarchy)</Box>} />
          </RadioGroup>

          {/* Internal */}
          {assigneeType === 'internal' && (
            <>
              <Autocomplete options={employees}
                getOptionLabel={o => o.name ? `${o.name}${o.phone ? ` — ${o.phone}` : ''}` : ''}
                value={selectedEmployee} onChange={(_, v) => setSelectedEmployee(v)}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                renderInput={params => <TextField {...params} label="Select Internal Employee *" size="small" />}
                renderOption={(props, o) => (
                  <Box component="li" {...props}>
                    <Typography variant="body2" fontWeight={600}>{o.name}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>{o.phone} · {o.role}</Typography>
                  </Box>
                )}
              />
              {selectedEmployee && (
                <Paper sx={{ mt: 1.5, p: 2, bgcolor: 'primary.50', border: '1px solid', borderColor: 'primary.200', borderRadius: 2 }}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Person color="primary" />
                    <Box>
                      <Typography variant="body2" fontWeight={700}>{selectedEmployee.name}</Typography>
                      <Typography variant="caption" color="text.secondary">📞 {selectedEmployee.phone}</Typography>
                    </Box>
                  </Box>
                </Paper>
              )}
            </>
          )}

          {/* External */}
          {assigneeType === 'external' && (
            <>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Autocomplete options={brandHierarchies}
                    getOptionLabel={o => o.brandName || ''}
                    value={selectedBrandHierarchy}
                    onChange={(_, v) => handleBrandHierarchySelect(v)}
                    isOptionEqualToValue={(a, b) => a.id === b.id}
                    renderInput={params => (
                      <TextField {...params} label="Brand Hierarchy *" size="small" placeholder="Select brand..." />
                    )}
                    renderOption={(props, o) => (
                      <Box component="li" {...props}>
                        <Typography variant="body2" fontWeight={600}>{o.brandName}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                          {(o.levels || []).length} escalation levels
                        </Typography>
                      </Box>
                    )}
                  />
                </Grid>

                {/* FIX 1: Escalation level selector WITH Default option */}
                {selectedBrandHierarchy && levels.length > 0 && (
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Escalation Level</InputLabel>
                      <Select value={currentEscalationLevel}
                        onChange={e => setCurrentEscalationLevel(e.target.value)}
                        label="Escalation Level">
                        {levels.map(lv => (
                          <MenuItem key={lv.level} value={lv.level}>
                            <Box>
                              <Typography variant="body2" fontWeight={600}>
                                Level {lv.level}{lv.title ? ` — ${lv.title}` : ''}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {lv.personName} · {lv.phone}
                              </Typography>
                            </Box>
                          </MenuItem>
                        ))}
                        <MenuItem value="default">
                          <Box>
                            <Typography variant="body2" fontWeight={700} color="error.main">🚨 Default Handler</Typography>
                            <Typography variant="caption" color="text.secondary">All brand levels exhausted</Typography>
                          </Box>
                        </MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                )}

                {/* FIX 2: Company complaint reference fields */}
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth size="small"
                    label="Company Complaint Number"
                    value={companyComplaintNumber}
                    onChange={e => setCompanyComplaintNumber(e.target.value)}
                    placeholder="e.g. SAM-2024-00123"
                    helperText="Reference number given by the brand company" />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth size="small"
                    label="Company Recorded Date" type="date"
                    value={companyRecordedDate}
                    onChange={e => setCompanyRecordedDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    helperText="Date when complaint was registered with brand" />
                </Grid>
              </Grid>

              {/* Escalation flow visual — Default box is also clickable */}
              {levels.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mb={1}>
                    ESCALATION FLOW — click to select
                  </Typography>
                  <Box display="flex" alignItems="center" flexWrap="wrap" gap={1}>
                    {levels.map((lv, i) => {
                      const isActive = lv.level === currentEscalationLevel;
                      return (
                        <React.Fragment key={lv.level}>
                          <Box sx={{
                            px: 1.5, py: 1, borderRadius: 1, cursor: 'pointer',
                            border: '2px solid',
                            borderColor: isActive ? 'warning.main' : 'grey.300',
                            bgcolor: isActive ? 'warning.50' : 'grey.50',
                            transition: 'all 0.15s',
                            '&:hover': { borderColor: 'warning.light' },
                          }}
                            onClick={() => setCurrentEscalationLevel(lv.level)}>
                            <Typography variant="caption" fontWeight={700}
                              color={isActive ? 'warning.main' : 'text.secondary'} display="block">
                              L{lv.level}{lv.title ? ` · ${lv.title}` : ''}
                            </Typography>
                            <Typography variant="caption" color="text.primary" fontWeight={isActive ? 700 : 400}>
                              {lv.personName}
                            </Typography>
                          </Box>
                          {i < levels.length - 1 && <Typography color="text.disabled">→</Typography>}
                        </React.Fragment>
                      );
                    })}
                    <Typography color="text.disabled">→</Typography>
                    {/* FIX 1: Default is clickable */}
                    <Box sx={{
                      px: 1.5, py: 1, borderRadius: 1, cursor: 'pointer',
                      border: '2px solid',
                      borderColor: currentEscalationLevel === 'default' ? 'error.main' : 'grey.300',
                      bgcolor: currentEscalationLevel === 'default' ? 'error.50' : 'grey.50',
                      transition: 'all 0.15s',
                      '&:hover': { borderColor: 'error.light' },
                    }}
                      onClick={() => setCurrentEscalationLevel('default')}>
                      <Typography variant="caption" fontWeight={700}
                        color={currentEscalationLevel === 'default' ? 'error.main' : 'text.secondary'} display="block">
                        🚨 Default
                      </Typography>
                      <Typography variant="caption"
                        color={currentEscalationLevel === 'default' ? 'error.main' : 'text.disabled'}
                        fontWeight={currentEscalationLevel === 'default' ? 700 : 400}>
                        Global Handler
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              )}

              {/* Assigned person preview */}
              {currentEscalationLevel !== 'default' && currentPerson && (
                <Paper sx={{ mt: 2, p: 2, bgcolor: 'warning.50', border: '2px solid', borderColor: 'warning.300', borderRadius: 2 }}>
                  <Typography variant="caption" color="warning.dark" fontWeight={700} display="block" mb={0.5}>
                    ASSIGNED TO — Level {currentPerson.level}{currentPerson.title ? ` (${currentPerson.title})` : ''}
                  </Typography>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Business color="warning" />
                    <Box>
                      <Typography variant="body2" fontWeight={700}>{currentPerson.personName}</Typography>
                      <Typography variant="caption" color="text.secondary">📞 {currentPerson.phone}</Typography>
                    </Box>
                  </Box>
                </Paper>
              )}
              {currentEscalationLevel === 'default' && (
                <Paper sx={{ mt: 2, p: 2, bgcolor: 'error.50', border: '2px solid', borderColor: 'error.300', borderRadius: 2 }}>
                  <Typography variant="caption" color="error.dark" fontWeight={700} display="block" mb={0.5}>
                    🚨 ASSIGNED TO — Default Handler
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Will be assigned to the globally configured default handler.
                  </Typography>
                </Paper>
              )}
              {selectedBrandHierarchy && levels.length === 0 && (
                <Alert severity="warning" sx={{ mt: 1.5 }}>
                  This brand has no escalation levels configured.{' '}
                  <Button size="small" onClick={() => navigate(`/brand-hierarchy/edit/${selectedBrandHierarchy.id}`)}>
                    Configure now →
                  </Button>
                </Alert>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <TextField fullWidth size="small" label="Internal Notes (optional)"
            value={notes} onChange={e => setNotes(e.target.value)}
            multiline rows={2} placeholder="Any additional notes..." />
        </CardContent>
      </Card>

      <Box display="flex" gap={2} justifyContent="flex-end">
        <Button variant="outlined" onClick={() => navigate('/complaints')}>Cancel</Button>
        <Button variant="contained" color="error" size="large"
          startIcon={saving ? <CircularProgress size={16} /> : <Save />}
          onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : isEdit ? 'Update Complaint' : 'Log Complaint'}
        </Button>
      </Box>

      <NewCustomerDialog open={newCustomerOpen} onClose={() => setNewCustomerOpen(false)} onSave={handleAddNewCustomer} />
    </Box>
  );
};

export default CreateComplaint;