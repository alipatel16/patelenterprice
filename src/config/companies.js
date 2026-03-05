export const COMPANIES = {
  ELECTRONICS_1: {
    id: "electronics_1",
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
    category: "electronics"
  },
  ELECTRONICS_2: {
    id: "electronics_2",
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
    category: "electronics"
  },
  FURNITURE_1: {
    id: "furniture_1",
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
    category: "furniture"
  },
  FURNITURE_2: {
    id: "furniture_2",
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
    category: "furniture"
  }
};

export const COMPANIES_LIST = Object.values(COMPANIES);

export const getCompaniesByCategory = (category) =>
  COMPANIES_LIST.filter((c) => c.category === category);

export const getCompanyById = (id) =>
  COMPANIES_LIST.find((c) => c.id === id);
