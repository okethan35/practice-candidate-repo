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
