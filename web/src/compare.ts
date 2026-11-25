// Pure logic for the `vs prior week` column (SPEC rules 76-79, 81, 85). No React, no DOM.
import { checkWeek, formatCents, viewFor, type ReportOutcome, type ReportRow } from "./report";

export interface CompareRow extends ReportRow {
  change: number | null;
}

export type ComparisonView =
  | { kind: "loading"; message: string }
  | { kind: "empty"; message: string }
  | { kind: "error"; message: string }
  | { kind: "table"; rows: CompareRow[]; note?: string };

export function priorWeek(week: string): string {
  const [y, m, d] = week.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCFullYear(y); // years 0000-0099 would otherwise map to 1900-1999
  dt.setUTCDate(dt.getUTCDate() - 7);
  const yy = String(dt.getUTCFullYear()).padStart(4, "0");
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function formatChange(cents: number): string {
  return cents > 0 ? `+${formatCents(cents)}` : formatCents(cents);
}

export function compareRows(current: ReportRow[], prior: ReportRow[]): CompareRow[] {
  const byClient = new Map<string, number>();
  for (const r of prior) byClient.set(r.clientId, r.grossProfitCents);
  return current.map((r) => ({
    ...r,
    change: byClient.has(r.clientId) ? r.grossProfitCents - (byClient.get(r.clientId) as number) : null,
  }));
}

const REPORT_PREFIX = "Could not load report: ";

export function comparisonView(selected: ReportOutcome, prior: ReportOutcome): ComparisonView {
  if (selected.kind === "pending" || prior.kind === "pending") {
    return { kind: "loading", message: "Loading…" };
  }
  const sv = viewFor(selected);
  if (sv.kind !== "table") return sv;
  const pv = viewFor(prior);
  if (pv.kind === "table") return { kind: "table", rows: compareRows(sv.rows, pv.rows) };
  if (pv.kind === "empty") return { kind: "table", rows: compareRows(sv.rows, []) };
  const detail = pv.message.startsWith(REPORT_PREFIX)
    ? pv.message.slice(REPORT_PREFIX.length)
    : pv.message;
  return {
    kind: "table",
    rows: compareRows(sv.rows, []),
    note: `Could not load prior week: ${detail}`,
  };
}

export interface ComparisonLoader {
  readonly view: ComparisonView | null;
  load(week?: string): Promise<void>;
  reset(): void;
}

type Fetched = { status: number; body: unknown };

async function settle(call: () => Promise<Fetched>): Promise<ReportOutcome> {
  try {
    const r = await call(); // the fetch starts synchronously
    return { kind: "response", status: r.status, body: r.body };
  } catch (error) {
    return { kind: "failed", error };
  }
}

export function createComparisonLoader(
  fetchReport: (week?: string) => Promise<Fetched>,
  onChange: () => void = () => {},
): ComparisonLoader {
  let latest = 0;
  let view: ComparisonView | null = null;
  return {
    get view() {
      return view;
    },
    async load(week) {
      const id = ++latest;
      view = { kind: "loading", message: "Loading…" };
      onChange();
      const check = checkWeek(week ?? "");
      if (check.kind !== "valid") {
        const outcome = await settle(() => fetchReport(week));
        if (id !== latest) return;
        view = comparisonView(outcome, { kind: "pending" });
        if (view.kind === "loading") view = viewFor(outcome) as ComparisonView;
        onChange();
        return;
      }
      const [selected, prior] = await Promise.all([
        settle(() => fetchReport(check.week)),
        settle(() => fetchReport(priorWeek(check.week))),
      ]);
      if (id !== latest) return; // a newer load (or reset) owns the view
      view = comparisonView(selected, prior);
      onChange();
    },
    reset() {
      latest++;
      view = null;
      onChange();
    },
  };
}
