// Rule 10: strip non letter/digit/whitespace, trim, collapse whitespace, lowercase.
export function clientKey(name: string): string {
  return name
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

// Display form: trimmed, whitespace collapsed (rule 12).
export function clientDisplayName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}
