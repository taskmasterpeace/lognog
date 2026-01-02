# LogNog New Features Guide

A plain-English guide to the 5 major features added to LogNog. Written for Splunk users who want to understand what these do and how to use them.

---

## Table of Contents

1. [Anomaly Detection (UEBA)](#1-anomaly-detection-ueba)
2. [Assets & Identities](#2-assets--identities)
3. [Common Information Model (CIM)](#3-common-information-model-cim)
4. [AI Agent](#4-ai-agent)
5. [Synthetic Monitoring](#5-synthetic-monitoring)

---

## 1. Anomaly Detection (UEBA)

**What is it?**

UEBA stands for "User and Entity Behavior Analytics." In plain terms: LogNog learns what "normal" looks like for your users, hosts, and applications, then alerts you when something weird happens.

**The Problem It Solves**

Traditional alerts are like: "Alert me if failed logins > 5." But what if a user normally has 0 failed logins and suddenly has 3? That's suspicious! And what if another user (maybe IT support) normally has 10 failed logins because they're testing? 5 would be normal for them.

Anomaly detection learns each entity's unique baseline, so "unusual" is personalized.

**How It Works**

1. **Baselines**: LogNog calculates moving averages for metrics like:
   - Login counts per user
   - Data transferred per host
   - Error rates per application
   - Activity by hour of day and day of week

2. **Detection**: When a new value comes in, LogNog compares it to the baseline. If it's more than X standard deviations away, it's flagged as anomalous.

3. **LLM Analysis**: Optionally, an AI model reviews the anomaly and provides:
   - A risk score (0-100)
   - Plain English explanation
   - Suggested investigation steps

**Real-World Examples**

| Scenario | What LogNog Detects |
|----------|---------------------|
| Employee account compromised | User normally logs in 9-5 from Seattle. Suddenly logging in at 3am from Russia. |
| Data exfiltration | A host normally sends 50MB/day. Today it sent 5GB. |
| Brute force attack | A service account normally has 0 failed logins. Now it has 50 in 5 minutes. |
| Insider threat | An employee accessing files they've never touched before, especially after giving notice. |

**How to Use It**

1. Go to **Anomaly** in the sidebar
2. View the **Risk Dashboard** showing entities with highest risk scores
3. Click on an anomaly to see:
   - What the normal baseline was
   - What the actual value was
   - The AI's analysis and recommendations
4. Mark anomalies as "true positive" or "false positive" to improve accuracy

**Splunk Equivalent**: This is like Splunk UBA (User Behavior Analytics), but built-in and using your local Ollama AI instead of cloud services.

---

## 2. Assets & Identities

**What is it?**

A database of all the "things" and "people" in your environment, automatically discovered from your logs.

- **Assets**: Servers, workstations, network devices, applications, databases
- **Identities**: Users, service accounts, API keys, email addresses

**The Problem It Solves**

When you see a log like `Failed login from 192.168.1.50 for user jsmith`, you want to know:
- Is 192.168.1.50 a critical server or a random workstation?
- Is jsmith in finance or IT? Are they a privileged admin?
- When did we first see this IP? Is it new?

Without an asset/identity database, you're flying blind.

**How It Works**

1. **Auto-Discovery**: LogNog scans your logs and extracts:
   - Hostnames, IPs, MAC addresses → creates Assets
   - Usernames, email addresses, service accounts → creates Identities

2. **Enrichment**: You can add metadata:
   - Asset criticality (1-100) - is this a dev box or the production database?
   - Asset owner - who's responsible?
   - Identity department/role - finance, IT, executive?
   - Privileged flag - is this an admin account?

3. **Correlation**: When viewing logs or anomalies, you see the full context about who/what is involved.

**Real-World Examples**

| Use Case | How Assets & Identities Help |
|----------|------------------------------|
| Security incident | "This IP belongs to the CEO's laptop, criticality 95, last seen yesterday" |
| Access review | "Show me all privileged identities that haven't logged in for 90 days" |
| Compliance | "List all assets in the PCI scope with their owners" |
| Onboarding | "When did we first see this new employee in logs?" |

**How to Use It**

1. Go to **Assets** or **Identities** in the sidebar
2. Click **Discover** to auto-populate from recent logs
3. Edit entries to add:
   - Criticality scores
   - Owners
   - Tags (e.g., "pci-scope", "production")
   - Department/role info
4. Use in searches: `search host=* | lookup assets by hostname`

**Splunk Equivalent**: This is like Splunk's Asset & Identity Framework from Enterprise Security, but simpler and built-in.

---

## 3. Common Information Model (CIM)

**What is it?**

A way to normalize field names across different log sources so you can write one search that works everywhere.

**The Problem It Solves**

Different systems call the same thing different names:

| What It Is | Windows Logs | Linux Syslog | AWS CloudTrail | Firewall |
|------------|--------------|--------------|----------------|----------|
| Username | `AccountName` | `user` | `userIdentity.userName` | `srcuser` |
| Source IP | `IpAddress` | `src` | `sourceIPAddress` | `src_ip` |
| Action | `EventType` | `action` | `eventName` | `act` |

Without CIM, you'd need to write a different search for each source. With CIM, you write ONE search using standard field names.

**How It Works**

1. **Data Models**: LogNog has built-in models defining standard fields:
   - **Authentication**: `user`, `src`, `dest`, `action`, `result`
   - **Network Traffic**: `src_ip`, `dest_ip`, `src_port`, `dest_port`, `bytes`
   - **Endpoint**: `host`, `process`, `file_path`, `action`
   - **Web**: `src_ip`, `uri`, `method`, `status`, `user_agent`

2. **Field Mappings**: You tell LogNog how to translate:
   - "For Windows logs, map `AccountName` → `user`"
   - "For AWS logs, map `sourceIPAddress` → `src_ip`"

3. **Normalized Searches**: Now you can search using standard names and it works across all sources.

**Real-World Examples**

**Before CIM** (pain):
```
search (sourcetype=windows AccountName=admin) OR
       (sourcetype=linux user=admin) OR
       (sourcetype=aws userIdentity.userName=admin)
```

**After CIM** (joy):
```
search user=admin
```

**How to Use It**

1. Go to **Data Models** in the sidebar
2. View built-in models (Authentication, Network, etc.)
3. Click **Field Mappings** to set up translations for your log sources
4. Example mapping:
   - Source Type: `windows:security`
   - Source Field: `AccountName`
   - CIM Field: `user`
5. Now searches using `user` will automatically find Windows `AccountName`

**Splunk Equivalent**: This is exactly like Splunk's Common Information Model, just simplified.

---

## 4. AI Agent

**What is it?**

A conversational AI assistant that can search your logs, investigate issues, and answer questions using natural language.

**The Problem It Solves**

Writing log queries requires knowing:
- The query language syntax
- What fields exist in your data
- How to structure complex searches

The AI Agent lets you just ask questions in plain English.

**How It Works**

1. **Natural Language**: You type questions like a conversation
2. **Tool Use**: The AI can:
   - Search logs using the DSL
   - Look up assets and identities
   - Check anomaly data
   - Enrich IP addresses with GeoIP
   - Create alerts
3. **Multi-Step Reasoning**: For complex questions, it breaks them down and investigates step by step

**Real-World Examples**

| You Ask | AI Does |
|---------|---------|
| "Show me failed logins in the last hour" | Runs `search action=failure \| stats count by user` |
| "Is there anything unusual with the database server?" | Checks anomalies for that host, reviews recent errors |
| "Who logged into the VPN from outside the US?" | Searches VPN logs, enriches IPs with GeoIP, filters by country |
| "Create an alert for more than 10 failed SSH logins" | Creates an alert rule with proper thresholds |

**Available Personas**

| Persona | Best For |
|---------|----------|
| Security Analyst | Threat hunting, investigating incidents |
| SRE | Troubleshooting outages, performance issues |
| Compliance | Audit queries, access reviews |

**How to Use It**

1. Go to **AI Agent** in the sidebar
2. Select a persona (or use default)
3. Type your question in plain English
4. Watch the AI:
   - Think through the problem
   - Run searches and lookups
   - Provide an answer with evidence
5. Ask follow-up questions to dig deeper

**Splunk Equivalent**: This is like Splunk AI Assistant, but runs locally using Ollama (no cloud, no cost per query).

---

## 5. Synthetic Monitoring

**What is it?**

Automated tests that regularly check if your websites, APIs, and services are up and responding correctly.

**The Problem It Solves**

Traditional monitoring is reactive - you find out something is down when:
- Users complain
- Logs show errors (but only if logging is working!)
- Someone happens to notice

Synthetic monitoring is proactive - it continuously tests your services from the outside, like a robot user, and alerts you before real users are affected.

**How It Works**

1. **Create Tests**: Define what to check:
   - HTTP: Is this URL responding with 200 OK?
   - API: Does this endpoint return valid JSON with expected fields?
   - TCP: Can we connect to this database port?

2. **Schedule**: How often to run (every 1 min, 5 min, hourly, etc.)

3. **Assertions**: What counts as "success":
   - Status code equals 200
   - Response time under 500ms
   - Body contains "healthy"
   - JSON field `status` equals `"ok"`

4. **Alerting**: After X consecutive failures, trigger an alert

**Test Types**

| Type | What It Checks | Example |
|------|----------------|---------|
| HTTP | Web page loads | Check if `https://myapp.com` returns 200 |
| API | API endpoint works | Check if `/api/health` returns `{"status":"ok"}` |
| TCP | Port is open | Check if database port 5432 is reachable |
| Browser | Full page render (coming soon) | Check if login form loads and works |

**Assertions You Can Add**

| Assertion | Example |
|-----------|---------|
| Status Code | `status equals 200` |
| Response Time | `responseTime lessThan 1000` (ms) |
| Body Contains | `body contains "Welcome"` |
| Header Check | `header Content-Type contains application/json` |
| JSON Path | `jsonPath data.status equals "healthy"` |

**Real-World Examples**

| Test | Why It Matters |
|------|----------------|
| Homepage returns 200 | Know immediately if your site is down |
| API response < 500ms | Catch performance degradation before users notice |
| Login page contains "Sign In" | Detect if the page is broken or showing errors |
| Database port reachable | Know if DB is accepting connections |
| JSON has required fields | Catch API breaking changes |

**How to Use It**

1. Go to **Synthetic** in the sidebar
2. Click **New Test**
3. Fill in:
   - Name: "Production API Health"
   - Type: HTTP
   - URL: `https://api.mycompany.com/health`
   - Schedule: Every 5 minutes
   - Assertions: Status = 200, Response Time < 1000ms
4. Save and watch the dashboard for results
5. View history to see uptime percentages and trends

**Splunk Equivalent**: This is like Splunk Synthetic Monitoring (formerly Rigor), but built-in and free.

---

## Quick Reference: Where to Find Everything

| Feature | Sidebar Location | What You'll See |
|---------|------------------|-----------------|
| Anomaly Detection | Anomaly | Risk dashboard, anomaly timeline, baseline charts |
| Assets | Assets | Asset inventory, criticality scores, discovery |
| Identities | Identities | User/account inventory, privilege flags |
| Data Models (CIM) | Data Models | Field definitions, mappings, validation |
| AI Agent | AI Agent | Chat interface, tool execution, personas |
| Synthetic | Synthetic | Test list, uptime stats, results history |

---

## Getting Started Recommendations

**If you're just exploring**, try these first:

1. **AI Agent**: Ask "What are the most common errors in the last hour?" - easiest way to start
2. **Synthetic**: Add a simple HTTP check for a website you care about
3. **Assets**: Click "Discover" to auto-populate from your logs

**If you want security monitoring**:

1. Run Asset & Identity discovery
2. Set criticality on your important servers
3. Enable Anomaly Detection baseline calculation
4. Review the Risk Dashboard daily

**If you want unified searching**:

1. Set up CIM field mappings for your main log sources
2. Now searches like `user=admin` work everywhere

---

## FAQ

**Q: Does any of this require cloud services?**

No! Everything runs locally:
- AI uses your local Ollama installation
- All data stays in your ClickHouse/SQLite
- Synthetic tests run from your LogNog server

**Q: Will this slow down my system?**

Minimal impact:
- Anomaly baselines calculate in background
- Synthetic tests run on schedule (not constantly)
- AI Agent only uses resources when you're chatting

**Q: Do I need to set up everything?**

Nope. Each feature is independent. Use what you need, ignore the rest.

**Q: How is this different from Splunk Enterprise Security?**

Similar concepts, but:
- Built-in (no separate purchase)
- Simpler to configure
- Runs locally (no cloud costs)
- Uses open-source AI (Ollama)

---

## Need Help?

- Check the **Docs** page in LogNog for reference
- The AI Agent can answer questions about your data
- Open an issue on GitHub for bugs or feature requests
