import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Card, CardContent, Grid, Chip, Divider,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  IconButton, Alert, CircularProgress, Stack,
} from '@mui/material';
import { ArrowBack, Edit, Print } from '@mui/icons-material';
import { doc, getDoc } from 'firebase/firestore';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';
import { COMPANIES } from '../../constants';
import { formatCurrency, formatDate } from '../../utils';
import { printQuotation } from '../../utils/quotationPrint';
import { useMediaQuery, useTheme } from '@mui/material';

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
const QuotationDetail = () => {
  const { db } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadQuote = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'quotations', id));
      if (!snap.exists()) { toast.error('Quotation not found'); navigate('/quotations'); return; }
      setQuote({ id: snap.id, ...snap.data() });
    } catch (e) {
      toast.error('Failed to load quotation');
    } finally {
      setLoading(false);
    }
  }, [db, id, navigate]);

  useEffect(() => { loadQuote(); }, [loadQuote]);

  if (loading) return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
      <CircularProgress />
    </Box>
  );
  if (!quote) return null;

  const company = COMPANIES[quote.companyId];
  const isGST = quote.invoiceType === 'gst';
  const today = new Date().toISOString().split('T')[0];
  const isExpired = quote.validUntil && quote.validUntil < today;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1000, mx: 'auto' }}>
      {/* Header */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3} flexWrap="wrap" gap={1}>
        <Box display="flex" alignItems="center" gap={1}>
          <IconButton onClick={() => navigate('/quotations')}><ArrowBack /></IconButton>
          <Box>
            <Typography variant="h5" fontWeight={700}>{quote.quoteNumber}</Typography>
            <Typography variant="body2" color="text.secondary">
              {formatDate(quote.quoteDate)} · {quote.companyName}
            </Typography>
          </Box>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Button
            variant="outlined"
            startIcon={<Print />}
            onClick={() => printQuotation(quote, company)}
            size={isMobile ? 'small' : 'medium'}
          >
            {isMobile ? 'Print' : 'Print Quote'}
          </Button>
          <Button
            variant="outlined"
            startIcon={<Edit />}
            onClick={() => navigate(`/quotations/edit/${id}`)}
            size={isMobile ? 'small' : 'medium'}
          >
            {isMobile ? 'Edit' : 'Edit Quote'}
          </Button>
        </Stack>
      </Box>

      {isExpired && (
        <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }}>
          This quotation expired on {formatDate(quote.validUntil)}.
        </Alert>
      )}

      {/* Summary */}
      <Grid container spacing={2} mb={2}>
        {[
          { label: 'Customer', value: quote.customerName, sub: quote.customerPhone },
          { label: 'Firm', value: quote.companyName, sub: company?.code },
          { label: 'Quote Date', value: formatDate(quote.quoteDate) },
          { label: 'Valid Until', value: formatDate(quote.validUntil), highlight: isExpired ? 'error' : 'success' },
        ].map(({ label, value, sub, highlight }) => (
          <Grid item xs={6} sm={3} key={label}>
            <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, height: '100%' }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block">{label}</Typography>
                <Typography variant="body2" fontWeight={700} color={highlight ? `${highlight}.main` : 'text.primary'}>
                  {value}
                </Typography>
                {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Type badges */}
      <Box display="flex" gap={1} mb={2}>
        <Chip
          label={isGST ? 'GST Quote' : 'Non-GST Quote'}
          color={isGST ? 'primary' : 'default'}
          variant="outlined"
          size="small"
        />
        <Chip
          label={isExpired ? 'Expired' : 'Active'}
          color={isExpired ? 'error' : 'success'}
          size="small"
        />
      </Box>

      {/* Items */}
      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 2 }}>
        <CardContent sx={{ p: 0 }}>
          <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography variant="subtitle1" fontWeight={700}>Items</Typography>
          </Box>

          {/* Desktop table */}
          <TableContainer sx={{ display: { xs: 'none', sm: 'block' } }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell sx={{ fontWeight: 700 }}>#</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Product</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">Qty</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Unit Price</TableCell>
                  {isGST && <><TableCell sx={{ fontWeight: 700 }} align="center">GST %</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">Tax</TableCell></>}
                  <TableCell sx={{ fontWeight: 700 }} align="right">Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(quote.items || []).map((it, idx) => (
                  <TableRow key={idx} hover>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{it.productName}</Typography>
                    </TableCell>
                    <TableCell align="center">{it.qty} {it.unit}</TableCell>
                    <TableCell align="right">{formatCurrency(it.price)}</TableCell>
                    {isGST && <><TableCell align="center">{it.gstRate}%</TableCell>
                      <TableCell align="right">{formatCurrency(it.totalTax)}</TableCell></>}
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={700}>{formatCurrency(it.subtotal)}</Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Mobile item cards */}
          <Box sx={{ display: { xs: 'block', sm: 'none' }, p: 1.5 }}>
            {(quote.items || []).map((it, idx) => (
              <Box key={idx} sx={{ p: 1.5, mb: 1, bgcolor: 'grey.50', borderRadius: 1 }}>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2" fontWeight={700}>{it.productName}</Typography>
                  <Typography variant="body2" fontWeight={700} color="primary.main">{formatCurrency(it.subtotal)}</Typography>
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {it.qty} {it.unit} × {formatCurrency(it.price)}
                  {isGST ? ` · GST ${it.gstRate}% (${formatCurrency(it.totalTax)})` : ''}
                </Typography>
              </Box>
            ))}
          </Box>
        </CardContent>
      </Card>

      {/* Totals */}
      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} mb={2}>Summary</Typography>
          <Box sx={{ maxWidth: 360, ml: 'auto' }}>
            <Box display="flex" justifyContent="space-between" py={0.75}>
              <Typography variant="body2" color="text.secondary">Subtotal</Typography>
              <Typography variant="body2" fontWeight={600}>{formatCurrency(quote.subtotal)}</Typography>
            </Box>
            {isGST && <>
              <Box display="flex" justifyContent="space-between" py={0.75}>
                <Typography variant="body2" color="text.secondary">CGST</Typography>
                <Typography variant="body2">{formatCurrency((quote.totalTax || 0) / 2)}</Typography>
              </Box>
              <Box display="flex" justifyContent="space-between" py={0.75}>
                <Typography variant="body2" color="text.secondary">SGST</Typography>
                <Typography variant="body2">{formatCurrency((quote.totalTax || 0) / 2)}</Typography>
              </Box>
              <Box display="flex" justifyContent="space-between" py={0.75}>
                <Typography variant="body2" color="text.secondary">Total Tax</Typography>
                <Typography variant="body2" color="warning.main" fontWeight={600}>{formatCurrency(quote.totalTax)}</Typography>
              </Box>
            </>}
            <Divider sx={{ my: 1 }} />
            <Box display="flex" justifyContent="space-between" py={1}
              sx={{ bgcolor: 'primary.50', px: 1.5, borderRadius: 1, border: '1px solid', borderColor: 'primary.200' }}>
              <Typography variant="body1" fontWeight={800} color="primary.main">Grand Total</Typography>
              <Typography variant="body1" fontWeight={800} color="primary.main">{formatCurrency(quote.grandTotal)}</Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {quote.notes && (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 2 }}>
          <CardContent>
            <Typography variant="subtitle2" fontWeight={700} mb={1}>Notes / Terms</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>{quote.notes}</Typography>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default QuotationDetail;