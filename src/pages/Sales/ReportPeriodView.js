import React, { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TablePagination, TableRow, TextField, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import usePagedCollection from '../../hooks/usePagedCollection';
import QueryStatus from '../../components/QueryStatus';
import { fetchReportTotals, mergeProductPage, periodQuery } from '../../data/reports';
import { generateCustomReport, reportJobId, validateReportJob, fetchCustomReportPage } from '../../data/reportJobs';
import { getKnownDocument, subscribeInvalidation, invalidateCollections } from '../../data/query';
import { projectionId } from '../../data/projections';
import { getInventoryForProducts } from '../../utils/inventoryCache';
import { formatCurrency } from '../../utils';
import { getTodayStr } from '../Employees/employeeConstants';

function Pager({ result }) {
  return <TablePagination component="div" count={result.total ?? -1} page={result.page} rowsPerPage={15} rowsPerPageOptions={[15]} onPageChange={(_, page) => result.setPage(page)} nextIconButtonProps={{ disabled: result.loading || !result.hasNext }} />;
}
export function InvoiceDrilldown({ db, row, start, end, onClose }) {
  const navigate = useNavigate();
  const filters = [['reportEmployeeKey', '==', row.dimensionKey], ...(start ? [['saleDate', '>=', start]] : []), ...(end ? [['saleDate', '<=', end]] : [])];
  const result = usePagedCollection(db, 'sales', { filters, sort: start || end ? [['saleDate', 'desc']] : [], pageSize: 15, requireReady: true });
  return <Dialog open onClose={onClose} fullWidth maxWidth="md"><DialogTitle>{row.employeeName} invoices</DialogTitle><DialogContent>

    <QueryStatus error={result.error} loading={result.loading} />
    {result.rows.map(sale => <Box key={sale.id} sx={{ p: 1 }}><Button onClick={() => navigate(`/sales/${sale.id}`)}>{sale.invoiceNumber || sale.id}</Button> {sale.saleDate} — {formatCurrency(sale.grandTotal || 0)}</Box>)}
    <Pager result={result} />
  </DialogContent><DialogActions><Button onClick={onClose}>Close</Button></DialogActions></Dialog>;
}

export default function ReportPeriodView({ dimension }) {
  const { db, isAdmin } = useAuth();
  const employee = dimension === 'employee';
  const allowed = !employee || isAdmin;
  const today = getTodayStr();
  const [mode, setMode] = useState(employee ? 'daily' : 'lifetime');
  const [day, setDay] = useState(today), [month, setMonth] = useState(today.slice(0, 7));
  const [start, setStart] = useState(today), [end, setEnd] = useState(today);
  const [search, setSearch] = useState(''), [catalog, setCatalog] = useState(false);
  const [metric, setMetric] = useState(employee ? 'revenue' : 'quantity');
  const [job, setJob] = useState(null), [running, setRunning] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState(null), [totals, setTotals] = useState(null), [details, setDetails] = useState(null);
  const [catalogRows, setCatalogRows] = useState([]), [inventory, setInventory] = useState({});
  const generation = useRef(0);
  const custom = mode === 'custom';
  const periodKey = mode === 'daily' ? day : mode === 'monthly' ? month : 'all';
  const options = { dimension, start, end };
  let jobId = '';
  try { jobId = reportJobId(options); } catch (_) { /* invalid dates stay disabled */ }
  const customReady = custom && job?.jobId === jobId && job.complete && job.status === 'complete';
  const definition = periodQuery(dimension, { periodType: custom ? 'lifetime' : mode, periodKey, search, metric });
  const collectionName = custom ? 'reportJobRows' : definition.collectionName;
  const filters = custom ? [['jobId', '==', jobId], ['asOfRevision', '==', job?.asOfRevision ?? -1]] : definition.options.filters;
  const ranking = usePagedCollection(allowed && (!custom || customReady) && !catalog ? db : null, collectionName, { ...definition.options, filters, requireReady: true, ...(custom ? { loadPage: (database, _collection, pageOptions) => fetchCustomReportPage(database, job, { cursor: pageOptions.cursor, metric, search: pageOptions.search }) } : {}) });
  useEffect(() => {
    if (custom && ranking.error) { setJob(current => current ? { ...current, complete: false, status: 'invalidated' } : current); setTotals(null); }
  }, [custom, ranking.error]);
  const products = usePagedCollection(allowed && !employee && catalog && (!custom || customReady) ? db : null, 'products', { search, sort: [['nameLower', 'asc']], pageSize: 15, requireReady: true });
  const result = catalog ? products : ranking;

  useEffect(() => { generation.current++; setJob(null); setError(null); setTotals(null); }, [db, mode, day, month, start, end, dimension]);
  useEffect(() => {
    if (!db || !allowed || !custom || !jobId) return;
    let active = true;
    getKnownDocument(db, 'reportJobs', jobId, { ttlMs: 0 }).then(async saved => {
      if (saved?.complete) { try { await validateReportJob(db, saved); } catch (_) { saved = { ...saved, complete: false, status: 'invalidated' }; } }
      if (active) setJob(saved);
    }).catch(e => { if (active) setError(e); });
    return () => { active = false; };
  }, [db, allowed, custom, jobId]);
  useEffect(() => {
    if (!db) return;
    return subscribeInvalidation(db, names => {
      if (!names || names.includes('reportState')) { setRefreshKey(value => value + 1); setJob(current => current ? { ...current, complete: false, status: 'invalidated' } : current); setTotals(null); }
    });
  }, [db]);
  const filterKey = JSON.stringify(filters);
  useEffect(() => {
    if (!db || !allowed || (custom && !customReady)) return;
    let active = true;
    setTotals(null);
    Promise.resolve().then(async () => {
      if (custom) await validateReportJob(db, job);
      const values = await fetchReportTotals(db, collectionName, filters, true);
      if (custom) await validateReportJob(db, job);
      if (active) setTotals(values);
    }).catch(e => { if (active) { setError(e); if (custom) setJob(current => current ? { ...current, complete: false, status: 'invalidated' } : null); } });
    return () => { active = false; };
    // Query identity contains the entire period scope, excluding page/search.
  }, [db, allowed, custom, customReady, collectionName, filterKey, ranking.page, refreshKey]);
  useEffect(() => {
    if (!db || employee || !catalog || (custom && !customReady)) return;
    let active = true;
    setCatalogRows([]);
    Promise.resolve().then(async () => {
      if (custom) await validateReportJob(db, job);
      const [movements, stock] = await Promise.all([
        Promise.all(products.rows.map(product => getKnownDocument(db, collectionName, custom ? `${job.jobId}_${job.asOfRevision}_${encodeURIComponent(`product:${product.id}`)}` : projectionId(mode, periodKey, `product:${product.id}`), { ttlMs: 0 }))),
        getInventoryForProducts(db, products.rows.map(product => product.id)),
      ]);
      if (custom) await validateReportJob(db, job);
      if (active) setCatalogRows(mergeProductPage(products.rows, movements.filter(Boolean), stock));
    }).catch(e => { if (active) setError(e); });
    return () => { active = false; };
  }, [db, employee, catalog, custom, customReady, products.rows, collectionName, mode, periodKey, job]);
  useEffect(() => {
    if (!db || employee || catalog) return;
    let active = true; setInventory({});
    getInventoryForProducts(db, ranking.rows.map(row => row.productId)).then(stock => { if (active) setInventory(stock); }).catch(e => { if (active) setError(e); });
    return () => { active = false; };
  }, [db, employee, catalog, ranking.rows]);
  const generate = async () => {
    const token = generation.current;
    setRunning(true); setError(null);
    try {
      const next = await generateCustomReport(db, { ...options, restart: job?.status === 'invalidated' }, { budget: 3, maxPageSize: 100, onProgress: progress => { if (token === generation.current) setJob(progress); } });
      if (token === generation.current) setJob(next);
    } catch (e) { if (token === generation.current) setError(e); }
    finally { setRunning(false); }
  };
  const rows = (custom && !customReady) ? [] : catalog ? catalogRows : ranking.rows;
  const from = mode === 'daily' ? day : mode === 'monthly' ? `${month}-01` : custom ? start : '';
  const to = mode === 'daily' ? day : mode === 'monthly' ? `${month}-${new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()}` : custom ? end : '';
  if (!allowed) return <Alert severity="error">Admin access required</Alert>;
  return <Box sx={{ p: 3 }}>
    <Typography variant="h5" sx={{ mb: 2 }}>{employee ? 'Employee Sales Report' : 'Product Movement Report'}</Typography>
    <Stack direction="row" gap={2} flexWrap="wrap" sx={{ mb: 2 }}>
      <TextField select size="small" label="Period" value={mode} onChange={e => setMode(e.target.value)}>{[['daily', 'Day'], ['monthly', 'Month'], ['lifetime', 'Lifetime'], ['custom', 'Custom range']].map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
      {mode === 'daily' && <TextField type="date" size="small" value={day} onChange={e => setDay(e.target.value)} />}
      {mode === 'monthly' && <TextField type="month" size="small" value={month} onChange={e => setMonth(e.target.value)} />}
      {custom && <><TextField type="date" label="From" InputLabelProps={{ shrink: true }} size="small" value={start} onChange={e => setStart(e.target.value)} /><TextField type="date" label="To" InputLabelProps={{ shrink: true }} size="small" value={end} onChange={e => setEnd(e.target.value)} /><Button variant="contained" disabled={running || !jobId} onClick={generate}>{running ? 'Generating…' : job?.status === 'invalidated' ? 'Regenerate' : job?.complete ? 'Verify report' : job ? 'Resume generation' : 'Generate report'}</Button></>}
      <TextField size="small" label="Search ranked names" value={search} onChange={e => setSearch(e.target.value)} />
      <TextField select size="small" label="Rank by" value={metric} onChange={e => setMetric(e.target.value)}>{['revenue', 'quantity', 'invoiceCount'].map(value => <MenuItem value={value} key={value}>{value}</MenuItem>)}</TextField>
      {!employee && <Button variant={catalog ? 'contained' : 'outlined'} onClick={() => setCatalog(value => !value)}>{catalog ? 'Catalog: includes zero movement' : 'Browse catalog including zero movement'}</Button>}
      <Button onClick={() => { invalidateCollections(db, [collectionName, 'inventory']); result.refresh(); setRefreshKey(value => value + 1); setError(null); }}>Refresh</Button><Button disabled={custom && !customReady} onClick={() => window.print()}>Print this page</Button>
    </Stack>
    {custom && <Alert severity={job?.status === 'invalidated' ? 'warning' : 'info'} sx={{ mb: 2 }}>{job ? `${job.status}: ${job.processed} daily summary rows processed. As of ${job.asOf}, source revision ${job.asOfRevision}.` : 'Generation processes at most 300 daily summary rows per click; resume until complete.'} {!customReady && ' Rankings remain hidden until generation is complete and the source revision is current.'}</Alert>}
    <QueryStatus error={error || result.error} loading={running || result.loading} search={search} />
    {totals && <Alert severity={totals.reconciliationCount ? 'warning' : 'info'}>Entire period: {formatCurrency(totals.revenue)} revenue · {totals.quantity} units · {totals.invoiceCount} {employee ? 'invoices' : 'product invoice contributions'} · {totals.reconciliationCount} reconciliation issues · {totals.undatedInvoiceCount} undated contributions. Search and pages do not change these totals.</Alert>}
    {catalog && <Typography variant="caption">Catalog is alphabetically paged; movement for each visible product uses the selected period. Legacy product buckets remain available in rankings.</Typography>}
    <Table size="small"><TableHead><TableRow><TableCell>{catalog ? 'Product' : 'Rank / Name'}</TableCell><TableCell>Units</TableCell><TableCell>Revenue</TableCell><TableCell>Invoices</TableCell><TableCell>Reconciliation</TableCell>{!employee && <TableCell>Current stock / Movement</TableCell>}{employee && <TableCell>Details</TableCell>}</TableRow></TableHead><TableBody>
      {rows.map((row, i) => <TableRow key={row.dimensionKey || row.productId}><TableCell>{!catalog && `${result.page * 15 + i + 1}. `}{employee ? row.employeeName : row.productName}{row.dimensionKey?.startsWith('legacy:') && ' (legacy)'}</TableCell><TableCell>{row.quantity}</TableCell><TableCell>{formatCurrency(row.revenue || 0)}</TableCell><TableCell>{row.invoiceCount}</TableCell><TableCell>{row.reconciliationCount || 0}</TableCell>{!employee && <TableCell>{catalog ? row.stock : inventory[row.productId] ?? 0} / {row.quantity === 0 ? 'Dead stock' : row.quantity <= 4 ? 'Slow' : row.quantity >= 15 ? 'Fast' : 'Moderate'}</TableCell>}{employee && <TableCell><Button onClick={() => setDetails(row)}>Invoices</Button></TableCell>}</TableRow>)}
    </TableBody></Table>
    <Pager result={result} />
    {details && <InvoiceDrilldown db={db} row={details} start={from} end={to} onClose={() => setDetails(null)} />}
  </Box>;
}
