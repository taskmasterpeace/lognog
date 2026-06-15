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
  // Index names are force-lowercased on ingest (sanitizeIndexName), but the
  // allow-list is stored verbatim. Compare case-insensitively so a key scoped to
  // e.g. "Hey-Youre-Hired" still matches its own lowercased index.
  const target = indexName.toLowerCase();
  return allowedIndexes.some((allowed) => allowed.toLowerCase() === target);
}

/**
 * Default index used by the storage layer when a record carries no `index_name`
 * (see `COALESCE(index_name, 'main')` in the DB backend). Records that omit the
 * field are effectively written to this index, so scope checks must use it too.
 */
const DEFAULT_INDEX = 'main';

/**
 * Scan a batch of records and return the first record's effective `index_name`
 * that the key is NOT allowed to write to, or `null` if every record passes.
 *
 * An unscoped key (`null`/`undefined`/empty `allowedIndexes`) always returns
 * `null` (all records allowed). Records with no `index_name` are treated as the
 * storage default ('main'), matching how they actually land in the database.
 *
 * Run this on the FINAL records (after any `processLogs`/routing-rule overrides)
 * so an admin routing rule cannot smuggle a record into an out-of-scope index.
 */
export function firstDisallowedIndex(
  allowedIndexes: string[] | null | undefined,
  // Index signature keeps this assignable from record shapes that omit
  // `index_name` entirely (e.g. SmartThings logs) without TS's weak-type check.
  records: Array<{ index_name?: string; [key: string]: unknown }>,
): string | null {
  if (!allowedIndexes || allowedIndexes.length === 0) return null;
  for (const record of records) {
    const indexName = record.index_name || DEFAULT_INDEX;
    if (!isIndexAllowed(allowedIndexes, indexName)) {
      return indexName;
    }
  }
  return null;
}
