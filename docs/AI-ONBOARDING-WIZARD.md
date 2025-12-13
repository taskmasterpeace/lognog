# LogNog AI-Powered Onboarding Wizard

> **Status:** Design Document - Not Yet Implemented
> **Feature Name:** "NogBot Setup Wizard" or "Observability Architect"

---

## The Problem

Developers know they should have logging, but they don't know:
1. **What to log** - Which events, errors, and metrics matter?
2. **How to log it** - What format? What library? What fields?
3. **Where to send it** - OTLP? Syslog? Agent?
4. **What to alert on** - What thresholds? What conditions?

Result: They either log nothing, log everything (noise), or give up on observability entirely.

---

## The Solution: 3-Step AI Interview

LogNog's AI wizard bridges the gap between "I have code" and "I have observability" through a human-in-the-loop process.

```
┌─────────────────────────────────────────────────────────────────┐
│                    THE 3-STEP PROCESS                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  STEP 1: USER ANSWERS 3 KEY QUESTIONS                          │
│  ────────────────────────────────────────────────────────────── │
│  LogNog asks the human 3 essential questions:                   │
│                                                                 │
│  Q1: "What does your application do?"                          │
│      □ Web application (API/frontend)                          │
│      □ Background service/worker                               │
│      □ CLI tool or script                                      │
│      □ Game server                                             │
│      □ IoT/embedded device                                     │
│      □ Other: _________                                        │
│                                                                 │
│  Q2: "What tech stack are you using?"                          │
│      Language: [dropdown: Node.js, Python, Go, Java, etc.]     │
│      Framework: [dynamic based on language]                    │
│      Database: [PostgreSQL, MySQL, MongoDB, etc.]              │
│                                                                 │
│  Q3: "What are your biggest concerns?"                         │
│      □ Security incidents (auth failures, access violations)   │
│      □ Performance issues (slow responses, timeouts)           │
│      □ Errors and crashes (exceptions, 500s)                   │
│      □ User activity (who did what, when)                      │
│      □ Compliance/audit trail                                  │
│      □ Cost/resource monitoring                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 2: CODEBASE INTERVIEW PROMPT                             │
│  ────────────────────────────────────────────────────────────── │
│  Based on answers, LogNog generates a prompt for the user      │
│  to give to their AI assistant (Claude, Cursor, Copilot, etc.) │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 📋 Copy this prompt and give it to your AI assistant:   │   │
│  │                                                         │   │
│  │ "Analyze this codebase and provide a JSON report:       │   │
│  │                                                         │   │
│  │ 1. List all API endpoints with their methods/paths      │   │
│  │ 2. Identify authentication/authorization code           │   │
│  │ 3. Find database connection and query patterns          │   │
│  │ 4. List external service integrations                   │   │
│  │ 5. Find existing logging statements                     │   │
│  │ 6. Identify error handling patterns                     │   │
│  │ 7. List background jobs or scheduled tasks              │   │
│  │ 8. Find sensitive data handling (PII, credentials)      │   │
│  │                                                         │   │
│  │ Output as JSON with this structure:                     │   │
│  │ {                                                       │   │
│  │   "endpoints": [...],                                   │   │
│  │   "auth": {...},                                        │   │
│  │   "database": {...},                                    │   │
│  │   ...                                                   │   │
│  │ }"                                                      │   │
│  │                                                         │   │
│  │ [Copy Prompt]                                           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  User copies prompt → gives to their AI → pastes response      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3: IMPLEMENTATION GUIDE GENERATED                        │
│  ────────────────────────────────────────────────────────────── │
│  LogNog analyzes the codebase report + user answers and        │
│  generates a complete implementation guide:                     │
│                                                                 │
│  📋 OBSERVABILITY IMPLEMENTATION GUIDE                         │
│  ═══════════════════════════════════════════════════════════   │
│                                                                 │
│  WHAT TO LOG                                                   │
│  ───────────                                                   │
│  ✓ Authentication events                                       │
│    - User login (success/failure)                              │
│    - Session creation/destruction                              │
│    - Password reset requests                                   │
│                                                                 │
│  ✓ API requests                                                │
│    - Method, path, status code, duration                       │
│    - User ID (if authenticated)                                │
│    - Request ID for correlation                                │
│                                                                 │
│  ✓ Database operations                                         │
│    - Slow queries (>100ms)                                     │
│    - Connection errors                                         │
│    - Transaction failures                                      │
│                                                                 │
│  ✓ Business events                                             │
│    - [app-specific based on codebase analysis]                 │
│                                                                 │
│  HOW TO IMPLEMENT                                              │
│  ────────────────                                              │
│  [Code snippets for their specific framework]                  │
│                                                                 │
│  // Example: Express.js middleware                             │
│  app.use((req, res, next) => {                                 │
│    const start = Date.now();                                   │
│    res.on('finish', () => {                                    │
│      logger.info({                                             │
│        method: req.method,                                     │
│        path: req.path,                                         │
│        status: res.statusCode,                                 │
│        duration_ms: Date.now() - start,                        │
│        user_id: req.user?.id                                   │
│      });                                                       │
│    });                                                         │
│    next();                                                     │
│  });                                                           │
│                                                                 │
│  HOW TO SHIP TO LOGNOG                                         │
│  ─────────────────────                                         │
│  [OTLP config or Agent config based on their stack]            │
│                                                                 │
│  RECOMMENDED ALERTS                                            │
│  ──────────────────                                            │
│  1. "Failed Login Spike" - >20 failed logins in 15 minutes    │
│  2. "API Error Rate" - >5% 5xx responses in 5 minutes         │
│  3. "Slow Database" - avg query time >500ms for 5 minutes     │
│                                                                 │
│  [Create These Alerts] [Copy AI Implementation Prompt]         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## State Management

The wizard needs to track state across the 3 steps. Options:

### Option A: Session-Based (Recommended for MVP)
- Store wizard state in browser localStorage
- No backend changes needed
- State structure:

```typescript
interface WizardState {
  step: 1 | 2 | 3;
  startedAt: string;

  // Step 1 answers
  appType: 'web' | 'worker' | 'cli' | 'game' | 'iot' | 'other';
  appTypeOther?: string;
  language: string;
  framework: string;
  database: string;
  concerns: string[];

  // Step 2 data
  codebasePrompt: string;  // Generated prompt
  codebaseReport?: string; // User-pasted JSON response

  // Step 3 output
  implementationGuide?: ImplementationGuide;
}

interface ImplementationGuide {
  whatToLog: LoggingRecommendation[];
  codeSnippets: CodeSnippet[];
  otlpConfig?: string;
  agentConfig?: string;
  alerts: AlertRecommendation[];
  aiPrompt: string; // Prompt user can give to AI to implement
}
```

### Option B: Database-Backed (Future)
- Store in SQLite alongside other user data
- Allows resuming wizard later
- Enables analytics on common patterns

---

## Step 1: The 3 Key Questions

### Question 1: Application Type

```tsx
<WizardStep1>
  <h2>What does your application do?</h2>
  <p>This helps us recommend the right logging patterns.</p>

  <RadioGroup>
    <Radio value="web">
      Web Application
      <span>REST APIs, GraphQL, frontend apps</span>
    </Radio>
    <Radio value="worker">
      Background Service
      <span>Queue workers, cron jobs, daemons</span>
    </Radio>
    <Radio value="cli">
      CLI Tool or Script
      <span>One-off scripts, automation tools</span>
    </Radio>
    <Radio value="game">
      Game Server
      <span>Minecraft, 7 Days to Die, Valheim, etc.</span>
    </Radio>
    <Radio value="iot">
      IoT / Embedded
      <span>Sensors, edge devices, embedded systems</span>
    </Radio>
    <Radio value="other">
      Other
      <Input placeholder="Describe your application..." />
    </Radio>
  </RadioGroup>
</WizardStep1>
```

### Question 2: Tech Stack

Dynamic dropdowns based on Q1 answer:

```tsx
const FRAMEWORKS_BY_LANGUAGE = {
  'javascript': ['Express.js', 'Fastify', 'NestJS', 'Next.js', 'Hono', 'None'],
  'typescript': ['Express.js', 'Fastify', 'NestJS', 'Next.js', 'Hono', 'None'],
  'python': ['FastAPI', 'Django', 'Flask', 'Celery', 'None'],
  'go': ['Gin', 'Echo', 'Fiber', 'Chi', 'Standard library'],
  'java': ['Spring Boot', 'Quarkus', 'Micronaut', 'None'],
  'rust': ['Actix-web', 'Axum', 'Rocket', 'None'],
  'csharp': ['.NET Core', 'ASP.NET', 'None'],
  // ...
};

const DATABASES = [
  'PostgreSQL',
  'MySQL',
  'MongoDB',
  'Redis',
  'SQLite',
  'ClickHouse',
  'DynamoDB',
  'None',
  'Other',
];
```

### Question 3: Primary Concerns

Multi-select checkboxes:

```tsx
const CONCERNS = [
  {
    id: 'security',
    label: 'Security incidents',
    description: 'Failed logins, unauthorized access, suspicious activity',
    logTypes: ['auth_failure', 'access_denied', 'suspicious_ip'],
  },
  {
    id: 'performance',
    label: 'Performance issues',
    description: 'Slow responses, timeouts, bottlenecks',
    logTypes: ['slow_request', 'timeout', 'high_latency'],
  },
  {
    id: 'errors',
    label: 'Errors and crashes',
    description: 'Exceptions, 500 errors, unhandled rejections',
    logTypes: ['error', 'exception', 'crash'],
  },
  {
    id: 'activity',
    label: 'User activity',
    description: 'Who did what, when - for debugging and support',
    logTypes: ['user_action', 'audit'],
  },
  {
    id: 'compliance',
    label: 'Compliance & audit trail',
    description: 'Full audit logs for regulatory requirements',
    logTypes: ['audit', 'data_access', 'admin_action'],
  },
  {
    id: 'cost',
    label: 'Cost & resource monitoring',
    description: 'Track usage, detect anomalies, optimize spending',
    logTypes: ['usage', 'billing_event', 'resource_metric'],
  },
];
```

---

## Step 2: Codebase Interview Prompt

Based on Q1-Q3 answers, generate a targeted prompt.

### Base Prompt Template

```typescript
function generateCodebasePrompt(answers: WizardAnswers): string {
  const basePrompt = `
Analyze this codebase and provide a structured JSON report.

## Application Context
- Type: ${answers.appType}
- Language: ${answers.language}
- Framework: ${answers.framework}
- Database: ${answers.database}

## Analysis Required

Please analyze and report on:

1. **Entry Points**
   - List all API endpoints, routes, or main entry points
   - Include HTTP methods, paths, and handler locations

2. **Authentication & Authorization**
   - How is authentication implemented?
   - What authorization checks exist?
   - Where are auth failures handled?

3. **Database Layer**
   - What database clients/ORMs are used?
   - Where are connections established?
   - Are there any slow query patterns?

4. **External Services**
   - What third-party APIs are called?
   - How are failures handled?

5. **Error Handling**
   - What error handling patterns exist?
   - Are errors currently logged?
   - What happens on unhandled exceptions?

6. **Existing Logging**
   - What logging exists currently?
   - What library is used (if any)?
   - What events are currently logged?

7. **Background Jobs** (if applicable)
   - What scheduled tasks or workers exist?
   - How do they report status/errors?

8. **Sensitive Data**
   - Where is PII or sensitive data handled?
   - What should NOT be logged?

## Output Format

Respond with valid JSON in this structure:

\`\`\`json
{
  "summary": "Brief description of the application",
  "entryPoints": [
    {"method": "GET", "path": "/api/users", "file": "src/routes/users.ts", "line": 15}
  ],
  "auth": {
    "type": "jwt|session|oauth|none",
    "middleware": "path to auth middleware if any",
    "loginHandler": "path to login handler",
    "failureHandling": "how auth failures are handled"
  },
  "database": {
    "type": "postgres|mysql|mongodb|etc",
    "client": "prisma|typeorm|mongoose|etc",
    "connectionFile": "where connection is established",
    "queryPatterns": ["description of common query patterns"]
  },
  "externalServices": [
    {"name": "Stripe", "file": "src/services/payment.ts", "errorHandling": "try/catch"}
  ],
  "errorHandling": {
    "globalHandler": "path to global error handler if any",
    "pattern": "try/catch|middleware|none",
    "currentlyLogged": true|false
  },
  "existingLogging": {
    "library": "winston|pino|console|none",
    "locations": ["list of files with logging"],
    "events": ["what is currently logged"]
  },
  "backgroundJobs": [
    {"name": "emailWorker", "file": "src/jobs/email.ts", "schedule": "*/5 * * * *"}
  ],
  "sensitiveData": {
    "locations": ["files handling sensitive data"],
    "fieldsToExclude": ["password", "ssn", "creditCard"]
  }
}
\`\`\`
`;

  // Add concern-specific questions
  if (answers.concerns.includes('security')) {
    basePrompt += `
9. **Security Events** (IMPORTANT - user prioritized security)
   - Where are failed login attempts handled?
   - Are there rate limiting mechanisms?
   - What admin/elevated actions exist?
`;
  }

  if (answers.concerns.includes('performance')) {
    basePrompt += `
9. **Performance Hotspots** (IMPORTANT - user prioritized performance)
   - What endpoints are likely to be slow?
   - Are there any N+1 query patterns?
   - What caching exists?
`;
  }

  return basePrompt;
}
```

---

## Step 3: Implementation Guide Generation

Parse the codebase JSON and generate recommendations.

### Logic for Recommendations

```typescript
interface CodebaseReport {
  summary: string;
  entryPoints: EntryPoint[];
  auth: AuthInfo;
  database: DatabaseInfo;
  // ... etc
}

function generateImplementationGuide(
  answers: WizardAnswers,
  codebase: CodebaseReport
): ImplementationGuide {
  const guide: ImplementationGuide = {
    whatToLog: [],
    codeSnippets: [],
    alerts: [],
    aiPrompt: '',
  };

  // 1. API Request Logging (if web app)
  if (answers.appType === 'web' && codebase.entryPoints.length > 0) {
    guide.whatToLog.push({
      category: 'API Requests',
      events: [
        'Request received (method, path, user_id)',
        'Response sent (status, duration)',
        'Request failed (error, stack)',
      ],
      priority: 'high',
    });

    guide.codeSnippets.push(
      getRequestLoggingSnippet(answers.language, answers.framework)
    );
  }

  // 2. Auth Logging (if auth exists and security concern)
  if (codebase.auth.type !== 'none') {
    guide.whatToLog.push({
      category: 'Authentication',
      events: [
        'Login success (user_id, ip, user_agent)',
        'Login failure (reason, ip, user_agent)',
        'Logout (user_id)',
        'Password reset request (email)',
        'Token refresh (user_id)',
      ],
      priority: answers.concerns.includes('security') ? 'high' : 'medium',
    });

    if (answers.concerns.includes('security')) {
      guide.alerts.push({
        name: 'Failed Login Spike',
        query: 'search app_name=auth message~"login_failed" | stats count | filter count>20',
        threshold: 'count > 20 in 15 minutes',
        action: 'email',
      });
    }
  }

  // 3. Database Logging (if database exists)
  if (codebase.database.type !== 'none') {
    guide.whatToLog.push({
      category: 'Database Operations',
      events: [
        'Slow queries (>100ms)',
        'Connection errors',
        'Transaction failures',
      ],
      priority: answers.concerns.includes('performance') ? 'high' : 'medium',
    });
  }

  // 4. Error Logging (always)
  guide.whatToLog.push({
    category: 'Errors',
    events: [
      'Unhandled exceptions',
      'Caught errors (with context)',
      'Validation failures',
    ],
    priority: 'high',
  });

  // 5. Generate the AI implementation prompt
  guide.aiPrompt = generateAIImplementationPrompt(answers, codebase, guide);

  return guide;
}
```

### Framework-Specific Code Snippets

```typescript
const CODE_SNIPPETS: Record<string, Record<string, string>> = {
  'express': {
    requestLogging: `
// Install: npm install pino pino-http
const pino = require('pino');
const pinoHttp = require('pino-http');

const logger = pino({
  transport: {
    target: '@opentelemetry/exporter-logs-otlp-http',
    options: { url: 'http://localhost:3001/api/ingest/otlp/v1/logs' }
  }
});

app.use(pinoHttp({ logger }));

// Or manual middleware:
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info({
      type: 'http_request',
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: Date.now() - start,
      user_id: req.user?.id,
      request_id: req.id
    });
  });
  next();
});
`,
    authLogging: `
// In your login handler:
async function login(req, res) {
  try {
    const user = await authenticate(req.body);
    logger.info({
      type: 'auth_success',
      user_id: user.id,
      ip: req.ip,
      user_agent: req.headers['user-agent']
    });
    // ... rest of login
  } catch (error) {
    logger.warn({
      type: 'auth_failure',
      reason: error.message,
      email: req.body.email, // Don't log password!
      ip: req.ip,
      user_agent: req.headers['user-agent']
    });
    // ... error response
  }
}
`,
  },

  'fastapi': {
    requestLogging: `
# Install: pip install structlog
import structlog
from fastapi import FastAPI, Request
from time import time

logger = structlog.get_logger()

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time()
    response = await call_next(request)
    duration = time() - start

    logger.info(
        "http_request",
        method=request.method,
        path=request.url.path,
        status=response.status_code,
        duration_ms=round(duration * 1000, 2),
        user_id=getattr(request.state, 'user_id', None)
    )
    return response
`,
  },

  // Add more frameworks...
};
```

### Final AI Implementation Prompt

The guide includes a prompt users can give to their AI to implement everything:

```typescript
function generateAIImplementationPrompt(
  answers: WizardAnswers,
  codebase: CodebaseReport,
  guide: ImplementationGuide
): string {
  return `
Based on this observability plan for my ${answers.language}/${answers.framework} application, please implement the following logging:

## What to Log
${guide.whatToLog.map(w => `
### ${w.category} (Priority: ${w.priority})
${w.events.map(e => `- ${e}`).join('\n')}
`).join('\n')}

## Requirements
1. Use structured logging (JSON format)
2. Include these fields in every log: timestamp, level, message, service_name
3. Add request_id for correlation across requests
4. NEVER log: passwords, tokens, credit cards, SSNs, or other PII
5. Log to stdout in development, send to LogNog in production

## LogNog Configuration
Send logs via OTLP to: ${process.env.LOGNOG_URL || 'http://localhost:3001'}/api/ingest/otlp/v1/logs

## Existing Code Context
${codebase.summary}

Auth middleware: ${codebase.auth.middleware || 'none'}
Error handler: ${codebase.errorHandling.globalHandler || 'none'}
Current logging: ${codebase.existingLogging.library || 'none'}

Please provide the implementation as a series of code changes I can apply to my codebase.
`;
}
```

---

## UI Flow

### Page: `/wizard` or `/setup`

```tsx
export function OnboardingWizard() {
  const [state, setState] = useState<WizardState>(() => {
    const saved = localStorage.getItem('lognog_wizard');
    return saved ? JSON.parse(saved) : { step: 1 };
  });

  // Persist state
  useEffect(() => {
    localStorage.setItem('lognog_wizard', JSON.stringify(state));
  }, [state]);

  return (
    <div className="max-w-3xl mx-auto py-8">
      <WizardProgress step={state.step} />

      {state.step === 1 && (
        <Step1Questions
          onComplete={(answers) => setState({
            ...state,
            step: 2,
            ...answers,
            codebasePrompt: generateCodebasePrompt(answers)
          })}
        />
      )}

      {state.step === 2 && (
        <Step2CodebaseInterview
          prompt={state.codebasePrompt}
          onComplete={(report) => setState({
            ...state,
            step: 3,
            codebaseReport: report,
            implementationGuide: generateImplementationGuide(state, JSON.parse(report))
          })}
        />
      )}

      {state.step === 3 && (
        <Step3ImplementationGuide
          guide={state.implementationGuide!}
          onCreateAlerts={() => { /* Navigate to alerts page with pre-filled data */ }}
          onReset={() => {
            localStorage.removeItem('lognog_wizard');
            setState({ step: 1 });
          }}
        />
      )}
    </div>
  );
}
```

---

## API Endpoints (If Backend Processing Needed)

For the MVP, all processing can happen client-side. Future versions might add:

```
POST /api/wizard/generate-prompt
  Body: { appType, language, framework, database, concerns }
  Returns: { prompt: string }

POST /api/wizard/generate-guide
  Body: { answers: WizardAnswers, codebaseReport: CodebaseReport }
  Returns: { guide: ImplementationGuide }

POST /api/wizard/create-alerts
  Body: { alerts: AlertRecommendation[] }
  Returns: { created: number, alertIds: string[] }
```

---

## Hosted Version Considerations

For the hosted LogNog cloud version, the wizard could:

1. **Store state server-side** - Resume across sessions/devices
2. **Use LogNog's AI** - Instead of user's AI, LogNog could analyze codebases directly
3. **One-click implementation** - Generate PRs or Codegen directly
4. **Analytics** - Learn common patterns across users to improve recommendations

---

## Implementation Priority

### Phase 1: MVP (Client-Side Only)
- [ ] Step 1 UI with 3 questions
- [ ] Prompt generator for Step 2
- [ ] Basic guide generator for Step 3
- [ ] Code snippets for Express.js, FastAPI, Go/Gin
- [ ] localStorage persistence

### Phase 2: Enhanced
- [ ] More framework support
- [ ] Alert creation flow
- [ ] Dashboard template suggestions
- [ ] OTLP config generator

### Phase 3: Hosted Features
- [ ] Server-side state
- [ ] Direct codebase analysis (if user grants access)
- [ ] Learning from usage patterns
- [ ] Team sharing of guides

---

## Competitive Advantage

**Why this matters:**

| Competitor | Onboarding Experience |
|------------|----------------------|
| **Splunk** | Read 100+ page manual, hire consultant |
| **Datadog** | Auto-instrument (but $$$), generic dashboards |
| **ELK** | Configure YAML for 3 days, pray |
| **Chronicle** | Google will tell you what to log (their way) |
| **LogNog** | 3 questions → custom implementation guide |

The wizard turns "I don't know where to start" into "here's exactly what to do" in under 5 minutes.

---

*Last updated: 2025-01-13*
*By Machine King Labs*
