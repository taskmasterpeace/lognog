import { Router, Request, Response } from 'express';
import {
  initializeLlamaIndex,
  loadOrCreateIndex,
  addDocument as llamaAddDocument,
  queryIndex as llamaQueryIndex,
  chatWithContext,
  getIndexStats,
  deleteAllDocuments,
} from '../../services/llamaindex.js';
import { createRAGDocument } from '../../db/sqlite.js';

export { queryIndex as llamaQueryIndex } from '../../services/llamaindex.js';

const router = Router();

// ============================================
// LlamaIndex Routes (Advanced RAG)
// ============================================

// Initialize LlamaIndex on first use
let llamaIndexInitialized = false;

export async function ensureLlamaIndexReady(): Promise<boolean> {
  if (!llamaIndexInitialized) {
    try {
      await initializeLlamaIndex();
      await loadOrCreateIndex();
      llamaIndexInitialized = true;
    } catch (error) {
      console.error('Failed to initialize LlamaIndex:', error);
      return false;
    }
  }
  return true;
}

// LlamaIndex status and stats
router.get('/llama/stats', async (_req: Request, res: Response) => {
  try {
    const ready = await ensureLlamaIndexReady();
    if (!ready) {
      return res.status(503).json({ error: 'LlamaIndex not available' });
    }

    const stats = await getIndexStats();
    return res.json({
      available: true,
      ...stats,
    });
  } catch (error) {
    console.error('Error getting LlamaIndex stats:', error);
    return res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Add document to LlamaIndex
router.post('/llama/documents', async (req: Request, res: Response) => {
  try {
    const { title, content, source_type, source_path, metadata } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const ready = await ensureLlamaIndexReady();
    if (!ready) {
      return res.status(503).json({ error: 'LlamaIndex not available' });
    }

    const docId = await llamaAddDocument({
      title,
      content,
      sourceType: source_type,
      sourcePath: source_path,
      metadata,
    });

    return res.json({
      message: 'Document added to LlamaIndex',
      document_id: docId,
    });
  } catch (error) {
    console.error('Error adding document to LlamaIndex:', error);
    return res.status(500).json({ error: 'Failed to add document' });
  }
});

// Query LlamaIndex
router.post('/llama/query', async (req: Request, res: Response) => {
  try {
    const { query, top_k, reasoning } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const ready = await ensureLlamaIndexReady();
    if (!ready) {
      return res.status(503).json({ error: 'LlamaIndex not available' });
    }

    const result = await llamaQueryIndex({
      query,
      topK: top_k || 5,
      useReasoning: reasoning === true,
    });

    return res.json({
      response: result.response,
      model: result.model,
      sources: result.sourceNodes.map(node => ({
        id: node.id,
        title: node.metadata.title || 'Untitled',
        score: node.score,
        excerpt: node.text.substring(0, 300) + '...',
      })),
    });
  } catch (error) {
    console.error('Error querying LlamaIndex:', error);
    return res.status(500).json({ error: 'Failed to query index' });
  }
});

// Chat with LlamaIndex context
router.post('/llama/chat', async (req: Request, res: Response) => {
  try {
    const { message, history, reasoning } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const ready = await ensureLlamaIndexReady();
    if (!ready) {
      return res.status(503).json({ error: 'LlamaIndex not available' });
    }

    const response = await chatWithContext(
      message,
      history || [],
      reasoning === true
    );

    return res.json({ response });
  } catch (error) {
    console.error('Error in LlamaIndex chat:', error);
    return res.status(500).json({ error: 'Failed to process chat' });
  }
});

// Clear LlamaIndex
router.delete('/llama/clear', async (_req: Request, res: Response) => {
  try {
    const ready = await ensureLlamaIndexReady();
    if (!ready) {
      return res.status(503).json({ error: 'LlamaIndex not available' });
    }

    await deleteAllDocuments();
    return res.json({ message: 'LlamaIndex cleared' });
  } catch (error) {
    console.error('Error clearing LlamaIndex:', error);
    return res.status(500).json({ error: 'Failed to clear index' });
  }
});

// Seed LlamaIndex with LogNog documentation
router.post('/llama/seed-docs', async (_req: Request, res: Response) => {
  try {
    const ready = await ensureLlamaIndexReady();
    if (!ready) {
      return res.status(503).json({ error: 'LlamaIndex not available' });
    }

    // LogNog built-in documentation content
    const docs = [
      {
        title: 'LogNog Overview',
        content: `LogNog is a self-hosted, fully-local Splunk alternative for homelab log management. Zero cloud dependencies.
Key features: 100% local data, Splunk-like query language (DSL), built-in alerting and dashboards, supports syslog/OTLP/HTTP ingestion, AI-powered features using local LLMs.
Deploy in under 10 minutes with docker-compose up.`,
      },
      {
        title: 'LogNog Query Language Basics',
        content: `LogNog uses a Splunk-like DSL (Domain Specific Language). Queries are pipelines connected by |.
Basic search: search host=router severity>=warning
Common commands: search, filter, stats, sort, limit, table, timechart, dedup, rename, eval, rex.
Operators: = (exact), != (not), >= <= > < (compare), ~ (regex match), !~ (regex not match).
Example: search app_name=nginx | filter message~"404" | stats count by hostname`,
      },
      {
        title: 'LogNog Statistics Functions',
        content: `Statistics functions for aggregation:
count - count events
sum(field) - sum values
avg(field) - average
min(field) / max(field) - extremes
dc(field) - distinct count
values(field) - list unique values
p50, p90, p95, p99 - percentiles
Examples: stats count by hostname | stats avg(response_time) by endpoint | stats dc(user_id) as unique_users`,
      },
      {
        title: 'LogNog Severity Levels',
        content: `Syslog severity levels (lower = more severe):
0 = Emergency (system unusable)
1 = Alert (immediate action required)
2 = Critical (critical conditions)
3 = Error (error conditions)
4 = Warning (warning conditions)
5 = Notice (normal but significant)
6 = Info (informational)
7 = Debug (debug messages)
Query examples: severity>=error (0-3), severity>=warning (0-4), severity=info (6 only)`,
      },
      {
        title: 'LogNog Ingestion Methods',
        content: `Ways to send logs to LogNog:
1. Syslog (UDP/TCP port 514) - For servers and network devices
2. HTTP API (POST /api/ingest/http) - For applications with JSON payload
3. OTLP (POST /api/ingest/otlp/v1/logs) - OpenTelemetry format
4. LogNog In Agent - Windows/Linux agent for log files and Windows Events
5. Supabase Log Drains (POST /api/ingest/supabase) - For Supabase projects
6. Vercel Log Drains (POST /api/ingest/vercel) - For Vercel deployments
7. SmartThings (POST /api/ingest/smartthings) - For IoT device events
All HTTP endpoints require X-API-Key header for authentication.`,
      },
      {
        title: 'LogNog Timechart Command',
        content: `The timechart command creates time-based aggregations for visualizations.
Syntax: timechart span=<interval> <function> [by <field>]
Intervals: 1m, 5m, 15m, 1h, 1d, 1w
Examples:
timechart span=1h count - hourly event count
timechart span=5m count by hostname - events per 5 min by host
timechart span=1d avg(response_time) - daily average response time`,
      },
      {
        title: 'LogNog Alerts',
        content: `Creating alerts:
1. Go to Alerts page and click Create Alert
2. Enter DSL query (e.g., search severity>=error | stats count)
3. Set threshold condition (when count > X)
4. Choose notification method (email, webhook)
5. Set check interval
Alert examples:
- High errors: search severity>=error | stats count | where count > 50
- Auth failures: search message~"auth.*fail" | stats count | where count > 5
Silencing: Can silence globally, per-host, or per-alert rule`,
      },
      {
        title: 'LogNog Dashboards',
        content: `Creating dashboards:
1. Go to Dashboards and click Create Dashboard
2. Add panels with DSL queries
3. Choose visualization: table, line chart, bar chart, counter, pie chart
4. Save and optionally share
Panel examples:
- Event Overview: search * | stats count by app_name | sort desc count
- Error Timeline: search severity>=error | timechart span=1h count
- Top Hosts: search * | stats count by hostname | sort desc count | limit 10`,
      },
      {
        title: 'LogNog Rex Command',
        content: `The rex command extracts fields using regular expressions.
Syntax: rex field=<field> "<regex with named groups>"
Named groups use (?P<name>pattern) syntax.
Examples:
rex field=message "user=(?P<username>\\w+)" - extract username
rex field=message "status=(?P<status>\\d+)" - extract status code
rex field=message "ip=(?P<client_ip>[\\d.]+)" - extract IP address`,
      },
      {
        title: 'LogNog AI Features',
        content: `AI-powered features (requires Ollama):
1. Natural Language to Query - Ask in English, get DSL query
2. Interview Wizard - Generate logging recommendations for your app
3. LlamaIndex RAG - Chat with indexed documentation
4. Query Explanation - Understand what a DSL query does
AI status: GET /ai/status shows which providers are available
Models used: DeepSeek-Coder-V2 (fast), Qwen3:30b (reasoning)
Fallback: OpenRouter cloud API if Ollama unavailable`,
      },
      {
        title: 'LogNog Troubleshooting',
        content: `Common issues:
Logs not appearing:
- Check Vector: docker logs lognog-vector
- Test syslog: echo "<14>test" | nc -u localhost 514
- Check API health: curl http://localhost:4000/health
Slow queries:
- Add time constraints and limits
- Filter by specific fields (hostname, app_name)
- Avoid search * without limits
AI not working:
- Check Ollama: curl http://localhost:11434/api/tags
- Verify models: ollama list
- Check AI status: curl http://localhost:4000/ai/status`,
      },
      {
        title: 'LogNog Onboarding Guide',
        content: `Getting Started with LogNog - Step by Step:

STEP 1: Deploy LogNog
- Run: docker-compose up -d
- Wait for all containers to start (about 1 minute)
- Access the UI at http://localhost

STEP 2: Create Admin Account
- On first visit, you'll see the setup page
- Create your admin username and password
- This account has full access to all features

STEP 3: Send Your First Logs
- Test syslog: echo "<14>Test message" | nc -u localhost 514
- Check the Search page to see your log appear
- Try a simple query: search *

STEP 4: Set Up Your Log Sources
- Configure your servers/devices to send syslog to LogNog's IP on port 514
- For applications, use the HTTP API with an API key
- Install LogNog In agent for Windows/Linux file monitoring

STEP 5: Create Your First Dashboard
- Go to Dashboards > Create Dashboard
- Add panels with queries like: stats count by hostname
- Save and share with your team

STEP 6: Set Up Alerts
- Go to Alerts > Create Alert
- Use a query like: search severity>=error | stats count
- Set threshold: when count > 10
- Configure email or webhook notifications

STEP 7: Explore AI Features
- Click the AI assistant (purple chat icon)
- Ask questions about DSL syntax
- Use Interview Wizard to generate logging recommendations`,
      },
      {
        title: 'LogNog Source Types and Templates',
        content: `LogNog supports various log source types with built-in templates:

NETWORK DEVICES:
- Routers (Cisco, MikroTik, Ubiquiti)
- Firewalls (pfSense, OPNsense, iptables)
- Switches and access points
Query: search sourcetype=firewall | stats count by action

WEB SERVERS:
- Nginx access and error logs
- Apache HTTP Server
- Traefik, Caddy
Query: search sourcetype=nginx | rex field=message "\\\"(?P<method>\\w+) (?P<path>[^\\\"]+)"

DATABASES:
- MySQL/MariaDB slow queries and errors
- PostgreSQL
- MongoDB, Redis
Query: search sourcetype=mysql severity>=warning

SECURITY/AUTH:
- sshd login attempts
- sudo commands
- Authentication services
Query: search sourcetype=sshd | filter message~"Failed|Accepted"

CONTAINERS:
- Docker container logs
- Kubernetes events
- Container orchestration
Query: search sourcetype=docker | stats count by container_name

APPLICATIONS:
- Custom application logs via HTTP API
- Structured JSON logs
- OpenTelemetry traces
Query: search sourcetype=application | stats count by service_name

IOT/SMART HOME:
- SmartThings device events
- Home automation systems
Query: search sourcetype=smartthings | stats count by device_name

CLOUD SERVICES:
- Supabase Log Drains (database, auth, storage, edge functions)
- Vercel Log Drains (serverless, edge, static)
Query: search sourcetype=supabase | stats count by event_type`,
      },
      {
        title: 'Splunk to LogNog Migration Guide',
        content: `SPLUNK TO LOGNOG QUICK REFERENCE

COMMAND EQUIVALENTS:
Splunk SPL → LogNog DSL

index=main → search *
index=main host=server1 → search hostname=server1
sourcetype=syslog → search sourcetype=syslog
| stats count by host → | stats count by hostname
| stats count, sum(bytes) → | stats count, sum(bytes)
| top 10 host → | top 10 hostname
| rare host → | rare hostname
| sort -count → | sort desc count
| head 100 → | limit 100 (or | head 100)
| tail 50 → | tail 50
| dedup host → | dedup hostname
| table host, message → | table hostname, message
| fields - _raw → | fields - raw
| rename host AS server → | rename hostname as server
| rex field=message "user=(?<user>\\w+)" → | rex field=message "user=(?P<user>\\w+)"
| eval new_field=field1+field2 → | eval new_field=field1+field2
| where count > 10 → | where count > 10
| timechart span=1h count → | timechart span=1h count

KEY DIFFERENCES:
1. LogNog requires explicit "search" command (Splunk allows implicit)
2. Field names use snake_case: hostname, app_name, severity (not host, sourcetype)
3. Time range is set in UI/API, not in query (no earliest= or latest=)
4. Regex named groups use Python syntax: (?P<name>pattern) not (?<name>pattern)
5. Regex match operator is ~ not regex: message~"error"
6. Use != for not equal, !~ for regex not match

EXAMPLE TRANSLATIONS:
Splunk: index=main host=web* status>=400 | stats count by host, status | sort -count
LogNog: search hostname~"web.*" status>=400 | stats count by hostname, status | sort desc count

Splunk: index=security action=failed | stats count by src_ip | where count > 5
LogNog: search action=failed | stats count by src_ip | where count > 5`,
      },
      {
        title: 'LogNog Common Query Templates',
        content: `READY-TO-USE QUERY TEMPLATES

ERROR MONITORING:
# All errors in last hour
search severity>=error

# Error count by host
search severity>=error | stats count by hostname | sort desc count

# Error timeline
search severity>=error | timechart span=5m count

SECURITY QUERIES:
# Failed SSH logins
search app_name=sshd message~"Failed password" | stats count by hostname

# Authentication events
search message~"auth|login|password" severity>=warning

# Sudo commands
search app_name=sudo | table timestamp, hostname, message

WEB SERVER ANALYSIS:
# Nginx/Apache errors
search app_name~"nginx|apache" severity>=error | stats count by hostname

# HTTP status codes
search sourcetype=nginx | rex field=message "HTTP/\\d.\\d\" (?P<status>\\d+)" | stats count by status

# Top requested URLs
search sourcetype=nginx | rex field=message "\"\\w+ (?P<url>[^\\s]+)" | top 20 url

PERFORMANCE MONITORING:
# Event volume over time
search * | timechart span=1h count

# Top talkers (most logs)
search * | stats count by hostname | sort desc count | limit 10

# Errors by application
search severity>=error | stats count by app_name | sort desc count

NETWORK/FIREWALL:
# Blocked traffic
search action=blocked | stats count by src_ip, dst_ip

# Connection summary
search sourcetype=firewall | stats count by action | sort desc count

CONTAINER/DOCKER:
# Container errors
search sourcetype=docker severity>=warning | stats count by container_name

# Container log volume
search sourcetype=docker | timechart span=5m count by container_name`,
      },
      {
        title: 'LogNog API Keys and Authentication',
        content: `Authentication in LogNog:

USER AUTHENTICATION:
- Login at /login with username/password
- JWT tokens for session management
- Role-based access: admin, user, readonly

API KEYS (for programmatic access):
- Create in Settings > API Keys
- Used for log ingestion and API access
- Include in requests: X-API-Key header

CREATING API KEYS:
1. Go to Settings > API Keys
2. Click "Create API Key"
3. Give it a descriptive name
4. Copy the key (shown only once!)
5. Use in your applications

USING API KEYS:
curl -X POST http://localhost/api/ingest/http \\
  -H "X-API-Key: your-api-key" \\
  -H "Content-Type: application/json" \\
  -d '[{"message": "test log", "severity": 6}]'

REVOKING KEYS:
- Go to Settings > API Keys
- Click delete on the key to revoke
- Revoked keys stop working immediately`,
      },
      {
        title: 'LogNog Anomaly Detection (UEBA)',
        content: `ANOMALY DETECTION - User and Entity Behavior Analytics

WHAT IT IS:
LogNog learns what "normal" looks like for your users, hosts, and applications, then alerts you when something unusual happens. Traditional alerts are static thresholds ("alert if failed logins > 5"), but anomaly detection learns each entity's unique baseline so "unusual" is personalized.

HOW IT WORKS:
1. Baselines: LogNog calculates moving averages for metrics like login counts, data transferred, error rates, activity by hour/day
2. Detection: When a new value deviates significantly (X standard deviations) from baseline, it's flagged as anomalous
3. LLM Analysis: Optional AI review provides risk scores (0-100), plain English explanations, and investigation steps

EXAMPLE SCENARIOS:
- User normally logs in 9-5 from Seattle, suddenly logs in at 3am from Russia
- Host normally sends 50MB/day, today sent 5GB (data exfiltration?)
- Service account with 0 failed logins suddenly has 50 in 5 minutes
- Employee accessing files they've never touched after giving notice

HOW TO USE:
1. Go to Anomaly in the sidebar
2. View Risk Dashboard showing entities with highest risk scores
3. Click anomaly to see: baseline vs actual value, AI analysis, recommendations
4. Mark as "true positive" or "false positive" to improve accuracy

Similar to Splunk UBA, but built-in and runs locally with Ollama.`,
      },
      {
        title: 'LogNog Assets and Identities',
        content: `ASSETS & IDENTITIES - Auto-discovered inventory from logs

WHAT IT IS:
A database of all "things" (assets) and "people" (identities) in your environment, automatically discovered from your logs.

Assets: Servers, workstations, network devices, applications, databases
Identities: Users, service accounts, API keys, email addresses

WHY IT MATTERS:
When you see "Failed login from 192.168.1.50 for jsmith" you want to know:
- Is 192.168.1.50 a critical server or random workstation?
- Is jsmith in finance or IT? A privileged admin?
- When did we first see this IP? Is it new?

HOW IT WORKS:
1. Auto-Discovery: LogNog scans logs and extracts hostnames, IPs, MAC addresses → Assets; usernames, emails, service accounts → Identities
2. Enrichment: Add metadata like criticality (1-100), owner, department/role, privileged flag
3. Correlation: When viewing logs or anomalies, see full context about who/what is involved

HOW TO USE:
1. Go to Assets or Identities in the sidebar
2. Click Discover to auto-populate from recent logs
3. Edit entries to add criticality scores, owners, tags
4. Use in searches: search host=* | lookup assets by hostname

Similar to Splunk Asset & Identity Framework from Enterprise Security, but simpler.`,
      },
      {
        title: 'LogNog Common Information Model (CIM)',
        content: `COMMON INFORMATION MODEL - Normalize field names across log sources

WHAT IT IS:
A way to standardize field names so you can write ONE query that works across all log sources.

THE PROBLEM:
Different systems call the same thing different names:
- Windows: AccountName, IpAddress, EventType
- Linux: user, src, action
- AWS CloudTrail: userIdentity.userName, sourceIPAddress, eventName
- Firewall: srcuser, src_ip, act

Without CIM: You need different searches for each source
With CIM: Write one search using standard field names

DATA MODELS (built-in):
- Authentication: user, src, dest, action, result
- Network Traffic: src_ip, dest_ip, src_port, dest_port, bytes
- Endpoint: host, process, file_path, action
- Web: src_ip, uri, method, status, user_agent

HOW TO USE:
1. Go to Data Models in the sidebar
2. View built-in models (Authentication, Network, etc.)
3. Click Field Mappings to set up translations
4. Example: Source Type=windows:security, Source Field=AccountName, CIM Field=user
5. Now searches using "user" automatically find Windows AccountName

BEFORE CIM:
search (sourcetype=windows AccountName=admin) OR (sourcetype=linux user=admin) OR (sourcetype=aws userIdentity.userName=admin)

AFTER CIM:
search user=admin

Similar to Splunk Common Information Model, just simplified.`,
      },
      {
        title: 'LogNog AI Agent Framework',
        content: `AI AGENT - Conversational assistant that searches and investigates logs

WHAT IT IS:
An AI assistant you can talk to in plain English. It searches logs, investigates issues, looks up assets, and creates alerts - all through natural conversation.

THE PROBLEM IT SOLVES:
Writing log queries requires knowing query syntax, field names, and how to structure complex searches. The AI Agent lets you just ask questions.

AGENT PERSONAS:
- Security Analyst: Threat hunting, investigating incidents
- SRE: Troubleshooting outages, performance issues
- Compliance: Audit queries, access reviews

WHAT THE AGENT CAN DO:
- "Show me failed logins in the last hour" → Runs: search action=failure | stats count by user
- "Is there anything unusual with the database server?" → Checks anomalies, reviews recent errors
- "Who logged into the VPN from outside the US?" → Searches VPN logs, enriches IPs with GeoIP, filters by country
- "Create an alert for more than 10 failed SSH logins" → Creates alert rule with proper thresholds

AVAILABLE TOOLS:
- search_logs: Execute DSL queries
- get_asset: Look up asset details
- enrich_ip: GeoIP lookup
- create_alert: Create alert rules
- get_anomalies: Check anomaly data

HOW TO USE:
1. Go to AI Agent in the sidebar
2. Select a persona (or use default)
3. Type your question in plain English
4. Watch the AI think, run searches, provide answers with evidence
5. Ask follow-up questions to dig deeper

Similar to Splunk AI Assistant, but runs locally with Ollama - no cloud costs.`,
      },
      {
        title: 'LogNog Synthetic Monitoring',
        content: `SYNTHETIC MONITORING - Proactive uptime testing

WHAT IT IS:
Automated tests that regularly check if your websites, APIs, and services are up and responding correctly - like a robot user continuously testing your services.

THE PROBLEM IT SOLVES:
Traditional monitoring is reactive - you find out something is down when users complain or logs show errors. Synthetic monitoring is proactive - it continuously tests from the outside and alerts before real users are affected.

TEST TYPES:
- HTTP: Is this URL responding with 200 OK?
- API: Does endpoint return valid JSON with expected fields?
- TCP: Can we connect to this database port?
- Browser: Full page render test (coming soon)

ASSERTIONS YOU CAN ADD:
- status equals 200
- responseTime lessThan 1000 (ms)
- body contains "Welcome"
- header Content-Type contains application/json
- jsonPath data.status equals "healthy"

EXAMPLE TESTS:
- Homepage returns 200: Know immediately if site is down
- API response < 500ms: Catch performance degradation before users notice
- Login page contains "Sign In": Detect if page is broken or showing errors
- Database port reachable: Know if DB is accepting connections

HOW TO USE:
1. Go to Synthetic in the sidebar
2. Click New Test
3. Fill in: Name, Type (HTTP/TCP/API), URL, Schedule (every 5 min), Assertions
4. Save and watch dashboard for results
5. View history for uptime percentages and trends

ALERTING:
After X consecutive failures, trigger an alert via email or webhook.

Similar to Splunk Synthetic Monitoring (formerly Rigor), but built-in and free.`,
      },
      {
        title: 'LogNog Feature Quick Reference',
        content: `LOGNOG FEATURE QUICK REFERENCE

WHERE TO FIND EVERYTHING:
| Feature | Sidebar Location | What You'll See |
|---------|------------------|-----------------|
| Anomaly Detection | Anomaly | Risk dashboard, anomaly timeline, baseline charts |
| Assets | Assets | Asset inventory, criticality scores, discovery |
| Identities | Identities | User/account inventory, privilege flags |
| Data Models (CIM) | Data Models | Field definitions, mappings, validation |
| AI Agent | AI Agent | Chat interface, tool execution, personas |
| Synthetic Monitoring | Synthetic | Test list, uptime stats, results history |

GETTING STARTED RECOMMENDATIONS:

If just exploring:
1. AI Agent: Ask "What are the most common errors in the last hour?"
2. Synthetic: Add HTTP check for a website you care about
3. Assets: Click Discover to auto-populate from logs

If you want security monitoring:
1. Run Asset & Identity discovery
2. Set criticality on important servers
3. Enable Anomaly Detection baseline calculation
4. Review Risk Dashboard daily

If you want unified searching:
1. Set up CIM field mappings for your main log sources
2. Now searches like user=admin work everywhere

FAQ:
Q: Does this require cloud services? No - everything runs locally with Ollama
Q: Will this slow down my system? Minimal - baselines calculate in background
Q: Do I need to set up everything? No - each feature is independent`,
      },
      {
        title: 'LogNog Index Management and Data Sources',
        content: `INDEX MANAGEMENT - How logs are organized in LogNog

HOW INDEXES WORK:
Logs are grouped into indexes (similar to Splunk indexes or folders). Each log belongs to one index.
- Default index is 'main' if not specified during ingestion
- Different ingestion sources have default indexes: agent='agent', supabase='supabase', vercel='vercel', http='http', otel='otel'
- You can specify a custom index when sending logs

HOW TO SPECIFY CUSTOM INDEX:
When sending logs via HTTP API, add the X-Index header:
curl -X POST /api/ingest/http \\
  -H "X-Index: my-custom-app" \\
  -H "X-API-Key: your-api-key" \\
  -H "Content-Type: application/json" \\
  -d '[{"message": "test log", "severity": 6}]'

Index name rules:
- Lowercase only
- Alphanumeric characters, hyphens, and underscores allowed
- Must start with a letter
- Maximum 32 characters
- Special characters are removed automatically

WHERE TO VIEW YOUR INDEXES:
Go to Data Sources in the sidebar, then click the Active Sources tab.
- See all indexes with their log counts
- View which app_names/sources are sending to each index
- Check error counts and last seen timestamps

CAN I RENAME AN INDEX?
No - once logs are ingested to an index, they cannot be moved to a different index.
To use a different index name, update your log sender to use the X-Index header with the desired name.

HOW TO NORMALIZE FIELDS ACROSS DIFFERENT SOURCES:
Use the Common Information Model (CIM) feature:
1. Go to Data Models in the sidebar
2. Create field mappings to translate different field names to standard names
3. Example: Map Windows 'AccountName' and Linux 'user' both to CIM field 'user'
4. Then queries like 'search user=admin' work across all sources

DATA SOURCES PAGE FEATURES:
- Active Sources tab: See all indexes and sources currently sending logs
- Source Templates tab: Pre-configured templates for common log sources (MySQL, Nginx, sshd, etc.)
- Each template includes: field extraction patterns, sample queries, setup instructions`,
      },
    ];

    // Add documents to LlamaIndex
    let added = 0;
    for (const doc of docs) {
      try {
        await llamaAddDocument({
          title: doc.title,
          content: doc.content,
          sourceType: 'builtin-docs',
          metadata: { category: 'documentation' },
        });
        added++;
      } catch (error) {
        console.error(`Failed to add doc: ${doc.title}`, error);
      }
    }

    return res.json({
      message: 'Documentation seeded successfully',
      added,
      total: docs.length,
    });
  } catch (error) {
    console.error('Error seeding documentation:', error);
    return res.status(500).json({ error: 'Failed to seed documentation' });
  }
});

// Seed FTS-only (for hybrid search fallback when Ollama unavailable)
router.post('/llama/seed-fts', async (_req: Request, res: Response) => {
  try {
    // LogNog documentation for FTS search (same as seed-docs but without LlamaIndex)
    const docs = [
      { title: 'LogNog Overview', content: 'LogNog is a self-hosted, fully-local Splunk alternative for homelab log management. Zero cloud dependencies. Key features: 100% local data, Splunk-like query language (DSL), built-in alerting and dashboards, supports syslog/OTLP/HTTP ingestion, AI-powered features using local LLMs. Deploy in under 10 minutes with docker-compose up.' },
      { title: 'LogNog Query Language Basics', content: 'LogNog uses a Splunk-like DSL (Domain Specific Language). Queries are pipelines connected by |. Basic search: search host=router severity>=warning. Common commands: search, filter, stats, sort, limit, table, timechart, dedup, rename, eval, rex. Operators: = (exact), != (not), >= <= > < (compare), ~ (regex match), !~ (regex not match). Example: search app_name=nginx | filter message~"404" | stats count by hostname' },
      { title: 'LogNog Statistics Functions', content: 'Statistics functions for aggregation: count - count events, sum(field) - sum values, avg(field) - average, min(field) / max(field) - extremes, dc(field) - distinct count, values(field) - list unique values, list(field) - collect all values, p50/p90/p95/p99 - percentiles, stddev(field) - standard deviation, variance(field) - variance, range(field) - max minus min, earliest(field)/latest(field) - first/last value. Example: search * | stats count, avg(response_time), p95(response_time) by hostname' },
      { title: 'Searching for Errors', content: 'To search for errors in LogNog: search severity>=4 finds warnings and errors (syslog severity 4 = warning, 3 = error, 2 = critical). search message~"error|fail|exception" searches message content. search app_name=nginx severity<=3 finds critical errors from nginx. Combine with stats: search severity<=3 | stats count by hostname, app_name | sort desc count. Use timechart for error trends: search severity<=3 | timechart span=1h count by app_name' },
      { title: 'Time Filtering', content: 'LogNog uses the time picker in the UI for time ranges. Default is last 15 minutes. Time syntax in queries: earliest=-24h (last 24 hours), latest=-1h (up to 1 hour ago), earliest=2024-01-01T00:00:00 (specific time). The bin command buckets by time: bin span=1h timestamp creates hourly buckets. timechart is a shortcut: timechart span=5m count by hostname gives time-series data for charts.' },
      { title: 'Ingestion Methods', content: 'LogNog supports multiple ingestion methods: Syslog UDP/TCP port 514 for network devices, OTLP endpoint POST /api/ingest/otlp/v1/logs for OpenTelemetry, HTTP POST /api/ingest for generic JSON logs, LogNog In Agent for Windows Event Logs and file monitoring, Supabase Log Drains POST /api/ingest/supabase, Vercel Log Drains POST /api/ingest/vercel. All except syslog support API key authentication via X-API-Key header.' },
      { title: 'Dashboard Creation', content: 'To create dashboards: Go to Dashboards page, click New Dashboard, add panels using the DSL query editor. Panel types: Time series chart, table, single value stat, bar chart, pie chart. Use variables for dynamic dashboards: $hostname$ in queries, define in dashboard settings. Annotations mark events on charts. Dashboards auto-refresh (configurable interval).' },
      { title: 'Alerts Configuration', content: 'LogNog alerts: Create from Alerts page or convert saved search. Define DSL query that returns results when alert should fire. Set schedule (cron syntax). Notification channels: email via SMTP, Slack/Discord/Telegram via Apprise. Alert silencing: global, per-host, or per-alert. Silence scheduling with expiration time.' },
    ];

    let added = 0;
    for (const doc of docs) {
      try {
        createRAGDocument({
          title: doc.title,
          content: doc.content,
          source_type: 'builtin-docs',
          metadata: JSON.stringify({ category: 'documentation' }),
        });
        added++;
      } catch (error) {
        console.error(`Failed to add doc to FTS: ${doc.title}`, error);
      }
    }

    return res.json({
      message: 'FTS documentation seeded successfully',
      added,
      total: docs.length,
    });
  } catch (error) {
    console.error('Error seeding FTS documentation:', error);
    return res.status(500).json({ error: 'Failed to seed FTS documentation' });
  }
});

export default router;
