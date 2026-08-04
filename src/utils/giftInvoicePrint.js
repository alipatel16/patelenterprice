import { toast } from 'react-toastify';
import { COMPANIES } from '../constants';

const COMPANY = COMPANIES.company_1;

export const generateGiftInvoiceHTML = (invoice) => {
  const company = COMPANY;
  const fmt = n => n > 0
    ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(n)
    : '—';
  const fmtD = d => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const itemRows = (invoice.items || []).map((it, idx) => {
    const isDelivered = it.deliveryStatus === 'delivered';
    return `
    <tr>
      <td class="tc">${idx + 1}</td>
      <td><strong>${it.name}</strong></td>
      <td class="tc">${it.qty} ${it.unit || 'pcs'}</td>
      <td class="tc">
        <span class="badge ${it.type === 'free' ? 'badge-green' : 'badge-blue'}">
          ${it.type === 'free' ? '🎁 FREE' : '💳 PAID'}
        </span>
      </td>
      <td class="tr">${it.type === 'paid' ? fmt(it.price * it.qty) : '<span style="color:#16a34a;font-weight:700">FREE</span>'}</td>
      <td class="tc">
        <span class="badge ${isDelivered ? 'badge-green' : 'badge-orange'}">
          ${isDelivered ? '✓ Delivered' : '⏳ Pending'}
        </span>
      </td>
      ${isDelivered && it.deliveredAt ? `<td class="tc" style="font-size:11px;color:#6b7280">${fmtD(it.deliveredAt)}</td>` : '<td></td>'}
    </tr>`;
  }).join('');

  const totalItems = invoice.items?.length || 0;
  const deliveredItems = invoice.items?.filter(i => i.deliveryStatus === 'delivered').length || 0;
  const freeItems = invoice.items?.filter(i => i.type === 'free').length || 0;
  const paidItems = invoice.items?.filter(i => i.type === 'paid').length || 0;
  const paidTotal = invoice.items?.filter(i => i.type === 'paid')
    .reduce((s, i) => s + (i.price * i.qty), 0) || 0;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Gift Invoice – ${invoice.invoiceNumber}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Inter',sans-serif;background:#fdf4ff;color:#1e1b4b;font-size:13px}
  .page{max-width:920px;margin:20px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(139,92,246,.12)}
  .header{background:linear-gradient(135deg,#7c3aed 0%,#a855f7 50%,#c084fc 100%);color:#fff;padding:32px 36px;position:relative;overflow:hidden}
  .header::after{content:'🎁';position:absolute;right:32px;top:50%;transform:translateY(-50%);font-size:80px;opacity:.15}
  .header::before{content:'';position:absolute;left:-40px;bottom:-40px;width:180px;height:180px;background:rgba(255,255,255,.05);border-radius:50%}
  .header-inner{display:flex;justify-content:space-between;align-items:flex-start;position:relative;z-index:1}
  .co-name{font-size:20px;font-weight:800;letter-spacing:-.3px;margin-bottom:4px}
  .co-sub{font-size:11px;opacity:.85;line-height:1.7}
  .inv-badge{text-align:right}
  .inv-badge .lbl{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;opacity:.8;margin-bottom:4px}
  .inv-badge .num{font-size:22px;font-weight:800;letter-spacing:-.3px;font-family:monospace}
  .inv-badge .sub-badges{display:flex;gap:6px;justify-content:flex-end;margin-top:6px}
  .inv-badge .sbadge{background:rgba(255,255,255,.2);border-radius:20px;padding:3px 10px;font-size:10px;font-weight:700}
  .gift-bar{background:linear-gradient(90deg,#7c3aed,#a855f7,#c084fc,#a855f7,#7c3aed);height:4px}
  .body{padding:32px 36px}
  .parties{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px}
  .pbox{background:#faf5ff;border:1px solid #e9d5ff;border-radius:10px;padding:16px;border-top:3px solid #7c3aed}
  .pbox .pt{font-size:9px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px}
  .pbox h3{font-size:14px;font-weight:700;color:#1e1b4b;margin-bottom:2px}
  .pbox p{font-size:11px;color:#6b7280}
  .meta-strip{display:flex;gap:0;margin-bottom:20px;border:1px solid #e9d5ff;border-radius:8px;overflow:hidden}
  .meta-cell{flex:1;padding:12px;text-align:center;border-right:1px solid #e9d5ff;background:#faf5ff}
  .meta-cell:last-child{border-right:none}
  .meta-cell .ml{font-size:9px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:.8px;margin-bottom:3px}
  .meta-cell .mv{font-size:13px;font-weight:700;color:#1e1b4b}
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}
  .stat-box{background:#faf5ff;border:1px solid #e9d5ff;border-radius:8px;padding:12px;text-align:center}
  .stat-box .sl{font-size:9px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
  .stat-box .sv{font-size:18px;font-weight:800;color:#1e1b4b}
  .tbl-wrap{border:1px solid #e9d5ff;border-radius:10px;overflow:hidden;margin-bottom:20px}
  table{width:100%;border-collapse:collapse}
  thead tr{background:#7c3aed;color:#fff}
  thead th{padding:10px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.3px}
  tbody tr{border-bottom:1px solid #f3e8ff}
  tbody tr:nth-child(even){background:#fdf4ff}
  tbody tr:last-child{border-bottom:none}
  tbody td{padding:10px 12px}
  .tc{text-align:center}.tr{text-align:right}
  .badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700}
  .badge-green{background:#dcfce7;color:#16a34a}
  .badge-blue{background:#dbeafe;color:#1d4ed8}
  .badge-orange{background:#fef9c3;color:#ca8a04}
  ${invoice.linkedSaleRef ? `.linked{background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:10px 14px;margin-bottom:16px;font-size:12px;color:#1d4ed8}` : ''}
  ${invoice.notes ? `.notes{background:#faf5ff;border:1px solid #e9d5ff;border-radius:8px;padding:14px;margin-bottom:20px}
  .notes .nl{font-size:9px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px}
  .notes p{font-size:12px;color:#4b5563;line-height:1.6}` : ''}
  .footer{display:flex;justify-content:space-between;align-items:flex-end;padding-top:20px;border-top:1px dashed #e9d5ff}
  .footer p{font-size:10px;color:#9ca3af;line-height:1.7}
  .sign-box{text-align:right}
  .sign-line{width:160px;border-top:2px solid #7c3aed;margin:44px 0 6px auto}
  .sign-label{font-size:10px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:.5px}
  @media print{body{background:#fff}.page{margin:0;border-radius:0;box-shadow:none}.np{display:none!important}}
</style></head><body>
<div class="np" style="text-align:center;padding:14px;background:linear-gradient(135deg,#7c3aed,#a855f7)">
  <button onclick="window.print()" style="background:#fff;color:#7c3aed;border:none;padding:10px 28px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:800">🖨️ Print Gift Invoice</button>
  <button onclick="window.close()" style="background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3);padding:10px 24px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:600;margin-left:10px">✕ Close</button>
</div>
<div class="page">
  <div class="header">
    <div class="header-inner">
      <div>
        <div class="co-name">${company.name}</div>
        <div class="co-sub">${company.address}<br>${company.phone} · ${company.email}<br>GSTIN: ${company.gstNumber}</div>
      </div>
      <div class="inv-badge">
        <div class="lbl">🎁 Gift Invoice</div>
        <div class="num">${invoice.invoiceNumber}</div>
        <div class="sub-badges">
          <span class="sbadge">Date: ${fmtD(invoice.date)}</span>
        </div>
      </div>
    </div>
  </div>
  <div class="gift-bar"></div>
  <div class="body">
    <div class="parties">
      <div class="pbox"><div class="pt">Gift Given To</div><h3>${invoice.customerName}</h3><p>${invoice.customerPhone || ''}</p></div>
      <div class="pbox"><div class="pt">Gift Set Used</div><h3>${invoice.giftSetName}</h3>
        <p>${freeItems} free item${freeItems !== 1 ? 's' : ''}, ${paidItems} paid item${paidItems !== 1 ? 's' : ''}</p>
      </div>
    </div>
    <div class="meta-strip">
      <div class="meta-cell"><div class="ml">Invoice Date</div><div class="mv">${fmtD(invoice.date)}</div></div>
      <div class="meta-cell"><div class="ml">Invoice No.</div><div class="mv">${invoice.invoiceNumber}</div></div>
      ${invoice.linkedSaleRef ? `<div class="meta-cell"><div class="ml">Linked Sale</div><div class="mv">${invoice.linkedSaleRef}</div></div>` : ''}
      <div class="meta-cell"><div class="ml">Total Items</div><div class="mv">${totalItems}</div></div>
    </div>
    <div class="stats">
      <div class="stat-box"><div class="sl">Total Items</div><div class="sv">${totalItems}</div></div>
      <div class="stat-box"><div class="sl">🎁 Free Items</div><div class="sv" style="color:#16a34a">${freeItems}</div></div>
      <div class="stat-box"><div class="sl">✓ Delivered</div><div class="sv" style="color:#7c3aed">${deliveredItems}</div></div>
      <div class="stat-box"><div class="sl">⏳ Pending</div><div class="sv" style="color:#d97706">${totalItems - deliveredItems}</div></div>
    </div>
    <div class="tbl-wrap"><table>
      <thead><tr>
        <th class="tc">#</th>
        <th>Item</th>
        <th class="tc">Qty</th>
        <th class="tc">Type</th>
        <th class="tr">Value</th>
        <th class="tc">Delivery</th>
        <th class="tc">Delivered On</th>
      </tr></thead>
      <tbody>${itemRows}</tbody>
    </table></div>
    ${paidTotal > 0 ? `<div style="text-align:right;margin-bottom:16px"><div style="display:inline-block;background:#faf5ff;border:1px solid #e9d5ff;border-radius:8px;padding:10px 20px">
      <span style="font-size:12px;color:#6b7280">Total Paid Items Value: </span>
      <strong style="font-size:16px;color:#7c3aed">${fmt(paidTotal)}</strong>
    </div></div>` : ''}
    ${invoice.linkedSaleRef ? `<div class="linked">📋 Linked to Sale Invoice: <strong>${invoice.linkedSaleRef}</strong></div>` : ''}
    ${invoice.notes ? `<div class="notes"><div class="nl">Notes</div><p>${invoice.notes}</p></div>` : ''}
    <div class="footer">
      <p>This is a computer-generated gift invoice.<br>Generated on ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}.</p>
      <div class="sign-box"><div class="sign-line"></div><div class="sign-label">Authorised Signatory</div></div>
    </div>
  </div>
</div></body></html>`;
};

export const printGiftInvoice = (invoice) => {
  const win = window.open('', '_blank', 'width=960,height=750');
  if (!win) {
    toast.error('Popup blocked. Please allow popups.');
    return;
  }

  win.document.write(generateGiftInvoiceHTML(invoice));
  win.document.close();
};
