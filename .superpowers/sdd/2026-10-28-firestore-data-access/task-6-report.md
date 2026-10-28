# Task 6 implementation report

Status: implemented; final verification recorded below. No production database, network, dependency installation, deployment, or private customer data was used.

## Delivered

- Every Firestore-reading screen in `src/pages/Employees/` was migrated. Employee lists, salary pages and both daily/monthly admin views use the shared server-side indexed employee search and 15-row cursor pages. Monthly selectors contain the current page only; profile template assignment uses the shared indexed autocomplete and retains assigned template metadata without loading the template collection.
- Attendance and salary use only known `attendanceMonths` documents for the visible employees and month. Every field in each summary day is flattened, including source IDs, breaks and payroll fields. Salary calculation was extracted unchanged to `payroll.js`; saved waived penalties merge by penalty ID. Month/database/page identities suppress old computations and waivers. Totals/printing explicitly cover the visible employee page.
- Employee summaries require readiness. Missing backfill raises a visible error instead of inventing absent days, zero checklist totals, payroll deductions, or a new clock-in. Known-ID reads use the shared scope-aware access layer.
- Daily and monthly checklist admin counts come from `checklistDays`; full day counts never depend on the number of task bodies shown. Expanded tasks and employee dashboard tasks/pending-task dialogs use independent 15-row cursor pages. Reasons entered across visited pending-task pages are retained when clocking out.
- Existing clock-in, clock-out, break, leave, geofence, role/access, penalty settings, salary waiver/restoration and salary detail/printing behavior remains. Source mutations use Task 2 write adapter aliases, so attendance/checklist/report projections remain maintained.
- Checklist generation reads/writes at most 15 assigned templates per action; deterministic source IDs plus operation markers make retries safe. The dashboard provides an explicit continuation action. Automatic missing-log-out repair handles at most 15 source days from the visible employee/month summaries per visit/refresh and uses source adapters.
- Both sales reports use shared daily/monthly/lifetime ranked summary queries with 15 rows per cursor page. Full period totals use aggregates and retain reconciliation/undated contribution counts. Product totals label invoice contributions correctly. Legacy employee/product dimensions are retained.
- Product movement includes a separately paginated product catalog, with known-ID period movement and bounded inventory lookup for visible products; products with no period sales show zero movement and current stock. It does not load the entire product/inventory/sales collections.
- Invoice drilldowns page source invoices with `reportEmployeeKey == row.dimensionKey` before the limit, including normalized legacy-name and unmatched buckets. The exact key comes from the Task 2 source adapter/backfill extension, without guessing users from duplicate names.
- Custom ranges use explicit bounded, resumable daily-summary jobs. Each invocation processes at most its page budget (UI: 3 × 100 daily summary rows), persists its checkpoint/as-of timestamp/source revision, commits dimensions and checkpoint atomically, and exposes ranking only after completion. Same-page concurrent/replayed commits do not double count. Source revision changes invalidate partial and complete results; regeneration uses revision-separated output IDs.

## Custom job persistence

`reportJobs/{dimension_start_end}` stores `jobId`, `dimension`, `start`, `end`, `asOfRevision`, `asOf`, `cursor: {periodKey,id}|null`, `processed`, `complete`, and `status` (`incomplete`, `complete`, `invalidated`). `reportJobRows/{jobId_revision_encodedDimensionKey}` contains the documented dimension/metric/search fields plus `jobId` and `asOfRevision`. It is derived job output, not a substitute source-summary schema. Its rank query filters by both job and revision. Daily source pagination orders by period key and document ID for stable durable resume.

Required indexes were communicated to the integrating agent: report period filters and ranking metrics/search; daily summary scan; report job/revision ranking/search; source employee key plus sale-date ordering; paged products and task filters.

## Verification evidence

TDD RED runs were observed for missing employee/report helper modules; missing payroll extraction; atomic checkpoint export; impossible calendar dates; unready attendance treated as an empty month; and legacy invoice drilldown. Each was followed by a passing focused run. A checklist UI test initially selected the employee pager instead of the task pager; the test selector was corrected to the expanded task row before validating cursor behavior.

Synthetic tests cover server employee search finding record 37 beyond page one, only-visible month reads, full checklist totals with 15 task bodies and a separate cursor, source-equivalent payroll including breaks/leaves/waivers, source create/edit/reassignment/date move/delete rank changes, zero movement products, preserved legacy dimensions and legacy drilldown filters, bounded custom generation, multiple-page accumulation, resume without duplicate contributions, atomic duplicate concurrent checkpoint commits, no partial ranking, strict dates, and source revision changes before/after completion or during page processing.

- Focused employee/report suites: passing (5 suites, 18 tests).
- Full suite: `CI=true npm test -- --watchAll=false --watchman=false --runInBand` passed: 27 suites, 159 tests. Final rerun after the last error-state cleanup also passed (same command; result communicated to integrator).
- Lint-enabled production build: `CI=false npm run build` passed. The first ordinary build could not write the pre-existing shared dependency-cache path (EPERM); a normal lint-enabled build using the approved shared-cache permission passed. A one-off no-lint compile was also performed early, but it is not the authoritative verification.
- `git diff --check` passed for owned changes.

## Operational limits and remaining integration work

No production acceptance is claimed. Migration/readiness flags and composite indexes must be applied by the integration/deployment workflow. Custom jobs pause at a bounded checkpoint and require explicit resume for larger ranges; old revision output is retained and ignored. Catalog pages are alphabetical; ranked pages contain movement summary dimensions. Salary totals/printing and attendance/checklist employee status cards are explicitly page-scoped. Automatic log-out repair and checklist generation now require explicit continuation when more than 15 repairs/templates remain, preventing hidden unbounded work.

All owned source paths are implemented; no known Task 6 functional blocker remains. Integration owns final cross-task review and deployment.

## Fix round 1 — four review findings addressed

Applied the receiving-code-review and fix-loop reference workflow. Each reported behavior was reproduced with a failing regression before its fix; the review findings were technically confirmed rather than dismissed.

1. **P1: stale custom job overwriting a newer checkpoint.** The transaction reads the persisted checkpoint before either accepting a page or recording invalidation. A candidate from an older source revision returns the newer checkpoint without writing over it. Same-revision invalidation preserves the persisted checkpoint's cursor/count. The deterministic regression in `src/data/reportJobs.test.js` pauses revision 7 after its page read, commits revision 8 through the production `createReportJobCommit` transaction, releases revision 7, verifies revision 8 is unchanged, and resumes to exactly 30 revenue/2 invoices rather than double counting.
2. **P2: employee generation progress surviving an identity/day change.** Progress is keyed by the current database, employee ID and day. A fresh identity immediately uses cursor zero; a late previous identity's generation cannot update current progress. `src/pages/Employees/EmployeeDashboard.test.js` renders a clocked-in employee, exhausts two assigned templates, changes the rendered day, and verifies generation becomes available and writes both new-day task IDs.
3. **P2: custom ranked search blocked by absent output readiness.** Generation now requires migration-published readiness for its source summary collection and `reportJobRows`; ranked browse/search and totals also use the common readiness guard. The generator never publishes or bypasses readiness. `fetchCustomReportPage` forwards indexed search. `src/data/reportJobs.integration.test.js` uses the real generator/transaction/query code with a deterministic Firestore boundary: source-only readiness rejects before any job checkpoint, then migration-published output readiness permits generation of 37 rows and indexed search finds the matching row beyond the first 15 ranked results. The root integration worker owns migration output-candidate publication and was explicitly notified of this contract.
4. **P2: undated invoices omitted from lifetime drilldown.** Lifetime drilldown retains its exact `reportEmployeeKey` filter and 15-row cursor limit, using default document-ID ordering (`sort: []`) so missing `saleDate` does not exclude documents. Date-specific drilldowns retain sale-date predicates/order. `src/pages/Employees/EmployeeViews.test.js` reproduces the excluded undated invoice, then verifies it renders after the fix, and separately verifies the bounded dated query.

Covering command:

`CI=true npm test -- --watchAll=false --watchman=false --runInBand --runTestsByPath src/pages/Employees/EmployeeViews.test.js src/pages/Employees/EmployeeDashboard.test.js src/data/reportJobs.test.js src/data/reportJobs.integration.test.js`

Output: **4 suites passed, 13 tests passed**. All four fixes had RED/GREEN coverage. The integration test additionally observed a second RED after readiness was added, proving indexed search forwarding was still missing before that final change.

Final full verification: `CI=true npm test -- --watchAll=false --watchman=false --runInBand` → **29 suites passed, 178 tests passed**, exit 0. `CI=false npm run build` → **Compiled successfully**, exit 0 (lint enabled, approved existing shared-cache access; `main.f9533391.js`). `git diff --check` → clean. No production/network/deployment/dependency/private-data access occurred. Four findings addressed; zero known open findings from this round. Migration readiness publication remains root-owned integration work.
