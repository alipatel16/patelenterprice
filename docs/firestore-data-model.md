# Firestore data access v2: write and projection contract

`src/data/projections.js`, `employeeSummaries.js`, and `writes.js` own these formats.
Source financial fields and receipt histories remain authoritative and unchanged by derivation.
All writes below are top-level documents. Derived records are updated atomically with their source.
No inventory changes are made here; existing inventory flows retain that responsibility.

## Public write interface

```js
addRecord(collectionRef, payload) // Promise<DocumentReference>
updateRecord(documentRef, patch) // Promise<void>; dot-separated field paths supported
setRecord(documentRef, payload, { merge, mergeFields } = {}) // Promise<void>
deleteRecord(documentRef) // Promise<void>
mutateRecord(documentRef, current => patch, { operationId } = {})
// Promise<{ id, data, revision, applied, operationId }>
```

Import named exports from `src/data/writes`. `mutateRecord` reads fresh source inside a
retryable transaction; the callback must be side-effect free and return a patch, `null`
to delete, or `undefined` to do nothing. Missing sources cannot be updated/mutated.
`operationId` is an optional nonempty string of at most 200 characters, unique per source
and user action; retries return `applied: false` without applying money/history twice.
The returned `data` on an idempotent replay is the current source, while `revision`
is the revision at which that operation originally applied.

Source writes recompute `searchTokens`, `searchVersion: 2`, `nameLower`, optional
`makerLower`, `_writeRevision` (monotonically increasing), `_projectionVersion: 2`,
and `_deleteMarkerId` (the exact `encodeURIComponent(documentRef.path)` marker ID).
Firebase `deleteField()` is materialized before projection; `serverTimestamp()` is
accepted outside arrays. Arithmetic/array transforms must use a mutator. Nested
set merges and string `mergeFields` are supported. In a merge, an explicitly empty
nested map replaces that map's children; an empty document-level payload preserves
the existing document. Firestore FieldPath overloads and
field/value varargs are outside this interface.

All transaction reads precede all writes. Successful commits invalidate every changed
collection. Conservative limits reject before committing: 450 written documents,
800,000 estimated bytes per document, 6,000,000 per transaction. Oversized plans
throw `data-access/transaction-too-large`. Invalid/underflowing existing summaries
throw `data-access/reconciliation-required` atomically. Unknown arithmetic transforms
and unsupported source payloads throw `data-access/invalid-payload`.

`_projectionVersion: 2` means the source already contributed to additive summaries.
A legacy source without this marker contributes once on its next write. A backfill
must build source plus summaries consistently before setting the marker. Legacy
sources deleted before backfill have no summary contribution to subtract. EMI rows
use deterministic IDs and can be replaced/deleted without additive subtraction.

## Sale state

`deriveSaleState(sale)` returns only derived fields:

| Field | Format/meaning |
| --- | --- |
| `reportEmployeeKey` | Exact employee report dimension identity: `user:ID`, `legacy:NORMALIZED_NAME`, or `legacy:unmatched` |
| `hasPendingEmi` | Boolean; unpaid/unknown installments or missing EMI schedule |
| `emiOutstandingAmount` | Sum of schedule remaining amounts, `null` when unknowable; zero for non-EMI |
| `emiRemainingInstallmentCount` | Number of unpaid/unknown schedule rows |
| `nextEmiDueDate` | Earliest valid unpaid `YYYY-MM-DD`, otherwise `null` |
| `hasOutstandingPayment` | Boolean; includes unknown outstanding balances |
| `outstandingPaymentAmount` | Schedule balance for EMI; other unpaid source balance; `null` when unknown |
| `deliveryState` | `immediate`, `pending`, or `delivered` |
| `exchangeState` | `none`, `pending`, or `received` |
| `financialWarnings` | Array of stable financial issue strings |
| `financialReconciliationRequired` | Financial warnings exist |
| `reconciliationIssues` | All issue strings, including invalid sale/due dates |
| `needsReconciliation` | Any issue exists |

Paid full-payment records retain paid meaning even when legacy `totalPaidAmount` is
zero. EMI balance uses installment amounts minus paid amounts (history sum only if
`paidAmount` is absent), clamped at zero and rounded to cents. Down payment is
compared to stored totals but is never double counted in the queue balance.
Principal mismatches do not hide unpaid dues or rewrite amounts.

Warnings include `invalid-grand-total`, `invalid-down-payment`, `invalid-paid-total`,
`missing-emi-schedule`, `emi-principal-mismatch`, `emi-paid-total-mismatch`, and
`installment-N-` followed by `invalid-amount`, `invalid-paid-amount`,
`invalid-payment-history`, `payment-history-mismatch`, `overpaid`, or
`paid-status-mismatch`. Date issues are `invalid-sale-date` and
`installment-N-invalid-due-date`. Duplicate/missing positive integer installment
numbers reject rather than collide.

## EMI queue

`buildEmiDueDocuments(saleId, sale)` returns an array of `{collection, id, data}`.
Collection is `emiDues`; ID is `projectionId(saleId, installmentNumber)`, joining
URI-encoded parts with `_`. It contains unpaid/unknown installments only.

Each `data` has `schemaVersion: 2`, `sourceRevision`, `saleId`, `installmentNumber`,
`emiMonths` (source value if present, otherwise schedule length),
`dueDateChangeCount` (installment value if present, otherwise zero),
`amount`, `paidAmount`, `remainingAmount`, `dueDate`, `saleDate`, `invoiceNumber`,
`companyId`, `companyName`, `customerId`, `customerName`, `customerPhone`, shared
search fields, and the four reconciliation/warning fields from sale state.
Unknown amounts/dates are `null`; valid dates are strict `YYYY-MM-DD`.
No receipt history is duplicated here: load the known source sale for payments.
Reschedule history is also retained only on the source; the queue copies badge
metadata without duplicating either history array.
Use `needsReconciliation == true` to expose malformed dates/amounts separately
from date-bounded queues. A missing schedule has source reconciliation state but
cannot create fictional installment rows.

## Report summaries

`buildReportContributions(saleId, sale)` returns `{collection, id, data}[]` for
`reportProductPeriods` and `reportEmployeePeriods`. Each sale contributes to
`daily` (`YYYY-MM-DD`), `monthly` (`YYYY-MM`), and `lifetime` (`all`). Invalid or
missing sale dates contribute only to lifetime, with `undatedInvoiceCount: 1`.

ID: `projectionId(periodType, periodKey, dimensionKey)`.
Common fields: `schemaVersion: 2`, `periodType`, `periodKey`, `dimensionKey`,
`quantity`, `revenue`, `invoiceCount`, `reconciliationCount`,
`undatedInvoiceCount`, shared search fields. Stored summaries additionally carry
`_writeRevision`. Metric fields are additive; invoice counts count each invoice
once per dimension (including repeated product lines).

Product fields: `productId` (or `null`), `productName`; dimension key is
`product:ID`, falling back to `legacy:NORMALIZED_NAME` or `legacy:unmatched`.
Product revenue is line quantity × unit price, before invoice-level deductions.
Employee fields: `employeeKey` (= dimension key), `employeeId` (or `null`),
`employeeName`. Explicit salesperson ID gives `user:ID`; legacy text gives
`legacy:NORMALIZED_NAME` or `legacy:unmatched`. Never resolve duplicate names by
choosing a user. Employee revenue is invoice `grandTotal`; quantity sums its lines.
Invalid item metrics contribute zero for the invalid quantity/price and increment
reconciliation count. Consumers must display reconciliation counts with totals.

Contributions are reversed/added on edits, reassignment, date moves and deletion.
Rows with every metric zero are deleted; negative metrics reject the transaction.
Additions/edits may update dimension display metadata and search tokens; subtraction
alone preserves the existing summary metadata/tokens rather than restoring labels
from the removed invoice. Source sales maintain `reportEmployeeKey` from the same
identity derivation as employee summaries. Invoice drilldowns filter this exact
field for both explicit users and complete legacy/unmatched buckets; it is query
support only and does not resolve a legacy name to a user.
Payment-only edits read/write no report summaries when contribution values,
including warning counts, stay unchanged. `reportState/version` contains
`{schemaVersion: 2, revision}` and increments once whenever report contributions
change. Custom report jobs compare this revision before accepting cached output.

## Employee summaries

`buildEmployeeSummaryChanges(collection, id, before, after)` returns
`{collection, id, before, after}[]` with `null` on an absent side.

`attendanceMonths`: ID `projectionId(userId, YYYY-MM)`. Fields: `schemaVersion: 2`,
`userId`, `userName`, `month`, `_writeRevision`, `days`. `days[YYYY-MM-DD]` contains
the complete source attendance day (all status/login/logout/break/payroll fields)
plus authoritative `sourceId`. At most 31 day entries. A second source claiming
an occupied employee/day rejects; edits move/reverse the old date as necessary.
Consumers flatten this map rather than assuming a fixed subset of payroll fields.

`checklistDays`: ID `projectionId(userId, YYYY-MM-DD)`. Fields: `schemaVersion: 2`,
`userId`, `userName`, `date`, `_writeRevision`, `totalCount`, `completedCount`,
`pendingCount`. A complete instance contributes 1/1/0; incomplete contributes 1/0/1.
No checklist bodies are duplicated. Both source types require a user and valid day.

## Complaints and operation markers

`deriveComplaintState` sets `complaintDueDate` to a valid source
`expectedResolutionDate` (`YYYY-MM-DD`), otherwise `9999-12-31`.
Missing/empty expected dates have `complaintDateIssues: []`; malformed nonempty
values add `invalid-expected-resolution-date`. Source dates are preserved.

`_deletionOps/{encodeURIComponent(sourcePath)}` stores `schemaVersion: 2`,
`sourcePath`, `previousRevision`, `revision`, `operationId` (or `null`). A recreated
source advances beyond the retained deletion revision. Markers are not deleted.
Every nondeleted source written by these adapters carries `_deleteMarkerId`, even
when its source ID contains non-ASCII characters, spaces, or literal percent signs.
The adapter always recomputes it and ignores caller overrides/deletion of this field.
For `customers/café ₹%` it is `customers%2Fcaf%C3%A9%20%E2%82%B9%25`.
Rules can read `_deletionOps/$(resource.data._deleteMarkerId)` with `getAfter`
to require a compatible atomic delete marker without reimplementing URI/UTF-8
encoding. Migration must populate this additive source field before enabling that
guard for legacy records. The marker ID equals the adapter's actual deletion path.
`_writeOps/{encodeURIComponent(JSON.stringify([sourcePath, operationId]))}` stores
`schemaVersion: 2`, `sourcePath`, `operationId`, `revision`, `kind` (`update` or
`delete`) to prevent replay. Do not expire these while a caller may replay an ID.
