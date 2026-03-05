// GST Calculation: price is INCLUSIVE of GST
export const calculateGST = (inclusiveAmount, gstRate) => {
  if (!gstRate || gstRate === 0) {
    return { baseAmount: inclusiveAmount, cgst: 0, sgst: 0, igst: 0, totalTax: 0, totalAmount: inclusiveAmount };
  }
  const baseAmount = (inclusiveAmount * 100) / (100 + gstRate);
  const totalTax = inclusiveAmount - baseAmount;
  const halfTax = totalTax / 2;
  return {
    baseAmount: parseFloat(baseAmount.toFixed(2)),
    cgst: parseFloat(halfTax.toFixed(2)),
    sgst: parseFloat(halfTax.toFixed(2)),
    igst: 0,
    totalTax: parseFloat(totalTax.toFixed(2)),
    totalAmount: parseFloat(inclusiveAmount.toFixed(2)),
    gstRate,
  };
};

export const formatCurrency = (amount) => {
  if (amount === undefined || amount === null) return '₹0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

export const generateInvoiceNumber = (prefix, count) => {
  const padded = String(count + 1).padStart(4, '0');
  const year = new Date().getFullYear();
  return `${prefix}/${year}/${padded}`;
};

export const getPaymentStatusColor = (status) => {
  const map = {
    full_payment: 'success',
    pending_payment: 'error',
    emi: 'warning',
    finance: 'info',
    bank_transfer: 'info',
  };
  return map[status] || 'default';
};

export const debounce = (fn, delay) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
};

export const formatPhone = (phone) => {
  if (!phone) return '-';
  return phone.startsWith('+91') ? phone : `+91-${phone}`;
};
