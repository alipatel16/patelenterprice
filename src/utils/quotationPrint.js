import { toast } from 'react-toastify';

const currency = value => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
}).format(Number(value) || 0);

const number = value => new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number(value) || 0);

const date = value => value
  ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';

const escapeHtml = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const multiline = value => escapeHtml(value).replace(/\n/g, '<br>');
const quoteType = quote => quote.invoiceType === 'gst' ? 'GST Quotation' : 'Non-GST Quotation';

const printToolbar = (background, buttonBackground, buttonColor = '#fff') => `
  <div class="print-toolbar">
    <button onclick="window.print()" style="background:${buttonBackground};color:${buttonColor}">Print Quotation</button>
    <button class="close" onclick="window.close()">Close</button>
  </div>
  <style>
    .print-toolbar{display:flex;justify-content:center;gap:10px;padding:14px;background:${background}}
    .print-toolbar button{border:0;padding:10px 24px;font:700 13px Arial,sans-serif;cursor:pointer;border-radius:4px}
    .print-toolbar .close{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.45)}
    @media print{.print-toolbar{display:none!important}}
  </style>`;

const documentStart = (quote, fonts, styles) => `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>Quotation – ${escapeHtml(quote.quoteNumber)}</title>
${fonts || ''}
<style>
  *{box-sizing:border-box}
  html,body{margin:0;padding:0}
  @page{size:A4;margin:9mm}
  ${styles}
</style></head><body>`;

const companyContact = (company, includeGST) => `
  ${escapeHtml(company.address)}<br>
  ${escapeHtml(company.city)}, ${escapeHtml(company.state)} ${escapeHtml(company.pincode)}<br>
  ${escapeHtml(company.phone)} · ${escapeHtml(company.email)}
  ${includeGST ? `<br>GSTIN: ${escapeHtml(company.gstNumber)}` : ''}`;

const totalsLines = (quote, classes = {}) => {
  const isGST = quote.invoiceType === 'gst';
  const row = classes.row || 'total-row';
  const grand = classes.grand || 'grand-total';
  return `
    <div class="${row}"><span>Subtotal</span><strong>${currency(quote.subtotal)}</strong></div>
    ${isGST ? `
      <div class="${row}"><span>CGST</span><strong>${currency((quote.totalTax || 0) / 2)}</strong></div>
      <div class="${row}"><span>SGST</span><strong>${currency((quote.totalTax || 0) / 2)}</strong></div>` : ''}
    <div class="${grand}"><span>Grand Total</span><strong>${currency(quote.grandTotal)}</strong></div>`;
};

// Company 1: asymmetric technology proposal with a permanent information rail.
const designCompany1 = (quote, company) => {
  const isGST = quote.invoiceType === 'gst';
  const rows = (quote.items || []).map((item, index) => `
    <tr>
      <td class="index">${String(index + 1).padStart(2, '0')}</td>
      <td><div class="product">${escapeHtml(item.productName)}</div><div class="unit-note">${escapeHtml(item.unit || 'pcs')}</div></td>
      <td class="center">${number(item.qty)}</td>
      <td class="right">${currency(item.price)}</td>
      ${isGST ? `<td class="center">${number(item.gstRate)}%</td><td class="right">${currency(item.totalTax)}</td>` : ''}
      <td class="right amount">${currency(item.subtotal)}</td>
    </tr>`).join('');

  const styles = `
    body{font-family:'Manrope',Arial,sans-serif;background:#e9eef7;color:#162033;font-size:12px}
    .sheet{width:100%;max-width:900px;min-height:1080px;margin:18px auto;background:#fff;display:grid;grid-template-columns:225px 1fr;box-shadow:0 14px 45px rgba(15,38,80,.16)}
    .rail{background:#102a56;color:#fff;padding:34px 24px;display:flex;flex-direction:column}
    .brand-mark{width:42px;height:42px;border:2px solid #75b8ff;display:grid;place-items:center;font-size:18px;font-weight:800;margin-bottom:24px}
    .company{font-size:19px;line-height:1.18;font-weight:800;margin-bottom:12px}
    .contact{font-size:10px;line-height:1.75;color:#c8d8ef}
    .rail-rule{height:1px;background:rgba(255,255,255,.2);margin:26px 0}
    .rail-label{font-size:8px;letter-spacing:1.8px;text-transform:uppercase;color:#75b8ff;font-weight:800;margin-bottom:6px}
    .rail-value{font-size:12px;line-height:1.45;font-weight:700;margin-bottom:18px}
    .customer{font-size:15px;line-height:1.35}
    .rail-footer{margin-top:auto;font-size:9px;line-height:1.65;color:#9eb5d5}
    .content{padding:34px 34px 28px}
    .eyebrow{font-size:9px;font-weight:800;letter-spacing:2.4px;text-transform:uppercase;color:#4385d7;margin-bottom:7px}
    h1{font-size:35px;line-height:1;margin:0;color:#102a56;letter-spacing:-1.5px;font-weight:800}
    .topline{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:24px;border-bottom:3px solid #102a56;margin-bottom:24px}
    .type-pill{border:1px solid #b8cbe3;color:#102a56;padding:7px 11px;font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase}
    .intro{display:grid;grid-template-columns:1fr 180px;gap:22px;align-items:end;margin-bottom:22px}
    .intro p{margin:0;color:#5d6a7e;line-height:1.65;font-size:11px}
    .valid-card{background:#edf5ff;padding:13px 15px;border-left:4px solid #4385d7}
    .valid-card small{display:block;color:#4385d7;font-size:8px;text-transform:uppercase;letter-spacing:1px;font-weight:800;margin-bottom:4px}
    .valid-card strong{font-size:13px;color:#102a56}
    table{width:100%;border-collapse:collapse;margin-bottom:22px}
    thead{display:table-header-group}thead th{background:#eef3f9;color:#52627a;padding:10px 8px;font-size:8px;text-transform:uppercase;letter-spacing:.8px;text-align:left;border-bottom:2px solid #102a56}
    tbody tr{break-inside:avoid;page-break-inside:avoid}tbody td{padding:12px 8px;border-bottom:1px solid #dae3ee;vertical-align:top}
    tbody tr:last-child td{border-bottom:2px solid #102a56}
    .index{color:#4385d7;font-weight:800;width:32px}.product{font-weight:800;color:#162033}.unit-note{font-size:9px;color:#8793a4;margin-top:3px}
    .center{text-align:center}.right{text-align:right}.amount{font-weight:800;color:#102a56}
    .bottom{display:grid;grid-template-columns:1fr 255px;gap:24px;align-items:start}
    .notes{border-left:3px solid #b8cbe3;padding-left:13px;color:#657287;font-size:10px;line-height:1.65;min-height:52px}
    .notes b{display:block;color:#102a56;text-transform:uppercase;letter-spacing:1px;font-size:8px;margin-bottom:5px}
    .summary{background:#102a56;color:#fff;padding:16px}
    .total-row{display:flex;justify-content:space-between;padding:5px 0;color:#bdd0eb;font-size:10px}
    .total-row strong{color:#fff}
    .grand-total{display:flex;justify-content:space-between;align-items:center;border-top:1px solid rgba(255,255,255,.25);margin-top:9px;padding-top:12px;font-size:13px}
    .grand-total strong{font-size:17px;color:#75b8ff}
    .foot{display:flex;justify-content:space-between;margin-top:26px;padding-top:13px;border-top:1px solid #dae3ee;color:#8a96a8;font-size:9px}
    @media print{body{background:#fff}.sheet{margin:0;box-shadow:none;min-height:auto}}
  `;

  return `${documentStart(quote, "<link href=\"https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap\" rel=\"stylesheet\">", styles)}
    ${printToolbar('#102a56', '#75b8ff', '#102a56')}
    <main class="sheet">
      <aside class="rail">
        <div class="brand-mark">PE</div>
        <div class="company">${escapeHtml(company.name)}</div>
        <div class="contact">${companyContact(company, isGST)}</div>
        <div class="rail-rule"></div>
        <div class="rail-label">Prepared for</div>
        <div class="rail-value customer">${escapeHtml(quote.customerName)}</div>
        <div class="rail-value">${escapeHtml(quote.customerPhone || 'Phone not provided')}</div>
        <div class="rail-label">Quotation number</div>
        <div class="rail-value">${escapeHtml(quote.quoteNumber)}</div>
        <div class="rail-label">Issued</div>
        <div class="rail-value">${date(quote.quoteDate)}</div>
        <div class="rail-footer">Prices and availability are governed by the terms stated in this proposal.</div>
      </aside>
      <section class="content">
        <div class="topline">
          <div><div class="eyebrow">Commercial proposal</div><h1>PRICE<br>QUOTATION</h1></div>
          <div class="type-pill">${quoteType(quote)}</div>
        </div>
        <div class="intro">
          <p>Thank you for your enquiry. We are pleased to submit the following commercial offer for the products listed below.</p>
          <div class="valid-card"><small>Offer valid until</small><strong>${date(quote.validUntil)}</strong></div>
        </div>
        <table>
          <thead><tr><th>#</th><th>Product description</th><th class="center">Qty</th><th class="right">Unit price</th>${isGST ? '<th class="center">GST</th><th class="right">Tax</th>' : ''}<th class="right">Amount</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="bottom">
          <div class="notes"><b>Terms & notes</b>${quote.notes ? multiline(quote.notes) : 'Standard company terms apply. Please confirm availability before placing the order.'}</div>
          <div class="summary">${totalsLines(quote)}</div>
        </div>
        <div class="foot"><span>Computer-generated quotation</span><span>${escapeHtml(company.website || '')}</span></div>
      </section>
    </main>
  </body></html>`;
};

// Company 2: industrial specification sheet with document-control blocks.
const designCompany2 = (quote, company) => {
  const isGST = quote.invoiceType === 'gst';
  const rows = (quote.items || []).map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td class="desc">${escapeHtml(item.productName)}</td>
      <td>${number(item.qty)} ${escapeHtml(item.unit || '')}</td>
      <td>${currency(item.price)}</td>
      ${isGST ? `<td>${number(item.gstRate)}%</td><td>${currency(item.totalTax)}</td>` : ''}
      <td class="line-total">${currency(item.subtotal)}</td>
    </tr>`).join('');

  const styles = `
    body{font-family:'Roboto Condensed',Arial,sans-serif;background:#d8d9d6;color:#171717;font-size:12px}
    .sheet{max-width:900px;margin:18px auto;background:#f8f8f5;border:3px solid #171717;box-shadow:7px 7px 0 #f2b705}
    .hazard{height:13px;background:repeating-linear-gradient(135deg,#171717 0,#171717 18px,#f2b705 18px,#f2b705 36px)}
    .header{display:grid;grid-template-columns:1fr 235px;border-bottom:3px solid #171717}
    .brand{padding:24px 26px;background:#171717;color:#fff}
    .brand-code{display:inline-block;background:#f2b705;color:#171717;padding:4px 8px;font-size:10px;font-weight:900;letter-spacing:1px;margin-bottom:10px}
    .brand h1{font-size:25px;line-height:1.05;margin:0 0 9px;text-transform:uppercase;letter-spacing:.4px}
    .brand p{margin:0;color:#d6d6d1;line-height:1.55;font-size:10px}
    .document-title{padding:20px;border-left:3px solid #171717;display:flex;flex-direction:column;justify-content:center;text-align:center;background:#f2b705}
    .document-title small{font-size:9px;font-weight:900;letter-spacing:2px;text-transform:uppercase}
    .document-title strong{font-size:28px;line-height:1;margin:5px 0;text-transform:uppercase}
    .document-title span{font:900 12px 'Courier New',monospace}
    .controls{display:grid;grid-template-columns:repeat(4,1fr);border-bottom:3px solid #171717}
    .control{padding:11px 13px;border-right:2px solid #171717;background:#fff}
    .control:last-child{border-right:0}.control label{display:block;font-size:8px;font-weight:900;letter-spacing:1px;text-transform:uppercase;margin-bottom:3px}.control b{font-size:12px}
    .customer-strip{display:grid;grid-template-columns:120px 1fr 210px;border-bottom:3px solid #171717;min-height:70px}
    .customer-label{display:grid;place-items:center;background:#171717;color:#fff;font-size:10px;font-weight:900;letter-spacing:1px;text-transform:uppercase}
    .customer-value{padding:13px 16px;border-right:2px solid #171717}.customer-value strong{font-size:17px;text-transform:uppercase}.customer-value div{margin-top:4px;color:#535353}
    .job-note{padding:12px;background:#efefea;font-size:10px;line-height:1.5}.job-note b{display:block;text-transform:uppercase;margin-bottom:4px}
    .section-title{display:flex;align-items:center;gap:9px;padding:14px 20px 8px;font-size:11px;font-weight:900;letter-spacing:1.2px;text-transform:uppercase}.section-title::before{content:'';width:24px;height:6px;background:#f2b705;border:2px solid #171717}
    .table-wrap{padding:0 20px 18px}
    table{width:100%;border-collapse:collapse;border:2px solid #171717;background:#fff}
    thead{display:table-header-group}th,td{border:1px solid #171717;padding:9px 8px;text-align:center}
    th{background:#333;color:#fff;font-size:9px;text-transform:uppercase;letter-spacing:.6px}
    tbody tr{break-inside:avoid;page-break-inside:avoid}tbody tr:nth-child(even){background:#f0f0eb}.desc{text-align:left;font-weight:800;text-transform:uppercase}.line-total{font-weight:900;background:#fff8d6}
    .footer-grid{display:grid;grid-template-columns:1fr 285px;border-top:3px solid #171717}
    .terms{padding:17px 20px;min-height:145px;border-right:3px solid #171717;background-image:linear-gradient(#e7e7e1 1px,transparent 1px);background-size:100% 24px;font-size:10px;line-height:1.7}
    .terms h3{font-size:10px;text-transform:uppercase;letter-spacing:1px;margin:0 0 9px;background:#f8f8f5;display:inline-block;padding-right:8px}
    .totals{background:#fff}
    .total-row{display:flex;justify-content:space-between;padding:10px 13px;border-bottom:1px solid #171717;font-size:11px}.total-row strong{font-family:'Courier New',monospace}
    .grand-total{display:flex;justify-content:space-between;padding:17px 13px;background:#f2b705;border-top:2px solid #171717;font-size:16px;font-weight:900;text-transform:uppercase}.grand-total strong{font-family:'Courier New',monospace}
    .approval{display:grid;grid-template-columns:1fr 1fr;border-top:3px solid #171717}.approval div{padding:18px 20px 10px;min-height:72px;border-right:2px solid #171717;font-size:9px;text-transform:uppercase;font-weight:900}.approval div:last-child{border-right:0}.approval span{display:block;border-top:1px solid #171717;margin-top:28px;padding-top:4px}
    @media print{body{background:#fff}.sheet{margin:0;box-shadow:none}}
  `;

  return `${documentStart(quote, "<link href=\"https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@400;600;700&display=swap\" rel=\"stylesheet\">", styles)}
    ${printToolbar('#171717', '#f2b705', '#171717')}
    <main class="sheet">
      <div class="hazard"></div>
      <header class="header">
        <div class="brand"><div class="brand-code">ENGINEERING · SUPPLY</div><h1>${escapeHtml(company.name)}</h1><p>${companyContact(company, isGST)}</p></div>
        <div class="document-title"><small>Commercial document</small><strong>Quote</strong><span>${escapeHtml(quote.quoteNumber)}</span></div>
      </header>
      <section class="controls">
        <div class="control"><label>Issue date</label><b>${date(quote.quoteDate)}</b></div>
        <div class="control"><label>Validity</label><b>${date(quote.validUntil)}</b></div>
        <div class="control"><label>Document type</label><b>${quoteType(quote)}</b></div>
        <div class="control"><label>Firm code</label><b>${escapeHtml(company.code)}</b></div>
      </section>
      <section class="customer-strip">
        <div class="customer-label">Client</div>
        <div class="customer-value"><strong>${escapeHtml(quote.customerName)}</strong><div>${escapeHtml(quote.customerPhone || 'Phone not provided')}</div></div>
        <div class="job-note"><b>Document purpose</b>Supply and pricing specification for the listed material.</div>
      </section>
      <div class="section-title">Schedule of supply</div>
      <div class="table-wrap"><table>
        <thead><tr><th>Pos.</th><th>Description / specification</th><th>Quantity</th><th>Unit rate</th>${isGST ? '<th>GST</th><th>Tax amount</th>' : ''}<th>Line value</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <section class="footer-grid">
        <div class="terms"><h3>Commercial notes</h3><div>${quote.notes ? multiline(quote.notes) : 'Rates are subject to stock availability. Delivery schedule will be confirmed after order acceptance.'}</div></div>
        <div class="totals">${totalsLines(quote)}</div>
      </section>
      <section class="approval"><div><span>Prepared by</span></div><div><span>Authorised approval</span></div></section>
    </main>
  </body></html>`;
};

// Company 3: restrained steel ledger with oversized typography and monochrome rules.
const designCompany3 = (quote, company) => {
  const isGST = quote.invoiceType === 'gst';
  const rows = (quote.items || []).map((item, index) => `
    <div class="item-row ${isGST ? 'gst' : ''}">
      <div class="item-no">${String(index + 1).padStart(2, '0')}</div>
      <div class="item-name">${escapeHtml(item.productName)}<small>${escapeHtml(item.unit || 'pcs')}</small></div>
      ${isGST ? `<div class="tax"><small>GST</small>${number(item.gstRate)}%<span>${currency(item.totalTax)}</span></div>` : ''}
      <div class="rate">${number(item.qty)} × ${currency(item.price)}</div>
      <div class="item-amount">${currency(item.subtotal)}</div>
    </div>`).join('');

  const styles = `
    body{font-family:'IBM Plex Sans',Arial,sans-serif;background:#eceeed;color:#222;font-size:12px}
    .sheet{max-width:900px;margin:18px auto;background:#fff;border:1px solid #222;position:relative;overflow:hidden}
    .watermark{position:absolute;right:24px;top:112px;font-size:68px;font-weight:700;letter-spacing:8px;color:#f1f2f2;z-index:0}
    .header{position:relative;z-index:1;padding:30px 38px 20px;border-bottom:8px solid #2f3437}
    .header-top{display:flex;justify-content:space-between;align-items:flex-start}
    .monogram{display:flex;align-items:center;gap:13px}.monogram-box{width:48px;height:48px;background:#2f3437;color:#fff;display:grid;place-items:center;font-size:17px;font-weight:700;letter-spacing:1px}.company h1{font-size:22px;margin:0 0 3px;letter-spacing:.2px}.company p{margin:0;color:#666;font-size:10px;line-height:1.55}
    .quote-number{text-align:right}.quote-number span{display:block;font-size:9px;text-transform:uppercase;letter-spacing:2px;color:#777}.quote-number strong{font:700 18px 'IBM Plex Mono',monospace}
    .title-row{display:flex;justify-content:space-between;align-items:flex-end;margin-top:25px}.title-row h2{margin:0;font-size:43px;font-weight:300;letter-spacing:-2px}.type{font-size:9px;text-transform:uppercase;letter-spacing:1.4px;border-bottom:2px solid #2f3437;padding-bottom:4px}
    .details{position:relative;z-index:1;display:grid;grid-template-columns:1.45fr .75fr .75fr;border-bottom:1px solid #222}
    .detail{padding:14px 20px;border-right:1px solid #222}.detail:last-child{border-right:0}.detail label{display:block;font-size:8px;text-transform:uppercase;letter-spacing:1.5px;color:#777;margin-bottom:6px}.detail strong{font-size:14px}.detail p{margin:4px 0 0;color:#666}
    .items{position:relative;z-index:1;padding:10px 38px 0}
    .items-head{display:grid;grid-template-columns:45px 1fr 110px 130px;padding:12px 0;border-bottom:2px solid #222;font-size:8px;text-transform:uppercase;letter-spacing:1.4px;color:#666}.items-head.gst{grid-template-columns:45px 1fr 105px 110px 130px}.items-head span:last-child{text-align:right}
    .item-row{display:grid;grid-template-columns:45px 1fr 110px 130px;align-items:center;min-height:60px;border-bottom:1px solid #c8cbcc;break-inside:avoid;page-break-inside:avoid}.item-row.gst{grid-template-columns:45px 1fr 105px 110px 130px}
    .item-no{font:600 12px 'IBM Plex Mono',monospace;color:#777}.item-name{font-size:14px;font-weight:600}.item-name small{display:block;font-size:9px;color:#777;font-weight:400;margin-top:5px}.tax{text-align:center;font:600 11px 'IBM Plex Mono',monospace}.tax small{display:block;font:400 7px 'IBM Plex Sans',sans-serif;letter-spacing:1px;color:#888}.tax span{display:block;font-size:8px;color:#777;margin-top:3px}.rate{text-align:right;font:500 10px 'IBM Plex Mono',monospace;color:#555}.item-amount{text-align:right;font:600 13px 'IBM Plex Mono',monospace}
    .closing{position:relative;z-index:1;display:grid;grid-template-columns:1fr 330px;margin:18px 38px 20px;break-inside:avoid;page-break-inside:avoid;border-top:2px solid #222;border-bottom:2px solid #222}
    .notes{padding:17px 18px 17px 0;font-size:10px;line-height:1.7;color:#606566}.notes b{display:block;color:#222;font-size:8px;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px}
    .totals{border-left:1px solid #222}.total-row{display:flex;justify-content:space-between;padding:9px 13px;border-bottom:1px solid #c8cbcc;font-size:10px}.total-row strong{font-family:'IBM Plex Mono',monospace}.grand-total{display:flex;justify-content:space-between;padding:16px 13px;background:#2f3437;color:#fff;font-size:13px}.grand-total strong{font:600 17px 'IBM Plex Mono',monospace}
    .footer{position:relative;z-index:1;background:#f1f2f2;padding:10px 38px;display:flex;justify-content:space-between;font-size:9px;color:#666}.footer strong{color:#222}
    @media print{body{background:#fff}.sheet{margin:0}.item-row.gst{grid-template-columns:45px 1fr 105px 110px 130px}}
  `;

  return `${documentStart(quote, "<link href=\"https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@300;400;600;700&display=swap\" rel=\"stylesheet\">", styles)}
    ${printToolbar('#2f3437', '#fff', '#2f3437')}
    <main class="sheet">
      <div class="watermark">STEEL</div>
      <header class="header">
        <div class="header-top">
          <div class="monogram"><div class="monogram-box">MR</div><div class="company"><h1>${escapeHtml(company.name)}</h1><p>${companyContact(company, isGST)}</p></div></div>
          <div class="quote-number"><span>Reference</span><strong>${escapeHtml(quote.quoteNumber)}</strong></div>
        </div>
        <div class="title-row"><h2>Quotation</h2><div class="type">${quoteType(quote)}</div></div>
      </header>
      <section class="details">
        <div class="detail"><label>Quoted to</label><strong>${escapeHtml(quote.customerName)}</strong><p>${escapeHtml(quote.customerPhone || 'Phone not provided')}</p></div>
        <div class="detail"><label>Issued</label><strong>${date(quote.quoteDate)}</strong></div>
        <div class="detail"><label>Valid through</label><strong>${date(quote.validUntil)}</strong></div>
      </section>
      <section class="items">
        <div class="items-head ${isGST ? 'gst' : ''}"><span>No.</span><span>Material / product</span>${isGST ? '<span>Tax</span>' : ''}<span>Rate basis</span><span>Line amount</span></div>
        ${rows}
      </section>
      <section class="closing">
        <div class="notes"><b>Notes and conditions</b>${quote.notes ? multiline(quote.notes) : 'This offer is subject to confirmation of stock and prevailing commercial terms.'}</div>
        <div class="totals">${totalsLines(quote)}</div>
      </section>
      <footer class="footer"><span>Computer-generated commercial quotation</span><span><strong>${escapeHtml(company.phone)}</strong> · ${escapeHtml(company.email)}</span></footer>
    </main>
  </body></html>`;
};

// Company 4: warm furniture catalogue with product cards instead of a conventional table.
const designCompany4 = (quote, company) => {
  const isGST = quote.invoiceType === 'gst';
  const cards = (quote.items || []).map((item, index) => `
    <article class="product-card">
      <div class="serial">${String(index + 1).padStart(2, '0')}</div>
      <div class="product-copy"><h3>${escapeHtml(item.productName)}</h3><p>${number(item.qty)} ${escapeHtml(item.unit || '')} at ${currency(item.price)} each${isGST ? ` · GST ${number(item.gstRate)}% (${currency(item.totalTax)})` : ''}</p></div>
      <div class="price">${currency(item.subtotal)}</div>
    </article>`).join('');

  const styles = `
    body{font-family:'Montserrat',Arial,sans-serif;background:#eee9e0;color:#302821;font-size:12px}
    .sheet{max-width:900px;margin:18px auto;background:#fffdf8;box-shadow:0 10px 35px rgba(80,55,30,.14);padding:0 42px 34px}
    .top-border{height:10px;margin:0 -42px;background:#704b32}
    .masthead{text-align:center;padding:31px 0 22px;border-bottom:1px solid #cdbda9}
    .ornament{font-family:'Cormorant Garamond',serif;font-size:18px;color:#b58a5b;letter-spacing:8px;margin-bottom:8px}
    .masthead h1{font-family:'Cormorant Garamond',serif;font-size:32px;line-height:1;margin:0;color:#543a29;font-weight:700}
    .masthead .tag{font-size:8px;text-transform:uppercase;letter-spacing:3px;color:#9a7655;margin:8px 0 12px}
    .masthead p{margin:0;color:#7d6c5e;font-size:9px;line-height:1.55}
    .quote-heading{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:18px;margin:25px 0 20px}.quote-heading::before,.quote-heading::after{content:'';height:1px;background:#cdbda9}.quote-heading h2{font-family:'Cormorant Garamond',serif;font-size:30px;font-style:italic;font-weight:600;margin:0;color:#704b32}
    .intro-card{display:grid;grid-template-columns:1.4fr .8fr;background:#f3ece2;margin-bottom:24px;border-left:5px solid #b58a5b}
    .client{padding:19px 22px}.client label,.meta label{display:block;font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:#9a7655;font-weight:700;margin-bottom:6px}.client strong{font-family:'Cormorant Garamond',serif;font-size:21px;color:#543a29}.client p{margin:3px 0 0;color:#7d6c5e}
    .meta{padding:15px 18px;border-left:1px solid #d7c9b8;background:#eee3d5}.meta-row{margin-bottom:9px}.meta-row:last-child{margin-bottom:0}.meta b{font-size:11px;color:#543a29}
    .products-title{font-size:8px;letter-spacing:2px;text-transform:uppercase;color:#9a7655;font-weight:700;margin-bottom:9px}
    .product-card{display:grid;grid-template-columns:50px 1fr 145px;align-items:center;border-top:1px solid #d7c9b8;padding:14px 5px;break-inside:avoid;page-break-inside:avoid}.product-card:last-child{border-bottom:1px solid #d7c9b8}.serial{font-family:'Cormorant Garamond',serif;font-size:23px;color:#b58a5b}.product-copy h3{font-family:'Cormorant Garamond',serif;font-size:18px;margin:0 0 3px;color:#543a29}.product-copy p{margin:0;color:#8a796b;font-size:9px}.price{text-align:right;font-weight:700;color:#704b32;font-size:13px}
    .lower{display:grid;grid-template-columns:1fr 285px;gap:30px;margin-top:25px;align-items:start;break-inside:avoid;page-break-inside:avoid}.message{font-family:'Cormorant Garamond',serif;font-size:15px;line-height:1.5;color:#6f5b4b;font-style:italic;padding:7px 12px 7px 0}.message b{display:block;font-family:'Montserrat',sans-serif;font-style:normal;font-size:8px;text-transform:uppercase;letter-spacing:1.5px;color:#9a7655;margin-bottom:8px}
    .summary{border:1px solid #cdbda9;background:#fff}.total-row{display:flex;justify-content:space-between;padding:9px 13px;color:#7d6c5e;font-size:10px;border-bottom:1px solid #e4d9cb}.total-row strong{color:#543a29}.grand-total{background:#704b32;color:#fff;padding:15px 13px;display:flex;justify-content:space-between;font-family:'Cormorant Garamond',serif;font-size:17px}.grand-total strong{font-size:19px}
    .signature{display:flex;justify-content:space-between;align-items:flex-end;margin-top:34px;padding-top:16px;border-top:1px solid #cdbda9;color:#9a8979;font-size:8px}.signature-area{text-align:center;color:#704b32;text-transform:uppercase;letter-spacing:1px}.signature-line{width:155px;border-top:1px solid #704b32;margin-bottom:5px}
    @media print{body{background:#fff}.sheet{margin:0;box-shadow:none}}
  `;

  return `${documentStart(quote, "<link href=\"https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,600&family=Montserrat:wght@400;600;700&display=swap\" rel=\"stylesheet\">", styles)}
    ${printToolbar('#704b32', '#b58a5b')}
    <main class="sheet">
      <div class="top-border"></div>
      <header class="masthead">
        <div class="ornament">◆ ◇ ◆</div>
        <h1>${escapeHtml(company.name)}</h1>
        <div class="tag">Furniture · Interiors · Comfort</div>
        <p>${companyContact(company, isGST)}</p>
      </header>
      <div class="quote-heading"><h2>Quotation</h2></div>
      <section class="intro-card">
        <div class="client"><label>Prepared especially for</label><strong>${escapeHtml(quote.customerName)}</strong><p>${escapeHtml(quote.customerPhone || 'Phone not provided')}</p></div>
        <div class="meta">
          <div class="meta-row"><label>Quotation</label><b>${escapeHtml(quote.quoteNumber)}</b></div>
          <div class="meta-row"><label>Dated</label><b>${date(quote.quoteDate)}</b></div>
          <div class="meta-row"><label>Valid until</label><b>${date(quote.validUntil)}</b></div>
          <div class="meta-row"><label>Category</label><b>${quoteType(quote)}</b></div>
        </div>
      </section>
      <div class="products-title">Selected products</div>
      <section>${cards}</section>
      <section class="lower">
        <div class="message"><b>Notes & terms</b>${quote.notes ? multiline(quote.notes) : 'We appreciate the opportunity to furnish your space. Product availability and delivery dates will be confirmed when the order is placed.'}</div>
        <div class="summary">${totalsLines(quote)}</div>
      </section>
      <footer class="signature"><span>This is a computer-generated quotation valid through ${date(quote.validUntil)}.</span><div class="signature-area"><div class="signature-line"></div>Authorised signatory</div></footer>
    </main>
  </body></html>`;
};

const DESIGNERS = {
  company_1: designCompany1,
  company_2: designCompany2,
  company_3: designCompany3,
  company_4: designCompany4,
};

export const generateQuotationHTML = (quote, company) => {
  const designer = DESIGNERS[quote.companyId] || designCompany1;
  return designer(quote, company);
};

export const printQuotation = (quote, company) => {
  const win = window.open('', '_blank', 'width=960,height=750');
  if (!win) {
    toast.error('Popup blocked. Please allow popups.');
    return;
  }

  win.document.write(generateQuotationHTML(quote, company));
  win.document.close();
};
