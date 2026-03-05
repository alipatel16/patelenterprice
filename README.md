# Patel Enterprise — Showroom Management System

A full-featured React web app for managing **Electronics** and **Furniture** showrooms with separate Firebase backends.

---

## Tech Stack

- **React 18** (CRA)
- **Material UI v5** — fully responsive, mobile-first
- **Firebase v10** — Dual Firestore databases (electronics + furniture)
- **React Router v6** — SPA routing
- **Recharts** — Dashboard analytics
- **DM Sans** — Clean, modern font

---

## Features

### 🔐 Auth
- Store-type selector at login/register (Electronics or Furniture)
- Role selection: **Admin** or **Employee**
- Each store has its own Firebase project — completely isolated data

### 📊 Dashboard
- Daily / Monthly / Custom date range stats
- Total Sales, Today's Sales, Pending Payments
- Customer, Product & Purchase counts
- 7-day sales bar chart
- Quick action buttons

### 👥 Customers
- Create / Edit / Delete customers
- Types: Wholesale, Retail
- Categories: Firm, Individual
- GSTIN (firms) or Aadhaar (individuals)
- Server-side paginated list with search + filters

### 📦 Products
- Full product master: name, maker, description, HSN code, price, GST slab, unit
- Server-side pagination + search

### 🛒 Purchases
- Record purchases from suppliers
- Multiple line items (linked to product master)
- Auto-updates inventory on save

### 📋 Inventory
- Real-time stock levels (purchases - sales)
- Out of Stock / Low Stock indicators
- Stock level progress bars

### 💰 Sales
- **GST Invoice** or **Non-GST Invoice**
- GST is always **inclusive** in price — automatically segregated (CGST + SGST)
- Select firm (company), customer, salesperson
- Multiple items with live stock validation
- Exchange item support with "received" checkbox
- Payment types:
  - ✅ Full Payment
  - 🔴 Pending / Pay at Delivery
  - 📅 EMI (down payment + monthly amount + start date)
  - 🏦 Finance / Bank Transfer (down payment + financer + ref no.)
- Full invoice summary with GST breakdown
- Filter by payment type / invoice type
- Server-side pagination

---

## Setup

### 1. Install dependencies
```bash
cd showroom-app
npm install
```

### 2. Firebase Setup

**Electronics Firebase project** (`patel-enterprise-prod`):
- Enable Firestore
- Enable Firebase Auth (Email/Password)

**Furniture Firebase project** (`patelfurniture-prod`):
- Enable Firestore  
- Enable Firebase Auth (Email/Password)

### 3. Firestore Indexes

You'll need composite indexes for efficient queries. Run the app and Firebase will prompt you to create them, or add these in the Firestore console:

**`sales` collection:**
- `paymentType` ASC + `createdAt` DESC
- `invoiceType` ASC + `createdAt` DESC

**`customers` collection:**
- `customerType` ASC + `name` ASC
- `category` ASC + `name` ASC

### 4. Start the app
```bash
npm start
```

---

## Firestore Collections

### `users`
```
{ uid, name, email, role, storeType, companyId, createdAt }
```

### `customers`
```
{ name, phone, email, address, city, state, pincode, customerType, category, gstin, aadhaar, createdAt }
```

### `products`
```
{ name, maker, description, hsnCode, price, gstRate, category, unit, createdAt }
```

### `purchases`
```
{ supplierName, supplierGst, invoiceNumber, invoiceDate, items[], grandTotal, notes, createdAt }
```

### `inventory`
```
{ productId, productName, stock, purchasedQty, soldQty, createdAt, updatedAt }
```

### `sales`
```
{
  invoiceNumber, invoiceType, companyId, companyName,
  customerId, customerName, customerPhone,
  salesperson, saleDate,
  items[{ productId, productName, qty, price, gstRate, subtotal, baseAmount, cgst, sgst, totalTax }],
  subtotal, totalTax, grandTotal,
  paymentType, hasExchange, exchangeItem, exchangeValue, exchangeReceived,
  downPayment, emiAmount, emiStartDate, financerName, paymentRef, balanceDue,
  notes, createdAt
}
```

---

## Companies

| Code | Name | Store |
|------|------|-------|
| EL1 | Patel Electronics And Furniture | Electronics |
| EL2 | Patel Engineering Works | Electronics |
| FN1 | M-Raj Steel Syndicate | Furniture |
| FN2 | Patel Furniture | Furniture |

---

## GST Logic

Price is always **inclusive of GST**. Example:

- Item price: ₹5,000 (includes 18% GST)
- Base amount: ₹5,000 × 100 / 118 = ₹4,237.29
- CGST (9%): ₹381.36
- SGST (9%): ₹381.36
- Total: ₹5,000 ✓

---

## Security Rules (Recommended)

Add these to both Firebase projects:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```
