import { useState } from 'react';
import { Copy, Check, Bot, Sparkles, Code, Zap, LayoutDashboard, Bell, Search, ChevronDown, ChevronUp } from 'lucide-react';

// ============================================================================
// SECTION 1: OVERVIEW - What is LogNog?
// ============================================================================
const OVERVIEW_CONTENT = `# What is LogNog?

LogNog is a self-hosted log management platform for centralized application logging. Send structured logs from any application and query them using a Splunk-like DSL.

## What Should Apps Send to LogNog?

### User Events
- **Signups & Authentication**: User registration, login, logout, OAuth flows
- **Feature Usage**: Which features users interact with, button clicks, page views
- **User Journey**: Profile completion, onboarding steps, activation events
- **Conversions**: Subscription upgrades, purchases, plan changes

### Errors & Issues
- **Exceptions**: Caught and uncaught errors with stack traces
- **Failed Operations**: API errors, validation failures, timeouts
- **Integration Failures**: OAuth failures, payment processing errors
- **External API Issues**: Third-party service failures (Stripe, OpenAI, etc.)

### Performance Metrics
- **Response Times**: API endpoint latency, database query duration
- **Resource Usage**: Memory, CPU, connection pool stats
- **Slow Operations**: Queries or operations exceeding thresholds
- **Rate Limits**: Approaching or hitting rate limits

### Business Metrics
- **Revenue Events**: New subscriptions, renewals, cancellations, refunds
- **Usage Stats**: Feature usage counts, API call volumes
- **Quota Usage**: Storage, API calls, seats used

## How It Works

\`\`\`
Your App → HTTP POST to /api/ingest/http → LogNog → ClickHouse
                                               ↓
                                     Query with DSL: search index=your-app
\`\`\`

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| LOGNOG_URL | LogNog server URL | https://logs.machinekinglabs.com |
| LOGNOG_API_KEY | Your API key (get from Settings > API Keys) | lnog_abc123... |
| LOGNOG_APP_NAME | Your app identifier (kebab-case) | hey-youre-hired |
| LOGNOG_INDEX | Index name for queries (usually same as app name) | hey-youre-hired |
`;

// ============================================================================
// SECTION 2: INTEGRATION CODE
// ============================================================================
const INTEGRATION_CODE_CONTENT = `# LogNog Integration Code

## Environment Variables

Add to \`.env.local\`:
\`\`\`bash
LOGNOG_URL=https://logs.machinekinglabs.com
LOGNOG_API_KEY=lnog_your_key_here
LOGNOG_APP_NAME=your-app-name
LOGNOG_INDEX=your-app-name
\`\`\`

## TypeScript/Node.js Logger

Create \`lib/lognog.ts\`:

\`\`\`typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  [key: string]: unknown;
}

class LogNogClient {
  private buffer: LogEntry[] = [];
  private flushTimeout: NodeJS.Timeout | null = null;
  private isFlushing = false;

  // CRITICAL: Use getters for lazy loading!
  // Environment variables may not be available at module load time
  private get url() {
    return process.env.LOGNOG_URL || 'https://logs.machinekinglabs.com';
  }

  private get apiKey() {
    return process.env.LOGNOG_API_KEY || '';
  }

  private get appName() {
    return process.env.LOGNOG_APP_NAME || 'my-app';
  }

  private get index() {
    return process.env.LOGNOG_INDEX || this.appName;
  }

  log(level: LogLevel, message: string, context: Record<string, unknown> = {}) {
    if (!this.apiKey) {
      console.warn('[LogNog] No API key configured');
      return;
    }

    this.buffer.push({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
    });

    if (this.buffer.length >= 50) {
      this.flush();
    } else if (!this.flushTimeout) {
      this.flushTimeout = setTimeout(() => this.flush(), 5000);
    }
  }

  debug(message: string, context?: Record<string, unknown>) {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>) {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>) {
    this.log('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>) {
    this.log('error', message, context);
  }

  async forceFlush(): Promise<void> {
    await this.flush();
  }

  private async flush(): Promise<void> {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }

    if (this.buffer.length === 0 || this.isFlushing) return;

    this.isFlushing = true;
    const logs = [...this.buffer];
    this.buffer = [];

    try {
      const response = await fetch(\`\${this.url}/api/ingest/http\`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
          'X-App-Name': this.appName,
          'X-Index': this.index,
        },
        body: JSON.stringify(logs),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error(\`[LogNog] Error \${response.status}: \${text}\`);
        this.buffer.unshift(...logs); // Retry
      }
    } catch (error) {
      console.error('[LogNog] Connection error:', error);
      this.buffer.unshift(...logs); // Retry
    } finally {
      this.isFlushing = false;
    }
  }
}

export const lognog = new LogNogClient();
export const flushLogs = () => lognog.forceFlush();
\`\`\`

## Usage Examples

\`\`\`typescript
import { lognog, flushLogs } from './lib/lognog';

// User events
lognog.info('User signup completed', { userId: 'user_123', plan: 'free', utm_source: 'google' });
lognog.info('Profile completion', { userId: 'user_123', completion_step: 'resume_uploaded' });
lognog.info('Feature used', { userId: 'user_123', feature_name: 'cover_letter', plan: 'pro' });

// Errors
lognog.error('Payment failed', { userId: 'user_456', errorCode: 'CARD_DECLINED', amount: 1999 });
lognog.error('OAuth login failed', { provider: 'google', error_reason: 'invalid_token' });

// Performance
lognog.info('Job search completed', { userId: 'user_123', duration_ms: 234, result_count: 50 });
lognog.warn('Slow query detected', { query: 'jobs', duration_ms: 5200 });

// CRITICAL: In scripts or before shutdown, force flush!
await flushLogs();
\`\`\`

## Critical Gotchas

1. **Lazy Loading**: Use getters for env vars, NOT constants at module level
2. **Force Flush**: Always call \`flushLogs()\` before script exit or process shutdown
3. **Import Order**: Load dotenv BEFORE importing lognog
4. **Batching**: Logs batch every 5s or 50 logs - don't expect instant delivery

## Test Your Integration

\`\`\`bash
curl -X POST https://logs.machinekinglabs.com/api/ingest/http \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: $LOGNOG_API_KEY" \\
  -H "X-App-Name: your-app-name" \\
  -H "X-Index: your-app-name" \\
  -d '[{"level": "info", "message": "Test log from curl"}]'

# Expected: {"accepted":1,"index":"your-app-name"}
\`\`\`
`;

// ============================================================================
// SECTION 3: DASHBOARD STRATEGY
// ============================================================================
const DASHBOARD_STRATEGY_CONTENT = `# Dashboard Strategy

## Recommended Dashboards

Every application should have these standard dashboards:

### 1. User Acquisition & Funnel Dashboard
Track user journey from signup to conversion.

**Panels:**
| Panel | Type | Query |
|-------|------|-------|
| Signups Over Time | Line | \`search index=APP message~"signup" | timechart span=1d count\` |
| Signups by Source | Pie | \`search index=APP message~"signup" | stats count by utm_source\` |
| Conversion Funnel | Table | Track each stage: signup → activation → conversion |
| Daily Active Users | Stat | \`search index=APP | timechart span=1d dc(user_id)\` |

### 2. Feature Usage Dashboard
Understand which features drive engagement.

**Panels:**
| Panel | Type | Query |
|-------|------|-------|
| Feature Usage | Bar | \`search index=APP message~"Feature used" | stats count by feature_name | sort -count\` |
| Feature Trend | Line | \`search index=APP message~"Feature used" | timechart span=1d count by feature_name\` |
| Top Users | Table | \`search index=APP | stats count by user_id | sort -count | head 20\` |
| Free vs Paid Usage | Pie | \`search index=APP message~"Feature used" | stats count by user_plan\` |

### 3. Error & Health Dashboard
Monitor application health and catch issues early.

**Panels:**
| Panel | Type | Query |
|-------|------|-------|
| Error Rate | Line | \`search index=APP severity<=3 | timechart span=1h count\` |
| Top Errors | Table | \`search index=APP severity<=3 | stats count by message | sort -count | head 10\` |
| Response Time P95 | Line | \`search index=APP duration_ms>0 | timechart span=1h p95(duration_ms)\` |
| External API Health | Table | \`search index=APP message~"External API" | stats count avg(response_time_ms) by api_name\` |

### 4. Revenue Dashboard (SaaS)
Track MRR, conversions, and churn.

**Panels:**
| Panel | Type | Query |
|-------|------|-------|
| New Subscriptions | Line | \`search index=APP message~"Subscription" | timechart span=1d count\` |
| Revenue by Plan | Pie | \`search index=APP message~"Subscription" | stats count by plan_name\` |
| Checkout Attempts | Table | \`search index=APP message~"Checkout" | table timestamp user_email plan_name\` |
| Churned Users | Table | \`search index=APP message~"Subscription" status="canceled" | table timestamp user_email\` |

## Naming Conventions

- **Dashboard names**: \`[App Name] - [Purpose]\` (e.g., "Hey You're Hired - User Funnel")
- **Panel titles**: Clear, action-oriented (e.g., "Signups Today", "Error Rate")
- **Index names**: kebab-case matching app name (e.g., \`hey-youre-hired\`)

## Creating Dashboards

1. Go to **Dashboards** → **New Dashboard**
2. Add panels using the DSL queries above
3. Replace \`APP\` with your actual index name
4. Set appropriate time ranges (24h for operations, 7d/30d for trends)
`;

// ============================================================================
// SECTION 4: ALERT TEMPLATES
// ============================================================================
const ALERT_TEMPLATES_CONTENT = `# Alert Templates

## Alert Severity Levels

| Severity | Response Time | Notification | Examples |
|----------|---------------|--------------|----------|
| **Critical** | Immediate | Page on-call | Payment system down, Auth failures |
| **High** | Within 1 hour | Slack + Email | API errors spike, External API down |
| **Medium** | Same day | Email digest | Conversion drop, Feature unused |
| **Low** | Weekly review | Report | New error type, Traffic anomaly |

## Critical Alerts (Page Immediately)

### High Error Rate
\`\`\`
Query: search index=APP severity<=3 | stats count
Schedule: Every 5 minutes
Threshold: > 50 errors
Action: Page on-call + Slack #alerts-critical
\`\`\`

### Payment System Down
\`\`\`
Query: search index=APP message~"Stripe" message~"error" OR message~"failed"
Schedule: Every 5 minutes
Threshold: Any match
Action: Page on-call + Slack #alerts-critical
\`\`\`

### OAuth/Auth Failures
\`\`\`
Query: search index=APP message~"OAuth" message~"failed"
Schedule: Every 10 minutes
Threshold: > 5 failures
Action: Slack #alerts-critical
\`\`\`

## High Alerts (Slack/Email)

### External API Degraded
\`\`\`
Query: search index=APP message~"External API" (message~"failed" OR message~"timeout")
Schedule: Every 10 minutes
Threshold: > 5 failures for same API
Action: Slack #alerts-high
\`\`\`

### Slow Response Times
\`\`\`
Query: search index=APP duration_ms>5000 | stats count
Schedule: Every 15 minutes
Threshold: > 10 slow requests
Action: Slack #alerts-high
\`\`\`

### Error Spike
\`\`\`
Query: search index=APP severity<=3 | stats count as current
Compare: > 200% of 7-day average
Schedule: Every 30 minutes
Action: Slack #alerts-high
\`\`\`

## Medium Alerts (Daily Digest)

### Signup Drop
\`\`\`
Query: search index=APP message~"signup" | stats count as today
Compare: < 50% of 7-day average
Schedule: Daily at 9am
Action: Email digest
\`\`\`

### Conversion Rate Drop
\`\`\`
Query: Calculate conversion rate from funnel stages
Threshold: < 3% (below baseline)
Schedule: Daily at 9am
Action: Email digest
\`\`\`

### Feature Not Used
\`\`\`
Query: search index=APP message~"Feature used" feature_name="KEY_FEATURE" | stats count
Threshold: 0 uses in 24 hours
Schedule: Daily at 9am
Action: Email digest
\`\`\`

## Setting Up Alerts

1. Go to **Alerts** → **New Alert**
2. Enter the search query
3. Set schedule (cron expression or interval)
4. Configure threshold condition
5. Add notification actions (Slack, Email via Apprise)
`;

// ============================================================================
// SECTION 5: QUERY EXAMPLES
// ============================================================================
const QUERY_EXAMPLES_CONTENT = `# LogNog Query Examples

## Basic Syntax

\`\`\`
search [conditions] | command1 | command2 | ...
\`\`\`

## Filtering Logs

### By Index (App)
\`\`\`
search index=hey-youre-hired
search index=directors-palette
\`\`\`

### By Severity
\`\`\`
search severity<=3                    # Errors and above (0=emergency, 3=error)
search severity=6                     # Info only
search severity>=4 severity<=6        # Warnings, notices, info
\`\`\`

### By Message Content
\`\`\`
search message~"signup"               # Contains "signup"
search message~"User signup"          # Contains phrase
search message:"error"                # Contains "error" (alternative syntax)
\`\`\`

### By Field Values
\`\`\`
search user_id="user_123"
search feature_name="cover_letter"
search utm_source="google"
\`\`\`

### Combining Conditions
\`\`\`
search index=APP severity<=3 message~"payment"
search index=APP user_id="user_123" feature_name="cover_letter"
\`\`\`

## Aggregations (stats)

### Count Events
\`\`\`
search index=APP | stats count                           # Total count
search index=APP | stats count by user_id                # Count per user
search index=APP | stats count by severity               # Count by severity
\`\`\`

### Unique Values
\`\`\`
search index=APP | stats dc(user_id) as unique_users     # Distinct count
search index=APP | stats values(feature_name)            # List all feature names
\`\`\`

### Numeric Aggregations
\`\`\`
search index=APP | stats avg(duration_ms)                # Average
search index=APP | stats p95(duration_ms)                # 95th percentile
search index=APP | stats min(duration_ms) max(duration_ms) avg(duration_ms)
\`\`\`

## Time Charts

### Events Over Time
\`\`\`
search index=APP | timechart count                       # Default span
search index=APP | timechart span=1h count               # Hourly
search index=APP | timechart span=1d count               # Daily
\`\`\`

### Grouped Time Charts
\`\`\`
search index=APP | timechart span=1d count by severity
search index=APP | timechart span=1h count by feature_name
\`\`\`

## Sorting and Limiting

\`\`\`
search index=APP | stats count by user_id | sort -count           # Descending
search index=APP | stats count by user_id | sort count            # Ascending
search index=APP | stats count by message | sort -count | head 10 # Top 10
\`\`\`

## Table Output

\`\`\`
search index=APP severity<=3 | table timestamp message user_id
search index=APP | table timestamp severity message | head 100
\`\`\`

## Common Use Cases

### Daily Signups
\`\`\`
search index=APP message~"signup" | timechart span=1d count
\`\`\`

### Error Breakdown
\`\`\`
search index=APP severity<=3 | stats count by message | sort -count | head 20
\`\`\`

### Slow Operations
\`\`\`
search index=APP duration_ms>1000 | stats count avg(duration_ms) by operation
\`\`\`

### User Activity
\`\`\`
search index=APP user_id="user_123" | table timestamp message
\`\`\`

### Feature Usage Today
\`\`\`
search index=APP message~"Feature used" | stats count by feature_name | sort -count
\`\`\`

### Conversion Funnel
\`\`\`
# Step 1: Signups
search index=APP message~"signup" | stats count as signups

# Step 2: Profile Complete
search index=APP message~"Profile completion" | stats count as profiles

# Step 3: First Feature Use
search index=APP message~"Feature used" | stats dc(user_id) as activated
\`\`\`
`;

// ============================================================================
// COMBINED CONTENT FOR "COPY ALL"
// ============================================================================
const ALL_CONTENT = `${OVERVIEW_CONTENT}

---

${INTEGRATION_CODE_CONTENT}

---

${DASHBOARD_STRATEGY_CONTENT}

---

${ALERT_TEMPLATES_CONTENT}

---

${QUERY_EXAMPLES_CONTENT}
`;

// ============================================================================
// COMPONENTS
// ============================================================================

function CopyButton({ text, label, size = 'md' }: { text: string; label?: string; size?: 'sm' | 'md' }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sizeClasses = size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2';

  return (
    <button
      onClick={handleCopy}
      className={`flex items-center gap-2 ${sizeClasses} rounded-lg font-medium transition-all ${
        copied
          ? 'bg-green-500 text-white'
          : 'bg-amber-500 hover:bg-amber-600 text-white'
      }`}
    >
      {copied ? (
        <>
          <Check className="w-4 h-4" />
          Copied!
        </>
      ) : (
        <>
          <Copy className="w-4 h-4" />
          {label || 'Copy'}
        </>
      )}
    </button>
  );
}

interface SectionProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  content: string;
  isExpanded: boolean;
  onToggle: () => void;
}

function CopyableSection({ title, description, icon, content, isExpanded, onToggle }: SectionProps) {
  return (
    <div className="bg-white dark:bg-nog-800 border border-slate-200 dark:border-nog-700 rounded-xl overflow-hidden">
      {/* Header - always visible */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-nog-50 dark:hover:bg-nog-700/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
            {icon}
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-slate-900 dark:text-nog-100">{title}</h3>
            <p className="text-sm text-slate-600 dark:text-nog-400">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <CopyButton text={content} label="Copy" size="sm" />
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          )}
        </div>
      </button>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="border-t border-slate-200 dark:border-nog-700">
          <div className="p-4 max-h-[400px] overflow-y-auto bg-nog-50 dark:bg-nog-900">
            <pre className="text-xs sm:text-sm text-slate-700 dark:text-nog-300 whitespace-pre-wrap font-mono">
              {content}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function OnboardingPage() {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['overview']));

  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const sections = [
    {
      id: 'overview',
      title: 'What is LogNog?',
      description: 'Overview of LogNog and what apps should send',
      icon: <Sparkles className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
      content: OVERVIEW_CONTENT,
    },
    {
      id: 'code',
      title: 'Integration Code',
      description: 'TypeScript logger with env vars and examples',
      icon: <Code className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
      content: INTEGRATION_CODE_CONTENT,
    },
    {
      id: 'dashboards',
      title: 'Dashboard Strategy',
      description: 'Standard dashboards and panel recommendations',
      icon: <LayoutDashboard className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
      content: DASHBOARD_STRATEGY_CONTENT,
    },
    {
      id: 'alerts',
      title: 'Alert Templates',
      description: 'Critical, high, medium, and low priority alerts',
      icon: <Bell className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
      content: ALERT_TEMPLATES_CONTENT,
    },
    {
      id: 'queries',
      title: 'Query Examples',
      description: 'Common DSL patterns and use cases',
      icon: <Search className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
      content: QUERY_EXAMPLES_CONTENT,
    },
  ];

  return (
    <div className="min-h-full bg-nog-50 dark:bg-nog-900">
      {/* Header */}
      <div className="bg-white dark:bg-nog-800 border-b border-slate-200 dark:border-nog-700 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-gradient-to-br from-amber-500 to-amber-500 rounded-xl">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-nog-100">
              AI Integration Kit
            </h1>
          </div>
          <p className="text-slate-600 dark:text-nog-400">
            Copy these instructions and give them to any AI assistant to integrate your app with LogNog.
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Master Copy All Button */}
        <div className="bg-gradient-to-r from-amber-50 to-amber-50 dark:from-amber-900/20 dark:to-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-6 mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-white dark:bg-nog-800 rounded-lg shadow-sm">
                <Zap className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-nog-100 mb-1">
                  Copy Everything for AI
                </h2>
                <p className="text-sm text-slate-600 dark:text-nog-400">
                  One click to copy all sections - overview, code, dashboards, alerts, and queries.
                  Give this to any AI assistant to fully integrate your app.
                </p>
              </div>
            </div>
            <CopyButton text={ALL_CONTENT} label="Copy All" />
          </div>
        </div>

        {/* Individual Sections */}
        <div className="space-y-4 mb-8">
          {sections.map((section) => (
            <CopyableSection
              key={section.id}
              {...section}
              isExpanded={expandedSections.has(section.id)}
              onToggle={() => toggleSection(section.id)}
            />
          ))}
        </div>

        {/* How to Use */}
        <div className="bg-white dark:bg-nog-800 border border-slate-200 dark:border-nog-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-nog-100 mb-4">
            How to Use
          </h2>
          <ol className="space-y-3">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full flex items-center justify-center text-sm font-medium">
                1
              </span>
              <span className="text-slate-600 dark:text-nog-400">
                Click <strong>"Copy All"</strong> to get the complete integration guide, or copy individual sections
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full flex items-center justify-center text-sm font-medium">
                2
              </span>
              <span className="text-slate-600 dark:text-nog-400">
                Paste into your AI assistant (Claude, ChatGPT, Cursor, Copilot)
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full flex items-center justify-center text-sm font-medium">
                3
              </span>
              <span className="text-slate-600 dark:text-nog-400">
                Tell the AI your app name (e.g., "Integrate LogNog into my app called directors-palette")
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full flex items-center justify-center text-sm font-medium">
                4
              </span>
              <span className="text-slate-600 dark:text-nog-400">
                Get your API key from <strong>Settings → API Keys</strong> and add it to your .env file
              </span>
            </li>
          </ol>
        </div>

        {/* Current Integrations */}
        <div className="mt-8 bg-white dark:bg-nog-800 border border-slate-200 dark:border-nog-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-nog-100 mb-4">
            Current Integrations
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-nog-700">
                  <th className="text-left py-2 px-3 font-medium text-slate-700 dark:text-nog-300">App</th>
                  <th className="text-left py-2 px-3 font-medium text-slate-700 dark:text-nog-300">Index Name</th>
                  <th className="text-left py-2 px-3 font-medium text-slate-700 dark:text-nog-300">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100 dark:border-nog-700/50">
                  <td className="py-2 px-3 text-slate-900 dark:text-nog-100">Hey You're Hired</td>
                  <td className="py-2 px-3">
                    <code className="text-xs bg-nog-100 dark:bg-nog-900 px-2 py-0.5 rounded">
                      hey-youre-hired
                    </code>
                  </td>
                  <td className="py-2 px-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      Live
                    </span>
                  </td>
                </tr>
                <tr className="border-b border-slate-100 dark:border-nog-700/50">
                  <td className="py-2 px-3 text-slate-900 dark:text-nog-100">Directors Palette</td>
                  <td className="py-2 px-3">
                    <code className="text-xs bg-nog-100 dark:bg-nog-900 px-2 py-0.5 rounded">
                      directors-palette
                    </code>
                  </td>
                  <td className="py-2 px-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      Pending
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
