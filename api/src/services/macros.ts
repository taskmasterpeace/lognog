/**
 * Search macros — reusable named DSL fragments, referenced in a query as
 * `name` (backticks; unused elsewhere in the DSL). Expanded to their stored
 * definition before the query is lexed/compiled. Macros may reference other
 * macros (and saved searches, if the resolver provides them); a depth guard
 * turns cycles into a clear error instead of an infinite loop.
 */

const MACRO_REF = /`([a-zA-Z_][a-zA-Z0-9_.-]*)`/g;

/**
 * Expand macro references in a query.
 * @param query   the raw DSL query
 * @param resolve name -> definition, or undefined for an unknown name (left as-is)
 * @param maxDepth expansion passes before assuming a cycle
 */
export function expandMacros(
  query: string,
  resolve: (name: string) => string | undefined,
  maxDepth = 20,
): string {
  let current = query;
  for (let depth = 0; depth < maxDepth; depth++) {
    let replaced = false;
    current = current.replace(MACRO_REF, (match, name: string) => {
      const definition = resolve(name);
      if (definition === undefined) return match; // unknown: leave untouched
      replaced = true;
      return definition;
    });
    if (!replaced) return current;
  }
  throw new Error('Macro expansion exceeded max depth (possible cycle in macro definitions)');
}
