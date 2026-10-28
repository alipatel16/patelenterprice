# Firestore data access v2 — verification and rollout

Implementation branch: `codex/firestore-data-access`. Original checkout and production databases have not been changed by this implementation. Both verified backups remain outside Git. Production deployment and backfill require separate approval and explicit operation budgets. The owner has temporarily enabled billing for the Furniture migration and may enable it for Electronics if needed; the ongoing design still targets low Firestore usage.

## Result

All business lists use server filters, cursor pages of 15, and search after two normalized characters with a 300 ms pause. Dates are optional filters. Search covers name-word prefixes, phone beginnings/endings (including multiple numbers in a legacy field), and actual stored reference fields. The dashboard opens on Today and loads server aggregates only when requested. EMI dues have an independent unpaid-installment queue, with complete count/amount aggregates and a review tab for uncertain legacy records. Delivery and payment status remain independent.

Employee calendars/payroll use visible employee-month summaries. Reports query ranked period summaries; custom ranges explicitly generate resumable daily-summary jobs and never expose partial rankings. Source mutations maintain supporting records in transactions. Financial history is preserved; no migration silently repairs receipt totals.

## Verification on 28 October 2026

- Application: 30 Jest suites, **185 tests passed**; normal lint-enabled `npm run build` compiled successfully (`main.2816b51b.js`).
- Tooling: `node --test scripts/*.test.cjs`: **24 passed**, one opt-in emulator test skipped. The opt-in test was run separately and passed.
- Real SDK 10.14.1 / Firestore emulator 1.22.0 / Java 21: authenticated versus anonymous access, old-client write/delete rejection, 15-row pages, historical name/phone search, three concurrent payments plus replay, stale invoice-edit rejection, simultaneous stock movements, receipt/queue balances, aggregate dashboard, current-source REST backfill, idempotent repeat, and Unicode document deletion passed with synthetic records.
- Offline migration and complete in-memory transaction simulation succeeded against **all 5,865 Electronics and 9,527 Furniture documents**, with zero derivation/transaction errors. Original source IDs and financial/history fields were retained. Review issues remain attached to 12 and 38 source records respectively.
- The simulated queues contain **33 Electronics and 184 Furniture unpaid installments**, matching the backup census. A mismatched schedule is flagged and remains discoverable.
- The AST census (`firestore-read-census.json`) covers 103 direct/shared access sites and reports zero unbounded ordinary SDK reads or source-write adapter bypasses. Per-domain implementation reports informed the dispositions. The census is a regression guard; query/transaction/UI tests provide behavioral evidence.
- Prepared **146 composite indexes**, including all 20 deployed index shapes captured in both backups; none have been deployed or removed. Embedded histories and employee-month day maps have explicit single-field index exemptions.

The emulator checks syntax, rules and real transport behavior. It does **not** enforce Native-mode composite index availability or reproduce production quota billing. Index build readiness and exact query acceptance must be checked separately before publishing collection readiness. Aggregation/pagination reduce returned documents; index work can still grow with the data. Firebase documents the free quota and index limits in [usage and limits](https://firebase.google.com/docs/firestore/quotas) and [index types](https://firebase.google.com/docs/firestore/query-data/index-overview).

## Storage planning

A complete offline projection and Firebase's published [storage-size formulas](https://firebase.google.com/docs/firestore/storage-size) estimate roughly **386 MiB for Electronics and 796 MiB for Furniture**, including documents, default single-field indexes and prepared composite indexes. These are planning estimates, not measured production billing. The first generated configuration included unreachable sales-company filter variants and estimated 1,089 MiB for Furniture. Removing those 32 unused composites reduced the estimate while retaining every current UI query and all 20 existing index shapes.

Check actual stored bytes after index construction and ordinary operation before deciding whether to turn billing off. Ongoing growth still uses storage; a bounded query is not a promise that a business of arbitrary size stays inside the free allowance.

## Read and write budget for the one-time setup

These are conservative document-operation estimates from the verified snapshots, not a claim about remaining quota today. Transaction contention/retries and ongoing staff usage add work.

| Store | Source scan budget used | Simulated transaction reads | Simulated writes | Planned read total |
| --- | ---: | ---: | ---: | ---: |
| Electronics | 6,015 | 21,170 | 15,338 | 27,185 |
| Furniture | 9,675 | 42,791 | 33,448 | 52,466 |

Furniture exceeds one free daily read/write allowance. On 28 October 2026, a read-only Cloud Billing check confirmed billing enabled for Furniture and disabled for Electronics. The owner permits temporary billing during migration and can enable Electronics if its available quota is insufficient. Furniture can therefore use approved paid capacity during the one-time migration; the tool's per-chunk budgets and checkpoints still apply. Electronics' estimate fits the daily free allowance before normal app usage, so check its actual headroom first. Usage above the free allowance can be billed ([Firestore pricing](https://firebase.google.com/docs/firestore/pricing)). Do not treat the offline test budgets as production approval. If a project remains without billing, pause/resume across quota windows; free daily quotas reset at midnight Pacific time. Monitoring is approximate and includes earlier backup/audit reads.

## Safe deployment order

1. Obtain final production approval, take a fresh recovery snapshot, verify the two project IDs and current usage, and choose explicit read/write limits for each chunk, including any approved paid usage. Recheck the deployed index inventory against the prepared 146-shape union; the no-billing limit is 200.
2. Deploy indexes to one explicitly named project at a time and wait until all required indexes are ready. Keep existing indexes. Do not publish readiness yet.
3. Coordinate a maintenance/cutover window and refresh all staff clients. Deploy the version-compatible rules so old clients cannot continue writing unsynchronized data while backfill runs. Firebase console/IAM writers bypass client rules and must remain paused or use the same source/summary semantics. Do not leave an old client silently writing alongside a migration.
4. Run the default live dry run, then approved apply chunks against **current source documents**, with an explicit project confirmation and read/write budgets. Save the private checkpoint outside Git after every processed record. Resume across chunks and, for any project without sufficient quota/billing, across quota windows; do not expose incomplete search as complete. Source and supporting writes are atomic, and `_projectionVersion: 2` prevents duplicate contributions on replay.
5. Resolve blocking errors, review historical warning records, check complete counts/totals against the fresh snapshot, exercise each query/filter/search/sum shape against the built production indexes, and install the reviewed application. Do not substitute a broad scan when an index is missing.
6. Publish `appSettings/dataAccessV2` with `version: 2` and only the verified `readyCollections` candidates from the **complete error-free checkpoint**. Sales completion covers `sales`, `emiDues`, `reportProductPeriods`, `reportEmployeePeriods`, and generated `reportJobRows`; attendance and checklist sources cover `attendanceMonths` and `checklistDays`. Job output uses the same search schema and also requires this explicit readiness. The tool never publishes readiness automatically.
7. Verify both stores independently with staff: older overdue EMI, partial/final payment on a delivered invoice the next day, name-word/phone-suffix lookup, stock display, complaint urgency, payroll waiver, and custom report resume/search. Observe usage over ordinary trading days and tune only with evidence.

If a staged rollout needs a module before its backfill is complete, retain an explicit setup/maintenance state. Never temporarily re-enable month downloads to hide incomplete migration.

## Commands

Run commands from the implementation checkout. Reports/checkpoints may contain record IDs; keep their paths outside the repository. No credential belongs in a command argument, source file, report or log. Live tooling reads `FIRESTORE_ACCESS_TOKEN` from the environment without printing it.

Offline, verified backup; no database requests:

```sh
node scripts/firestore-migrate.cjs --project patelfurniture-prod \
  --backup '<private-verified-backup-directory>' \
  --output '<private-report-path>.json' \
  --read-budget 20000 --write-budget 0 --simulate
```

Live dry run (explicit small example budget, not a quota recommendation):

```sh
node scripts/firestore-migrate.cjs --project patelfurniture-prod \
  --output '<private-dry-run-path>.json' --read-budget 1000 --write-budget 0
```

Approved current-source apply chunk, with separately determined headroom:

```sh
node scripts/firestore-migrate.cjs --project patelfurniture-prod \
  --apply --confirm-project patelfurniture-prod \
  --output '<private-apply-checkpoint-path>.json' \
  --read-budget '<approved-read-headroom>' --write-budget '<approved-write-headroom>'
```

Resume an apply checkpoint using the same project/mode/collection scope and a new chunk budget:

```sh
node scripts/firestore-migrate.cjs --project patelfurniture-prod \
  --apply --confirm-project patelfurniture-prod \
  --resume '<private-apply-checkpoint-path>.json' \
  --output '<private-apply-checkpoint-path>.json' \
  --read-budget '<approved-read-headroom>' --write-budget '<approved-write-headroom>'
```

A backup cannot be passed to a live apply. Do not use a dry-run checkpoint as an apply checkpoint. Token/format/financial errors are not retried as broader queries. Failed records prevent their collection from becoming a readiness candidate; fix the cause and start/review a fresh collection pass before publication.

Regenerate indexes: `node scripts/firestore-indexes.cjs`. Audit source: `node scripts/firestore-audit.cjs`. Tool tests: `node --test scripts/*.test.cjs`. For the opt-in local test, first run the official local emulator on 127.0.0.1:8080 with this rules file, then use `RUN_FIRESTORE_EMULATOR_TESTS=1 node --test scripts/firestore-emulator.test.cjs`. That test only addresses `demo-patel-refactor`; it clears its synthetic emulator database.

## Consistency and rollback

Adapters alone control monotonically increasing source revisions. Each action has a fresh `_writeToken` held stable across Firestore transaction retries. Rules require a new action token for an update and a newly written deletion marker for a delete; the SDK/REST transaction read preconditions enforce fresh-state concurrency. Comparing a stale transaction's proposed revision strictly to the latest rule resource rejects legitimate contention before the SDK can retry, so rules deliberately avoid that comparison. These are old-client compatibility guards, retaining the existing broadly authenticated staff model; they are not a server-side replacement for the supporting-data transaction logic.

On an issue, stop migration and keep/clear the affected readiness flag before accepting incomplete results. Preserve the checkpoint and private error report. Roll back the client/rules as a coordinated maintenance action; an old client must not resume writes against summaries presumed current. Restoring the full backup can overwrite newer business activity and requires a separate recovery decision. Prefer repairing/rebuilding additive fields from current sources. Do not restore old payment totals as an incidental rollback.

Migration and readiness are per project. No Cloud Function, paid backend, dependency upgrade or external search service is required. Historical discrepancies still require an owner-reviewed reconciliation; the application explicitly refuses to create another inconsistent financial record.

## Recorded implementation decisions

These decisions preserve the approved scope and explain the tradeoffs made during implementation.

1. Created an isolated manual Git worktree after the app's worktree tool could not recognize the original chat directory. The original source checkout stays untouched; the cost is manual integration bookkeeping.
2. Continued the implementation workflow already approved by the owner without another planning confirmation. This avoids repeated approvals; the owner can change the workflow, at the cost of rework.
3. Converted the independent dashboard while the shared access layer received a read-only review. Shared interface changes would require dashboard revalidation.
4. Worked on disjoint projection/dashboard modules concurrently while the cache fix was reviewed. This reduced waiting, with the same risk of downstream revalidation if a contract changed.
5. Omitted the seven unused chart invoice-count values because the chart never rendered them. The displayed overall invoice count remains an independent complete aggregate. A future chart-count feature would need its own aggregates.
6. Added `complaintDueDate`, using the preserved valid expected date or a far-future missing-date sentinel. This avoids a daily urgency update job; malformed dates are flagged for review rather than guessed.
7. Continued independent employee and migration work alongside task reviews, with final integration checks required. The cost of a late contract change would be rework, not a production side effect.
8. Kept migration/audit and final generic-write integration under one owner. Full-backup tests exposed multi-number phone fields, so tokenization handles each number separately; exchange-item search remains available. This adds token work, checked against complete backups, without changing display strings.
9. Retained all 20 deployed index shapes in the 146-index union to avoid removing existing query support. This leaves 54 slots under the no-billing composite-index limit. Index storage and query behavior must be observed after rollout; the Native-mode emulator cannot prove index availability.
10. Initially planned multiple free-quota windows for Furniture's estimated 52,466 reads and 33,448 writes. The owner's later temporary-billing instruction replaces that operational restriction where billing is enabled. Explicit migration budgets and a separately approved production cutover still apply; incorrect estimates could cause extra usage charges or downtime.

## Reviewed boundaries

The existing broadly authenticated staff model is retained; this work does not redesign row/role authorization or enforce all supporting-document semantics against a deliberately malicious authenticated writer. Supported writes use the shared adapters, and old clients are blocked during coordinated cutover.

Stock arithmetic is current and retry-safe for an existing unique inventory row. The separate invoice and stock operations are not redesigned into one cross-document business transaction; concurrent first-time inventory-row creation retains existing behavior and duplicate mappings are rejected for review. Old custom-report output and permanent operation markers are retained because no cleanup policy was approved and replay protection must not be silently expired. Production index acceptance, actual costs and migration success require the separate rollout checks. Historical monetary/date/employee ambiguities remain owner-reviewed issues.

Final configuration decision: generate composite indexes only for filters actually offered by the current screen. The reusable sales options helper supports a company predicate, but SalesList does not expose it; 32 unreachable variants were removed. Adding that UI filter later requires extending the index family and its runtime-shape test. No current filter or deployed index was removed.
