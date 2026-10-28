# Task 5: EMI dues, delivery payments, exchange queues

Status: implementation complete; focused and full synthetic suites pass. The latest
production build is blocked by another worker's in-progress AttendanceTracker.js
syntax error (`await`, line 346). Root was notified; no unowned file was edited.

## Owned deliverables

- Sales/EmiList.js: server pages of 15, active/all EMI filters, common search,
  readiness enforcement, independent complete count and monetary aggregates.
- Sales/EmiDues.js: direct emiDues pages ordered by due date, active tab only;
  overdue includes all prior dates, today, upcoming seven days, and Needs Review.
  Each tab has full aggregates. Total Due aggregates all outstanding installments,
  including dates beyond seven days. Unknown monetary values are explicitly marked
  and review counts explain that monetary totals include known amounts only.
- Sales/DeliveryTracking.js: canonical server pending/delivered filters; delivered
  payment-pending tab; searchable delivered history and persistent shared search
  across tab changes. Delivery acknowledgement changes delivery fields alone.
- Sales/ExchangeTracking.js: server pages and canonical exchangeState filters on
  both tabs, common search, no 200-record cap or client post-limit filter.
- Sales/SaleDetail.js: direct known-ID fetch, no legacy write-on-read migration,
  cached customer reuse, acknowledged sale state after transaction success,
  stable receipt operation identity through a failed acknowledgement/retry.
  Existing invoice/receipt printing and payment history remain available.
- data/payments.js: recordEmiPayment, recordSalePayment, rescheduleEmi return
  `{id,...acknowledgedData}`. Actions derive from fresh mutateRecord state; payment
  operation IDs are mandatory; reschedule accepts an optional stable sixth ID
  (the UI supplies it). No financial inputs come from a component array/cache.
- data/salesQueues.js + hooks/useSalesQueue.js: query filters, India calendar day,
  midnight/focus/visibility refresh, debounced complete aggregates and invalidation.
- data/paymentTestStore.js and focused tests: deterministic optimistic transaction
  simulator executes the real write adapter, checks read-before-write ordering,
  and retries conflicts against fresh state.

## Financial behavior

Concurrent receipts retain both histories, update the exact due record, and replay
once per operation ID. Money uses cents and a fresh balance rejects overpayment.
EMI mismatch histories reject with data-access/reconciliation-required and are
never silently rebuilt. Legacy receipt-derived installment paid amounts work when
paidAmount is absent, including final paid status with other receipt-only rows.
Non-EMI existing collected baselines remain in totalPaidAmount when later receipts
are appended. Full-payment legacy invoices with stored zero remain fully paid.
Delivery completion and later collections are independent; final collection removes
only outstanding state and retains delivered history, delivery date, and search.

## Test-first and verification evidence

Observed RED: initially absent payment API (seven behavioral failures with a stub),
then all seven passed with the implementation. Queue filter/day stubs failed all
four queue/date tests, then passed. Additional observed RED/GREEN caught two legacy
receipt-only cases: adding a receipt lost the old paid scalar basis; finalization
missed another fully-paid receipt-only installment. Both regressions now pass.

Focused coverage: 22 tests across payments.test.js, salesQueues.test.js,
useSalesQueue.test.js, and Sales/SalesQueues.test.js. It exercises:

- two-year-old overdue dues and complete 36-match/3600 aggregates with only 15 rows;
- 224 pending exchanges across 225 source records, beyond the retired cap;
- concurrent partial/final payments, transaction retries, operation replay,
  rescheduling against a simultaneous payment and one reschedule history entry;
- delivery without collection, another-word/phone-suffix lookup the next day,
  partial/final collection, delivered history retention;
- only active tabs mount/query; all filters precede shared server paging;
- India midnight, focus/resume and visibility refresh; aggregate debounce,
  short searches, invalidation and late-response suppression;
- legacy detail opens without migration reads/writes; a failed acknowledgement
  retains the receipt ID for retry, and payment success reuses loaded customer data.

Commands:

- `CI=true npm test -- --watchAll=false --watchman=false --runInBand`
  Latest full run: **25 suites / 134 tests passed** (shared workspace at run time).
- Focused command with the four files: **4 suites / 22 tests passed**.
- Babel parsing of all five owned screens: passed.
- `git diff --check` for the five owned screens: passed.
- `npm run build`: initial blockers were concurrent Inventory syntax, then inline
  nonexistent react-hooks rule directives in CreateComplaint/CreateSale. Latest
  build reaches the concurrent AttendanceTracker.js syntax failure at line 346.
  First unprivileged build also encountered shared node_modules cache permissions;
  subsequent authorized build runs could access that cache.

## Coordination and limits

Root added exchangeItem to the shared search token schema with RED/GREEN coverage,
so preserved item search uses the same readiness/migration contract as other terms.
Requested optional due display metadata (emiMonths, dueDateChangeCount) from the
projection owner; absent metadata displays installment number without a denominator
and omits an unavailable reschedule badge. No extra source reads are introduced.

No production/private data, dependency installation, network/database mutation,
deployment, or changes to another worker's owned paths. Synthetic tests do not
replace a real Firestore staging/index rollout; readyCollections gates the screens
until the separately reviewed migration and indexes are ready.
