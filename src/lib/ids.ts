// Short, readable ids like "p_42".
export function newId(prefix: string): string {
  return `${prefix}_${Math.floor(Math.random() * 100)}`;
}
