import type { Client, Placement } from "../store";

export interface ReportRow {
  clientId: string;
  clientName: string;
  revenueCents: number;
  payCents: number;
  burdenCents: number;
  grossProfitCents: number;
}

export interface PlacementCents {
  revenueCents: number;
  payCents: number;
  burdenCents: number;
  grossProfitCents: number;
}

// Exact decimal value of a finite non-negative double, as digits / 10^scale.
function toDecimal(n: number): { digits: bigint; scale: number } {
  const m = /^(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(n.toString());
  if (!m) throw new Error(`not a plain decimal: ${n}`);
  const frac = m[2] ?? "";
  let digits = BigInt(m[1] + frac);
  let scale = frac.length - Number(m[3] ?? 0);
  if (scale < 0) {
    digits *= 10n ** BigInt(-scale);
    scale = 0;
  }
  return { digits, scale };
}

// round(hours * rate * 100) to the nearest cent, halves up, on exact decimals.
function cents(hours: number, rate: number): number {
  const h = toDecimal(hours);
  const r = toDecimal(rate);
  const num = h.digits * r.digits * 100n;
  const den = 10n ** BigInt(h.scale + r.scale);
  return Number((2n * num + den) / (2n * den));
}

export function placementCents(p: Pick<Placement, "hours" | "billRate" | "payRate">): PlacementCents {
  const revenueCents = cents(p.hours, p.billRate);
  const payCents = cents(p.hours, p.payRate);
  const burdenCents = Math.floor((payCents * 12 * 2 + 100) / 200);
  return { revenueCents, payCents, burdenCents, grossProfitCents: revenueCents - payCents - burdenCents };
}

function isRealDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCFullYear(y);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

// `week` is the raw query value: undefined/"" = all weeks; anything that is
// not a single real YYYY-MM-DD string selects nothing.
export function grossProfitRows(
  clients: Client[],
  placements: Placement[],
  tenantId: string,
  week: unknown,
): ReportRow[] {
  let weekFilter: string | null = null;
  if (week !== undefined && week !== "") {
    if (typeof week !== "string" || !isRealDate(week)) return [];
    weekFilter = week;
  }
  const names = new Map<string, string>();
  for (const c of clients) if (c.tenantId === tenantId) names.set(c.id, c.name);

  const rows = new Map<string, ReportRow>();
  for (const p of placements) {
    if (p.tenantId !== tenantId) continue;
    if (weekFilter !== null && p.weekStart !== weekFilter) continue;
    const name = names.get(p.clientId);
    if (name === undefined) continue;
    const c = placementCents(p);
    let row = rows.get(p.clientId);
    if (!row) {
      row = { clientId: p.clientId, clientName: name, revenueCents: 0, payCents: 0, burdenCents: 0, grossProfitCents: 0 };
      rows.set(p.clientId, row);
    }
    row.revenueCents += c.revenueCents;
    row.payCents += c.payCents;
    row.burdenCents += c.burdenCents;
    row.grossProfitCents += c.grossProfitCents;
  }
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return [...rows.values()].sort(
    (a, b) => b.grossProfitCents - a.grossProfitCents || cmp(a.clientName, b.clientName) || cmp(a.clientId, b.clientId),
  );
}
