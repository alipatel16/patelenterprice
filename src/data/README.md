# Shared data access, version 2

All functions below are named exports. `usePagedCollection` and `QueryStatus` also
have default exports. Search helpers are pure and have no browser/Firebase
imports, so migration and write adapters must reuse them.

```js
normalizeSearch(raw) // string
searchState(raw) // 'browse' | 'short' | 'search'
buildSearchTokens(collectionName, data) // string[]
withSearchFields(collectionName, data) // original fields + search fields

fetchPage(db, collectionName, {
  search = '', filters = [], sort = [['createdAt', 'desc']], cursor = null,
  pageSize = 15, includeTotal = true, requireReady = false,
}) // Promise<{ rows, total, lastDoc, hasNext }>

fetchAggregate(db, collectionName, {
  filters = [], aggregates = { count: { op: 'count' } }, requireReady = false,
}) // Promise<object>, e.g. { count: 100, revenue: 12345 }

getKnownDocument(db, collectionName, id, { ttlMs = 60000 } = {})
// Promise<object with id | null>; ttlMs: 0 bypasses cached/in-flight data
invalidateCollections(db, names) // names: collection-name string[]
subscribeInvalidation(db, callback) // returns unsubscribe()
setDataAccessScope(db, scopeKey) // clear caches/pending requests on identity change

usePagedCollection(db, collectionName, options)
// { rows, total, loading, error, page, hasNext,
//   setPage, next, previous, refresh }
// options: search, filters, sort, pageSize, includeTotal, requireReady, cursor
// page is zero-based; cursor optionally seeds page zero. The hook owns later cursors.

<QueryStatus error={error} loading={loading} search={rawSearch} sx={optionalSx} />
```

`filters` are serializable `[field, operator, value]` triples, for example
`[['companyId', '==', id], ['createdAt', '>=', timestamp]]`. `sort` contains
`[field, direction]` pairs. A sum descriptor is
`{ op: 'sum', field: 'grandTotal' }`; count uses `{ op: 'count' }`.
Rows always include the authoritative document `id`. Aggregates have no limit;
page totals use the exact same filters/search but omit sort/cursor/limit.
`includeTotal: false` returns `total: null`. A full page enables Next; the final
empty page is acceptable, without an extra look-ahead read. Firebase snapshot
cursors preserve its document-ID tie break when sort values are equal.

Ordinary pages and dropdowns use 15; existing compact screens may use 10.
`fetchPage` rejects invalid sizes and permits up to 100 only for explicit
administrative/report paging. Use the default 15 for ordinary screens.

Blank raw search browses immediately. One normalized character returns no rows
and makes no read request. At two characters the hook waits 300ms. Every raw
query/database/filter/sort change hides old rows, resets the cursor chain and
rejects older responses, including during the debounce interval. `setPage(n)`
accepts visited pages and the next adjacent page only when its cursor is known.
`refresh()` invalidates the collection and resets all subscribed views.

Search uses exactly one `where('searchTokens', 'array-contains', normalizedTerm)`.
All predicates precede the limit. Search always checks the known document
`appSettings/dataAccessV2` for `{ version: 2, readyCollections: ['customers', ...] }`.
An unready/missing/version-mismatched setting rejects with
`error.code === 'data-access/not-ready'`; there is no fallback scan. Non-search
browse/aggregate consumers can opt in with `requireReady: true`. Invalidate
`appSettings` when readiness changes. A scope change while readiness is pending
rejects with `data-access/stale-scope` before starting collection transport.

`withSearchFields` preserves original display/source fields, adds normalized
`nameLower` (and `makerLower` when provided), `searchTokens`, and `searchVersion: 2`.
Tokens include normalized full-field and word prefixes, reference prefixes,
and phone digit prefixes/suffixes. A national 10-digit phone also indexes its
`91` form; `91`/`+91` 12-digit forms index the national form. No arbitrary middle
substring matching is promised. Long notes/descriptions are excluded. Supported
text fields and phone aliases are explicitly listed in `search.js`.

`SEARCH_LIMITS` bounds each indexed text field to 160 Unicode code points,
2000 distinct tokens, and a conservative 100000-byte token budget. Phones over
15 digits are rejected. Unsupported input throws instead of silently truncating
search coverage. Migrations must report these failures before marking a
collection ready. Unicode is normalized with NFKC, case folded, trimmed, and
repeated whitespace collapsed. Numeric phone-shaped queries discard formatting.

Caches are isolated by Firestore instance and explicit auth scope (store/user/
role), bounded to 200 entries and 200 in-flight deduplication slots per instance,
with a default 60-second TTL. Page, total, aggregate, document and inventory keys
are separate; page revisits reuse entries and Next does not refetch a cached
total. A scope change clears every entry; late old requests cannot repopulate
it. Collection invalidation evicts that collection and notifies subscribers with
its `names` array. Scope/global clearing notifies with `null`. No callback carries
cached document data. Cached stock/balances are display data, never authoritative
financial-write inputs.

Compatibility details:

- `FirestoreAutocomplete` retains controlled selections, caps the merged dropdown
  at 15 including the selection, uses the common hook, displays errors in helper
  text, and supports `filters` (`extraConstraints` alias) as filter triples.
  Pass `sort` explicitly for collections needing a field other than `nameLower`.
  Previous per-field/minimum-character/debounce overrides are superseded by the
  universal contract. `invalidateSearchCache(collectionName, db)` scopes eviction;
  old one-argument calls conservatively evict the named collection in all stores.
- `getOrFetch(key, fetcher, db)` caches/deduplicates with explicit db. Old callers
  omitting db run uncached to prevent cross-store leakage. Results over 100 rows
  are rejected. The caller must still bound its source query; Task 3 replaces
  legacy arbitrary-fetcher consumers. `getCached(key, db)` /
  `setCached(key, data, db)` have 60-second expiry and scope invalidation.
- `getInventoryForProducts(db, ids)` accepts up to 100 visible/selected IDs,
  reads at most two mappings per product, deduplicates and caches per scope, and
  throws on duplicates. Missing mappings return zero. `invalidateInventoryCache(
  ids, db)` evicts inventory pages and lookups; omitted db conservatively evicts
  registered stores. It never arbitrarily selects a duplicate mapping.
- `useFirestoreCollection` exposes `error`, delegates reads to bounded helpers,
  normalizes added/updated search fields and invalidates after writes. `getAll()`
  is deprecated and throws. Explicit jobs use `fetchAdministrativePage(options)`.
  The transactional adapters in Task 2 replace its interim generic write paths.
