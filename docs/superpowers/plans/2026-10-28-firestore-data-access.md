# Project-wide Firestore Data Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace bulk/month-scoped reads throughout the app with complete indexed search, cursor pages, aggregates and consistent EMI/report projections.

**Architecture:** Keep existing source collections, introduce shared query/cache/hooks and transactional write helpers, and add queryable unpaid EMI and reporting/employee summaries. Versioned migration/readiness gates prevent silently incomplete search. Production changes are separate from local implementation.

**Tech Stack:** Existing React 18 / MUI 5 / Firebase 10.14.1 / CRA/Jest; no paid service or dependency upgrade required.

**Spec:** `docs/superpowers/specs/2026-10-28-firestore-data-access-design.md` (approved in chat).

## Global Constraints

- Keep Spark as a firm constraint. No paid backend, external search service or scheduled Cloud Function.
- Default list and search page size: **15**, with existing compact views allowed to use 10. Never fetch an unbounded result set or month in an ordinary screen.
- Two normalized characters, **300 ms** debounce, matching any name-word prefix and phone prefix/suffix. Filters apply before the limit. Search does not require a selected month.
- Preserve source records, identifiers, payment histories, authorization behavior, routes and invoice printing. No production migration, rule/index deployment, merge to original checkout, push or release during implementation.
- Dashboard defaults to Today and uses only server aggregation after explicit Load Dashboard Stats. Preserve its `createdAt` date basis and use India day boundaries.
- Source and derived writes are atomic/retry-safe, and payment operations derive from current transaction data. Never silently repair financial inconsistencies in migration.
- All tests/fixtures use synthetic data. Real backups, credentials and customer data remain outside Git.

## Review Focus

1. A response arriving after search deletion/store change must never expose the old results — Task 1 race tests.
2. A historical unpaid EMI and a delivered invoice awaiting payment must be found despite unrelated newer records — Task 5 tests.
3. Concurrent/retried payments and sale date/edit/delete operations must preserve histories and summaries — Task 2/5 transaction tests.
4. Missing legacy fields and an interrupted migration must display readiness errors, not incomplete results or broader reads — Task 7 migration tests.
5. Complete report totals/rankings and payroll values must not become page subtotals; interrupted custom jobs stay resumable and clearly incomplete — Task 6 tests.

---

### Task 1: Shared bounded query, search and cache foundation

**Files:** Create `src/data/search.js`, `src/data/query.js`, `src/hooks/usePagedCollection.js`, `src/components/QueryStatus.jsx`, related `.test.js` files. Modify `src/components/FirestoreAutocomplete.jsx`, `src/utils/normalizeDoc.js`, `src/utils/lookupCache.js`, `src/utils/inventoryCache.js`, `src/contexts/AuthContext.js`, `src/hooks/useFirestore.js`. Remove unused Timeline imports in `src/pages/Complaints/ComplaintDetail.js` to unblock the existing build.

**Interfaces produced:**
- `buildSearchTokens(collectionName, data): string[]`, `withSearchFields(collectionName, data): object`, `normalizeSearch(raw): string`, `searchState(raw): 'browse'|'short'|'search'`.
- `fetchPage(db, collectionName, { search='', filters=[], sort=[['createdAt','desc']], cursor=null, pageSize=15, includeTotal=true, requireReady=false }): Promise<{rows,total,lastDoc,hasNext}>`. Filters are serializable `[field,operator,value]` triples; sort is `[field,direction]` pairs; rows include `id`. `total` is null if not requested. Search always requires readiness, read from `appSettings/dataAccessV2` with `{version:2,readyCollections:[...]}`.
- `fetchAggregate(db, collectionName, {filters=[],aggregates={count:{op:'count'}},requireReady=false}): Promise<object>`; sum descriptors are `{op:'sum',field:'grandTotal'}`. No page limit.
- `getKnownDocument(db, collectionName, id, {ttlMs=60000}={}): Promise<object|null>`; `invalidateCollections(db,names)`, `subscribeInvalidation(db,callback): unsubscribe`, `setDataAccessScope(db,scopeKey)`.
- `usePagedCollection(db, collectionName, options): {rows,total,loading,error,page,hasNext,setPage,next,previous,refresh}`. `options` uses the query interface and accepts raw `search`; the hook debounces, resets cursors and rejects stale work. `setPage` only accepts current/visited/adjacent pages with known cursors. Export `QueryStatus` to render errors/not-ready/short-search hints. Document exact signatures for later workers.

- [ ] Write tests first: `expect(buildSearchTokens('customers',{name:'Ali Patel',phone:'+91 9876543210'})).toEqual(expect.arrayContaining(['pa','98','3210']))`; no arbitrary middle-name substring promised. Include Unicode, multi-word prefixes, normalized phone forms and token-size validation.
- [ ] Write cache/pagination/hook tests proving 0/1 chars cause no search transport call, 2 chars wait 300 ms, old responses are ignored immediately, filters precede limits, page revisits cache, missing readiness errors, and two stores/users with identical IDs never share results.
- [ ] Run `CI=true npm test -- --watchAll=false --runInBand src/data src/hooks src/components/FirestoreAutocomplete.test.js`; Expected: RED on missing functions/behavior.
- [ ] Implement the exact interfaces, 60-second bounded cache/request deduplication, readiness gate, scoped invalidation, cached known-ID reads, safe lookup limits and dropdown cap. Preserve controlled edit selections. Deprecate unbounded generic `getAll` in favor of explicit administrative paging.
- [ ] Run the same focused tests; Expected: PASS. Run full suite and local build; report pre-existing warnings separately.
- [ ] Commit the task and append test evidence to the ledger.

### Task 2: Transactional source writes and supporting projections

**Files:** Create `src/data/projections.js`, `src/data/writes.js`, `src/data/employeeSummaries.js` and their tests. These modules own all derived record shape; later tasks must consume them rather than invent parallel formats.

**Interfaces consumed:** Task 1 token generation and invalidation.

**Interfaces produced:** `addRecord(collectionRef,payload): Promise<DocumentReference>`, `updateRecord(documentRef,payload): Promise<void>`, `setRecord(documentRef,payload,options): Promise<void>`, `deleteRecord(documentRef): Promise<void>` — compatible call shapes with Firebase writes. `mutateRecord(documentRef,mutator,{operationId}={}): Promise<object>` invokes `mutator(current)` inside a transaction. Helpers maintain `_writeRevision`, search tokens, sale projection state and related summaries. Export pure `deriveSaleState(sale)`, `buildEmiDueDocuments(saleId,sale)`, `buildReportContributions(saleId,sale)`, `buildEmployeeSummaryChanges(collection,id,oldData,newData)` and document derived collection formats.

Projection collections: `emiDues` (unpaid installments only); `reportProductPeriods`, `reportEmployeePeriods` (daily/monthly/lifetime rows with `periodType`, `periodKey`, dimension identity, quantity/revenue/count fields and search tokens); `attendanceMonths` (user/month, complete payroll-relevant day values); `checklistDays` (user/day counts); `reportState/version` (revision invalidating custom report jobs); `_deletionOps` (revision-compatible delete markers). Source sale fields include `hasPendingEmi`, `emiOutstandingAmount`, `nextEmiDueDate`, `emiRemainingInstallmentCount`, `deliveryState`, `exchangeState` and `_writeRevision`. Detailed field/interface documentation is part of this task.

- [ ] Write tests first: two installments with paid amounts produce only the unpaid queue documents and correct sum/earliest date; fully paid non-EMI sales retain paid meaning; source financial values are never silently rewritten. Include malformed dates/amounts and transaction-size rejection.
- [ ] Write contribution-diff tests for create/edit/date-change/delete, two products, legacy/unmatched salespeople, attendance day changes and checklist counts; increments reverse correctly and zero rows do not become negative from valid histories.
- [ ] Write transaction tests with a deterministic in-memory transaction driver exercising concurrent revision retries and idempotent operation IDs; prove `history.length` and total money contain both payments, rather than asserting mocks.
- [ ] Run `CI=true npm test -- --watchAll=false --runInBand src/data`; Expected: new tests RED.
- [ ] Implement pure derivation and atomic adapters. All reads precede writes, deterministic projection IDs are used, and shared formats are documented in `docs/firestore-data-model.md`. Leave ambiguous historical financial records for explicit reconciliation. Payment-specific mutators follow in Task 5.
- [ ] Run focused and complete suites; Expected: PASS. Commit and ledger evidence.

### Task 3: Business lists, complaints and all creation/edit lookups

**Files:** Modify `src/pages/Customers/CustomerList.js`, `src/pages/Products/ProductList.js`, `src/pages/Purchase/PurchaseList.js`, `src/pages/Inventory/Inventory.js`, `src/pages/Sales/SalesList.js`, `src/pages/Quotations/QuotationsList.js`, `src/pages/Gifts/GiftInvoiceList.js`, `src/pages/Gifts/GiftSetList.js`, `src/pages/Complaints/BrandHierarchyList.js`, `src/pages/Complaints/ComplaintList.js`, `src/components/MonthSearchBar.jsx`; update writes/lookups in their create/detail/form companions, `src/pages/Sales/CreateSale.js` and `src/utils/inventoryUtils.js` without changing payment actions owned by Task 5. Add focused tests under each affected domain.

**Interfaces consumed:** Task 1 paged hook/autocomplete/status and Task 2 compatible write adapters. Prefer imports such as `addRecord as addDoc` from the adapter when existing call bodies can remain unchanged.

- [ ] Write query/UI tests first proving a searched record beyond the first date-filtered page is returned, one-character input performs no search, date/dropdown predicates are preserved, and 400 month records never enter component state as a bulk result. Include complaints urgency predicates and gifts/brand searches beyond the current page.
- [ ] Run focused tests; Expected: RED under current bulk/current-page implementations.
- [ ] Replace each read branch with the shared hook. Remove month-required search disabling and bulk month arrays. Reuse existing filters/layouts/detail actions; count labels are aggregates or explicitly page-scoped. Put complaint urgency date predicates in the query and use a normalized sort date.
- [ ] Replace all full employee/brand/gift-set/customer/product lookups with on-demand selection or known-ID fetches, including editing/printing. Route writes through adapters so inline-created records are searchable and projections stay current. Bound inventory-by-product queries and report duplicate product mappings rather than choosing arbitrarily.
- [ ] Run focused tests, full suite and build; Expected: PASS. Commit and ledger evidence with per-file read dispositions.

### Task 4: Today-first aggregate dashboard

**Files:** Modify `src/pages/Dashboard/Dashboard.js`; create `src/data/dashboard.js` and tests.

**Interface produced:** `loadDashboard(db,{range,start,end,now}): Promise<{stats,chartData,refreshedAt}>` uses Task 1 aggregates, preserves existing statistic/chart keys and `createdAt` semantics, and computes Asia/Kolkata bounds.

- [ ] Write tests first with synthetic sales spanning local midnight/month boundaries: default range is daily, no query before Load, no document read transport during load, and aggregate totals equal independent fixture totals. Settled pending-type invoices are excluded from current pending counts. Separate aggregates where missing fields would otherwise change inclusion.
- [ ] Run `CI=true npm test -- --watchAll=false --runInBand src/data/dashboard.test.js src/pages/Dashboard`; Expected: RED.
- [ ] Implement manual loading, Today default, seven daily aggregate chart buckets with reuse, store/date caching/invalidation and last-refresh label. Remove sales `getDocs` imports and document-count summing loops.
- [ ] Run focused/full tests; Expected: PASS. Commit and ledger evidence.

### Task 5: Complete EMI dues, later delivery payments and exchange queues

**Files:** Modify `src/pages/Sales/EmiList.js`, `src/pages/Sales/EmiDues.js`, `src/pages/Sales/DeliveryTracking.js`, `src/pages/Sales/ExchangeTracking.js`, `src/pages/Sales/SaleDetail.js`; create `src/data/payments.js` and tests.

**Interfaces consumed:** Task 1 hook/aggregates and Task 2 `mutateRecord`/derived shapes. **Produced:** `recordEmiPayment(db,saleId,installmentNumber,payment,operationId)`, `recordSalePayment(db,saleId,payment,operationId)`, `rescheduleEmi(db,saleId,installmentNumber,newDate,reason)`; these return the acknowledged current sale, deriving from transaction state rather than component arrays.

- [ ] Write tests first: a two-year-old overdue installment is returned alongside newer invoices; counts/sums remain complete when more than 15 dues match; partial/final payment and rescheduling update the exact due record and invoice summary; retrying an operation adds no duplicate receipt; concurrent entries retain both histories.
- [ ] Write delivery workflow tests: mark delivered without payment, search by another name word/phone suffix the next day, record partial/final payment, remove only from outstanding queue and keep delivered history. Exchange tests exceed the old 200-record cap without truncation.
- [ ] Run focused sales/payment tests; Expected: RED.
- [ ] Use server pages for EMI active/all filters and direct `emiDues` date tabs. Only active tab rows load; full totals aggregate. Use India day helpers that update at midnight/resume. Add delivered-payment-pending tab and shared search to delivered history; preserve payment/delivery independence. Remove index fallbacks, capped client filtering and detail write-on-read migration.
- [ ] Integrate transactional payment actions and reuse unchanged customer data; update local state/cache only after acknowledgement. Use fresh operation IDs per submitted payment with stable retry identity.
- [ ] Run focused/full tests and build; Expected: PASS. Commit and ledger evidence.

### Task 6: Employees, calendar/payroll views and scalable reports

**Files:** Modify every file in `src/pages/Employees/` that reads Firestore, plus `src/pages/Sales/EmployeeSalesReport.js`, `src/pages/Sales/ProductMovementReport.js`; create `src/data/reports.js`, `src/data/reportJobs.js` and tests.

**Interfaces consumed:** shared query/write helpers and the Task 2 documented summary shapes. **Produced:** paged period-report queries, `generateCustomReport(db, options, {onProgress,budget,maxPageSize})` with persisted checkpoints/as-of revision and explicit complete/incomplete state.

- [ ] Write tests first: employee search finds records beyond page one; monthly calendars/salary load only visible employee-month records; payroll computed from summaries equals source-log fixtures including waived penalties; checklist drill-downs page tasks and total counts remain full-scope.
- [ ] Write report tests: create/edit/delete/date changes update synthetic ranked rows; custom-range ranking spans multiple pages and is unavailable while incomplete; pause/resume preserves all rows without duplicates; a concurrent source revision invalidates results; zero-movement products and legacy salesperson buckets remain visible as specified.
- [ ] Run focused employee/report tests; Expected: RED.
- [ ] Replace employee/month bulk loads and full selector loads with shared pages, summaries and known-ID reads. Preserve clock-in/geofence, checklists, salary calculations and permission controls. Ensure generation is bounded/idempotent and source writes maintain summaries.
- [ ] Replace all-sales movement/employee reports with 15-row ranked summary queries; paginated invoice/task drill-downs and explicit resumable custom-summary jobs replace silent scans. Show complete totals or explicitly page-scoped labels.
- [ ] Run focused/full tests and build; Expected: PASS. Commit and ledger evidence.

### Task 7: Migration/index/rule artifacts, full audit and verification

**Files:** Create `scripts/firestore-migrate.cjs`, `scripts/firestore-audit.cjs`, `firestore.indexes.json`, `firestore.rules`, `firebase.json`, rollout documentation and migration/integration tests. Refactor `src/components/DataMigrationUtil.jsx`, `src/components/EmiPaymentStatusFix.jsx` into bounded explicit administrative operations; finish Auth/settings/known-ID read integration and source census dispositions.

**Interfaces consumed:** shared schema/version, search/projection formats and query index requirements from Tasks 1–6. No new runtime data model may be invented here.

- [ ] Write dry-run/checkpoint tests first: interrupted jobs resume, old backup revisions cannot overwrite newer source data, budgets stop before exhaustion, unready collections do not masquerade as complete search, and no mutating request occurs in dry-run mode.
- [ ] Run focused migration/audit tests; Expected: RED.
- [ ] Implement versioned additive migration/reconciliation. Default mode is dry-run; production apply requires an explicit flag, project allowlist and budget. Derive from current documents with revision preconditions and deterministic IDs; report ambiguous monetary/date/product mappings. Keep private backups and credentials out of artifacts/logs.
- [ ] Generate query-aligned indexes and revision-compatible authenticated write rules from current deployed behavior. Document old-client refresh, index readiness, per-store/collection readiness flags, rollback and separate production deployment approval. Validate syntax/rules against emulator when available; never deploy during this task.
- [ ] Run the full read census: every call site is a bounded routine read, a server aggregate, a known-ID lookup or an explicitly paged administrative/report job. Add regression audit tests forbidding month bulk branches, broad missing-index fallback and raw dashboard reads.
- [ ] Run complete tests, local production build, synthetic/emulator workflow/read-count comparisons and an offline migration dry-run against both full backups. Verify no customer/credential data entered Git and no production write occurred. Record exact limitations (including no production quota telemetry) in rollout notes.
- [ ] Commit, obtain a fresh whole-branch review, fix critical/important findings with failing regression tests, rerun suite/build, and present the tested branch plus dry-run/rollout artifacts. Ask only for the final external deployment/integration action if needed.
