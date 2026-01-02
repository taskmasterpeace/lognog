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
  ];
}
