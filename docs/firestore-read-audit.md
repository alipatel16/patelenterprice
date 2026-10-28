# Firestore access dispositions

Generated from the AST census after the refactor. Ordinary pages and lookups delegate to the shared bounded/readiness-aware service; custom report work and administrative preview/migration are explicit. No missing-index fallback or collection/month scan remains in an ordinary screen. See `firestore-rollout.md` for behavioral verification and production limits.

| File | Access disposition |
| --- | --- |
| `src/components/AdminDataPreview.jsx` | bounded-shared-query |
| `src/components/FirestoreAutocomplete.jsx` | bounded-shared-query |
| `src/contexts/AuthContext.js` | known-id |
| `src/data/dashboard.js` | aggregate |
| `src/data/query.js` | aggregate, bounded-shared-query, known-id |
| `src/data/reportJobs.js` | bounded-page, bounded-shared-query, explicit-atomic-report-job, known-id |
| `src/data/reports.js` | aggregate, bounded-shared-query |
| `src/data/writes.js` | atomic-source-adapter |
| `src/hooks/useFirestore.js` | bounded-shared-query, known-id |
| `src/hooks/useSalesQueue.js` | aggregate |
| `src/pages/Complaints/BrandHierarchyForm.js` | known-id |
| `src/pages/Complaints/BrandHierarchyList.js` | bounded-shared-query, known-id |
| `src/pages/Complaints/ComplaintDetail.js` | known-id |
| `src/pages/Complaints/ComplaintList.js` | aggregate, bounded-shared-query |
| `src/pages/Complaints/CreateComplaint.js` | aggregate, known-id |
| `src/pages/Customers/CustomerList.js` | bounded-shared-query |
| `src/pages/Employees/AttendanceTracker.js` | bounded-shared-query |
| `src/pages/Employees/ChecklistAdminView.js` | bounded-shared-query |
| `src/pages/Employees/ChecklistTemplateForm.js` | known-id |
| `src/pages/Employees/ChecklistTemplateList.js` | bounded-shared-query |
| `src/pages/Employees/EmployeeDashboard.js` | bounded-shared-query, known-id |
| `src/pages/Employees/EmployeeList.js` | bounded-shared-query |
| `src/pages/Employees/EmployeeProfile.js` | known-id |
| `src/pages/Employees/PenaltySettings.js` | known-id |
| `src/pages/Employees/SalaryReport.js` | bounded-shared-query, known-id |
| `src/pages/Employees/employeeData.js` | known-id |
| `src/pages/Gifts/CreateGiftInvoice.js` | aggregate, known-id |
| `src/pages/Gifts/GiftInvoiceDetail.js` | known-id |
| `src/pages/Gifts/GiftInvoiceList.js` | bounded-shared-query |
| `src/pages/Gifts/GiftSetForm.js` | known-id |
| `src/pages/Gifts/GiftSetList.js` | bounded-shared-query |
| `src/pages/Inventory/Inventory.js` | aggregate, bounded-shared-query |
| `src/pages/Products/ProductList.js` | bounded-shared-query |
| `src/pages/Purchase/PurchaseList.js` | bounded-shared-query, known-id |
| `src/pages/Quotations/CreateQuotation.js` | aggregate, known-id |
| `src/pages/Quotations/QuotationDetail.js` | known-id |
| `src/pages/Quotations/QuotationsList.js` | bounded-shared-query |
| `src/pages/Sales/CreateSale.js` | aggregate, known-id |
| `src/pages/Sales/DeliveryTracking.js` | bounded-shared-query |
| `src/pages/Sales/EmiDues.js` | bounded-shared-query |
| `src/pages/Sales/EmiList.js` | bounded-shared-query |
| `src/pages/Sales/ExchangeTracking.js` | bounded-shared-query |
| `src/pages/Sales/ReportPeriodView.js` | bounded-shared-query, known-id |
| `src/pages/Sales/SaleDetail.js` | known-id |
| `src/pages/Sales/SalesList.js` | bounded-shared-query, known-id |
| `src/utils/inventoryCache.js` | bounded-page |
| `src/utils/inventoryUtils.js` | bounded-page |
| `src/utils/knownDocument.js` | known-id |

Selectors use FirestoreAutocomplete (2 normalized characters, 300 ms, at most 15 options). Inventory mapping queries are limited to two to detect duplicates. Known snapshots bridge the shared cache to existing detail/print consumers. The adapter transaction and explicit report-job transaction are the only direct write transports; source mutations otherwise use their public wrappers.
