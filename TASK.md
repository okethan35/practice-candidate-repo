# Task: Sync dashboard for a staffing agency

Time box: 2 hours. Use agents any way you like. Talk through your decisions as you go.

## Context
Staffing agencies get placement data from an applicant tracking system (ATS). Owners want to see gross profit by client without reconciling spreadsheets. Build a small tool that pulls ATS data in and shows gross profit by client.

Each agency is a tenant. Agencies must never see each other's data.

## What's here
- Express and TypeScript API skeleton with an in-memory store and two seeded tenants (`t_alpha`, `t_beta`).
- Fake auth: the tenant comes from the `x-tenant-id` header.
- A fake ATS client in `src/ats/fakeAts.ts` that reads `fixtures/ats-feed.json`.
- Vitest and supertest. `npm run check` runs typecheck and tests.

## What to build
1. **Sync.** `POST /api/sync` pulls the calling tenant's records with `fetchPlacements(tenantId)` and stores them. Records are identified by `external_id`. Running it again must not create duplicates.
   Returns `200 { runId, inserted, updated, unchanged, failed }`. Counts are numbers. If the ATS call itself fails, return `502 { error }`.
2. **Status.** `GET /api/sync/status` returns
   `{ lastSyncedAt: string | null, lastRun: null | { runId, inserted, updated, unchanged, failed, finishedAt } }`
   for the calling tenant.
3. **Report.** `GET /api/reports/gross-profit`, with an optional `?week=YYYY-MM-DD` that matches `week_start`. Returns
   `{ rows: [{ clientId, clientName, revenueCents, payCents, burdenCents, grossProfitCents }] }`
   with one row per client, highest gross profit first.
   - Revenue is hours times bill rate.
   - Pay is hours times pay rate.
   - Burden is 12% of pay.
   - Gross profit is revenue minus pay minus burden.
   - Money is integer cents in the API. Round revenue, pay and burden to whole cents per record, then sum.
4. **Web page** in `web/` (Vite, React, TypeScript). A tenant picker, a "Sync now" button, last-synced status, and a gross-profit-by-client table shown in dollars. Handle loading, empty and error states.

## Keep
Express, the `createApp(store?)` export in `src/server.ts`, header-based tenant auth, and the fixture format. Everything else is yours to change.

## Deliver
A working app, tests you trust, and a short README with how to run it, your decisions, and what you cut. Be ready to demo and explain it.

## Not specified on purpose
Some things are left open. Ask the interviewer.
