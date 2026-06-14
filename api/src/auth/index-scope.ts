// api/src/auth/index-scope.ts

/**
 * Decide whether an API key may write to / read a given index.
 *
 * A `null`, `undefined`, or empty `allowedIndexes` means UNSCOPED — the key may
 * touch every index. This keeps all existing keys backward-compatible and is the
 * seam multi-tenancy (Phase 5) builds on later.
 */
export function isIndexAllowed(
  allowedIndexes: string[] | null | undefined,
  indexName: string,
): boolean {
  if (!allowedIndexes || allowedIndexes.length === 0) return true;
  return allowedIndexes.includes(indexName);
}
