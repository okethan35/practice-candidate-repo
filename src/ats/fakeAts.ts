import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Shape of one record as the ATS sends it. Rates are dollars per hour.
export interface AtsPlacement {
  external_id: string;
  client_name: string;
  worker_name: string;
  bill_rate: number;
  pay_rate: number;
  hours: number;
  week_start: string; // YYYY-MM-DD
  notes?: string;
}

const DEFAULT_FEED = fileURLToPath(new URL("../../fixtures/ats-feed.json", import.meta.url));

// Stands in for a real ATS API call. Needs an API key, like the real thing would.
export async function fetchPlacements(
  tenantId: string,
  apiKey: string | undefined = process.env.ATS_API_KEY,
): Promise<AtsPlacement[]> {
  if (!apiKey) throw new Error("ATS auth failed: ATS_API_KEY is not set");
  const feedPath = process.env.ATS_FEED_PATH ?? DEFAULT_FEED;
  const feed = JSON.parse(await readFile(feedPath, "utf8")) as Record<string, AtsPlacement[]>;
  return feed[tenantId] ?? [];
}
