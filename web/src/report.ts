// Pure logic for the gross-profit report page (SPEC rules 65-69). No React, no DOM.

export interface ReportRow {
  clientId: string;
  clientName: string;
  revenueCents: number;
  payCents: number;
  burdenCents: number;
  grossProfitCents: number;
}

export type WeekCheck =
  | { kind: "valid"; week: string }
  | { kind: "blank" }
  | { kind: "invalid"; message: string };

export const WEEK_HINT = "No records found. Use YYYY-MM-DD, e.g. 2026-11-02.";

function isRealDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCFullYear(y); // years 0000-0099 would otherwise map to 1900-1999
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function checkWeek(input: string): WeekCheck {
  const week = input.trim();
  if (week === "") return { kind: "blank" };
  if (!isRealDate(week)) return { kind: "invalid", message: WEEK_HINT };
  return { kind: "valid", week };
}

export function formatCents(n: number): string {
  const abs = Math.abs(n);
  const dollars = Math.floor(abs / 100);
  const cents = abs % 100;
  const grouped = String(dollars).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${n < 0 ? "-" : ""}$${grouped}.${String(cents).padStart(2, "0")}`;
}

export type ReportOutcome =
  | { kind: "pending" }
  | { kind: "response"; status: number; body: unknown }
  | { kind: "failed"; error: unknown };

export type ReportView =
  | { kind: "loading"; message: string }
  | { kind: "empty"; message: string }
  | { kind: "error"; message: string }
  | { kind: "table"; rows: ReportRow[] };

function errorFromBody(body: unknown): string | undefined {
  if (body && typeof body === "object" && "error" in body) {
    const e = (body as { error: unknown }).error;
    if (typeof e === "string" && e !== "") return e;
  }
  return undefined;
}

export function viewFor(outcome: ReportOutcome): ReportView {
  if (outcome.kind === "pending") return { kind: "loading", message: "Loading…" };
  if (outcome.kind === "failed") {
    const e = outcome.error;
    const msg = e instanceof Error ? e.message : String(e);
    return { kind: "error", message: `Could not load report: ${msg}` };
  }
  const { status, body } = outcome;
  const rows =
    body && typeof body === "object" ? (body as { rows?: unknown }).rows : undefined;
  if (status === 200 && Array.isArray(rows)) {
    if (rows.length === 0) return { kind: "empty", message: "No records found" };
    return { kind: "table", rows: rows as ReportRow[] };
  }
  const detail = errorFromBody(body) ?? `HTTP ${status}`;
  return { kind: "error", message: `Could not load report: ${detail}` };
}

export interface ReportLoader {
  readonly view: ReportView | null;
  load(week?: string): Promise<void>;
}

export function createReportLoader(
  fetchReport: (week?: string) => Promise<{ status: number; body: unknown }>,
  onChange: () => void = () => {},
): ReportLoader {
  let latest = 0;
  let view: ReportView | null = null;
  return {
    get view() {
      return view;
    },
    async load(week) {
      const id = ++latest;
      view = viewFor({ kind: "pending" });
      onChange();
      let outcome: ReportOutcome;
      try {
        const r = await fetchReport(week);
        outcome = { kind: "response", status: r.status, body: r.body };
      } catch (error) {
        outcome = { kind: "failed", error };
      }
      if (id !== latest) return; // a newer load owns the view
      view = viewFor(outcome);
      onChange();
    },
  };
}
