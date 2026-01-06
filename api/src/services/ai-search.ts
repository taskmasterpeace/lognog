/**
 * AI-powered natural language to Spunk Query Language translator
 */

interface TranslationResult {
  query: string;
  confidence: number;
  explanation: string;
}

// Common field mappings
const FIELD_ALIASES: Record<string, string> = {
  'host': 'hostname',
  'hosts': 'hostname',
  'server': 'hostname',
  'servers': 'hostname',
  'machine': 'hostname',
  'machines': 'hostname',
  'app': 'app_name',
  'apps': 'app_name',
  'application': 'app_name',
  'applications': 'app_name',
  'program': 'app_name',
  'service': 'app_name',
  'services': 'app_name',
  'level': 'severity',
  'ip': 'source_ip',
  'source': 'hostname',
  'user': 'user',
  'users': 'user',
  // SaaS field aliases (Hey You're Hired)
  'email': 'user_email',
  'plan': 'plan_name',
  'subscription': 'plan_name',
  'campaign': 'utm_campaign',
  'medium': 'utm_medium',
  'feature': 'feature_name',
  'utm': 'utm_source',
  // LogNog self-monitoring aliases
  'api': 'action',
  'endpoint': 'path',
  'latency': 'duration_ms',
  'response_time': 'duration_ms',
  'category': 'category',
};

// Severity mappings
const SEVERITY_TERMS: Record<string, string> = {
  'emergency': 'severity=0',
  'emergencies': 'severity=0',
  'alert': 'severity<=1',
  'alerts': 'severity<=1',
  'critical': 'severity<=2',
  'error': 'severity<=3',
  'errors': 'severity<=3',
  'warning': 'severity<=4',
  'warnings': 'severity<=4',
  'notice': 'severity<=5',
  'notices': 'severity<=5',
  'info': 'severity=6',
  'informational': 'severity=6',
  'debug': 'severity=7',
};

// Time range patterns
const TIME_PATTERNS: Array<{ pattern: RegExp; handler: (match: RegExpMatchArray) => { earliest?: string; latest?: string } }> = [
  {
    pattern: /last\s+(\d+)\s+(minute|minutes|min|mins|hour|hours|hr|hrs|day|days|week|weeks)/i,
    handler: (match) => {
      const amount = parseInt(match[1], 10);
      const unit = match[2].toLowerCase();
      let minutes = amount;
      if (unit.startsWith('hour') || unit.startsWith('hr')) minutes = amount * 60;
      else if (unit.startsWith('day')) minutes = amount * 60 * 24;
      else if (unit.startsWith('week')) minutes = amount * 60 * 24 * 7;
      return { earliest: `-${minutes}m` };
    },
  },
  {
    pattern: /today/i,
    handler: () => ({ earliest: '-0d@d' }),
  },
  {
    pattern: /yesterday/i,
    handler: () => ({ earliest: '-1d@d', latest: '-0d@d' }),
  },
  {
    pattern: /this\s+week/i,
    handler: () => ({ earliest: '-0w@w' }),
  },
  {
    pattern: /past\s+(\d+)\s+(minute|minutes|hour|hours|day|days)/i,
    handler: (match) => {
      const amount = parseInt(match[1], 10);
      const unit = match[2].toLowerCase();
      let minutes = amount;
      if (unit.startsWith('hour')) minutes = amount * 60;
      else if (unit.startsWith('day')) minutes = amount * 60 * 24;
      return { earliest: `-${minutes}m` };
    },
  },
];

// Query pattern templates
const QUERY_PATTERNS: Array<{
  patterns: RegExp[];
  handler: (match: RegExpMatchArray, input: string) => TranslationResult;
}> = [
  // "show me errors" / "find all errors" / "get errors"
  {
    patterns: [
      /(?:show|find|get|list|display)\s+(?:me\s+)?(?:all\s+)?(\w+)\s*(?:from|in|on)?\s*(\w+)?/i,
    ],
    handler: (match, input) => {
      const term = match[1].toLowerCase();
      const target = match[2]?.toLowerCase();

      // Check if it's a severity term
      if (SEVERITY_TERMS[term]) {
        let query = `search | where ${SEVERITY_TERMS[term]}`;
        if (target && (FIELD_ALIASES[target] || target.includes('-'))) {
          const field = FIELD_ALIASES[target] || 'hostname';
          query = `search | where ${SEVERITY_TERMS[term]} AND ${field}='${target}'`;
        }
        return {
          query,
          confidence: 0.85,
          explanation: `Searching for ${term} level logs${target ? ` from ${target}` : ''}`,
        };
      }

      // Check if it's a field reference
      if (FIELD_ALIASES[term]) {
        return {
          query: `search | stats count by ${FIELD_ALIASES[term]}`,
          confidence: 0.75,
          explanation: `Counting logs grouped by ${term}`,
        };
      }

      // Default to text search
      return {
        query: `search ${term}`,
        confidence: 0.7,
        explanation: `Searching for "${term}" in log messages`,
      };
    },
  },

  // "how many errors" / "count of errors"
  {
    patterns: [
      /(?:how\s+many|count\s+(?:of)?|number\s+of)\s+(\w+)(?:\s+(?:from|in|on|by)\s+(\w+))?/i,
    ],
    handler: (match) => {
      const term = match[1].toLowerCase();
      const groupBy = match[2]?.toLowerCase();

      let baseQuery = 'search';
      if (SEVERITY_TERMS[term]) {
        baseQuery = `search | where ${SEVERITY_TERMS[term]}`;
      } else if (term !== 'logs' && term !== 'events') {
        baseQuery = `search ${term}`;
      }

      if (groupBy) {
        const field = FIELD_ALIASES[groupBy] || groupBy;
        return {
          query: `${baseQuery} | stats count by ${field}`,
          confidence: 0.9,
          explanation: `Counting ${term} grouped by ${groupBy}`,
        };
      }

      return {
        query: `${baseQuery} | stats count`,
        confidence: 0.9,
        explanation: `Counting total ${term}`,
      };
    },
  },

  // "top 10 hosts" / "top hosts by errors"
  {
    patterns: [
      /top\s+(\d+)?\s*(\w+)(?:\s+(?:by|with)\s+(?:most\s+)?(\w+))?/i,
    ],
    handler: (match) => {
      const limit = match[1] ? parseInt(match[1], 10) : 10;
      const field = match[2].toLowerCase();
      const metric = match[3]?.toLowerCase();

      const mappedField = FIELD_ALIASES[field] || field;

      let query: string;
      if (metric && SEVERITY_TERMS[metric]) {
        query = `search | where ${SEVERITY_TERMS[metric]} | stats count by ${mappedField} | sort desc | limit ${limit}`;
      } else {
        query = `search | stats count by ${mappedField} | sort desc | limit ${limit}`;
      }

      return {
        query,
        confidence: 0.9,
        explanation: `Top ${limit} ${field}${metric ? ` by ${metric}` : ' by log count'}`,
      };
    },
  },

  // "failed logins" / "login failures"
  {
    patterns: [
      /(?:failed|unsuccessful)\s+(?:login|ssh|auth|authentication)s?/i,
      /(?:login|ssh|auth|authentication)\s+(?:failure|fail)s?/i,
    ],
    handler: () => ({
      query: `search app_name=sshd Failed | stats count by hostname source_ip`,
      confidence: 0.95,
      explanation: 'Finding failed SSH authentication attempts',
    }),
  },

  // "successful logins"
  {
    patterns: [
      /(?:successful|accepted)\s+(?:login|ssh|auth|authentication)s?/i,
    ],
    handler: () => ({
      query: `search app_name=sshd Accepted | stats count by hostname`,
      confidence: 0.95,
      explanation: 'Finding successful SSH authentication events',
    }),
  },

  // "database errors" / "postgres errors"
  {
    patterns: [
      /(?:database|db|postgres|postgresql|mysql|sql)\s+(?:error|errors|issue|issues|problem|problems)/i,
    ],
    handler: () => ({
      query: `search app_name=postgres | where severity<=3`,
      confidence: 0.9,
      explanation: 'Finding database error logs',
    }),
  },

  // "nginx traffic" / "web server logs"
  {
    patterns: [
      /(?:nginx|web\s*server|http)\s+(?:traffic|logs?|requests?|access)/i,
    ],
    handler: () => ({
      query: `search app_name=nginx`,
      confidence: 0.9,
      explanation: 'Finding nginx/web server access logs',
    }),
  },

  // "firewall blocks" / "blocked connections"
  {
    patterns: [
      /(?:firewall|fw)\s+(?:block|blocks|blocked|deny|denied)/i,
      /blocked?\s+(?:connection|traffic|request)s?/i,
    ],
    handler: () => ({
      query: `search BLOCK OR blocked | stats count by source_ip | sort desc count`,
      confidence: 0.85,
      explanation: 'Finding blocked firewall events',
    }),
  },

  // "slowest queries" / "slow database queries"
  {
    patterns: [
      /(?:slow|slowest|long\s*running)\s+(?:query|queries|request|requests)/i,
    ],
    handler: () => ({
      query: `search duration | where app_name='postgres' | sort desc timestamp | limit 50`,
      confidence: 0.8,
      explanation: 'Finding slow database queries',
    }),
  },

  // "disk space" / "out of memory"
  {
    patterns: [
      /(?:disk\s*space|storage|out\s+of\s+(?:memory|space)|oom|no\s+space)/i,
    ],
    handler: () => ({
      query: `search "No space" OR "Out of memory" OR OOM OR "disk full"`,
      confidence: 0.85,
      explanation: 'Finding disk space or memory issues',
    }),
  },

  // "docker containers" / "container logs"
  {
    patterns: [
      /(?:docker|container)s?\s+(?:log|logs|event|events|status)/i,
    ],
    handler: () => ({
      query: `search app_name=dockerd`,
      confidence: 0.9,
      explanation: 'Finding Docker container events',
    }),
  },

  // "what happened on [host]"
  {
    patterns: [
      /what\s+(?:happened|occurred|went\s+wrong)\s+(?:on|at|with)\s+([a-zA-Z0-9\-_]+)/i,
    ],
    handler: (match) => ({
      query: `search | where hostname='${match[1]}' | sort desc timestamp | limit 100`,
      confidence: 0.85,
      explanation: `Recent events on ${match[1]}`,
    }),
  },

  // "errors from [app/host]"
  {
    patterns: [
      /errors?\s+(?:from|in|on)\s+([a-zA-Z0-9\-_]+)/i,
    ],
    handler: (match) => {
      const target = match[1];
      // Guess if it's a hostname or app
      const isLikelyHost = target.includes('-') || target.match(/\d/);
      const field = isLikelyHost ? 'hostname' : 'app_name';
      return {
        query: `search | where severity<=3 AND ${field}='${target}'`,
        confidence: 0.85,
        explanation: `Errors from ${target}`,
      };
    },
  },

  // "traffic by status code"
  {
    patterns: [
      /(?:traffic|requests?)\s+(?:by|grouped\s+by)\s+(?:status|response)\s*(?:code)?/i,
    ],
    handler: () => ({
      query: `search app_name=nginx | stats count by message | sort desc count | limit 20`,
      confidence: 0.7,
      explanation: 'Web traffic grouped by response',
    }),
  },

  // "summary" / "overview" / "what's happening"
  {
    patterns: [
      /(?:summary|overview|what'?s?\s+happening|status)/i,
    ],
    handler: () => ({
      query: `search | stats count by severity | sort severity`,
      confidence: 0.8,
      explanation: 'Overview of logs by severity level',
    }),
  },

  // ============================================
  // SaaS Analytics Patterns (Hey You're Hired)
  // ============================================

  // "new signups" / "user signups" / "registrations"
  {
    patterns: [
      /(?:new\s+)?(?:signup|signups|sign\s*up|registrations?|new\s+users?)/i,
    ],
    handler: () => ({
      query: `search message:"User signup completed" | stats count by user_email | sort -count`,
      confidence: 0.95,
      explanation: 'Finding user signup events',
    }),
  },

  // "signups by utm" / "signups by source" / "marketing channels"
  {
    patterns: [
      /(?:signup|signups|registrations?)\s+(?:by|from)\s+(?:utm|source|channel|marketing)/i,
      /marketing\s+(?:channel|source)s?\s+(?:performance|stats|breakdown)/i,
    ],
    handler: () => ({
      query: `search message:"User signup completed" | stats count by utm_source utm_campaign | sort -count`,
      confidence: 0.95,
      explanation: 'Signups breakdown by marketing channel',
    }),
  },

  // "checkout" / "checkouts" / "checkout attempts"
  {
    patterns: [
      /(?:checkout|checkouts|checkout\s+attempts?|payment\s+page)/i,
    ],
    handler: () => ({
      query: `search message:"Checkout" | stats count by user_email plan_name | sort -count`,
      confidence: 0.9,
      explanation: 'Finding checkout/payment page events',
    }),
  },

  // "conversions" / "successful payments" / "subscriptions"
  {
    patterns: [
      /(?:conversion|conversions|successful\s+payments?|new\s+subscriptions?|paying\s+users?)/i,
    ],
    handler: () => ({
      query: `search message:"Subscription created" OR message:"Payment successful" | stats count by user_email plan_name | sort -count`,
      confidence: 0.95,
      explanation: 'Finding successful conversion events',
    }),
  },

  // "profile completions" / "onboarding"
  {
    patterns: [
      /(?:profile\s+completion|onboarding|profile\s+wizard|setup\s+progress)/i,
    ],
    handler: () => ({
      query: `search message:"Profile completion" | stats count by user_email completion_step | sort -count`,
      confidence: 0.9,
      explanation: 'Finding profile/onboarding completion events',
    }),
  },

  // "feature usage" / "ai usage" / "job recommendations"
  {
    patterns: [
      /(?:feature\s+usage|ai\s+usage|job\s+recommendations?|cover\s+letters?)/i,
    ],
    handler: () => ({
      query: `search feature_name:* | stats count by feature_name user_email | sort -count`,
      confidence: 0.9,
      explanation: 'Finding feature usage events',
    }),
  },

  // "oauth failures" / "login failures" / "google auth"
  {
    patterns: [
      /(?:oauth|google)\s+(?:failure|failures|error|errors|fail|failed)/i,
      /(?:login|auth)\s+(?:failure|failures)\s+(?:oauth|google)?/i,
    ],
    handler: () => ({
      query: `search message:"OAuth login failed" | stats count by error_reason provider | sort -count`,
      confidence: 0.95,
      explanation: 'Finding OAuth authentication failures',
    }),
  },

  // "payment failures" / "stripe errors" / "billing issues"
  {
    patterns: [
      /(?:payment|billing|stripe)\s+(?:failure|failures|error|errors|issue|issues)/i,
      /(?:subscription\s+sync|webhook)\s+(?:failure|failures|error|errors)/i,
    ],
    handler: () => ({
      query: `search message:"Subscription sync failed" OR message:"Stripe webhook error" OR message:"Payment failed" | table timestamp user_email error message`,
      confidence: 0.95,
      explanation: 'Finding payment and billing errors',
    }),
  },

  // "api failures" / "external api" / "jobspy errors"
  {
    patterns: [
      /(?:external\s+)?api\s+(?:failure|failures|error|errors)/i,
      /(?:jobspy|active\s+jobs)\s+(?:error|errors|failure|failures)/i,
    ],
    handler: () => ({
      query: `search message:"External API" (message~"failed" OR message~"error") | stats count by api_name error_type | sort -count`,
      confidence: 0.9,
      explanation: 'Finding external API failures',
    }),
  },

  // "slow searches" / "slow api" / "performance issues"
  {
    patterns: [
      /slow\s+(?:job\s+)?(?:search|searches|api|requests?)/i,
      /(?:job\s+search|api)\s+performance/i,
    ],
    handler: () => ({
      query: `search message:"Job search completed" duration_ms>5000 | table timestamp user_email duration_ms | sort -duration_ms`,
      confidence: 0.9,
      explanation: 'Finding slow job search requests',
    }),
  },

  // "funnel" / "conversion funnel" / "user journey"
  {
    patterns: [
      /(?:conversion\s+)?funnel|user\s+journey/i,
    ],
    handler: () => ({
      query: `search message:"User signup completed" OR message:"Profile completion" OR message:"Checkout" OR message:"Subscription created" | stats count by message | sort timestamp`,
      confidence: 0.85,
      explanation: 'Conversion funnel overview',
    }),
  },

  // "user activity" / "what did [email] do"
  {
    patterns: [
      /(?:what\s+did|activity\s+for|events\s+for|logs\s+for)\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+)/i,
      /user\s+activity\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+)/i,
    ],
    handler: (match) => ({
      query: `search user_email="${match[1]}" | sort -timestamp | limit 100`,
      confidence: 0.95,
      explanation: `Activity for user ${match[1]}`,
    }),
  },

  // "users on [plan]" / "pro users" / "starter users"
  {
    patterns: [
      /(?:users?\s+on|subscribers?\s+(?:on|to))\s+(\w+)\s+(?:plan)?/i,
      /(pro|starter|basic|premium)\s+(?:plan\s+)?users?/i,
    ],
    handler: (match) => ({
      query: `search plan_name="${match[1]}" | stats dc(user_email) as users`,
      confidence: 0.85,
      explanation: `Users on ${match[1]} plan`,
    }),
  },

  // "churn" / "cancellations" / "subscription canceled"
  {
    patterns: [
      /(?:churn|cancellations?|canceled?\s+subscriptions?)/i,
    ],
    handler: () => ({
      query: `search message:"Subscription canceled" OR message:"Subscription cancelled" | stats count by user_email plan_name | sort -count`,
      confidence: 0.9,
      explanation: 'Finding subscription cancellation events',
    }),
  },

  // "revenue" / "mrr" / "payments today"
  {
    patterns: [
      /(?:revenue|mrr|payments?\s+today|billing\s+today)/i,
    ],
    handler: () => ({
      query: `search message:"Payment successful" | stats count sum(amount) by plan_name`,
      confidence: 0.8,
      explanation: 'Payment and revenue summary',
    }),
  },

  // ============================================
  // LogNog Self-Monitoring Patterns
  // ============================================

  // "lognog errors" / "lognog api errors" / "internal errors"
  {
    patterns: [
      /(?:lognog|internal|self)\s+(?:api\s+)?errors?/i,
      /api\s+errors?\s+(?:in\s+)?lognog/i,
    ],
    handler: () => ({
      query: `search app_scope="lognog" success=false | stats count by action category | sort desc count`,
      confidence: 0.9,
      explanation: 'Showing LogNog internal errors by action and category',
    }),
  },

  // "lognog performance" / "api latency" / "slow requests"
  {
    patterns: [
      /(?:lognog|api)\s+(?:performance|latency)/i,
      /slow\s+(?:api\s+)?requests?/i,
      /api\s+response\s+times?/i,
    ],
    handler: () => ({
      query: `search app_scope="lognog" category="api" | stats avg(duration_ms) p95(duration_ms) max(duration_ms) by path | sort desc avg(duration_ms)`,
      confidence: 0.9,
      explanation: 'API endpoint performance statistics',
    }),
  },

  // "failed logins" / "login failures" / "authentication failures"
  {
    patterns: [
      /(?:failed|failure)\s+logins?/i,
      /login\s+failures?/i,
      /authentication\s+failures?/i,
      /auth\s+failures?/i,
    ],
    handler: () => ({
      query: `search app_scope="lognog" action="auth.login_failed" | stats count by username | sort desc count`,
      confidence: 0.95,
      explanation: 'Failed login attempts grouped by username',
    }),
  },

  // "alert activity" / "triggered alerts" / "alert history"
  {
    patterns: [
      /alert\s+(?:activity|history)/i,
      /triggered\s+alerts?/i,
      /alert\s+triggers?/i,
    ],
    handler: () => ({
      query: `search app_scope="lognog" category="alert" | stats count by action alert_name | sort desc count`,
      confidence: 0.9,
      explanation: 'Alert execution activity summary',
    }),
  },

  // "ingest rate" / "ingestion stats" / "logs ingested"
  {
    patterns: [
      /ingest(?:ion)?\s+(?:rate|stats?|statistics)/i,
      /logs?\s+ingested/i,
      /ingestion\s+volume/i,
    ],
    handler: () => ({
      query: `search app_scope="lognog" action="ingest.batch" | timechart span=1h sum(event_count) by source_type`,
      confidence: 0.9,
      explanation: 'Log ingestion rate over time by source type',
    }),
  },

  // "query performance" / "slow queries" / "search performance"
  {
    patterns: [
      /(?:query|search)\s+performance/i,
      /slow\s+(?:queries|searches)/i,
      /query\s+latency/i,
    ],
    handler: () => ({
      query: `search app_scope="lognog" category="search" | stats avg(duration_ms) p95(duration_ms) count by action | sort desc avg(duration_ms)`,
      confidence: 0.9,
      explanation: 'Query execution performance statistics',
    }),
  },

  // "lognog health" / "system health" / "api health"
  {
    patterns: [
      /(?:lognog|system|api)\s+health/i,
      /health\s+(?:check|status)/i,
    ],
    handler: () => ({
      query: `search app_scope="lognog" | stats count as total, sum(case(success=false, 1, 0)) as errors, avg(duration_ms) as avg_latency by category`,
      confidence: 0.85,
      explanation: 'LogNog health summary by category',
    }),
  },

  // "who logged in" / "recent logins" / "login activity"
  {
    patterns: [
      /who\s+logged\s+in/i,
      /recent\s+logins?/i,
      /login\s+activity/i,
    ],
    handler: () => ({
      query: `search app_scope="lognog" action="auth.login" | table timestamp username ip user_agent | sort desc timestamp | limit 50`,
      confidence: 0.9,
      explanation: 'Recent successful login activity',
    }),
  },

  // "lognog" / "internal logs" / "self monitoring"
  {
    patterns: [
      /^lognog$/i,
      /^internal\s+logs?$/i,
      /^self\s+monitoring$/i,
    ],
    handler: () => ({
      query: `search app_scope="lognog" | stats count by category action | sort desc count`,
      confidence: 0.8,
      explanation: 'LogNog internal event summary',
    }),
  },
];

/**
 * Translate natural language to Spunk Query Language
 */
export function translateNaturalLanguage(input: string): TranslationResult & { timeRange?: { earliest?: string; latest?: string } } {
  const normalizedInput = input.trim().toLowerCase();

  // Extract time range if present
  let timeRange: { earliest?: string; latest?: string } | undefined;
  let cleanedInput = input;

  for (const { pattern, handler } of TIME_PATTERNS) {
    const match = input.match(pattern);
    if (match) {
      timeRange = handler(match);
      cleanedInput = input.replace(pattern, '').trim();
      break;
    }
  }

  // Try each pattern
  for (const { patterns, handler } of QUERY_PATTERNS) {
    for (const pattern of patterns) {
      const match = cleanedInput.match(pattern);
      if (match) {
        const result = handler(match, cleanedInput);
        return { ...result, timeRange };
      }
    }
  }

  // Fallback: treat as keyword search
  const keywords = cleanedInput
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !['the', 'and', 'for', 'from', 'with', 'show', 'find', 'get', 'all', 'me'].includes(w));

  if (keywords.length > 0) {
    return {
      query: `search ${keywords.join(' ')}`,
      confidence: 0.5,
      explanation: `Searching for: ${keywords.join(', ')}`,
      timeRange,
    };
  }

  // Ultimate fallback
  return {
    query: 'search | limit 100',
    confidence: 0.3,
    explanation: 'Could not understand query, showing recent logs',
    timeRange,
  };
}

/**
 * Get suggested queries based on common use cases
 */
export function getSuggestedQueries(): Array<{ text: string; description: string }> {
  return [
    { text: 'Show me all errors from the last hour', description: 'Find recent errors' },
    { text: 'Top 10 hosts by log volume', description: 'Most active servers' },
    { text: 'Failed SSH logins', description: 'Security: auth failures' },
    { text: 'Database errors', description: 'PostgreSQL issues' },
    { text: 'What happened on web-prod-01', description: 'Host investigation' },
    { text: 'Count of errors by application', description: 'Error breakdown' },
    { text: 'Firewall blocks', description: 'Blocked connections' },
    { text: 'Docker container events', description: 'Container lifecycle' },
    { text: 'Slow database queries', description: 'Performance issues' },
    { text: 'Out of memory errors', description: 'Resource exhaustion' },
    // SaaS Analytics suggestions
    { text: 'New signups today', description: 'User registrations' },
    { text: 'Signups by utm source', description: 'Marketing channels' },
    { text: 'Conversion funnel', description: 'Signup to payment' },
    { text: 'OAuth failures', description: 'Login issues' },
    { text: 'Payment failures', description: 'Billing errors' },
    { text: 'Slow job searches', description: 'API performance' },
  ];
}
