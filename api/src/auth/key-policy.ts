/**
 * The key lock: what an API key's permissions let it do, route by route.
 *
 * API keys keep the permission list they always had (`api_keys.permissions`,
 * a JSON array). This file is the single place that says which of those
 * permission strings a route needs. JWT (browser) sessions never come through
 * here; they are still authorized by role exactly as before.
 *
 * Permission strings a key can hold:
 *   'write'             send logs (the ingest endpoints). Nothing else.
 *   'read' / 'search'   read: search, stats, dashboards, alerts list...
 *   'alerts:write'      create / change / delete alerts and silences
 *   'dashboards:write'  create / change / delete dashboards and panels
 *   'admin'             everything except sending logs (settings, keys, users...)
 *   '*'                 everything
 *
 * A key with `allowed_indexes` set (scoped key) may only read through the
 * routes that filter results to those indexes (SCOPE_AWARE_READS). Any other
 * read, and any alert / dashboard / admin change, is refused for a scoped key,
 * because those routes cannot promise to stay inside the key's indexes.
 */

export type KeyNeed = 'none' | 'ingest' | 'read' | 'alerts:write' | 'dashboards:write' | 'admin';

/** Which permission strings satisfy each need. */
export const KEY_GRANTS: Record<Exclude<KeyNeed, 'none'>, readonly string[]> = {
  ingest: ['write', '*'],
  read: ['read', 'search', 'admin', '*'],
  'alerts:write': ['alerts:write', 'admin', '*'],
  'dashboards:write': ['dashboards:write', 'admin', '*'],
  admin: ['admin', '*'],
};

/** Every permission string the key lock understands (for the UI and docs). */
export const KNOWN_KEY_PERMISSIONS = ['read', 'search', 'write', 'alerts:write', 'dashboards:write', 'admin', '*'] as const;

export function keyHasNeed(permissions: readonly string[] | null | undefined, need: KeyNeed): boolean {
  if (need === 'none') return true;
  const perms = permissions ?? [];
  return KEY_GRANTS[need].some((p) => perms.includes(p));
}

type Rule = { methods: '*' | readonly string[]; path: RegExp; need: KeyNeed };

const MUTATING = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;
const ANY = '*' as const;

/**
 * Ordered rules; the first match wins. Anything that matches no rule falls to
 * the default: GET/HEAD/OPTIONS need 'read', every other method needs 'admin'.
 * So a new write route is locked to admin keys until someone decides otherwise.
 */
const RULES: readonly Rule[] = [
  // --- Public or self-authenticated routes: the key is irrelevant here. ---
  { methods: ANY, path: /^\/auth\/(setup-required|setup|login|refresh)$/, need: 'none' },
  // Only the two share-link routes are public. Anything deeper under
  // /dashboards/public/... is a normal dashboard route whose ":id" happens to
  // be "public" (e.g. DELETE /dashboards/public/variables/<id>) and must be
  // checked like any other dashboard change.
  { methods: ['GET'], path: /^\/dashboards\/public\/[^/]+$/, need: 'none' },
  { methods: ['POST'], path: /^\/dashboards\/public\/[^/]+\/query$/, need: 'none' },
  { methods: ['GET'], path: /^\/ingest\/(guide|schema|health)$/, need: 'none' },
  { methods: ['GET'], path: /^\/search\/(ai\/suggestions|backend|lookup-tables)$/, need: 'none' },
  { methods: ['POST'], path: /^\/search\/validate$/, need: 'none' },
  { methods: ANY, path: /^\/utils\//, need: 'none' },
  { methods: ['GET'], path: /^\/dsl\//, need: 'none' },
  { methods: ['GET'], path: /^\/notifications\/(services|status)$/, need: 'none' },
  { methods: ['GET'], path: /^\/mcp\/(status|health)$/, need: 'none' },
  // MCP messages are tied to an already-opened (admin-checked) SSE session.
  { methods: ['POST'], path: /^\/mcp\/messages$/, need: 'none' },

  // --- Sending logs: the only thing a 'write' key may do. ---
  { methods: ['POST'], path: /^\/ingest\/generate-test-data$/, need: 'admin' },
  { methods: ANY, path: /^\/ingest\//, need: 'ingest' },

  // --- Admin-only, including reads that expose secrets or spend money. ---
  { methods: ANY, path: /^\/auth\/(api-keys|users|audit-log|change-password|logout)(\/|$)/, need: 'admin' },
  { methods: ANY, path: /^\/settings\/(system|ai|internal-logging|logs)(\/|$)/, need: 'admin' },
  { methods: ANY, path: /^\/notifications\/(channels|test)(\/|$)/, need: 'admin' }, // channel URLs carry tokens
  { methods: ANY, path: /^\/synthetic\/tests(\/|$)/, need: 'admin' }, // check configs can carry auth headers
  { methods: ANY, path: /^\/pull-collectors(\/|$)/, need: 'admin' },
  { methods: ANY, path: /^\/demo(\/|$)/, need: 'admin' }, // export dumps every index
  { methods: ANY, path: /^\/ai(\/|$)/, need: 'admin' }, // LLM spend, unscoped context
  { methods: ANY, path: /^\/search\/ai$/, need: 'admin' }, // LLM spend, same as /ai/*
  { methods: ANY, path: /^\/mcp\/sse$/, need: 'admin' }, // MCP tools create alerts/dashboards, unscoped
  { methods: ANY, path: /^\/geoip\/cache(\/|$)/, need: 'admin' },

  // --- POSTs that only read. ---
  { methods: ['POST'], path: /^\/search\/(query|parse)$/, need: 'read' },
  { methods: ['POST'], path: /^\/agent\/(search|alerts\/test)$/, need: 'read' },
  { methods: ['POST'], path: /^\/alerts\/test$/, need: 'read' },
  { methods: ['POST'], path: /^\/dashboards\/[^/]+\/(export|variables\/preview-options|variables\/[^/]+\/options)$/, need: 'read' },
  { methods: ['POST'], path: /^\/geoip\/lookup$/, need: 'read' },
  { methods: ['POST'], path: /^\/cim\/(normalize|validate|auto-detect|compliance)$/, need: 'read' },
  { methods: ['POST'], path: /^\/routing-rules\/evaluate$/, need: 'read' },
  { methods: ['POST'], path: /^\/field-extractions\/test$/, need: 'read' },
  { methods: ['POST'], path: /^\/knowledge\/field-extractions\/[^/]+\/test$/, need: 'read' },
  { methods: ['POST'], path: /^\/templates\/[^/]+\/test$/, need: 'read' },
  { methods: ['POST'], path: /^\/saved-searches\/[^/]+\/run$/, need: 'read' },
  { methods: ['POST'], path: /^\/reports\/generate$/, need: 'read' },

  // --- Alert changes. ---
  // Runs every user's alerts at once, script actions included.
  { methods: ['POST'], path: /^\/alerts\/evaluate-all$/, need: 'admin' },
  { methods: MUTATING, path: /^\/(alerts|silences)(\/|$)/, need: 'alerts:write' },
  { methods: MUTATING, path: /^\/agent\/alerts(\/|$)/, need: 'alerts:write' },
  { methods: ['POST'], path: /^\/saved-searches\/[^/]+\/create-alert$/, need: 'alerts:write' },

  // --- Dashboard changes. ---
  // A share link runs the dashboard's panel queries for anyone, on every
  // index, so publishing (or changing a link) needs an admin key. Changes to a
  // dashboard that is already shared are refused in routes/dashboards.ts.
  { methods: MUTATING, path: /^\/dashboards\/[^/]+\/share$/, need: 'admin' },
  { methods: MUTATING, path: /^\/dashboards(\/|$)/, need: 'dashboards:write' },
  { methods: ['POST'], path: /^\/saved-searches\/[^/]+\/create-panel$/, need: 'dashboards:write' },
];

/**
 * Reads a SCOPED key may make: these routes filter what they return to the
 * key's allowed indexes (search, stats and the agent API all apply
 * index_name IN (...) through auth/index-scope.ts), or return nothing from
 * the log store at all.
 */
const SCOPE_AWARE_READS: readonly RegExp[] = [
  /^\/search\/(query|parse|fields|fields\/discover|fields\/[^/]+\/values|logs\/[^/]+\/(full-message|context))$/,
  /^\/stats\/(overview|timeseries|severity|indexes|indexes\/details|indexes\/[^/]+\/fields|sources|storage)$/,
  /^\/agent(\/(search|summary|indexes|fields))?$/,
  /^\/auth\/me$/,
  /^\/reports\/generate$/,
  // Added by sibling branches in the 2026-10-21 release; both filter to the
  // key's indexes (services/home-summary.ts hides alerts from scoped keys;
  // services/lab-lights.ts keeps only alerts on allowed indexes).
  /^\/stats\/home$/,
  /^\/status\/lights$/,
];

/**
 * Put a path in the one form the rules are written for, the way Express will
 * route it: Express matches paths case-insensitively and tolerates repeated
 * slashes and a trailing slash, so "/AUTH//API-KEYS/" reaches the same
 * handler as "/auth/api-keys" and must get the same decision.
 */
export function normalizeKeyPath(path: string): string {
  const p = path.toLowerCase().replace(/\/{2,}/g, '/');
  return p.length > 1 && p.endsWith('/') ? p.replace(/\/+$/, '') || '/' : p;
}

/** What permission a request with an API key needs on this method + path. */
export function apiKeyNeed(method: string, rawPath: string): KeyNeed {
  const m = method.toUpperCase();
  const path = normalizeKeyPath(rawPath);
  for (const rule of RULES) {
    if (rule.methods !== ANY && !rule.methods.includes(m)) continue;
    if (rule.path.test(path)) return rule.need;
  }
  return m === 'GET' || m === 'HEAD' || m === 'OPTIONS' ? 'read' : 'admin';
}

/**
 * Ingest routes a SCOPED key may not use: the alert pop-ups the desktop agent
 * polls carry alert text and log lines from whatever index the alert watched,
 * and nothing ties a pop-up to an index, so only an unscoped key gets them.
 */
const INGEST_UNSCOPED_ONLY: readonly RegExp[] = [/^\/ingest\/notifications(\/|$)/];

export function isScopeAwareRead(rawPath: string): boolean {
  const path = normalizeKeyPath(rawPath);
  return SCOPE_AWARE_READS.some((re) => re.test(path));
}

export type KeyDecision = { allowed: true; need: KeyNeed } | { allowed: false; need: KeyNeed; reason: string };

/**
 * The whole decision for one API-key request: does this key's permission list
 * (and index scope) allow this method + path?
 */
export function decideApiKey(
  method: string,
  path: string,
  permissions: readonly string[] | null | undefined,
  allowedIndexes: readonly string[] | null | undefined,
): KeyDecision {
  const need = apiKeyNeed(method, path);
  if (need === 'none') return { allowed: true, need };

  if (!keyHasNeed(permissions, need)) {
    return {
      allowed: false,
      need,
      reason: `This API key can't do that: it needs the '${need}' permission (it has ${JSON.stringify(permissions ?? [])}).`,
    };
  }

  const scoped = !!allowedIndexes && allowedIndexes.length > 0;
  if (scoped && need === 'ingest' && INGEST_UNSCOPED_ONLY.some((re) => re.test(normalizeKeyPath(path)))) {
    return {
      allowed: false,
      need,
      reason:
        'This API key is limited to some indexes. Alert pop-ups can carry logs from any index, so only a key that is not limited can fetch them.',
    };
  }
  if (scoped && need !== 'ingest' && !(need === 'read' && isScopeAwareRead(path))) {
    return {
      allowed: false,
      need,
      reason:
        "This API key is limited to some indexes, so it may only send logs to them and read them through search, stats and the agent API.",
    };
  }

  return { allowed: true, need };
}
