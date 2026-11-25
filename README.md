# staffing-lite

Express + TypeScript API with an in-memory store.

## Sync behavior

- **Data lives in memory.** The store is in memory, so all data is lost on restart.
- **Invalid records keep the last good copy.** If a stored record comes back invalid on sync, it keeps its last valid version and counts as `failed`.
- **Client names are merged by normalization.** Names are compared ignoring punctuation, case, and whitespace, so `"Acme Corp."` = `"ACME CORP"`.
- **Every sync attempt is kept in a run history.** Every sync attempt that runs, ATS failures included, is kept in an in-memory run history. Nothing displays it yet.

## Running the app

Put `ATS_API_KEY=<your key>` in a `.env` file, then run `npm run dev`. The server listens on port 3000.

## Running the web app

1. Start the API on port 3000 (see "Running the app" above).
2. In another terminal, run `cd web`.
3. Run `npm install`.
4. Run `npm run dev`.

## Week comparison and appearance

- **`vs prior week` column.** The column compares each client's gross profit with the week 7 days earlier. It shows only when a week is selected, and shows `—` for a client with no prior-week row.
- **Appearance.** The page follows the system light or dark appearance. There is no toggle.

## What we cut

- **Report pagination.** The gross-profit report returns every row in one response.
- **Money beyond JavaScript's exact integer range.** Amounts above about $90 trillion are not supported, because they exceed the exact integer range of JavaScript numbers.
