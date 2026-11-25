// Pure logic for the last-synced status area and sync-failure message (SPEC rules 71-75, 81, 85).
// No React, no DOM.
import type { ReportOutcome } from "./report";

export interface LastRun {
  inserted: number;
  updated: number;
  unchanged: number;
  failed: number;
}

export type StatusView =
  | { kind: "loading"; message: string }
  | { kind: "error"; message: string }
  | { kind: "status"; lastSynced: string; counts: string | null };

export function formatLastSynced(iso: string | null, timeZone?: string): string {
  if (iso === null) return "Never synced";
  const text = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    ...(timeZone ? { timeZone } : {}),
  })
    .format(new Date(iso))
    .replace(/[  ]/g, " ");
  return `Last synced ${text}`;
}

export function countsLine(lastRun: LastRun | null): string | null {
  if (!lastRun) return null;
  return `${lastRun.inserted} inserted · ${lastRun.updated} updated · ${lastRun.unchanged} unchanged · ${lastRun.failed} failed`;
}

function errorDetail(outcome: Extract<ReportOutcome, { kind: "response" }>): string {
  const { body, status } = outcome;
  if (body && typeof body === "object" && "error" in body) {
    const e = (body as { error: unknown }).error;
    if (typeof e === "string" && e !== "") return e;
  }
  return `HTTP ${status}`;
}

function failureDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function statusViewFor(outcome: ReportOutcome): StatusView {
  if (outcome.kind === "pending") return { kind: "loading", message: "Loading…" };
  const prefix = "Could not load sync status: ";
  if (outcome.kind === "failed") {
    return { kind: "error", message: prefix + failureDetail(outcome.error) };
  }
  const { status, body } = outcome;
  if (status === 200 && body && typeof body === "object") {
    const { lastSyncedAt, lastRun } = body as { lastSyncedAt?: unknown; lastRun?: unknown };
    if (lastSyncedAt === null || typeof lastSyncedAt === "string") {
      return {
        kind: "status",
        lastSynced: formatLastSynced(lastSyncedAt),
        counts: countsLine(lastRun && typeof lastRun === "object" ? (lastRun as LastRun) : null),
      };
    }
  }
  return { kind: "error", message: prefix + errorDetail(outcome) };
}

export function syncMessageFor(outcome: ReportOutcome): string | null {
  if (outcome.kind === "pending") return null;
  if (outcome.kind === "failed") return `Sync failed: ${failureDetail(outcome.error)}`;
  if (outcome.status === 200) return null;
  return `Sync failed: ${errorDetail(outcome)}`;
}

export interface StatusLoader {
  readonly view: StatusView | null;
  load(): Promise<void>;
  reset(): void;
}

export function createStatusLoader(
  fetchStatus: () => Promise<{ status: number; body: unknown }>,
  onChange: () => void = () => {},
): StatusLoader {
  let latest = 0;
  let view: StatusView | null = null;
  return {
    get view() {
      return view;
    },
    async load() {
      const id = ++latest;
      view = statusViewFor({ kind: "pending" });
      onChange();
      let outcome: ReportOutcome;
      try {
        const r = await fetchStatus();
        outcome = { kind: "response", status: r.status, body: r.body };
      } catch (error) {
        outcome = { kind: "failed", error };
      }
      if (id !== latest) return; // a newer load or a reset owns the view
      view = statusViewFor(outcome);
      onChange();
    },
    reset() {
      latest++;
      view = null;
      onChange();
    },
  };
}
