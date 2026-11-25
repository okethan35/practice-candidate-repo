export type FetchFn = (
  url: string,
  init?: { method?: string; headers?: Record<string, string> },
) => Promise<{ status: number; json(): Promise<unknown> }>;

async function parse(res: { status: number; json(): Promise<unknown> }) {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }
  return { status: res.status, body };
}

export async function getReport(
  fetchFn: FetchFn,
  tenant: string,
  week: string,
): Promise<{ status: number; body: unknown }> {
  const query = week === "" ? "" : `?week=${encodeURIComponent(week)}`;
  const res = await fetchFn(`/api/reports/gross-profit${query}`, {
    headers: { "x-tenant-id": tenant },
  });
  return parse(res);
}

export async function postSync(
  fetchFn: FetchFn,
  tenant: string,
): Promise<{ status: number; body: unknown }> {
  const res = await fetchFn("/api/sync", {
    method: "POST",
    headers: { "x-tenant-id": tenant },
  });
  return parse(res);
}

export async function getStatus(
  fetchFn: FetchFn,
  tenant: string,
): Promise<{ status: number; body: unknown }> {
  const res = await fetchFn("/api/sync/status", {
    headers: { "x-tenant-id": tenant },
  });
  return parse(res);
}
