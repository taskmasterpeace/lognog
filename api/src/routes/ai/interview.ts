import { Router, Request, Response } from 'express';
import { isAnyAIAvailable, generateText, extractJSON } from './shared.js';
import { getInterviewSessions, getInterviewSession, createInterviewSession, updateInterviewSession, deleteInterviewSession } from '../../db/sqlite.js';

const router = Router();

// The initial questionnaire template
const INITIAL_QUESTIONNAIRE = `# LogNog Codebase Interview Questionnaire

Please answer the following questions about your application. Be as detailed as possible - this helps us generate better logging recommendations.

---

## 1. Application Overview

**1.1 What is the name of your application?**
>

**1.2 What does your application do? (Brief description)**
>

**1.3 What programming language(s) and framework(s) does your application use?**
> (e.g., Node.js/Express, Python/Django, Java/Spring, Go, etc.)

---

## 2. Architecture

**2.1 Is your application a monolith, microservices, or serverless?**
>

**2.2 What database(s) does your application use?**
> (e.g., PostgreSQL, MongoDB, Redis, etc.)

**2.3 Do you use message queues or event streaming?**
> (e.g., RabbitMQ, Kafka, Redis Pub/Sub, etc.)

**2.4 What external APIs or services does your application integrate with?**
>

---

## 3. Current Logging

**3.1 Do you currently have any logging in place? If yes, describe what and how.**
>

**3.2 What logging library do you use (if any)?**
> (e.g., Winston, Pino, Log4j, Python logging, slog, etc.)

**3.3 Where do your logs currently go?**
> (e.g., console only, files, existing log service, etc.)

---

## 4. Critical Paths

**4.1 What are the most critical user-facing operations in your application?**
> (e.g., user signup, checkout, file upload, etc.)

**4.2 What operations involve money, sensitive data, or compliance requirements?**
>

**4.3 What are the most common issues or errors you encounter?**
>

---

## 5. Infrastructure

**5.1 Where does your application run?**
> (e.g., Docker, Kubernetes, bare metal, AWS Lambda, Vercel, etc.)

**5.2 How is your application deployed?**
> (e.g., CI/CD pipeline, manual deployment, etc.)

**5.3 Do you run multiple instances/replicas of your application?**
>

---

## 6. Monitoring Goals

**6.1 What problems do you want logging to help you solve?**
> (e.g., debugging production issues, security monitoring, performance tracking, etc.)

**6.2 What metrics or events are most important to track?**
>

**6.3 Do you need real-time alerting? For what conditions?**
>

---

## 7. Team & Process

**7.1 How many developers work on this codebase?**
>

**7.2 Who will be reviewing logs regularly?**
> (e.g., developers, DevOps, security team, etc.)

---

## Additional Notes

**Anything else we should know about your application or logging requirements?**
>

---

*Please fill out all sections and return this document. We'll use AI to analyze your responses and generate customized logging recommendations and implementation code.*
`;

// Get all interview sessions
router.get('/interview', async (_req: Request, res: Response) => {
  try {
    const sessions = getInterviewSessions();
    return res.json(sessions);
  } catch (error) {
    console.error('Error getting interview sessions:', error);
    return res.status(500).json({ error: 'Failed to get interview sessions' });
  }
});

// Get single interview session
router.get('/interview/:id', async (req: Request, res: Response) => {
  try {
    const session = getInterviewSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Interview session not found' });
    }
    return res.json(session);
  } catch (error) {
    console.error('Error getting interview session:', error);
    return res.status(500).json({ error: 'Failed to get interview session' });
  }
});

// Create new interview session (Step 1: Generate questionnaire)
router.post('/interview/start', async (req: Request, res: Response) => {
  try {
    const { name, app_name, team_name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Session name is required' });
    }

    const session = createInterviewSession(name, {
      app_name,
      team_name,
      questionnaire: INITIAL_QUESTIONNAIRE,
    });

    return res.json({
      session,
      questionnaire: INITIAL_QUESTIONNAIRE,
      message: 'Interview session created. Send the questionnaire to your development team.',
      next_step: 'Submit their responses using POST /api/ai/interview/:id/respond',
    });
  } catch (error) {
    console.error('Error starting interview:', error);
    return res.status(500).json({ error: 'Failed to start interview session' });
  }
});

// Get questionnaire for a session
router.get('/interview/:id/questionnaire', async (req: Request, res: Response) => {
  try {
    const session = getInterviewSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Interview session not found' });
    }

    return res.json({
      session_id: session.id,
      session_name: session.name,
      questionnaire: session.questionnaire || INITIAL_QUESTIONNAIRE,
      status: session.status,
    });
  } catch (error) {
    console.error('Error getting questionnaire:', error);
    return res.status(500).json({ error: 'Failed to get questionnaire' });
  }
});

// Submit responses (Step 2: Process responses and generate follow-up questions)
router.post('/interview/:id/respond', async (req: Request, res: Response) => {
  try {
    const { responses } = req.body;
    const session = getInterviewSession(req.params.id);

    if (!session) {
      return res.status(404).json({ error: 'Interview session not found' });
    }

    if (!responses) {
      return res.status(400).json({ error: 'Responses are required' });
    }

    // Store the responses
    updateInterviewSession(session.id, {
      responses,
      status: 'processing',
      current_step: 2,
    });

    // Check if any AI provider is available
    const available = await isAnyAIAvailable();

    let followUpQuestions: string;
    let recommendedLogs: string;

    if (available) {
      // Generate AI-powered follow-up questions
      const followUpPrompt = `You are a logging expert helping a development team set up logging for their application.

Based on their questionnaire responses below, generate 3-5 specific follow-up questions to clarify their logging needs. Focus on:
- Specific endpoints or functions that need logging
- Error handling patterns in their code
- Authentication/authorization flows
- Data validation points
- Performance-critical sections

Their responses:
${responses}

Generate follow-up questions in markdown format with clear numbering. Be specific to their tech stack and architecture.`;

      try {
        const { response } = await generateText(followUpPrompt, { endpoint: '/ai/interview/respond' });
        followUpQuestions = response;
      } catch {
        followUpQuestions = generateDefaultFollowUpQuestions(responses);
      }

      // Generate initial log recommendations
      const recommendationsPrompt = `You are a logging expert. Based on these questionnaire responses, suggest what logs this application should capture.

Responses:
${responses}

Generate a JSON object with this structure:
{
  "critical_logs": ["list of critical events to log"],
  "security_logs": ["security-related events to log"],
  "performance_logs": ["performance metrics to capture"],
  "error_logs": ["error types to capture"],
  "business_logs": ["business events to track"]
}

Only output the JSON, no other text.`;

      try {
        const { response: recommendationsRaw } = await generateText(recommendationsPrompt, { endpoint: '/ai/interview/respond' });
        recommendedLogs = recommendationsRaw;
      } catch {
        recommendedLogs = JSON.stringify(generateDefaultRecommendations(responses), null, 2);
      }
    } else {
      // Fallback without AI
      followUpQuestions = generateDefaultFollowUpQuestions(responses);
      recommendedLogs = JSON.stringify(generateDefaultRecommendations(responses), null, 2);
    }

    // Update session with follow-up questions
    const updatedSession = updateInterviewSession(session.id, {
      follow_up_questions: followUpQuestions,
      recommended_logs: recommendedLogs,
      status: 'follow_up_sent',
      current_step: 2,
    });

    // Safely parse recommendations (LLM might wrap in code blocks)
    let parsedRecommendations;
    try {
      parsedRecommendations = JSON.parse(extractJSON(recommendedLogs));
    } catch {
      parsedRecommendations = { raw: recommendedLogs };
    }

    return res.json({
      session: updatedSession,
      follow_up_questions: followUpQuestions,
      preliminary_recommendations: parsedRecommendations,
      message: 'Responses received. Review the follow-up questions and preliminary recommendations.',
      next_step: 'Submit follow-up answers using POST /api/ai/interview/:id/follow-up OR generate implementation guide using POST /api/ai/interview/:id/generate',
      ai_available: available,
    });
  } catch (error) {
    console.error('Error processing responses:', error);
    return res.status(500).json({ error: 'Failed to process responses' });
  }
});

// Submit follow-up answers (optional Step 2.5)
router.post('/interview/:id/follow-up', async (req: Request, res: Response) => {
  try {
    const { follow_up_answers } = req.body;
    const session = getInterviewSession(req.params.id);

    if (!session) {
      return res.status(404).json({ error: 'Interview session not found' });
    }

    // Append follow-up answers to responses
    const updatedResponses = `${session.responses || ''}\n\n## Follow-up Answers\n\n${follow_up_answers}`;

    const updatedSession = updateInterviewSession(session.id, {
      responses: updatedResponses,
      current_step: 3,
    });

    return res.json({
      session: updatedSession,
      message: 'Follow-up answers recorded.',
      next_step: 'Generate implementation guide using POST /api/ai/interview/:id/generate',
    });
  } catch (error) {
    console.error('Error processing follow-up:', error);
    return res.status(500).json({ error: 'Failed to process follow-up answers' });
  }
});

// Generate implementation guide (Step 3)
router.post('/interview/:id/generate', async (req: Request, res: Response) => {
  try {
    const session = getInterviewSession(req.params.id);

    if (!session) {
      return res.status(404).json({ error: 'Interview session not found' });
    }

    if (!session.responses) {
      return res.status(400).json({ error: 'No responses recorded. Submit responses first.' });
    }

    updateInterviewSession(session.id, { status: 'processing' });

    const available = await isAnyAIAvailable();
    let implementationGuide: string;

    if (available) {
      const guidePrompt = `You are a senior developer generating a COPY-PASTE READY logging implementation guide. The developer should be able to implement this in under 30 minutes.

APPLICATION DETAILS:
${session.responses}

${session.recommended_logs ? `CRITICAL EVENTS TO LOG:\n${session.recommended_logs}` : ''}

Generate a markdown guide with ACTUAL CODE (not pseudocode) that includes:

## 1. Install Dependencies
Exact npm/pip/go commands for their framework.

## 2. Logger Configuration
Complete, working configuration file. Example for Node.js:
\`\`\`typescript
// src/lib/logger.ts - COPY THIS FILE
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'SERVICE_NAME', env: process.env.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Structured logging helpers
export const logEvent = (event: string, data: Record<string, unknown>) => {
  logger.info({ event, ...data });
};
\`\`\`

## 3. HTTP Request Logging Middleware
Complete middleware code for their framework.

## 4. Critical Event Logging
For EACH critical event from their responses, provide exact code:
\`\`\`typescript
// Payment success - add to payment handler
logger.info({
  event: 'payment_success',
  user_id: user.id,
  amount: payment.amount,
  transaction_id: payment.id
}, 'Payment processed successfully');

// Payment failure - add to error handler
logger.error({
  event: 'payment_failure',
  user_id: user.id,
  error_code: error.code,
  error_message: error.message
}, 'Payment processing failed');
\`\`\`

## 5. Ship Logs to LogNog
Two options with complete configs:

### Option A: HTTP Ingestion (Recommended for Serverless/Vercel)
\`\`\`typescript
// Add to logger.ts
import { logger } from './logger';

const LOGNOG_URL = process.env.LOGNOG_URL || 'http://localhost:4000';
const LOGNOG_API_KEY = process.env.LOGNOG_API_KEY;

export async function shipToLogNog(logs: object[]) {
  await fetch(\`\${LOGNOG_URL}/api/ingest/http\`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': LOGNOG_API_KEY || '',
    },
    body: JSON.stringify(logs),
  });
}
\`\`\`

### Option B: Syslog (for Docker/Server deployments)
\`\`\`toml
# vector.toml - add this source
[sources.app_logs]
type = "file"
include = ["/var/log/app/*.log"]

[sinks.lognog]
type = "socket"
inputs = ["app_logs"]
address = "lognog-vector:514"
mode = "udp"
\`\`\`

## 6. Environment Variables
\`\`\`bash
# .env.local
LOGNOG_URL=http://your-lognog-server:4000
LOGNOG_API_KEY=your-api-key-here
LOG_LEVEL=info
\`\`\`

## 7. LogNog Alert Rules
Ready-to-create alerts with DSL queries:
\`\`\`
Alert: High Error Rate
Query: search event=*_failure | timechart span=5m count | where count > 10
Threshold: Trigger when count > 10 in 5 minutes

Alert: Payment Failures
Query: search event=payment_failure | stats count
Threshold: Any occurrence
\`\`\`

## 8. Recommended Dashboard Panels
\`\`\`
Panel 1: Event Overview
Query: search * | stats count by event | sort desc count

Panel 2: Error Rate Over Time
Query: search severity>=error | timechart span=1h count

Panel 3: Top Users by Activity
Query: search event=* | stats count by user_id | sort desc count | limit 10
\`\`\`

## Quick Checklist
- [ ] Install dependencies
- [ ] Add logger configuration file
- [ ] Add HTTP middleware
- [ ] Add logging to critical paths (list specific files)
- [ ] Set environment variables
- [ ] Test locally with \`curl http://localhost:4000/health\`
- [ ] Create alerts in LogNog

BE SPECIFIC to their tech stack. If they use Next.js, show Next.js code. If they use Python/FastAPI, show Python code. Generate WORKING code they can copy-paste.`;

      try {
        const { response } = await generateText(guidePrompt, { endpoint: '/ai/interview/generate' });
        implementationGuide = response;
      } catch {
        implementationGuide = generateDefaultImplementationGuide(session.responses);
      }
    } else {
      implementationGuide = generateDefaultImplementationGuide(session.responses);
    }

    const updatedSession = updateInterviewSession(session.id, {
      implementation_guide: implementationGuide,
      status: 'implementation_ready',
      current_step: 4,
    });

    return res.json({
      session: updatedSession,
      implementation_guide: implementationGuide,
      message: 'Implementation guide generated! Share this with your development team.',
      ai_available: available,
    });
  } catch (error) {
    console.error('Error generating implementation guide:', error);
    return res.status(500).json({ error: 'Failed to generate implementation guide' });
  }
});

// Mark session as completed
router.post('/interview/:id/complete', async (req: Request, res: Response) => {
  try {
    const session = getInterviewSession(req.params.id);

    if (!session) {
      return res.status(404).json({ error: 'Interview session not found' });
    }

    const updatedSession = updateInterviewSession(session.id, {
      status: 'completed',
    });

    return res.json({
      session: updatedSession,
      message: 'Interview session marked as completed.',
    });
  } catch (error) {
    console.error('Error completing session:', error);
    return res.status(500).json({ error: 'Failed to complete session' });
  }
});

// Delete interview session
router.delete('/interview/:id', async (req: Request, res: Response) => {
  try {
    const deleted = deleteInterviewSession(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Interview session not found' });
    }
    return res.json({ message: 'Interview session deleted' });
  } catch (error) {
    console.error('Error deleting session:', error);
    return res.status(500).json({ error: 'Failed to delete session' });
  }
});

// Helper functions for fallback when Ollama is not available

function generateDefaultFollowUpQuestions(responses: string): string {
  const hasNode = responses.toLowerCase().includes('node') || responses.toLowerCase().includes('javascript');
  const hasPython = responses.toLowerCase().includes('python');
  const hasDocker = responses.toLowerCase().includes('docker');
  const hasDatabase = responses.toLowerCase().includes('database') || responses.toLowerCase().includes('sql') || responses.toLowerCase().includes('mongo');

  let questions = `# Follow-up Questions

Based on your responses, we have a few clarifying questions:

## Code Structure

1. **Entry Points**: What are the main entry points to your application? (e.g., API routes, event handlers, cron jobs)

2. **Error Handling**: How do you currently handle errors? Do you have a central error handler or try-catch blocks throughout?

`;

  if (hasDatabase) {
    questions += `3. **Database Operations**: Which database operations are most critical to your business? (e.g., user creation, order processing)

`;
  }

  if (hasNode || hasPython) {
    questions += `4. **Async Operations**: Do you have background jobs or async operations that should be logged?

`;
  }

  if (hasDocker) {
    questions += `5. **Container Logging**: Are your containers configured to output logs to stdout/stderr?

`;
  }

  questions += `
## Specific Scenarios

6. **Authentication Flow**: Can you describe your authentication flow? (login, token refresh, logout)

7. **Data Validation**: Where does your application validate user input?

8. **Third-Party Calls**: Which external API calls are most likely to fail or need monitoring?

---

*Please provide brief answers to help us generate more targeted logging recommendations.*
`;

  return questions;
}

function generateDefaultRecommendations(responses: string): Record<string, string[]> {
  const recommendations: Record<string, string[]> = {
    critical_logs: [
      'Application startup and shutdown',
      'Configuration loading (without secrets)',
      'Health check endpoints',
      'Critical business transactions',
    ],
    security_logs: [
      'Authentication attempts (success/failure)',
      'Authorization failures',
      'Password changes',
      'API key usage',
      'Suspicious activity patterns',
    ],
    performance_logs: [
      'Request/response times',
      'Database query durations',
      'External API call latencies',
      'Memory/CPU usage (periodic)',
      'Queue depths',
    ],
    error_logs: [
      'Unhandled exceptions',
      'Validation errors',
      'Database connection failures',
      'External service timeouts',
      'Rate limiting events',
    ],
    business_logs: [
      'User signup/onboarding',
      'Key feature usage',
      'Conversion events',
      'Subscription changes',
      'Data exports',
    ],
  };

  // Customize based on responses
  if (responses.toLowerCase().includes('payment') || responses.toLowerCase().includes('checkout')) {
    recommendations.critical_logs.push('Payment processing events');
    recommendations.security_logs.push('Payment fraud detection');
  }

  if (responses.toLowerCase().includes('file') || responses.toLowerCase().includes('upload')) {
    recommendations.critical_logs.push('File upload/download events');
    recommendations.error_logs.push('File processing failures');
  }

  return recommendations;
}

function generateDefaultImplementationGuide(responses: string): string {
  const hasNode = responses.toLowerCase().includes('node') || responses.toLowerCase().includes('express');
  const hasPython = responses.toLowerCase().includes('python') || responses.toLowerCase().includes('django') || responses.toLowerCase().includes('flask');

  let guide = `# Logging Implementation Guide

## Overview

This guide will help you implement structured logging in your application and ship logs to LogNog.

---

`;

  if (hasNode) {
    guide += `## 1. Logging Setup (Node.js)

### Install Dependencies

\`\`\`bash
npm install pino pino-pretty
\`\`\`

### Create Logger Configuration

\`\`\`javascript
// src/utils/logger.js
const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: process.env.SERVICE_NAME || 'my-app',
    environment: process.env.NODE_ENV || 'development',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

module.exports = logger;
\`\`\`

### Usage Examples

\`\`\`javascript
const logger = require('./utils/logger');

// Basic logging
logger.info('Application started');
logger.error({ err: error }, 'Database connection failed');

// With context
logger.info({ userId: user.id, action: 'login' }, 'User logged in');

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: Date.now() - start,
      ip: req.ip,
    }, 'HTTP request');
  });
  next();
});
\`\`\`

`;
  } else if (hasPython) {
    guide += `## 1. Logging Setup (Python)

### Install Dependencies

\`\`\`bash
pip install python-json-logger
\`\`\`

### Create Logger Configuration

\`\`\`python
# utils/logger.py
import logging
import os
from pythonjsonlogger import jsonlogger

def setup_logger(name='app'):
    logger = logging.getLogger(name)
    logger.setLevel(os.getenv('LOG_LEVEL', 'INFO'))

    handler = logging.StreamHandler()
    formatter = jsonlogger.JsonFormatter(
        '%(timestamp)s %(level)s %(name)s %(message)s',
        rename_fields={'levelname': 'level', 'asctime': 'timestamp'}
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)

    return logger

logger = setup_logger()
\`\`\`

### Usage Examples

\`\`\`python
from utils.logger import logger

# Basic logging
logger.info('Application started')
logger.error('Database connection failed', exc_info=True)

# With context
logger.info('User logged in', extra={'user_id': user.id, 'action': 'login'})

# Request logging decorator
def log_request(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        start = time.time()
        try:
            result = func(*args, **kwargs)
            logger.info('Request processed', extra={
                'function': func.__name__,
                'duration_ms': (time.time() - start) * 1000
            })
            return result
        except Exception as e:
            logger.error('Request failed', extra={
                'function': func.__name__,
                'error': str(e)
            }, exc_info=True)
            raise
    return wrapper
\`\`\`

`;
  } else {
    guide += `## 1. Logging Setup (Generic)

Choose a structured logging library for your language:

| Language | Recommended Library |
|----------|---------------------|
| Node.js | pino, winston |
| Python | python-json-logger, structlog |
| Go | zap, zerolog |
| Java | logback with JSON encoder |
| Ruby | semantic_logger |
| PHP | monolog with JSON formatter |

### Key Configuration Points

1. **Output format**: Use JSON for structured logging
2. **Log level**: Set via environment variable
3. **Base fields**: Include service name, environment, hostname
4. **Timestamp**: ISO 8601 format

`;
  }

  guide += `## 2. Log Format

### Recommended Structure

\`\`\`json
{
  "timestamp": "2025-01-15T10:30:00.000Z",
  "level": "info",
  "service": "my-app",
  "environment": "production",
  "hostname": "web-01",
  "message": "User logged in",
  "context": {
    "user_id": "12345",
    "action": "login",
    "ip": "192.168.1.100"
  },
  "trace_id": "abc123"
}
\`\`\`

### Required Fields

| Field | Description |
|-------|-------------|
| timestamp | ISO 8601 timestamp |
| level | Log level (debug, info, warn, error) |
| service | Application name |
| message | Human-readable message |

### Recommended Fields

| Field | Description |
|-------|-------------|
| hostname | Server hostname |
| environment | dev/staging/production |
| trace_id | Request correlation ID |
| user_id | Authenticated user |
| duration | Request/operation duration |

---

## 3. Where to Add Logging

### Application Lifecycle

\`\`\`javascript
// Startup
logger.info({ config: sanitizedConfig }, 'Application starting');

// Ready
logger.info({ port: PORT }, 'Application ready');

// Shutdown
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down');
});
\`\`\`

### HTTP Requests

Log every incoming request with:
- Method, path, status code
- Duration
- Client IP
- User ID (if authenticated)

### Database Operations

\`\`\`javascript
// Log slow queries
if (duration > 100) {
  logger.warn({ query, duration, params }, 'Slow database query');
}

// Log failures
logger.error({ query, error: err.message }, 'Database query failed');
\`\`\`

### Authentication

\`\`\`javascript
// Success
logger.info({ userId, method: 'password' }, 'Authentication successful');

// Failure
logger.warn({ email, reason: 'invalid_password', ip }, 'Authentication failed');
\`\`\`

### Errors

\`\`\`javascript
// Global error handler
app.use((err, req, res, next) => {
  logger.error({
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: req.user?.id,
  }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
});
\`\`\`

---

## 4. Integration with LogNog

### Option A: LogNog In Agent (Recommended)

1. Install the LogNog In agent on your server
2. Configure it to watch your log files or capture stdout
3. Agent handles batching, retries, and shipping

### Option B: HTTP Direct

\`\`\`javascript
const LOG_NOG_URL = process.env.LOG_NOG_URL;
const LOG_NOG_API_KEY = process.env.LOG_NOG_API_KEY;

async function shipToLogNog(logs) {
  await fetch(\`\${LOG_NOG_URL}/api/ingest/http\`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': LOG_NOG_API_KEY,
    },
    body: JSON.stringify(logs),
  });
}
\`\`\`

### Option C: Syslog (Docker/Linux)

Configure your logging library to output to syslog, then point syslog at LogNog:

\`\`\`
*.* @lognog-server:514
\`\`\`

---

## 5. Dashboard Recommendations

Create these panels in LogNog:

1. **Request Volume** - \`search * | timechart span=5m count\`
2. **Error Rate** - \`search level=error | timechart span=5m count\`
3. **Slow Requests** - \`search duration>1000 | stats count by path\`
4. **Top Errors** - \`search level=error | stats count by message | limit 10\`
5. **Active Users** - \`search user_id!=null | stats dc(user_id)\`

---

## 6. Alert Recommendations

Set up these alerts:

| Alert | Query | Condition |
|-------|-------|-----------|
| High Error Rate | \`search level=error | stats count\` | > 100 in 5 min |
| Authentication Failures | \`search action=login level=warn | stats count\` | > 10 in 5 min |
| Slow API | \`search duration>5000 | stats count\` | > 5 in 5 min |

---

## 7. What NOT to Log

**Never log:**
- Passwords or API keys
- Credit card numbers
- Social Security Numbers
- Personal health information
- Full request/response bodies (may contain PII)

**Mask sensitive data:**
\`\`\`javascript
function maskEmail(email) {
  const [user, domain] = email.split('@');
  return \`\${user[0]}***@\${domain}\`;
}

logger.info({ email: maskEmail(user.email) }, 'Password reset requested');
\`\`\`

---

## Next Steps

1. Implement the logging configuration
2. Add logging to your critical paths
3. Configure log shipping to LogNog
4. Create your first dashboard
5. Set up alerts for critical events

*Need help? Open an issue at github.com/machinekinglabs/lognog*
`;

  return guide;
}

export default router;
