# staffing-lite

Express + TypeScript API with an in-memory store.

## Sync behavior

- **Data lives in memory.** The store is in memory, so all data is lost on restart.
- **Invalid records keep the last good copy.** If a stored record comes back invalid on sync, it keeps its last valid version and counts as `failed`.
- **Client names are merged by normalization.** Names are compared ignoring punctuation, case, and whitespace, so `"Acme Corp."` = `"ACME CORP"`.

## Running the app

Put `ATS_API_KEY=<your key>` in a `.env` file, then run `npm run dev`. The server listens on port 3000.
