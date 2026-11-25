import { randomUUID } from "node:crypto";

// Unique ids like "p_<uuid>".
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}
