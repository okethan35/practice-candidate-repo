# Decision log

Why your spec rules are the way they are, for rules that would look arbitrary without a reason. `/spec` proposes lines here alongside each new spec section; you approve the exact text.

The loop's own decisions are in `.claude/ralph/DECISIONS.md`.

## Phase 1: Sync

- Rule 13 (never rename clients): seeded and existing client names stay fixed so report labels don't change between syncs. Rejected: last-seen ATS name wins.
- Rule 10 (strip punctuation): "Acme Corp." and "Acme Corp" are treated as the same client, at the risk of merging names that differ only in punctuation. The README documents it.
- Rule 17 (keep last valid version): dropping a record that turns invalid would make its revenue vanish from the report without anyone noticing. The run's `failed` count makes the problem visible instead.
- Rule 18 (later duplicates fail): counting one `external_id` twice would break rule 4's totals.
- Rule 8 (zero and bill < pay allowed): a 0-hour week and a placement that loses money are real data, not bad data.
- Rules 24 and 21 (502 keeps `lastSyncedAt`): "last synced" must describe the data actually on screen.
- Rule 26 (409, not a queue): overlapping same-tenant runs could overwrite each other and confuse the user. The 409 is an addition to the TASK.md contract.
- Rule 30 (fix placement-by-id leak here): sync is what first puts real tenant data behind that endpoint.
- Deferred to the report section: a markdown hand-check report, computed from the fixture separately from the app code, that lets the owner verify the gross-profit numbers.

## Phase 2: Sync status

- Rules 24, 43 and 45 (failed runs kept outside the store): a run's record can't be recreated later, so every attempt is kept for future debugging. Failures stay out of the store because rule 24's "a 502 leaves the store unchanged" is pinned by an existing test. Rejected: dropping failed runs; keeping successes in the store and failures outside (split history).
- Rule 38 (an all-failed 200 still updates `lastSyncedAt`): a 200 is a successful sync however many records were rejected. Otherwise a feed with one permanently bad record would show "never synced". Confirmed with the interviewer.
- Rule 46 (a 409 is not recorded): it is stopped before it runs, to prevent overlapping syncs, so there is nothing to record.
- Rule 43 (test accessor, no route): the history is kept for later debugging, and showing it is deferred. The accessor exists only so the rules can be tested.
- Rule 47 (no cap): memory is cleared on restart, and nobody needs a limit yet.
