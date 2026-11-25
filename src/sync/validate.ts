import { clientKey } from "./clientKey";

export interface CleanAtsRecord {
  external_id: string;
  client_name: string;
  worker_name: string;
  bill_rate: number;
  pay_rate: number;
  hours: number;
  week_start: string;
}

export type ValidationResult = { valid: true; record: CleanAtsRecord } | { valid: false };

const INVALID: ValidationResult = { valid: false };

function nonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

function nonNegative(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

function isRealDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCFullYear(y); // years 0-99 would otherwise map to 1900s
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

// Rules 7-9: decide validity and return a cleaned record.
export function validateAtsRecord(raw: unknown): ValidationResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return INVALID;
  const r = raw as Record<string, unknown>;
  const { external_id, client_name, worker_name, week_start, bill_rate, pay_rate, hours } = r;
  if (!nonEmptyString(external_id) || !nonEmptyString(client_name)) return INVALID;
  if (!nonEmptyString(worker_name) || !nonEmptyString(week_start)) return INVALID;
  if (!nonNegative(bill_rate) || !nonNegative(pay_rate) || !nonNegative(hours)) return INVALID;
  if (!isRealDate(week_start)) return INVALID;
  if (clientKey(client_name) === "") return INVALID;
  return {
    valid: true,
    record: {
      external_id: external_id.trim(),
      client_name,
      worker_name: worker_name.trim(),
      bill_rate,
      pay_rate,
      hours,
      week_start,
    },
  };
}
