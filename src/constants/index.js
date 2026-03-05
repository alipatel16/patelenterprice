export const COMPANIES = {
  company_1: {
    id: "company_1",
    code: "EL1",
    name: "Patel Electronics And Furniture",
    address: "1st Floor Patel House near Petrol Pump Mandal Road Viramgam",
    city: "Ahmedabad",
    state: "Gujarat",
    pincode: "382150",
    phone: "+91-7862819198",
    email: "info@patelelectronicsandfurniture.com",
    gstNumber: "24AAVFP7956R1ZW",
    website: "https://patelelectronicsandfurniture.com/",
    logo: null,
    storeType: "electronics",
  },
  company_2: {
    id: "company_2",
    code: "EL2",
    name: "Patel Engineering Works",
    address: "Opposite Mataji Temple Bhutiyajin Compound Mandal Road Viramgam",
    city: "Ahmedabad",
    state: "Gujarat",
    pincode: "382150",
    phone: "+91-8154884077",
    email: "info@patelelectronicsandfurniture.com",
    gstNumber: "24ABCPP2196D1ZV",
    website: "https://patelelectronicsandfurniture.com/",
    logo: null,
    storeType: "electronics",
  },
  company_3: {
    id: "company_3",
    code: "FN1",
    name: "M-Raj Steel Syndicate",
    address: "Opposite Dinesh Farsal Mandal Road Viramgam",
    city: "Ahmedabad",
    state: "Gujarat",
    pincode: "382150",
    phone: "+91-8200152937",
    email: "info@patelelectronicsandfurniture.com",
    gstNumber: "24ACCPP4650M1ZF",
    website: "https://patelelectronicsandfurniture.com/",
    logo: null,
    storeType: "furniture",
  },
  company_4: {
    id: "company_4",
    code: "FN2",
    name: "Patel Furniture",
    address: "Above SBI Bank Opp. APMC Market Seva Sadan Road",
    city: "Viramgam",
    state: "Gujarat",
    pincode: "382150",
    phone: "+91-7600946872",
    email: "info@patelelectronicsandfurniture.com",
    gstNumber: "24CAIPP6969F1Z8",
    website: "https://patelelectronicsandfurniture.com/",
    logo: null,
    storeType: "furniture",
  }
};

export const ELECTRONICS_COMPANIES = Object.values(COMPANIES).filter(c => c.storeType === 'electronics');
export const FURNITURE_COMPANIES = Object.values(COMPANIES).filter(c => c.storeType === 'furniture');

export const getCompaniesByStore = (storeType) => {
  return Object.values(COMPANIES).filter(c => c.storeType === storeType);
};

export const GST_SLABS = [0, 5, 12, 18, 28];

export const PAYMENT_TYPES = {
  FULL: 'full_payment',
  PENDING: 'pending_payment',
  EMI: 'emi',
  FINANCE: 'finance',
  BANK_TRANSFER: 'bank_transfer',
};

export const PAYMENT_LABELS = {
  full_payment: 'Full Payment',
  pending_payment: 'Pending / Pay at Delivery',
  emi: 'EMI',
  finance: 'Finance',
  bank_transfer: 'Bank Transfer',
};

export const CUSTOMER_TYPES = ['wholesale', 'retail'];
export const CUSTOMER_CATEGORIES = ['firm', 'individual'];

export const INVOICE_TYPES = {
  GST: 'gst',
  NON_GST: 'non_gst',
};

export const USER_ROLES = {
  ADMIN: 'admin',
  EMPLOYEE: 'employee',
};

export const STORE_TYPES = {
  ELECTRONICS: 'electronics',
  FURNITURE: 'furniture',
};
