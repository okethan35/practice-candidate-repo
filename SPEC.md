# Spec

Your project's behavior contract, written by you, never by the agents. `/grill` sharpens an idea, `/spec` turns it into a numbered section here, and after you merge it `/new-track` slices the section into Ralph Loop issues.

Each section has a heading and numbered rules; each rule is one testable statement with its exact output. For example:

```
# Phase 1: <feature>

1. <input or situation> returns <exact output>.
2. <edge case> returns <exact output>.
```

# Phase 1: Sync (`POST /api/sync`)

## Auth
1. `POST /api/sync` without `x-tenant-id` returns `401 { error: "missing x-tenant-id" }`; with an unknown tenant it returns `403 { error: "unknown tenant" }`. Neither calls the ATS, takes the sync lock or records a run.
2. The request body is ignored.

## Success response
3. An authorized request calls `fetchPlacements(tenantId)` for the calling tenant and returns `200 { runId, inserted, updated, unchanged, failed }`. `runId` is a non-empty string, unique across runs. Each count is a non-negative integer.
4. `inserted + updated + unchanged + failed` equals the number of records in the ATS payload.
5. With the default fixture, the first sync for `t_alpha` returns `inserted: 5, updated: 0, unchanged: 0, failed: 1` (A-1006 has no `bill_rate`), and the first sync for `t_beta` returns `inserted: 3, updated: 0, unchanged: 0, failed: 0`.
6. A second sync for `t_alpha` with an unchanged feed returns `inserted: 0, updated: 0, unchanged: 5, failed: 1`, and `t_alpha` still has exactly 5 synced placements.

## Validation
7. A record is valid only when all of these hold:
   - `external_id`, `client_name`, `worker_name` and `week_start` are strings that are non-empty after trimming.
   - `bill_rate`, `pay_rate` and `hours` are JSON numbers that are finite and ≥ 0. A numeric string such as `"42.1"` is invalid.
   - `week_start` matches `YYYY-MM-DD` and is a real calendar date (`2026-02-30` and `2026-11-2` are invalid).
   - `client_name` normalizes (rule 10) to a non-empty key.

   Every other record counts as `failed`.
8. Zero rates or hours are valid. `bill_rate` below `pay_rate` is valid. `week_start` does not have to be a Monday. `notes` and unknown fields never affect validity and are not stored.
9. `external_id` and `worker_name` are trimmed before matching and storage.

## Clients
10. A client name's normalized key is computed in this order:
    - remove every character that is not a Unicode letter, digit or whitespace;
    - trim;
    - collapse runs of whitespace to one space;
    - lowercase.

    `"Acme Corp"`, `"ACME CORP"`, `"  Acme Corp "` and `"Acme Corp."` all give `acme corp`.
11. A valid record links to the calling tenant's existing client with the same key, seeded clients included. With the default fixture, A-1001, A-1002 and A-1005 link to `c_alpha_acme`, and `t_alpha` still has exactly 2 clients after sync.
12. When no client matches, sync creates one for the calling tenant. Its name is the first valid record's `client_name` in that run, trimmed and with whitespace collapsed. With the default fixture, `t_beta` gains exactly one client, named `"Hooli"`.
13. Sync never renames an existing client. An invalid record never creates a client. Clients are never matched across tenants.

## Upsert
14. A record matches a stored placement by (tenant, `externalId`). Sync never matches or modifies a stored placement that has no `externalId`.
15. A valid record with a new `external_id` is stored with `tenantId`, `clientId`, `externalId`, `workerName`, `billRate`, `payRate`, `hours` and `weekStart`, and counts as `inserted`. This includes a record that was invalid in an earlier run.
16. For a valid record that matches a stored placement:
    - if any of `clientId`, `workerName`, `billRate`, `payRate`, `hours` or `weekStart` differs, those fields are overwritten and the record counts as `updated`;
    - otherwise it counts as `unchanged`.

    A `client_name` change that normalizes to the same client counts as `unchanged`.
17. An invalid record whose `external_id` is already stored leaves the stored placement unchanged and counts as `failed`.
18. In one payload, the second and later occurrences of an `external_id` each count as `failed`, whatever happened to the first.
19. Sync leaves stored placements whose `externalId` is absent from the payload unchanged and does not count them.
20. An empty payload (for example a tenant with no feed entry) returns `200` with all four counts `0` and still records a run.

## Run record
21. Every `200` records the calling tenant's latest run as `{ runId, inserted, updated, unchanged, failed, finishedAt }`, where `finishedAt` is an ISO 8601 string, and sets the tenant's `lastSyncedAt` to `finishedAt`.

## ATS failure
22. If `fetchPlacements` rejects, the response is `502 { error: "ATS request failed: <error message>" }`. If it resolves to something that is not an array, the response is `502 { error: "ATS request failed: payload is not an array" }`.
23. With `ATS_API_KEY` unset, the response is `502 { error: "ATS request failed: ATS auth failed: ATS_API_KEY is not set" }`.
24. After a `502`, the store is unchanged: no placement, client, latest run or `lastSyncedAt` is written or changed. The attempt is added to the run history (rule 45).
25. Sync applies changes only after it has processed the whole payload, so no request leaves a partial write.

## Concurrency
26. While a sync for a tenant is in flight, another `POST /api/sync` for the same tenant returns `409 { error: "sync already in progress" }`. That request does not call the ATS, change the store or record a run.
27. The lock clears when the in-flight sync finishes with any status, so the next request runs normally.
28. A sync in flight for one tenant never blocks or changes another tenant's sync. Two tenants syncing at once both succeed independently.

## Tenant isolation
29. A sync never reads, creates or modifies another tenant's placements, clients or run record.
30. `GET /api/placements/:id` for a placement that belongs to another tenant returns `404 { error: "not found" }`.

## Ids
31. `newId` returns ids that are unique across calls (based on `crypto.randomUUID`). `runId` and the ids of new clients and placements come from it.

## Web
32. The "Sync now" button is disabled from the click until the sync response arrives, whatever its status.

## README
33. The README states that:
    - data lives in memory and is lost on restart;
    - a stored record that comes back invalid keeps its last valid version and counts as `failed`;
    - client names are merged by rule 10's normalization (punctuation, case and whitespace).

# Phase 2: Sync status (`GET /api/sync/status`)

## Auth
34. `GET /api/sync/status` without `x-tenant-id` returns `401 { error: "missing x-tenant-id" }`; with an unknown tenant it returns `403 { error: "unknown tenant" }`.
35. Status never calls the ATS, takes the sync lock, or changes the store or the run history. The query string and body are ignored.

## Response
36. An authorized request returns `200 { lastSyncedAt, lastRun }` for the calling tenant. `lastSyncedAt` is the tenant's `lastSyncedAt` and `lastRun` is the tenant's latest run (rule 21), as `{ runId, inserted, updated, unchanged, failed, finishedAt }`.
37. Before the tenant's first `200` sync, it returns `200 { lastSyncedAt: null, lastRun: null }`.
38. After a `200` sync, `lastRun` equals that sync's response body plus its `finishedAt`, and `lastSyncedAt` equals `lastRun.finishedAt`. This holds when `failed > 0`, when every record failed, and for an empty payload (rule 20).
39. After a `502`, status returns the same body as before the `502`: the previous successful run, or both fields `null` if there is none.
40. Two status requests with no sync between them return identical bodies.
41. While a sync for the tenant is in flight, status returns `200` with the state from before that sync. It never returns `409`.
42. A `200` or `502` sync for `t_alpha` leaves `t_beta`'s status unchanged, and status never returns another tenant's data.

## Run history
43. Each app created by `createApp` keeps a per-tenant run history outside the store, oldest entry first, lost on restart. A new app starts with an empty history. `app.locals.syncRuns(tenantId)` returns a copy of that tenant's entries, or `[]` when there are none.
44. Every `200` sync appends `{ runId, outcome: "success", inserted, updated, unchanged, failed, finishedAt }`, with the same values as the tenant's latest run.
45. Every `502` sync appends `{ runId, outcome: "failed", error, finishedAt }`. `runId` comes from `newId`, `error` equals the `error` string in the `502` body, and `finishedAt` is an ISO 8601 string. The `502` body stays as in rule 22.
46. `401`, `403` and `409` responses append nothing.
47. A sync never appends to another tenant's history. The history has no size cap.

## README
48. The README states that every sync attempt that runs, ATS failures included, is kept in an in-memory run history that nothing displays yet.

# Phase 3: Gross-profit report (`GET /api/reports/gross-profit`)

## Auth
49. `GET /api/reports/gross-profit` without `x-tenant-id` returns `401 { error: "missing x-tenant-id" }`; with an unknown tenant it returns `403 { error: "unknown tenant" }`.
50. The report never calls the ATS, takes the sync lock, or changes the store or the run history. The body and every query parameter other than `week` are ignored.

## Response
51. An authorized request returns `200 { rows }` with one row per client of the calling tenant that has at least one placement in the selected set, as `{ clientId, clientName, revenueCents, payCents, burdenCents, grossProfitCents }`. `clientName` is the stored client's name (rule 13). A placement counts under its current `clientId`.
52. The selected set is every stored placement of the calling tenant, with or without `externalId`, filtered by `week` (rule 57).
53. When the selected set is empty, the response is `200 { rows: [] }`. This includes a tenant that has never synced.

## Money
54. For each placement, in integer cents:
    - revenue = hours × bill rate × 100, rounded;
    - pay = hours × pay rate × 100, rounded;
    - burden = 12% of the rounded pay, rounded;
    - gross profit = revenue − pay − burden.

    Rounding goes to the nearest whole cent on the exact decimal value, with halves rounded up. 1 hour at a bill rate of `1.005` gives revenue `101`.
55. A row's `revenueCents`, `payCents`, `burdenCents` and `grossProfitCents` are the sums of its placements' values. Every money field is an integer. Zero hours give zeros. A bill rate below the pay rate gives a negative `grossProfitCents`.
56. With the default fixture, after one sync of each tenant, rows are (revenue / pay / burden / gross profit, in cents):
    - all weeks, `t_alpha`: Globex 375200 / 244000 / 29280 / 101920, then Acme Corp 265468 / 182193 / 21863 / 61412;
    - all weeks, `t_beta`: Initech 438000 / 292000 / 35040 / 110960, then Hooli 169200 / 108360 / 13003 / 47837;
    - `week=2026-11-02`, `t_alpha`: Globex 220000 / 144000 / 17280 / 58720, then Acme Corp 172368 / 118493 / 14219 / 39656;
    - `week=2026-11-02`, `t_beta`: Initech 228000 / 152000 / 18240 / 57760, then Hooli 169200 / 108360 / 13003 / 47837;
    - `week=2026-11-09`, `t_alpha`: Globex 155200 / 100000 / 12000 / 43200, then Acme Corp 93100 / 63700 / 7644 / 21756;
    - `week=2026-11-09`, `t_beta`: Initech 210000 / 140000 / 16800 / 53200 only.

## Week filter
57. `week` selects placements whose `weekStart` equals it exactly. A missing or empty `week` selects all weeks.
58. A `week` that is not a real `YYYY-MM-DD` date by rule 7 (for example `banana`, `2026-02-30`, `2026-11-2` or ` 2026-11-02`), or a `week` given more than once, returns `200 { rows: [] }`. So does a real date with no placements.

## Order
59. Rows are sorted by `grossProfitCents`, highest first. Ties are broken by `clientName` in ascending code-unit order, then by `clientId` ascending.

## Consistency
60. While a sync for the tenant is in flight, the report returns `200` with the data from before that sync. After a `502`, it returns the same body as before. Two requests with no sync between them return identical bodies.
61. A report never includes another tenant's placements or clients, even when both tenants have a client with the same name.
62. A placement that sync moved to another client counts only under its current client. A client left with no placements in the selected set has no row.

## Web
63. The page has a tenant picker listing `t_alpha` and `t_beta`. Every request the page makes, "Sync now" included, sends the picked tenant in `x-tenant-id`.
64. The page loads the report on open, on a tenant change, when the week is submitted (Enter or an "Apply" button), and after any "Sync now" response. A blank week loads all weeks. After an error, any of these triggers loads again.
65. The week input is trimmed before it is checked. A trimmed value that is not a real `YYYY-MM-DD` date (rule 7) sends no request and shows `No records found. Use YYYY-MM-DD, e.g. 2026-11-02.`
66. While a report request is pending, the page shows `Loading…`. Empty `rows` shows `No records found`. A non-200 response shows `Could not load report: <error>`, where `<error>` is the body's `error`, or `HTTP <status>` when there is none. A network failure shows `Could not load report: <message>`. Otherwise the page shows a table of client, revenue, pay, burden and gross profit, in `rows` order.
67. Money is shown in US dollars with two decimals and thousands separators: `101920` → `$1,019.20`, `-1234` → `-$12.34`, `0` → `$0.00`.
68. Only the latest report request's response is shown, and an earlier response that arrives later is discarded. A reload after "Sync now" is for the tenant picked when the sync response arrives.
69. The week check, money formatting, the choice of what to show, and the latest-request rule live in plain `.ts` modules in `web/src/`. They are tested from `tests/*.test.ts`.

## README
70. The README states how to run the web app (`cd web`, `npm install`, `npm run dev`, with the API on port 3000). Under what was cut, it lists report pagination and money amounts beyond JavaScript's exact integer range (about $90 trillion). It keeps every phrase `tests/readme.test.ts` checks.

# Phase 4: Web page (last-synced status, week comparison, design)

## Last-synced status
71. The page loads `GET /api/sync/status` on open, on a tenant change, and after any "Sync now" response, sending the picked tenant in `x-tenant-id`. Only the latest status request's response is shown (rule 68).
72. `lastSyncedAt` is shown as `Last synced <date>`, formatted in US English in the browser's time zone as month abbreviation, day, year and 12-hour time, for example `Last synced Nov 25, 2026, 3:42 PM`. `lastSyncedAt: null` shows `Never synced`.
73. When `lastRun` is not null, a secondary line below it shows `<inserted> inserted · <updated> updated · <unchanged> unchanged · <failed> failed`, all four counts in that order, zeros included. When `lastRun` is null the line is not shown.
74. While a status request is pending, the status area shows `Loading…`. A non-200 response shows `Could not load sync status: <error>`, where `<error>` is the body's `error`, or `HTTP <status>` when there is none. A network failure shows `Could not load sync status: <message>`. A status error never hides or blocks the report.
75. A "Sync now" response other than `200` shows `Sync failed: <error>` next to the button, with the same `<error>` rule as rule 74, for example `Sync failed: sync already in progress`. A network failure shows `Sync failed: <message>`. The message stays until the next "Sync now" click or tenant change. A `200` shows no message. The raw response body is never shown.

## Week comparison
76. When the applied week is a valid, non-blank date (rule 65), the page also requests the report for the date 7 calendar days earlier, across month and year boundaries: `2026-11-09` → `2026-11-02`, `2026-03-02` → `2026-02-23`, `2026-01-01` → `2025-12-25`. When all weeks are shown, no prior-week request is made and no comparison column is shown.
77. With a week applied, the table has a `vs prior week` column after gross profit. Each row's value is its `grossProfitCents` minus the `grossProfitCents` of the prior-week row with the same `clientId`. A client with no prior-week row shows `—`. Rows and their order come from the selected week only. A client that appears only in the prior week has no row.
78. The change is shown in US dollars like rule 67, with a sign: `-15520` → `-$155.20`, `1234` → `+$12.34`, `0` → `$0.00`.
79. With a week applied, the page shows `Loading…` until both the selected-week and prior-week responses arrive. A selected-week failure shows rule 66's error and no table. If only the prior-week request fails, the table shows with `—` in every `vs prior week` cell and the note `Could not load prior week: <error>`, with the same `<error>` rule as rule 74. Rule 68's latest-request rule applies to the pair: a pair from an earlier load is discarded.
80. With the default fixture after one sync of `t_alpha`, `week=2026-11-09` shows Globex `-$155.20` and Acme Corp `-$179.00`, and `week=2026-11-02` shows `—` for every client.

## Tenant change
81. A tenant change clears the last-synced status, the sync failure message, the report table and the prior-week note before the new requests are sent. Data from the previous tenant is never shown under the new tenant.

## Design
82. The page follows the system appearance through `prefers-color-scheme`, light and dark, and has no appearance toggle.
83. At a viewport width of 360px the page has no horizontal scroll. The table scrolls horizontally inside its own container. Money columns are right-aligned and use tabular figures.
84. Colors are defined as named light and dark tokens in `web/src/theme.ts`. Every text-and-background token pair the page uses has a contrast ratio of at least 4.5:1 in both appearances, checked by a test in `tests/`. Every interactive control shows a visible focus ring when it has keyboard focus.
85. The last-synced formatting, the counts line, the prior-week date, the change computation and formatting, and the choice of what the status area and comparison column show live in plain `.ts` modules in `web/src/` and are tested from `tests/*.test.ts` (rule 69).

## README
86. The README states that the `vs prior week` column compares each client's gross profit with the week 7 days earlier and appears only when a week is selected, and that the page follows the system light or dark appearance. It keeps every phrase `tests/readme.test.ts` checks.
