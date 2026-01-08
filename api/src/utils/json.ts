/**
 * Safe JSON parsing utilities to prevent crashes from corrupted data.
 */

/**
 * Safely parse JSON with a default fallback value.
 * Logs a warning if parsing fails.
 */
export function safeJsonParse<T>(
  json: string | null | undefined,
  defaultValue: T,
  context?: string
): T {
  if (!json) return defaultValue;
  try {
    return JSON.parse(json) as T;
  } catch {
    console.warn(`[JSON Parse Error]${context ? ` ${context}:` : ''} ${json.substring(0, 100)}`);
    return defaultValue;
  }
}
