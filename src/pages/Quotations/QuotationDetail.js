import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Card, CardContent, Grid, Chip, Divider,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  IconButton, Alert, CircularProgress, Stack,
} from '@mui/material';
import { ArrowBack, Edit, Print, Description } from '@mui/icons-material';
import { doc, getDoc } from 'firebase/firestore';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';
import { COMPANIES } from '../../constants';
import { formatCurrency, formatDate } from '../../utils';
import { useMediaQuery, useTheme } from '@mui/material';

// ─────────────────────────────────────────────────────────────────────────────
// PRINT DESIGN 1: Patel Electronics And Furniture (company_1)
// Style: Modern Blue – clean, professional, dual-tone header
// ─────────────────────────────────────────────────────────────────────────────
const printDesign_company1 = (quote, company) => {
  const isGST = quote.invoiceType === 'gst';
  const fmt = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(n || 0);
  const fmtD = d => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

  const itemRows = (quote.items || []).map((it, idx) => `
    <tr>
      <td class="tc">${idx + 1}</td>
      <td>${it.productName}</td>
      <td class="tc">${it.qty} ${it.unit || ''}</td>
      <td class="tr">₹${(it.price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      ${isGST ? `<td class="tc">${it.gstRate || 0}%</td><td class="tr">${fmt(it.totalTax || 0)}</td>` : ''}
      <td class="tr"><strong>${fmt(it.subtotal || 0)}</strong></td>
    </tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Quotation – ${quote.quoteNumber}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Inter',sans-serif;background:#f0f4ff;color:#1e293b;font-size:13px}
  .page{max-width:900px;margin:20px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(30,64,175,.12)}
  .header{background:linear-gradient(135deg,#1e40af 0%,#3b82f6 100%);color:#fff;padding:32px 36px;position:relative;overflow:hidden}
  .header::after{content:'';position:absolute;right:-60px;top:-60px;width:220px;height:220px;background:rgba(255,255,255,.06);border-radius:50%}
  .header::before{content:'';position:absolute;right:30px;bottom:-40px;width:140px;height:140px;background:rgba(255,255,255,.04);border-radius:50%}
  .header-inner{display:flex;justify-content:space-between;align-items:flex-start;position:relative;z-index:1}
  .co-name{font-size:22px;font-weight:800;letter-spacing:-.3px;margin-bottom:4px}
  .co-sub{font-size:12px;opacity:.8;line-height:1.6}
  .quote-badge{text-align:right}
  .quote-badge .label{font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;opacity:.75;margin-bottom:4px}
  .quote-badge .num{font-size:24px;font-weight:800;letter-spacing:-.5px}
  .badge-row{display:flex;gap:8px;justify-content:flex-end;margin-top:8px}
  .badge{background:rgba(255,255,255,.2);border-radius:20px;padding:3px 12px;font-size:11px;font-weight:600}
  .body{padding:32px 36px}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:28px}
  .info-box{background:#f8faff;border:1px solid #dbeafe;border-radius:10px;padding:16px}
  .info-box .title{font-size:10px;font-weight:700;color:#3b82f6;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
  .info-box h3{font-size:15px;font-weight:700;color:#1e293b;margin-bottom:3px}
  .info-box p{font-size:12px;color:#64748b;line-height:1.5}
  .dates-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:28px}
  .date-box{background:#eff6ff;border-radius:8px;padding:12px;text-align:center}
  .date-box .dl{font-size:10px;font-weight:700;color:#3b82f6;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
  .date-box .dv{font-size:13px;font-weight:700;color:#1e293b}
  table{width:100%;border-collapse:collapse;border-radius:10px;overflow:hidden}
  .tbl-wrap{border-radius:10px;overflow:hidden;border:1px solid #dbeafe;margin-bottom:24px}
  thead tr{background:#1e40af;color:#fff}
  thead th{padding:11px 12px;font-size:11px;font-weight:700;letter-spacing:.3px;text-transform:uppercase}
  tbody tr{border-bottom:1px solid #f1f5f9}
  tbody tr:last-child{border-bottom:none}
  tbody tr:nth-child(even){background:#f8faff}
  tbody td{padding:10px 12px;font-size:13px}
  .tc{text-align:center}.tr{text-align:right}
  .totals{display:flex;justify-content:flex-end;margin-bottom:28px}
  .tbox{width:300px;background:#f8faff;border:1px solid #dbeafe;border-radius:10px;padding:16px}
  .trow{display:flex;justify-content:space-between;padding:5px 0;font-size:13px;color:#64748b}
  .trow strong{color:#1e293b}
  .grand{display:flex;justify-content:space-between;margin-top:10px;padding:12px;background:#1e40af;color:#fff;border-radius:8px;font-size:16px;font-weight:800}
  ${quote.notes ? `.notes{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px;margin-bottom:24px}
  .notes .nl{font-size:10px;font-weight:700;color:#d97706;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}
  .notes p{font-size:12px;color:#78350f;line-height:1.6}` : ''}
  .footer{display:flex;justify-content:space-between;align-items:center;padding-top:20px;border-top:1px solid #e2e8f0}
  .footer p{font-size:11px;color:#94a3b8}
  .sign-box{text-align:right}
  .sign-line{width:160px;border-top:2px solid #1e40af;margin-top:40px;margin-left:auto;margin-bottom:4px}
  .sign-label{font-size:11px;color:#64748b;font-weight:600}
  @media print{body{background:#fff}.page{margin:0;border-radius:0;box-shadow:none}.np{display:none!important}}
</style></head><body>
<div class="np" style="text-align:center;padding:16px;background:#1e40af">
  <button onclick="window.print()" style="background:#fff;color:#1e40af;border:none;padding:10px 28px;border-radius:6px;font-size:14px;cursor:pointer;font-weight:700">🖨️ Print Quotation</button>
  <button onclick="window.close()" style="background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3);padding:10px 24px;border-radius:6px;font-size:14px;cursor:pointer;font-weight:600;margin-left:10px">✕ Close</button>
</div>
<div class="page">
  <div class="header">
    <div class="header-inner">
      <div>
        <div class="co-name">${company.name}</div>
        <div class="co-sub">${company.address}<br>${company.phone} · ${company.email}${isGST ? `<br>GSTIN: ${company.gstNumber}` : ''}</div>
      </div>
      <div class="quote-badge">
        <div class="label">Quotation</div>
        <div class="num">${quote.quoteNumber}</div>
        <div class="badge-row">
          <span class="badge">${isGST ? 'GST Quote' : 'Non-GST Quote'}</span>
        </div>
      </div>
    </div>
  </div>
  <div class="body">
    <div class="info-grid">
      <div class="info-box">
        <div class="title">Quotation For</div>
        <h3>${quote.customerName}</h3>
        <p>${quote.customerPhone || ''}</p>
      </div>
      <div class="info-box">
        <div class="title">From</div>
        <h3>${company.name}</h3>
        <p>${company.city}, ${company.state} – ${company.pincode}</p>
      </div>
    </div>
    <div class="dates-grid">
      <div class="date-box"><div class="dl">Quote Date</div><div class="dv">${fmtD(quote.quoteDate)}</div></div>
      <div class="date-box"><div class="dl">Valid Until</div><div class="dv">${fmtD(quote.validUntil)}</div></div>
      <div class="date-box"><div class="dl">Quote Ref</div><div class="dv">${quote.quoteNumber}</div></div>
    </div>
    <div class="tbl-wrap"><table>
      <thead><tr>
        <th class="tc">#</th><th>Description</th><th class="tc">Qty</th><th class="tr">Unit Price</th>
        ${isGST ? '<th class="tc">GST</th><th class="tr">Tax Amt</th>' : ''}
        <th class="tr">Amount</th>
      </tr></thead>
      <tbody>${itemRows}</tbody>
    </table></div>
    <div class="totals"><div class="tbox">
      <div class="trow"><span>Subtotal</span><strong>${fmt(quote.subtotal)}</strong></div>
      ${isGST ? `<div class="trow"><span>CGST</span><strong>${fmt((quote.totalTax || 0) / 2)}</strong></div>
      <div class="trow"><span>SGST</span><strong>${fmt((quote.totalTax || 0) / 2)}</strong></div>` : ''}
      <div class="grand"><span>Grand Total</span><span>${fmt(quote.grandTotal)}</span></div>
    </div></div>
    ${quote.notes ? `<div class="notes"><div class="nl">Terms & Notes</div><p>${quote.notes}</p></div>` : ''}
    <div class="footer">
      <p>This is a computer-generated quotation.<br>Valid until ${fmtD(quote.validUntil)} only.</p>
      <div class="sign-box"><div class="sign-line"></div><div class="sign-label">Authorised Signatory</div></div>
    </div>
  </div>
</div></body></html>`;
};

// ─────────────────────────────────────────────────────────────────────────────
// PRINT DESIGN 2: Patel Engineering Works (company_2)
// Style: Industrial Dark – bold, orange accents, technical feel
// ─────────────────────────────────────────────────────────────────────────────
const printDesign_company2 = (quote, company) => {
  const isGST = quote.invoiceType === 'gst';
  const fmt = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(n || 0);
  const fmtD = d => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
  const itemRows = (quote.items || []).map((it, idx) => `
    <tr>
      <td class="tc">${idx + 1}</td><td>${it.productName}</td>
      <td class="tc">${it.qty} ${it.unit || ''}</td>
      <td class="tr">₹${(it.price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      ${isGST ? `<td class="tc">${it.gstRate || 0}%</td><td class="tr">${fmt(it.totalTax || 0)}</td>` : ''}
      <td class="tr"><strong>${fmt(it.subtotal || 0)}</strong></td>
    </tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Quotation – ${quote.quoteNumber}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Roboto',sans-serif;background:#1a1a2e;color:#e0e0e0;font-size:13px}
  .page{max-width:900px;margin:20px auto;background:#0f0f1a;border:1px solid #2d2d4e;border-radius:4px;overflow:hidden}
  .header{background:#0f0f1a;border-bottom:4px solid #f97316;padding:28px 32px;display:flex;justify-content:space-between;align-items:flex-start}
  .logo-area .co{font-size:20px;font-weight:900;color:#fff;letter-spacing:1px;text-transform:uppercase;margin-bottom:3px}
  .logo-area .tag{font-size:10px;color:#f97316;font-weight:700;letter-spacing:3px;text-transform:uppercase;margin-bottom:8px}
  .logo-area .co-info{font-size:11px;color:#6b7280;line-height:1.7}
  .quote-ref{text-align:right}
  .quote-ref .qt{font-size:10px;font-weight:700;color:#f97316;letter-spacing:3px;text-transform:uppercase;margin-bottom:4px}
  .quote-ref .num{font-size:26px;font-weight:900;color:#fff;letter-spacing:-1px;font-family:monospace}
  .quote-ref .type{margin-top:6px;display:inline-block;background:#f97316;color:#000;font-size:10px;font-weight:700;padding:3px 10px;border-radius:2px;letter-spacing:1px;text-transform:uppercase}
  .accent-bar{height:3px;background:linear-gradient(90deg,#f97316,#fb923c,transparent)}
  .body{padding:28px 32px;background:#111827}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
  .ibox{background:#1f2937;border:1px solid #374151;border-left:3px solid #f97316;border-radius:2px;padding:14px}
  .ibox .it{font-size:9px;font-weight:700;color:#f97316;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px}
  .ibox h3{font-size:14px;font-weight:700;color:#f9fafb;margin-bottom:2px}
  .ibox p{font-size:11px;color:#9ca3af}
  .dates-row{display:flex;gap:12px;margin-bottom:24px}
  .dbox{flex:1;background:#1f2937;border:1px solid #374151;border-radius:2px;padding:12px;text-align:center}
  .dbox .dl{font-size:9px;font-weight:700;color:#f97316;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px}
  .dbox .dv{font-size:13px;font-weight:700;color:#f9fafb;font-family:monospace}
  .tbl-wrap{border:1px solid #374151;border-radius:2px;overflow:hidden;margin-bottom:20px}
  table{width:100%;border-collapse:collapse}
  thead tr{background:#f97316}
  thead th{padding:10px 12px;font-size:10px;font-weight:700;color:#000;text-transform:uppercase;letter-spacing:.5px}
  tbody tr{border-bottom:1px solid #1f2937}
  tbody tr:nth-child(even){background:#1a2332}
  tbody td{padding:10px 12px;color:#d1d5db}
  .tc{text-align:center}.tr{text-align:right}
  .totals{display:flex;justify-content:flex-end;margin-bottom:20px}
  .tbox{width:300px;background:#1f2937;border:1px solid #374151;padding:16px;border-radius:2px}
  .trow{display:flex;justify-content:space-between;padding:5px 0;font-size:12px;color:#9ca3af;border-bottom:1px solid #374151}
  .trow:last-of-type{border-bottom:none}
  .trow span:last-child{color:#f9fafb;font-weight:600}
  .grand{display:flex;justify-content:space-between;margin-top:12px;padding:12px;background:#f97316;color:#000;border-radius:2px;font-size:16px;font-weight:900;font-family:monospace}
  ${quote.notes ? `.notes{background:#1f2937;border:1px solid #374151;border-left:3px solid #fbbf24;padding:14px;margin-bottom:20px;border-radius:2px}
  .notes .nl{font-size:9px;font-weight:700;color:#fbbf24;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
  .notes p{font-size:12px;color:#d1d5db;line-height:1.6}` : ''}
  .footer{display:flex;justify-content:space-between;align-items:flex-end;padding-top:20px;border-top:1px solid #374151}
  .footer p{font-size:10px;color:#6b7280;line-height:1.6}
  .sign-box{text-align:right}
  .sign-line{width:160px;border-top:2px solid #f97316;margin:40px 0 6px auto}
  .sign-label{font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.5px}
  @media print{body{background:#fff}.page{margin:0;background:#fff;border:none}.np{display:none!important}
    .header{background:#fff;border-bottom:4px solid #f97316}.logo-area .co{color:#000}.quote-ref .num{color:#000}
    .body{background:#fff}.ibox{background:#f9fafb}.dbox{background:#f9fafb}
    .tbl-wrap{border:1px solid #ccc}.thead tr{background:#f97316}
    .tbody tr{border-bottom:1px solid #e5e7eb}.tbody tr:nth-child(even){background:#fafafa}
    tbody td{color:#374151}.tbox{background:#f9fafb;border:1px solid #e5e7eb}
    .trow{color:#374151;border-bottom:1px solid #e5e7eb}.trow span:last-child{color:#111}}
</style></head><body>
<div class="np" style="text-align:center;padding:14px;background:#0f0f1a;border-bottom:3px solid #f97316">
  <button onclick="window.print()" style="background:#f97316;color:#000;border:none;padding:10px 28px;border-radius:3px;font-size:13px;cursor:pointer;font-weight:900;text-transform:uppercase;letter-spacing:1px">🖨️ PRINT</button>
  <button onclick="window.close()" style="background:#1f2937;color:#9ca3af;border:1px solid #374151;padding:10px 24px;border-radius:3px;font-size:13px;cursor:pointer;font-weight:700;margin-left:10px;text-transform:uppercase;letter-spacing:1px">✕ CLOSE</button>
</div>
<div class="page">
  <div class="header">
    <div class="logo-area">
      <div class="tag">Engineering Works</div>
      <div class="co">${company.name}</div>
      <div class="co-info">${company.address}<br>${company.phone} · ${company.email}${isGST ? `<br>GSTIN: ${company.gstNumber}` : ''}</div>
    </div>
    <div class="quote-ref">
      <div class="qt">Quotation</div>
      <div class="num">${quote.quoteNumber}</div>
      <div class="type">${isGST ? 'GST Quote' : 'Non-GST'}</div>
    </div>
  </div>
  <div class="accent-bar"></div>
  <div class="body">
    <div class="grid2">
      <div class="ibox"><div class="it">Bill To</div><h3>${quote.customerName}</h3><p>${quote.customerPhone || ''}</p></div>
      <div class="ibox"><div class="it">From</div><h3>${company.name}</h3><p>${company.city}, ${company.state}</p></div>
    </div>
    <div class="dates-row">
      <div class="dbox"><div class="dl">Issued</div><div class="dv">${fmtD(quote.quoteDate)}</div></div>
      <div class="dbox"><div class="dl">Valid Until</div><div class="dv">${fmtD(quote.validUntil)}</div></div>
      <div class="dbox"><div class="dl">Ref No.</div><div class="dv">${quote.quoteNumber}</div></div>
    </div>
    <div class="tbl-wrap"><table>
      <thead><tr>
        <th class="tc">#</th><th>Item / Description</th><th class="tc">Qty</th><th class="tr">Rate</th>
        ${isGST ? '<th class="tc">GST%</th><th class="tr">Tax</th>' : ''}
        <th class="tr">Total</th>
      </tr></thead>
      <tbody>${itemRows}</tbody>
    </table></div>
    <div class="totals"><div class="tbox">
      <div class="trow"><span>Subtotal</span><span>${fmt(quote.subtotal)}</span></div>
      ${isGST ? `<div class="trow"><span>CGST</span><span>${fmt((quote.totalTax || 0) / 2)}</span></div>
      <div class="trow"><span>SGST</span><span>${fmt((quote.totalTax || 0) / 2)}</span></div>` : ''}
      <div class="grand"><span>TOTAL</span><span>${fmt(quote.grandTotal)}</span></div>
    </div></div>
    ${quote.notes ? `<div class="notes"><div class="nl">⚙ Terms & Conditions</div><p>${quote.notes}</p></div>` : ''}
    <div class="footer">
      <p>Computer generated quotation · Valid till ${fmtD(quote.validUntil)}<br>For queries: ${company.phone}</p>
      <div class="sign-box"><div class="sign-line"></div><div class="sign-label">Authorised Signatory</div></div>
    </div>
  </div>
</div></body></html>`;
};

// ─────────────────────────────────────────────────────────────────────────────
// PRINT DESIGN 3: M-Raj Steel Syndicate (company_3)
// Style: Metallic Silver – steel gray, premium industrial
// ─────────────────────────────────────────────────────────────────────────────
const printDesign_company3 = (quote, company) => {
  const isGST = quote.invoiceType === 'gst';
  const fmt = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(n || 0);
  const fmtD = d => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
  const itemRows = (quote.items || []).map((it, idx) => `
    <tr>
      <td class="tc">${idx + 1}</td><td>${it.productName}</td>
      <td class="tc">${it.qty} ${it.unit || ''}</td>
      <td class="tr">₹${(it.price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      ${isGST ? `<td class="tc">${it.gstRate || 0}%</td><td class="tr">${fmt(it.totalTax || 0)}</td>` : ''}
      <td class="tr"><strong>${fmt(it.subtotal || 0)}</strong></td>
    </tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Quotation – ${quote.quoteNumber}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700;800&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Barlow',sans-serif;background:#e8e8e8;font-size:13px}
  .page{max-width:900px;margin:20px auto;background:#fff;box-shadow:0 4px 24px rgba(0,0,0,.15)}
  .topbar{height:8px;background:linear-gradient(90deg,#374151,#6b7280,#9ca3af,#6b7280,#374151)}
  .header{padding:28px 36px;display:flex;justify-content:space-between;align-items:flex-start;background:linear-gradient(135deg,#f9fafb 0%,#f3f4f6 100%);border-bottom:2px solid #e5e7eb}
  .co-area .co-name{font-size:20px;font-weight:800;color:#111827;letter-spacing:-.3px;margin-bottom:2px}
  .co-area .co-tag{font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px}
  .co-area .co-info{font-size:11px;color:#6b7280;line-height:1.7}
  .co-area .gst{font-size:11px;font-weight:600;color:#374151}
  .qt-area{text-align:right}
  .qt-area .qt-label{font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:2px}
  .qt-area .qt-num{font-size:22px;font-weight:800;color:#111827;font-family:monospace;letter-spacing:-1px;margin:4px 0}
  .qt-area .qt-type{display:inline-block;background:#374151;color:#fff;font-size:10px;font-weight:700;padding:3px 12px;border-radius:20px;letter-spacing:.5px}
  .metallic-strip{background:linear-gradient(90deg,#374151,#4b5563,#6b7280,#4b5563,#374151);height:3px}
  .body{padding:28px 36px}
  .parties{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px}
  .pbox{border:1px solid #e5e7eb;border-top:3px solid #6b7280;padding:14px;background:#fafafa}
  .pbox .pt{font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px}
  .pbox h3{font-size:14px;font-weight:700;color:#111827;margin-bottom:3px}
  .pbox p{font-size:11px;color:#6b7280}
  .meta-row{display:flex;gap:0;margin-bottom:24px;border:1px solid #e5e7eb;overflow:hidden}
  .meta-cell{flex:1;padding:12px 16px;text-align:center;border-right:1px solid #e5e7eb;background:#f9fafb}
  .meta-cell:last-child{border-right:none}
  .meta-cell .ml{font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px}
  .meta-cell .mv{font-size:13px;font-weight:700;color:#111827}
  .tbl-wrap{border:1px solid #d1d5db;overflow:hidden;margin-bottom:20px}
  table{width:100%;border-collapse:collapse}
  thead tr{background:#374151}
  thead th{padding:10px 12px;font-size:10px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.5px}
  tbody tr{border-bottom:1px solid #e5e7eb}
  tbody tr:nth-child(even){background:#f9fafb}
  tbody td{padding:10px 12px;color:#374151}
  .tc{text-align:center}.tr{text-align:right}
  .totals{display:flex;justify-content:flex-end;margin-bottom:20px}
  .tbox{width:280px}
  .trow{display:flex;justify-content:space-between;padding:7px 12px;font-size:12px;color:#6b7280;border-bottom:1px solid #f3f4f6}
  .trow span:last-child{font-weight:600;color:#374151}
  .grand{display:flex;justify-content:space-between;padding:12px;background:#374151;color:#fff;font-size:16px;font-weight:800;font-family:'Barlow',sans-serif;letter-spacing:.3px;margin-top:8px}
  ${quote.notes ? `.notes{background:#f9fafb;border:1px solid #e5e7eb;border-left:3px solid #6b7280;padding:14px;margin-bottom:20px}
  .notes .nl{font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
  .notes p{font-size:12px;color:#374151;line-height:1.6}` : ''}
  .footer{display:flex;justify-content:space-between;align-items:flex-end;padding-top:16px;border-top:1px solid #e5e7eb}
  .footer p{font-size:10px;color:#9ca3af;line-height:1.7}
  .sign-area{text-align:right}
  .sign-line{width:160px;border-top:2px solid #374151;margin:44px 0 6px auto}
  .sign-label{font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px}
  @media print{body{background:#fff}.page{margin:0;box-shadow:none}.np{display:none!important}}
</style></head><body>
<div class="np" style="text-align:center;padding:14px;background:#374151">
  <button onclick="window.print()" style="background:#9ca3af;color:#fff;border:none;padding:10px 28px;font-size:13px;cursor:pointer;font-weight:700;letter-spacing:.5px">🖨️ Print Quotation</button>
  <button onclick="window.close()" style="background:transparent;color:#9ca3af;border:1px solid #4b5563;padding:10px 24px;font-size:13px;cursor:pointer;font-weight:600;margin-left:10px">✕ Close</button>
</div>
<div class="page">
  <div class="topbar"></div>
  <div class="header">
    <div class="co-area">
      <div class="co-tag">Steel Syndicate</div>
      <div class="co-name">${company.name}</div>
      <div class="co-info">${company.address}<br>${company.phone} · ${company.email}</div>
      ${isGST ? `<div class="gst" style="margin-top:4px">GSTIN: ${company.gstNumber}</div>` : ''}
    </div>
    <div class="qt-area">
      <div class="qt-label">Price Quotation</div>
      <div class="qt-num">${quote.quoteNumber}</div>
      <div class="qt-type">${isGST ? 'GST Quote' : 'Non-GST Quote'}</div>
    </div>
  </div>
  <div class="metallic-strip"></div>
  <div class="body">
    <div class="parties">
      <div class="pbox"><div class="pt">Quoted To</div><h3>${quote.customerName}</h3><p>${quote.customerPhone || ''}</p></div>
      <div class="pbox"><div class="pt">Quoted By</div><h3>${company.name}</h3><p>${company.city}, ${company.state} – ${company.pincode}</p></div>
    </div>
    <div class="meta-row">
      <div class="meta-cell"><div class="ml">Quote Date</div><div class="mv">${fmtD(quote.quoteDate)}</div></div>
      <div class="meta-cell"><div class="ml">Valid Till</div><div class="mv">${fmtD(quote.validUntil)}</div></div>
      <div class="meta-cell"><div class="ml">Quote No.</div><div class="mv">${quote.quoteNumber}</div></div>
    </div>
    <div class="tbl-wrap"><table>
      <thead><tr>
        <th class="tc">#</th><th>Product / Description</th><th class="tc">Qty</th><th class="tr">Unit Rate</th>
        ${isGST ? '<th class="tc">GST%</th><th class="tr">Tax Amt</th>' : ''}
        <th class="tr">Amount</th>
      </tr></thead>
      <tbody>${itemRows}</tbody>
    </table></div>
    <div class="totals"><div class="tbox">
      <div class="trow"><span>Subtotal</span><span>${fmt(quote.subtotal)}</span></div>
      ${isGST ? `<div class="trow"><span>CGST</span><span>${fmt((quote.totalTax || 0) / 2)}</span></div>
      <div class="trow"><span>SGST</span><span>${fmt((quote.totalTax || 0) / 2)}</span></div>` : ''}
      <div class="grand"><span>GRAND TOTAL</span><span>${fmt(quote.grandTotal)}</span></div>
    </div></div>
    ${quote.notes ? `<div class="notes"><div class="nl">Terms & Conditions</div><p>${quote.notes}</p></div>` : ''}
    <div class="footer">
      <p>This is a computer-generated quotation.<br>Prices are subject to change without prior notice.<br>Valid until ${fmtD(quote.validUntil)}.</p>
      <div class="sign-area"><div class="sign-line"></div><div class="sign-label">Authorised Signatory</div></div>
    </div>
  </div>
</div></body></html>`;
};

// ─────────────────────────────────────────────────────────────────────────────
// PRINT DESIGN 4: Patel Furniture (company_4)
// Style: Warm Elegant – cream/gold tones, serif fonts, refined
// ─────────────────────────────────────────────────────────────────────────────
const printDesign_company4 = (quote, company) => {
  const isGST = quote.invoiceType === 'gst';
  const fmt = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(n || 0);
  const fmtD = d => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
  const itemRows = (quote.items || []).map((it, idx) => `
    <tr>
      <td class="tc">${idx + 1}</td><td>${it.productName}</td>
      <td class="tc">${it.qty} ${it.unit || ''}</td>
      <td class="tr">₹${(it.price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      ${isGST ? `<td class="tc">${it.gstRate || 0}%</td><td class="tr">${fmt(it.totalTax || 0)}</td>` : ''}
      <td class="tr"><strong>${fmt(it.subtotal || 0)}</strong></td>
    </tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Quotation – ${quote.quoteNumber}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;800&family=Lato:wght@400;500;600;700&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Lato',sans-serif;background:#faf7f2;font-size:13px;color:#3d2b1f}
  .page{max-width:900px;margin:20px auto;background:#fff;box-shadow:0 6px 32px rgba(100,60,20,.12)}
  .border-top{height:6px;background:linear-gradient(90deg,#92400e,#b45309,#d97706,#b45309,#92400e)}
  .header{padding:32px 40px;background:#fffbf5;border-bottom:1px solid #fde8c8}
  .header-inner{display:flex;justify-content:space-between;align-items:flex-start}
  .brand .co-name{font-family:'Playfair Display',serif;font-size:24px;font-weight:800;color:#78350f;letter-spacing:-.3px;margin-bottom:3px}
  .brand .co-tag{font-size:10px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;font-family:'Lato',sans-serif}
  .brand .co-info{font-size:11px;color:#92400e;line-height:1.7;opacity:.85}
  .qt-section{text-align:right}
  .qt-section .heading{font-family:'Playfair Display',serif;font-size:28px;font-weight:400;color:#78350f;letter-spacing:1px;margin-bottom:4px;font-style:italic}
  .qt-section .num{font-family:'Lato',sans-serif;font-size:14px;font-weight:700;color:#b45309;letter-spacing:.5px}
  .qt-section .badge{display:inline-block;margin-top:6px;background:#fef3c7;border:1px solid #fde68a;color:#92400e;font-size:10px;font-weight:700;padding:3px 12px;border-radius:20px;letter-spacing:.5px}
  .ornament{text-align:center;padding:10px;background:#fffbf5;border-bottom:1px solid #fde8c8;font-size:16px;color:#d97706;letter-spacing:12px}
  .body{padding:32px 40px}
  .parties{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px}
  .pbox{border:1px solid #fde8c8;background:#fffbf5;padding:16px}
  .pbox::before{content:'';display:block;width:32px;height:3px;background:#d97706;margin-bottom:10px}
  .pbox .pt{font-size:9px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px;font-family:'Lato',sans-serif}
  .pbox h3{font-family:'Playfair Display',serif;font-size:15px;font-weight:600;color:#78350f;margin-bottom:3px}
  .pbox p{font-size:11px;color:#92400e;opacity:.8}
  .dates-strip{display:flex;background:#fef3c7;border:1px solid #fde68a;margin-bottom:24px;overflow:hidden}
  .date-item{flex:1;padding:14px;text-align:center;border-right:1px solid #fde68a}
  .date-item:last-child{border-right:none}
  .date-item .dl{font-size:9px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;font-family:'Lato',sans-serif}
  .date-item .dv{font-size:13px;font-weight:700;color:#78350f;font-family:'Playfair Display',serif}
  .tbl-wrap{border:1px solid #fde8c8;overflow:hidden;margin-bottom:20px}
  table{width:100%;border-collapse:collapse}
  thead tr{background:#78350f}
  thead th{padding:11px 14px;font-size:10px;font-weight:700;color:#fef3c7;text-transform:uppercase;letter-spacing:.5px;font-family:'Lato',sans-serif}
  tbody tr{border-bottom:1px solid #fef3c7}
  tbody tr:nth-child(even){background:#fffbf5}
  tbody td{padding:11px 14px;color:#44260e}
  .tc{text-align:center}.tr{text-align:right}
  .totals{display:flex;justify-content:flex-end;margin-bottom:24px}
  .tbox{width:300px}
  .trow{display:flex;justify-content:space-between;padding:7px 14px;font-size:12px;color:#92400e;background:#fffbf5;border-bottom:1px solid #fde8c8}
  .trow span:last-child{font-weight:600;color:#78350f}
  .grand{display:flex;justify-content:space-between;padding:14px;background:#78350f;color:#fef3c7;font-family:'Playfair Display',serif;font-size:17px;font-weight:700;margin-top:8px}
  ${quote.notes ? `.notes{background:#fffbf5;border:1px solid #fde8c8;padding:16px;margin-bottom:20px}
  .notes::before{content:'';display:block;width:32px;height:2px;background:#d97706;margin-bottom:10px}
  .notes .nl{font-size:9px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;font-family:'Lato',sans-serif}
  .notes p{font-size:12px;color:#78350f;line-height:1.7}` : ''}
  .footer{display:flex;justify-content:space-between;align-items:flex-end;padding-top:20px;border-top:1px solid #fde8c8}
  .footer p{font-size:10px;color:#b45309;opacity:.8;line-height:1.7;font-style:italic}
  .sign-area{text-align:right}
  .sign-line{width:160px;border-top:2px solid #d97706;margin:44px 0 6px auto}
  .sign-label{font-size:10px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:.5px;font-family:'Lato',sans-serif}
  @media print{body{background:#fff}.page{margin:0;box-shadow:none}.np{display:none!important}}
</style></head><body>
<div class="np" style="text-align:center;padding:14px;background:#78350f">
  <button onclick="window.print()" style="background:#d97706;color:#fff;border:none;padding:10px 28px;font-size:13px;cursor:pointer;font-weight:700;border-radius:2px">🖨️ Print Quotation</button>
  <button onclick="window.close()" style="background:transparent;color:#fde8c8;border:1px solid #b45309;padding:10px 24px;font-size:13px;cursor:pointer;font-weight:600;margin-left:10px;border-radius:2px">✕ Close</button>
</div>
<div class="page">
  <div class="border-top"></div>
  <div class="header">
    <div class="header-inner">
      <div class="brand">
        <div class="co-tag">Est. Furniture House</div>
        <div class="co-name">${company.name}</div>
        <div class="co-info">${company.address}<br>${company.phone} · ${company.email}${isGST ? `<br>GSTIN: ${company.gstNumber}` : ''}</div>
      </div>
      <div class="qt-section">
        <div class="heading">Quotation</div>
        <div class="num">${quote.quoteNumber}</div>
        <div class="badge">${isGST ? 'GST Quotation' : 'Non-GST Quotation'}</div>
      </div>
    </div>
  </div>
  <div class="ornament">✦ ✦ ✦</div>
  <div class="body">
    <div class="parties">
      <div class="pbox"><div class="pt">Prepared For</div><h3>${quote.customerName}</h3><p>${quote.customerPhone || ''}</p></div>
      <div class="pbox"><div class="pt">Prepared By</div><h3>${company.name}</h3><p>${company.city}, ${company.state} – ${company.pincode}</p></div>
    </div>
    <div class="dates-strip">
      <div class="date-item"><div class="dl">Date of Quote</div><div class="dv">${fmtD(quote.quoteDate)}</div></div>
      <div class="date-item"><div class="dl">Valid Until</div><div class="dv">${fmtD(quote.validUntil)}</div></div>
      <div class="date-item"><div class="dl">Reference No.</div><div class="dv">${quote.quoteNumber}</div></div>
    </div>
    <div class="tbl-wrap"><table>
      <thead><tr>
        <th class="tc">#</th><th>Item Description</th><th class="tc">Qty</th><th class="tr">Unit Price</th>
        ${isGST ? '<th class="tc">GST %</th><th class="tr">Tax</th>' : ''}
        <th class="tr">Total</th>
      </tr></thead>
      <tbody>${itemRows}</tbody>
    </table></div>
    <div class="totals"><div class="tbox">
      <div class="trow"><span>Subtotal</span><span>${fmt(quote.subtotal)}</span></div>
      ${isGST ? `<div class="trow"><span>CGST</span><span>${fmt((quote.totalTax || 0) / 2)}</span></div>
      <div class="trow"><span>SGST</span><span>${fmt((quote.totalTax || 0) / 2)}</span></div>` : ''}
      <div class="grand"><span>Grand Total</span><span>${fmt(quote.grandTotal)}</span></div>
    </div></div>
    ${quote.notes ? `<div class="notes"><div class="nl">Terms & Conditions</div><p>${quote.notes}</p></div>` : ''}
    <div class="footer">
      <p>This quotation is computer generated and valid until ${fmtD(quote.validUntil)}.<br>We appreciate your interest in ${company.name}.</p>
      <div class="sign-area"><div class="sign-line"></div><div class="sign-label">Authorised Signatory</div></div>
    </div>
  </div>
</div></body></html>`;
};

// ─────────────────────────────────────────────────────────────────────────────
// Print dispatcher
// ─────────────────────────────────────────────────────────────────────────────
const printQuotation = (quote, company) => {
  const designers = {
    company_1: printDesign_company1,
    company_2: printDesign_company2,
    company_3: printDesign_company3,
    company_4: printDesign_company4,
  };
  const designer = designers[quote.companyId] || printDesign_company1;
  const html = designer(quote, company);
  const win = window.open('', '_blank', 'width=960,height=750');
  if (!win) { toast.error('Popup blocked. Please allow popups.'); return; }
  win.document.write(html);
  win.document.close();
};

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