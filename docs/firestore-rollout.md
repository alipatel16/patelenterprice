# Firestore data access v2 — verification and rollout

Implementation branch: `codex/firestore-data-access`. Original checkout and production databases have not been changed by this implementation. Both verified backups remain outside Git. Production deployment and backfill require a separate approval and a planned quota window.

## Result

All business lists use server filters, cursor pages of 15, and search after two normalized characters with a 300 ms pause. Dates are optional filters. Search covers name-word prefixes, phone beginnings/endings (including multiple numbers in a legacy field), and actual stored reference fields. The dashboard opens on Today and loads server aggregates only when requested. EMI dues have an independent unpaid-installment queue, with complete count/amount aggregates and a review tab for uncertain legacy records. Delivery and payment status remain independent.

Employee calendars/payroll use visible employee-month summaries. Reports query ranked period summaries; custom ranges explicitly generate resumable daily-summary jobs and never expose partial rankings. Source mutations maintain supporting records in transactions. Financial history is preserved; no migration silently repairs receipt totals.

## Verification on 28 October 2026

- Application: 29 Jest suites, **178 tests passed**; normal lint-enabled `npm run build` compiled successfully (`main.f9533391.js`).
- Tooling: `node --test scripts/*.test.cjs`: **23 passed**, one opt-in emulator test skipped. The opt-in test was run separately and passed.
- Real SDK 10.14.1 / Firestore emulator 1.22.0 / Java 21: authenticated versus anonymous access, old-client write/delete rejection, 15-row pages, historical name/phone search, three concurrent payments plus replay, receipt/queue balances, aggregate dashboard, current-source REST backfill, idempotent repeat, and Unicode document deletion passed with synthetic records.
- Offline migration and complete in-memory transaction simulation succeeded against **all 5,865 Electronics and 9,527 Furniture documents**, with zero derivation/transaction errors. Original source IDs and financial/history fields were retained. Review issues remain attached to 12 and 38 source records respectively.
- The simulated queues contain **33 Electronics and 184 Furniture unpaid installments**, matching the backup census. A mismatched schedule is flagged and remains discoverable.
- The AST census (`firestore-read-census.json`) covers 104 direct/shared access sites and reports zero unbounded ordinary SDK reads or source-write adapter bypasses. Per-domain implementation reports informed the dispositions. The census is a regression guard; query/transaction/UI tests provide behavioral evidence.
- Prepared **178 composite indexes**, including all 20 deployed index shapes captured in both backups; none have been deployed or removed. Embedded histories and employee-month day maps have explicit single-field index exemptions.

The emulator checks syntax, rules and real transport behavior. It does **not** enforce Native-mode composite index availability or reproduce production quota billing. Index build readiness and exact query acceptance must be checked separately before publishing collection readiness. Aggregation/pagination reduce returned documents; index work can still grow with the data. Firebase documents the free quota and index limits in [usage and limits](https://firebase.google.com/docs/firestore/quotas) and [index types](https://firebase.google.com/docs/firestore/query-data/index-overview).

## Read and write budget for the one-time setup

These are conservative document-operation estimates from the verified snapshots, not a claim about remaining quota today. Transaction contention/retries and ongoing staff usage add work.

| Store | Source scan budget used | Simulated transaction reads | Simulated writes | Planned read total |
| --- | ---: | ---: | ---: | ---: |
| Electronics | 6,015 | 21,170 | 15,338 | 27,185 |
| Furniture | 9,675 | 42,791 | 33,448 | 52,466 |

Furniture exceeds one Spark daily read/write window. Plan at least two quota windows, reserve room for ordinary operations, and pause/resume using the checkpoint. Do not start a full production apply with the offline test budgets. Check the Firebase console's current usage first; the Monitoring baseline is approximate and includes the earlier backup/audit reads. Free daily quotas reset at midnight Pacific time, so calculate the corresponding India time for the actual rollout date.

## Safe deployment order

1. Obtain final production approval, take a fresh recovery snapshot, verify the two project IDs and current usage, and choose explicit read/write headroom for each chunk. Recheck the deployed index inventory against the prepared 178-shape union; the no-billing limit is 200.
2. Deploy indexes to one explicitly named project at a time and wait until all required indexes are ready. Keep existing indexes. Do not publish readiness yet.
3. Coordinate a maintenance/cutover window and refresh all staff clients. Deploy the version-compatible rules so old clients cannot continue writing unsynchronized data while backfill runs. Firebase console/IAM writers bypass client rules and must remain paused or use the same source/summary semantics. Do not leave an old client silently writing alongside a migration.
4. Run the default live dry run, then approved apply chunks against **current source documents**, with an explicit project confirmation and read/write budgets. Save the private checkpoint outside Git after every processed record. Resume across quota windows; do not expose incomplete search as complete. Source and supporting writes are atomic, and `_projectionVersion: 2` prevents duplicate contributions on replay.
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

These decisions were made under the approved design and existing authorization. They are retained here for review, including tradeoffs, before local coordination files are removed.

- Ruling: Native create_worktree returned Not a git repository because this chat retains its old non-Git working directory. Use an explicitly authorized manual Git worktree under the writable workspace, rooted at the verified original HEAD. No source checkout modification — costs only manual integration bookkeeping.
- Ruling: The user explicitly approved the design and instructed proceeding with implementation. Use the planned subagent workflow without another execution-choice confirmation — avoids repeating an approval already supplied; method can be changed if the user steers it.
- Ruling: After the user's latency concern, start independent Task 4 dashboard conversion during Task 1's read-only review. Dashboard owns separate files and consumes the already documented shared API; no shared module edits allowed. If foundation review changes an interface, reverify the dashboard. This preserves review gates while overlapping independent work; possible cost is one downstream rebase/fix.
- Ruling: Parallel Task2 pure/write modules with Task4 dashboard and the scoped Task1 fix because owned files do not overlap and public interfaces are fixed. All task reviews and integrated verification remain required. Possible cost: reverify downstream assumptions if a public contract changes.
- Ruling: Drop chartData.count, which original BarChart never consumes, rather than fetch7 unused daily counts. Preserve displayed invoice count as its own aggregate. Today uses12 aggregate calls, custom/month13; avoids six unnecessary minimum reads per load.
- Ruling: Complaint query sort field is complaintDueDate: valid expectedResolutionDate or9999-12-31 sentinel for missing dates. Task2 owns derivation/write maintenance; Task3 owns date predicates and display. Avoid dynamic stored urgency buckets/daily jobs. Invalid dates are reported, not guessed.
- Ruling: Continue disjoint Task6 and controller-owned Task7 tools while task reviews run; preserve stable contracts and require all gates plus integrated verification before completion. This follows existing parallel ruling after user latency concern; cost is potential rework if reviewed contracts change.
- Ruling: Controller owns migration/audit tools plus final Auth/generic write integration. Full-backup dry-run exposed multi-number phone fields in82 records; TDD fix indexes slash/backslash/pipe/hyphen-separated numbers individually without rewriting original strings. Exchange item word-prefix search preserved with shared token field. RED/GREEN observed in search.test.js. Repeat complete backup simulation required.
- Ruling: Retain178compositeindexshapesincludingall20current toavoidremovingexistingquerysupport; verifyindexreadinessseparatelysinceNativeemulatordoesnotenforceindexes—costisindex/storageheadroom(22composite slotsbefore200limit)andpotentialtuningafterusageevidence.
- Ruling: Productionbackfillmustspanquota-budgetedwindows: Furniture simulationrequires52,466read/33,448writeoperations includingqueryscan. Do notupgradebillingorconsumeunapprovedquotas; exactcutoverwindowrequiresownerapproval—costifwrongisworkflowdowntimeorquotaexhaustion.
