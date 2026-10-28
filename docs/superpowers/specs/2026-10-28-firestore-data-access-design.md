# Project-wide Firestore fetching and search design

**Date:** 28 October 2026  
**Status:** Proposed detailed design; the existing-records approach is approved. Product changes and production migrations have not started.  
**Application:** `/Users/alipatel/Documents/patelenterprice`  
**Stores:** Electronics (`patel-enterprise-prod`) and Furniture (`patelfurniture-prod`).

## 1. Intent and scope

Refactor every Firestore reading path so ordinary navigation and search do not download a collection or an entire selected month. Keep Spark as a firm constraint. Preserve invoices, payment history, stock history, employee records, existing routes, and business workflows while changing how data is retrieved and how query-supporting fields are maintained.

The user specifically requires searches to wait for two characters, return at most 10–15 results at a time, match the start of any name word and the start or end of a phone number, work with existing filters, and not require a selected month. Dashboard statistics should use aggregation and default to Today. EMI due-date tracking must include older outstanding installments. Employees must be able to find delivered invoices and receive payment on a later date.

The scope includes sales, EMI invoices and dues, payment entry, delivery and exchange tracking, customers, products, inventory, purchases, quotations, gifts, complaints and brand hierarchies, employees, attendance, checklists, salary and sales reports, authentication profile reads, all form lookups, and administrative data utilities. A source census found 119 direct read call sites across 43 files; all must receive an explicit disposition, including small settings/detail reads that can remain bounded.

No visual redesign, external search service, paid backend, scheduled Cloud Function, payment-rule change, or migration of Firebase Authentication/Storage/Realtime Database is required.

## 2. Evidence and recovery baseline

Verified complete Firestore snapshots exist at `firestore-audit/backups/2026-10-28T08-32-39-786Z` in the surrounding ChatGPT workspace. They contain 5,865 Electronics documents and 9,527 Furniture documents, rules, indexes and field overrides; every document was checked for subcollections. Counts and checksums match. A verified Git bundle contains the app's complete committed history at `adee9f1790dac3513e4997ddd5efe32b5f99f84d`.

The snapshots contain 44 Electronics EMI invoices and 580 Furniture EMI invoices. Their embedded schedules have 33 and 184 unpaid installments, respectively. Furniture has 21 scheduled-delivery invoices marked delivered with unpaid/partial payment status. Both stores contain settled invoices whose original payment type remains `pending_payment`; payment type is not current payment state.

The current dashboard downloads sales documents and sums them in the browser. Sales, customers, products, purchases, inventory, quotations and gift invoices have unbounded month/range search branches. Active complaints and EMI invoices have unbounded result sets; exchange tracking silently caps large sets at 200. Some employee/gift/brand/history searches only examine the current page. Shared caches omit database identity. No production daily-read telemetry has been collected, so exact daily savings are not yet established.

## 3. Approaches and selected direction

**Selected: preserve source records and add query-supporting data.** Retain the existing primary collections and embedded invoice/payment history. Add normalized search fields, a small independently queryable EMI due collection, and report/employee summaries only where aggregation over current fields cannot serve the view. Update source records and their supporting data together. This addresses the entire app without re-identifying existing records or rewriting payment history.

**Alternative: replace the entire transactional data model.** Split invoice headers, items, installments and payments into new primary collections and migrate every workflow. This provides flexibility but requires a larger migration, creates more document reads/writes for common detail views, and is unnecessary for the stated search/pagination goals. The user accepted the first direction after backups.

Implementation retains React 18, Material UI, the existing modular Firebase SDK and CRA tooling. Shared services and hooks replace duplicated fetch implementations. Dependency upgrades are not an objective.

## 4. Universal browsing, filtering and search contract

- Default list and search page size: **15**, with existing compact views allowed to use 10. Each document query uses a matching limit; no unbounded fallback and no month-sized download. A full page can enable Next; discovering the final empty page is acceptable and consumes the normal minimum query read. No hidden look-ahead document is required.
- Use Firestore cursors with a stable ordering and document identity as a tie-breaker, not numeric offsets. Cache visited pages briefly so Previous does not repeatedly re-read them. Never jump to a page whose cursor is unknown.
- Apply status, company, type, assignee, date and search predicates **before** the limit. Changing any predicate or sort resets the cursor chain. A selected date range remains an optional query filter; it never enables a different bulk-fetch mode.
- Blank search browses the first bounded page. One normalized character displays a two-character hint and issues no search request. At two characters, debounce for **300 ms** and issue a bounded query. Clearing the search restores filtered browsing. Search spans all dates unless the user deliberately retains a date filter.
- Search and dropdown options have at most 15 visible results. More results are available by paging lists or refining dropdown text. Do not fetch a large result set and then trim it to 15.
- Normalize case, Unicode and surrounding/repeated whitespace consistently. Store a deduplicated `searchTokens` array built from full-field and individual-word prefixes of the relevant names/titles/brands, reference-number prefixes, and phone digit prefixes and suffixes. Preserve original display values. Handle both national Indian numbers and `91`/`+91` forms. A query uses one `array-contains` search token rather than multiple per-field searches. Multi-word input matches the corresponding normalized field prefix; arbitrary substring matching is not promised.
- Retain relevant search fields: customer name/phone/email; product name/maker/category/HSN; supplier/invoice reference; invoice/quotation/complaint number; customer name/phone copied to business records; gift set; complaint title/brand; employee name/phone/email; checklist title. Long free-form notes are excluded from indexing. Token generation must be bounded against Firestore document/index limits, audited on the complete backup, and reject or report unsupported input rather than silently hiding old records.
- Never label current-page counts or totals as complete. Full counts/sums come from matching server aggregation queries, cached separately and not rerun on every Next/Previous. Where the UI only needs navigation, use Previous/Next rather than an expensive exact total.
- Missing indexes produce an actionable error. They must never trigger a broader scan, filter-after-limit, or differently ordered fallback.

## 5. Shared data access and cache behavior

A shared query service owns query construction, bounded pagination, search readiness, aggregation and diagnostics. A reusable hook owns debouncing, cursor state, loading/error state, stale-response rejection and mutation invalidation. Shared autocomplete uses the same search contract.

Cache identity includes project/database, authenticated user and role, collection, normalized filters/search/sort, schema version and page cursor. Use a bounded in-memory cache with a 60-second default list/search freshness period and request deduplication. Small settings/profile data may use five minutes with explicit invalidation. Financial writes always read current authoritative data in a transaction; cached balance/stock is never the write authority. Signing out or changing user/store clears relevant caches and discards pending old responses.

Invalidate a request immediately when input changes, drops below two characters, unmounts, or changes store; a late response must not repopulate stale options. Clearing a timer alone is insufficient. Query constraints must have stable identities so render cycles do not cause extra reads. Offline/permission/index errors must be shown distinctly from an empty result. Preserve selected form values when editing without loading every option.

Detail screens fetch their known document IDs, and linked records only as needed. Reuse an unchanged customer lookup after a payment rather than refetching it. Remove write-on-read legacy EMI migration from routine details; migration belongs in the explicit administrative path.

## 6. Dashboard

Select **Today** on entry, including when the store changes. Keep **Load Dashboard Stats** as an explicit action; editing dates or choosing a tab does not download data automatically. Keep the existing seven-day chart and available monthly/custom controls.

Use `getAggregateFromServer` with `count`/`sum` for sales totals and invoice counts, plus filtered count queries for collection/pending counts. Fetch seven daily aggregate results for the chart, reusing Today's result where possible. No `getDocs(sales...)` is allowed in the dashboard. Pending means a currently outstanding invoice, not the original payment type. Aggregations must not inherit a page limit.

Preserve the dashboard's current `createdAt` date basis to avoid silently changing reported revenue. Today and chart-day boundaries use the store's India timezone. Sales/invoice lists retain their business `saleDate` filters. Do not combine aggregates in a way that drops documents with missing fields; audit numeric/missing values and validate against offline totals. Cache by store/user/date bounds and invalidate on relevant writes. Mark the last refresh time. Aggregations consume reads based on index entries; they are not free and are not guaranteed constant-cost at arbitrary scale.

## 7. EMI invoices and due-date tracking

Keep `sales.emiInstallments[]` and its payment/rescheduling history as the source of truth. Add derived sale fields for active EMI state, remaining amount, remaining installment count and earliest unpaid due date. The EMI invoice screen defaults to active EMI invoices ordered by next due date, paginated on the server. It offers paid/all filters and the common indexed search. It must not download all 580 Furniture EMI invoices to find a name.

Create `emiDues/{saleId}_{installmentNumber}` for each unpaid installment. Store its sale ID, installment number, due date, original/paid/remaining amount, invoice/company/customer display fields, search tokens, and source revision. Only unpaid/partial installments are in this collection. Deterministic identity makes updates and migration idempotent.

Overdue, Today and Next 7 Days query this collection by due date. Only the active tab loads rows, at 15 per page. Header counts and remaining-amount totals are matching server aggregates over the complete query, not the page. Thus an old invoice with an overdue installment remains discoverable regardless of invoice creation date. Selecting a due opens the original sale/payment flow.

Payment and rescheduling transactions read the current sale, preserve all existing entries, update the installment and sale summary, and set/delete the corresponding due document atomically. Editing customer display fields or changing the EMI schedule also updates affected due documents; deleting/changing an EMI sale removes its queue records. No daily job is needed to change a due from upcoming to overdue: the query uses today's date. Recompute day boundaries at midnight and on resuming the app. Never recreate paid installments in the unpaid queue.

Use stable payment operation IDs to make retries idempotent. A concurrent payment retries against the latest sale; it must not overwrite another employee's payment. Preserve existing payment/overpayment rules and history, show the remaining balance, and report success only after server acknowledgement. Financial inconsistencies found during migration are reported for review, not silently rewritten.

## 8. Delivery, later payment and exchanges

Paginate/search pending deliveries and delivered history on the server with the same case-insensitive name/phone/reference behavior. Add **Delivered — Payment Pending** to expose scheduled deliveries that are complete but have an outstanding payment. This search is independent of the pending-delivery queue. Selecting a row opens the original invoice and existing payment-entry action; completing payment removes it from this outstanding tab while retaining delivered history.

Delivery completion changes delivery fields only. Payment completion changes payment fields only. Derive a consistent queryable delivery state from existing compatibility rules, keeping original fields/history. Enforce scheduled-delivery predicates and current state in Firestore before limiting results. Align index definitions and sorting; remove the missing-index fallback that changes queue order. Update the affected cached row/queue on acknowledgement instead of re-downloading a month.

Replace both 200-document exchange caps with paginated pending/received queries and searchable fields. A normalized exchange state allows legacy missing booleans to be handled by migration, not client filtering after a limit. Keep exchange receipt history and stock/payment behavior unchanged.

## 9. Coverage by module

| Area | Required result |
|---|---|
| Customers, products, purchases, inventory | Remove month-fetch branches; keep filters; indexed search and bounded cursor pages in browse and search modes. Query stock only for visible/selected product IDs. |
| Sales, quotations, gift invoices | Preserve invoice/date/company/payment filters and details/printing; apply search before limit; never download a date window to search it. |
| Gift sets and brand hierarchies | Replace current-page-only filtering with complete indexed search; replace full lookup dropdowns with on-demand search. |
| Complaints | Paginate open, in-progress and history tabs; put assignee/status/search/urgency date predicates in the query. Use full-query count aggregates for badges and urgency totals. A stored date/sort key supports overdue-first order without downloading all active complaints. |
| Employee list/profile/form lookups | Search across employees, not only loaded rows; paginate template assignment options and keep selected IDs; remove all-employee form loads. Preserve roles and disabled-user behavior. |
| Attendance, checklist daily/monthly views | Page/search employees first. Fetch only the visible employee/date scope. Use bounded employee-month summaries for calendar/salary inputs and employee-day checklist counts, with paginated task details. Never download the whole store's month or every employee. |
| Salary | Fetch saved reports for visible employee IDs. Explicit generation uses complete visible employee-month summary data and preserves salary/penalty calculations; it must not recompute every employee from all attendance logs on navigation. |
| Employee dashboard/checklists | Known-user/day queries only, paginated assigned work and template lookup by known IDs. Creation of daily assignments is idempotent and bounded, not a repeated all-template scan. |
| Employee sales/product movement | Use queryable summaries for ranked report pages; detail drill-downs are paginated. No all-sales/all-inventory scan on opening or searching a report. |
| Auth, settings and details | Deduplicate profile reads and scope caches to identity/store. Keep small known-document reads, with correct invalidation. |
| Administrative migrations | Explicit read/write jobs with checkpoints, progress and bounded batches; never run automatically on normal page visits. |

## 10. Reports that cannot be solved by simple sums

Firestore cannot group an embedded `items[]` array into a ranked product report. Preserve raw invoices and create small product/employee reporting summaries for daily, monthly and lifetime periods, maintained from invoice item deltas on sale creation/edit/deletion. The daily/monthly keys use business `saleDate`, as the existing reports do. Include stable employee IDs where known; retain a distinct legacy/unmatched salesperson bucket instead of guessing matches. Stock displayed beside a product comes from the current inventory lookup, not a stale sales summary.

Standard Today/month/lifetime ranked reports query the relevant period's summary rows with server ordering and 15-row pagination. Search/filter applies to the report rows too. Keep zero-movement products discoverable through a paginated product/dead-stock view; absence of a movement row is zero, not an unknown silently discarded product.

Exact global ranking over an arbitrary custom date range cannot be obtained by sorting each page locally. For custom ranges, an explicit **Generate Report** action runs a resumable, bounded-page job over daily summaries, creates complete report rows, and shows progress. It never reads all invoice documents, runs while the client is open, and can resume from checkpoints. Results become available only when complete, with source/as-of metadata. A changed underlying period invalidates a saved result. No incomplete page subtotal is presented as a global ranking. This heavier action is separate from ordinary searching and requires a visible read estimate/budget before running.

Employee-month attendance summaries contain the payroll-relevant day values for at most 31 days. Checklist day summaries contain counts; task details remain paginated. All supporting summaries carry schema/source revisions and are rebuilt in bounded administrative jobs. They do not replace original daily logs or tasks.

## 11. Write paths and consistency

Every create/edit/delete path that affects search tokens, EMI dues or summaries must use shared write helpers. Include inline customer/product creation, complaint reassignment/status changes, gift/quotation edits, sale conversions, date changes, employee renames, and existing administrative utilities. Source writes and dependent records use atomic transactions/batches with transaction reads before writes, deterministic IDs, revision checks and retry-safe operation IDs. The current snapshot's maximum EMI schedule is nine installments; transaction bounds must be checked explicitly for future larger invoices/schedules rather than splitting an invariant across commits.

Existing staff authorization behavior must continue. Deployed rules currently require authentication broadly; new collections must not inadvertently grant unauthenticated access. Add a revision compatibility requirement to affected source mutations so stale pre-refactor clients cannot continue writing unsynchronized supporting data. This requires a coordinated client refresh during rollout. An external writer or manual console change needs the same helper semantics or an explicit reconciliation job; derived data cannot be assumed self-updating without a backend trigger.

## 12. Migration and release

Prepare and test migration against the verified local backups/emulator first. Produce a dry-run report listing source counts, proposed additions, indexes, writes, invalid dates, payment inconsistencies, duplicate inventory product IDs, and index-token sizes. Existing money/history is not modified as a side effect of adding search or due fields.

Use versioned, additive and resumable backfills with deterministic IDs. Check the source document revision/update time before applying a derived change so a payment made after the backup cannot be overwritten. Do not blindly restore or backfill the old snapshots into production. Keep per-project read/write budgets below remaining Spark quota and pause/checkpoint before exceeding the chosen budget; current usage must be checked before a live migration.

Deploy required indexes, verify they are ready, coordinate writes/old-client refresh, run bounded live backfill and reconciliation, then set per-store/per-collection readiness flags. New searches/queues must not silently omit unindexed legacy documents: until ready, show a clear not-ready state, keep known-ID details available, and never fall back to a bulk scan. Cross-store flags and derived collections are isolated. Retain source records and prior fields for rollback. Prepare deployment/migration artifacts during implementation; execute production rollout only after the tested result and dry-run report are reviewed.

## 13. Verification and acceptance

Baseline checks before implementation: the existing test command reports no tests. The existing production build fails because `src/pages/Complaints/ComplaintDetail.js` imports unused Timeline components from `@mui/material`, which does not export them. Remove those unused imports as a bounded prerequisite; do not add a new UI dependency for unused components.

- Regression tests prove a zero/one-character search issues no request; two characters debounce once; name word-prefix and phone start/end matching work; options stay within 15; shortening input or switching stores rejects old responses.
- Integration tests prove date/status/company/search predicates run before the limit; results beyond the first historical page are found; tied sort values paginate without duplicates; cursor state resets on every filter change; cache entries and invalidations cannot cross stores/users.
- A dashboard test fails if it performs a sales document query; Today is the default and aggregate totals match independent offline calculations. Tests include local midnight and legacy missing/non-numeric fields.
- EMI tests include old overdue invoices, partial payments, multiple overdue installments, today/upcoming boundaries, rescheduling, schedule edits/conversion/deletion, retries, concurrent payments and queue reconciliation.
- Delivery tests cover completing delivery with no payment, finding it later by another name word/phone suffix/reference, receiving partial/final payment, and preserving delivered history.
- Summary tests cover sale edits/deletion/date changes, products with no movement, unmatched/renamed salespeople, interrupted custom reports, and concurrent updates. Attendance/checklist/salary totals must equal calculations from source fixtures.
- A complete source-read audit leaves no silent unbounded query in a routine screen. Large administrative/report jobs are explicitly labelled and paged. Build and the complete test suite pass; representative mobile/desktop workflows are exercised.
- Add development diagnostics for query purpose, returned-document count, cache hits/deduplication, and aggregate calls without logging customer data or credentials. Compare the same scripted Furniture navigation/search workflow before and after using synthetic/emulator data, then inspect real Firebase daily usage after rollout. SDK counters are estimates; Firebase usage is the service-side evidence.

Success means a normal search or page reads at most its bounded matching page, EMI/delivery/payment results are complete for the selected filters, dashboards return aggregates, and the ordinary workload's read usage drops substantially. Spark has a fixed quota; no design can promise unlimited business growth without measuring workload and enforcing budgets.

## 14. References

- [Firestore cursor pagination](https://firebase.google.com/docs/firestore/query-data/query-cursors)
- [Firestore aggregation queries](https://firebase.google.com/docs/firestore/query-data/aggregation-queries)
- [Firestore pricing and read accounting](https://firebase.google.com/docs/firestore/pricing)
- [Atomic transactions and batches](https://firebase.google.com/docs/firestore/manage-data/transactions)
