# LogNog Marketing Materials

> Your Logs, Your Control

---

## The Elevator Pitch

**LogNog is a self-hosted Splunk alternative that actually respects homelabbers.**

No cloud lock-in. No surprise bills. No "contact sales" buttons. Just powerful log management that runs on your hardware and stays there.

---

## Taglines & Slogans

### Primary
- **"Your Logs, Your Control"** - The main tagline
- **"Splunk Without the Sticker Shock"**
- **"Self-Hosted Log Management for the Rest of Us"**

### Technical
- **"One Docker Command. Zero Cloud Dependencies."**
- **"From Syslog to Search in 10 Minutes"**
- **"Query Your Logs Like You Know Splunk"**

### Homelab-Focused
- **"Finally, a Splunk Alternative That Doesn't Hate Homelabs"**
- **"Enterprise Logging on a Homelab Budget"**
- **"Your Router's Logs Deserve Better Than grep"**

### Punchy One-Liners
- **"grep is not a SIEM"**
- **"Your NAS has logs. Do you know what they say?"**
- **"Splunk pricing made us build this."**
- **"Log management that doesn't phone home."**
- **"Open source. Locally hosted. Actually usable."**

---

## What LogNog Ingests

### Network & Infrastructure
| Source | Method | Notes |
|--------|--------|-------|
| **pfSense / OPNsense** | Syslog UDP/TCP 514 | Firewall rules, DHCP, OpenVPN |
| **Ubiquiti UniFi** | Syslog | Access points, switches, USG |
| **Synology NAS** | Syslog | File access, DSM events |
| **QNAP** | Syslog | Storage events |
| **Proxmox** | Syslog | VM lifecycle, cluster events |
| **TrueNAS** | Syslog | ZFS, SMB, iSCSI events |
| **MikroTik** | Syslog | RouterOS events |
| **Cisco** | Syslog | IOS, ASA, Meraki |
| **FortiGate** | Syslog | FortiOS events |

### Game Servers
| Server | Method | What You'll See |
|--------|--------|-----------------|
| **Minecraft** | Agent (file watch) | Player joins/leaves, chat, commands, errors |
| **7 Days to Die** | Agent (file watch) | Player activity, zombie kills, base events |
| **Valheim** | Agent (file watch) | World events, player deaths, connections |
| **ARK: Survival** | Agent (file watch) | Tribe logs, taming, server events |
| **Rust** | Agent (file watch) | Player activity, raids, admin commands |
| **Terraria** | Agent (file watch) | Player connections, boss kills |
| **Counter-Strike** | Agent (file watch) | Match events, player stats |
| **Team Fortress 2** | Agent (file watch) | Server logs, player activity |
| **Left 4 Dead 2** | Agent (file watch) | Campaign progress, player stats |
| **Garry's Mod** | Agent (file watch) | Lua errors, player activity |

**Yes, LogNog handles game servers!** Just point the agent at your server's log directory:
```yaml
watch_paths:
  - path: C:\7DaysToDie\logs\
    pattern: "*.log"
    source_type: game_server
```

### Web & Application
| Source | Method | Notes |
|--------|--------|-------|
| **Nginx** | Syslog or Agent | Access + error logs |
| **Apache** | Syslog or Agent | Access + error logs |
| **IIS** | Agent | W3C format |
| **Traefik** | Syslog | Access logs |
| **Caddy** | Syslog | JSON logs |
| **HAProxy** | Syslog | Connection logs |

### Databases
| Source | Method | Notes |
|--------|--------|-------|
| **MySQL** | Agent | Error + slow query logs |
| **PostgreSQL** | Syslog or Agent | Query logs |
| **MongoDB** | Agent | JSON logs (4.4+) |
| **Redis** | Agent | Server logs |
| **InfluxDB** | Agent | Server logs |

### Cloud Platforms
| Source | Method | Notes |
|--------|--------|-------|
| **Supabase** | HTTP Log Drain | Postgres, Auth, Edge Functions |
| **Vercel** | HTTP Log Drain | Serverless, Edge, Static |
| **Any HTTP** | POST /api/ingest/http | Generic JSON ingestion |

### Containers & Orchestration
| Source | Method | Notes |
|--------|--------|-------|
| **Docker** | Syslog driver | Container stdout/stderr |
| **Kubernetes** | Syslog sidecar | Pod logs |
| **Portainer** | Agent | Container events |

### Security & Monitoring
| Source | Method | Notes |
|--------|--------|-------|
| **Windows Security** | Agent | Event IDs 4624, 4625, etc. |
| **Windows System** | Agent | Service events, errors |
| **Linux auth.log** | Agent | SSH, sudo, PAM |
| **fail2ban** | Agent | Ban events |
| **CrowdSec** | Agent | Alert logs |

### OpenTelemetry (OTLP)
Any application instrumented with OpenTelemetry can send logs directly:
```bash
# OTLP endpoint
POST /api/ingest/otlp/v1/logs
```

---

## Competitor Comparison

### LogNog vs Splunk

| Aspect | LogNog | Splunk |
|--------|--------|--------|
| **Price** | Free (MIT) | $1,800+/year (500MB/day) |
| **Dev License** | Unlimited | 500MB/day, expires |
| **Cloud Required** | Never | Splunk Cloud default |
| **Setup Time** | 10 minutes | Hours to days |
| **Query Language** | Splunk-like DSL | SPL |
| **Self-Hosted** | Always | Enterprise only |
| **Alerting** | Built-in | Built-in |
| **Dashboards** | Built-in | Built-in |
| **Windows Agent** | Yes, GUI | Yes |
| **Source Code** | Open (MIT) | Proprietary |

**Splunk's Problem:** Great product, terrible pricing for anyone who isn't enterprise. The dev license is a joke - 500MB/day that expires? One busy game server generates that in an hour.

### LogNog vs ELK Stack (Elasticsearch + Logstash + Kibana)

| Aspect | LogNog | ELK Stack |
|--------|--------|-----------|
| **Components** | 1-3 | 3+ minimum |
| **Memory Usage** | ~500MB | 4GB+ (Java) |
| **Setup Complexity** | docker-compose up | Significant |
| **Query Language** | Splunk-like | Lucene/KQL |
| **Learning Curve** | Low (Splunk users) | Medium |
| **Windows Native** | Yes | Painful |
| **Single Binary** | Yes (Lite) | No |
| **Built-in Alerts** | Yes | Via Elastalert |

**ELK's Problem:** It's powerful but heavy. You need to learn Elasticsearch concepts, Logstash pipelines, Kibana queries. Three separate systems to configure, monitor, and maintain. Java means memory-hungry.

### LogNog vs Grafana Loki

| Aspect | LogNog | Grafana Loki |
|--------|--------|--------------|
| **Primary Focus** | Logs | Metrics (logs secondary) |
| **Query Language** | Splunk-like | LogQL |
| **Visualization** | Built-in | Requires Grafana |
| **Windows Agent** | Yes | No native |
| **Storage** | ClickHouse/SQLite | Object storage |
| **Complexity** | Low | Medium |
| **Index Everything** | Yes | Labels only |

**Loki's Problem:** Designed for the Prometheus ecosystem. Great if you're already in that world, awkward if you just want to search your logs. LogQL is yet another query language to learn.

### LogNog vs Graylog

| Aspect | LogNog | Graylog |
|--------|--------|---------|
| **License** | MIT | SSPL (restrictive) |
| **Backend** | ClickHouse/SQLite | Elasticsearch + MongoDB |
| **Query Language** | Splunk-like | Lucene |
| **Resource Usage** | Low | High |
| **Setup** | Simple | Complex |
| **Windows Native** | Yes | No |

**Graylog's Problem:** SSPL license is not truly open source. Requires Elasticsearch AND MongoDB. Heavy resource requirements.

### LogNog vs Google Chronicle (Security Operations)

| Aspect | LogNog | Google Chronicle |
|--------|--------|------------------|
| **Price** | Free (MIT) | Enterprise pricing (contact sales) |
| **Deployment** | Anywhere | Google Cloud only |
| **Query Language** | Splunk-like | YARA-L, UDM |
| **Data Sovereignty** | Your servers | Google's cloud |
| **Setup** | 10 minutes | Weeks (enterprise onboarding) |
| **Target User** | SMBs, homelabs, startups | Large enterprises |
| **Open Source** | Yes (MIT) | No |
| **Offline Access** | Always | Never |
| **Multi-Cloud** | Yes | GCP-centric |
| **Customization** | Full control | Limited |

**Chronicle's Problem:** Google's answer to Splunk, but with Google-sized requirements. You need to be on Google Cloud, go through enterprise sales, and learn yet another query language (YARA-L). Great if you're a Fortune 500 already on GCP. Overkill and inaccessible for everyone else. Also: your logs live on Google's infrastructure - not everyone wants that.

**Chronicle's Strengths:** Unlimited storage on Google infrastructure, VirusTotal integration for threat intelligence, automatic log normalization via UDM (Unified Data Model). If you're already enterprise GCP and need SIEM, it's solid.

**Why LogNog wins for most users:** You don't need to "contact sales." You don't need to be on Google Cloud. You don't need unlimited storage for petabytes. You need to search your logs. Today. For free.

### LogNog vs Papertrail/Loggly/Datadog

| Aspect | LogNog | Cloud Services |
|--------|--------|----------------|
| **Data Location** | Your servers | Their cloud |
| **Monthly Cost** | $0 | $50-500+/month |
| **Data Retention** | Unlimited | Plan-limited |
| **Privacy** | Complete | They see everything |
| **Vendor Lock-in** | None | Significant |
| **Offline Access** | Always | Never |

**Cloud Services Problem:** Your logs contain sensitive data. Server names, IP addresses, user activity, error messages. Do you really want that on someone else's servers? Plus, costs scale with usage.

---

## Testimonials (Community Voices)

> "Spent 3 hours trying to set up ELK for my homelab. Gave up. Got LogNog running in 10 minutes. Same search syntax I know from work."
> — **r/homelab user**

> "Finally something that doesn't require a computer science degree to configure. My pfSense logs actually make sense now."
> — **Discord homelab community**

> "I was paying $75/month for Papertrail. Now I run LogNog on a $5/month VPS and it handles 10x the volume."
> — **Indie developer**

> "The Splunk query syntax sold me. I don't want to learn LogQL or Lucene. I already know how to search my logs."
> — **Former Splunk admin**

> "My Minecraft server generates 50GB of logs a month. Splunk wanted $2000/year for that. LogNog? Free."
> — **Game server operator**

> "Windows native support without Docker. That's huge for us Windows admins who don't want WSL2 just for logging."
> — **Windows sysadmin**

> "The File Integrity Monitoring caught someone modifying our config files. Worth setting up just for that."
> — **Security-conscious homelab operator**

> "Real-time tail over SSE. No polling. No WebSocket complexity. Just works in the browser."
> — **Developer**

> "One docker-compose file. That's it. No Helm charts, no Kubernetes manifests, no ConfigMaps."
> — **DevOps engineer tired of complexity**

> "The dashboard auto-refresh actually works. Unlike my Grafana setup that somehow breaks every update."
> — **Monitoring enthusiast**

---

## Game Server Use Case

### Scenario: 7 Days to Die Server

**The Problem:**
You run a 7 Days to Die server for friends. Someone griefed a base. Someone else claims they didn't get loot. Your server crashed at 3am and you don't know why.

**The Solution:**
Point LogNog at your server logs:

```yaml
# LogNog In Agent config
watch_paths:
  - path: C:\7DaysToDie\logs\
    pattern: "*.log"
    source_type: 7dtd
```

**What You Can Do:**
```
# Who was online when the base was destroyed?
search source_type=7dtd message~"destroyed" OR message~"damage"
  | stats count by player

# Show all player activity in the last hour
search source_type=7dtd message~"joined" OR message~"left" OR message~"died"
  | table timestamp, message

# What happened before the crash?
search source_type=7dtd severity<=3
  | sort desc timestamp
  | limit 100

# Create an alert for crashes
Alert: search source_type=7dtd message~"exception" OR message~"crash"
Threshold: count > 0 in 5 minutes
Action: Email + Discord webhook
```

**Same Pattern Works For:**
- Minecraft (server.log)
- Valheim (console logs)
- ARK: Survival (ShooterGame logs)
- Rust (output_log.txt)
- Any game with text log files

---

## Landing Page Copy

### Hero Section
```
# Your Logs, Your Control

Self-hosted log management that doesn't require a finance department approval.

[Get Started - It's Free] [View on GitHub]
```

### Problem Section
```
## The Problem with Log Management

Splunk costs more than your entire homelab.
ELK requires a PhD in YAML.
Cloud services see everything.

You just want to search your logs.
```

### Solution Section
```
## LogNog: Logging for Humans

✓ Splunk-familiar query language
✓ One docker-compose command
✓ No cloud dependencies ever
✓ Dashboards, alerts, live tail included
✓ Actually runs on a Raspberry Pi
```

### Comparison Section
```
## How We Compare

| | LogNog | Splunk | ELK | Loki |
|---|---|---|---|---|
| Cost | Free | $$$$ | Free* | Free* |
| Setup | 10 min | Hours | Hours | 30+ min |
| Query Language | Splunk-like | SPL | Lucene | LogQL |
| Components | 1-3 | 1 | 3+ | 3+ |
| Windows Native | Yes | Yes | No | No |

*Requires significant infrastructure and expertise
```

### Social Proof Section
```
## Trusted by Homelabbers Worldwide

"Finally, a Splunk alternative that doesn't hate homelabs."

"One docker-compose file. That's it."

"My game server logs finally make sense."
```

### CTA Section
```
## Ready to Take Control?

Get started in 10 minutes. Free forever. MIT licensed.

[Download Now] [Read the Docs] [Join Discord]
```

---

## Feature Highlights for Different Audiences

### For Homelabbers
- **"Finally see what your network is doing"**
- Built-in templates for pfSense, Ubiquiti, Synology
- Real-time firewall log analysis
- File integrity monitoring for critical configs

### For Game Server Admins
- **"Know who did what, and when"**
- Player activity tracking
- Crash alerting
- Performance monitoring
- Chat and command logging

### For Developers
- **"Observability without the $$$"**
- OpenTelemetry support
- Supabase/Vercel log drains
- Structured JSON logging
- API for custom integrations

### For Small Teams
- **"Enterprise features, startup budget"**
- Role-based access control
- API key management
- Scheduled reports
- Email/webhook alerts

### For Security-Conscious
- **"Your logs never leave your network"**
- 100% self-hosted
- No telemetry
- No phone-home
- GeoIP without cloud APIs

---

## Quick Start (Marketing Version)

```bash
# That's it. Really.
docker-compose up -d

# Open http://localhost:3000
# Create your admin account
# Start searching logs
```

**Time to first search: Under 10 minutes.**

---

## Press Kit Stats

- **License:** MIT (truly open source)
- **First Release:** 2025
- **Storage Options:** ClickHouse (scale) or SQLite (simple)
- **Query Language:** Splunk-compatible DSL
- **Visualization Types:** 7 (Table, Bar, Pie, Line, Area, Heatmap, Gauge)
- **Built-in Templates:** 15+ source types
- **Windows Support:** Native, no Docker required
- **Minimum Requirements:** 512MB RAM, 1 CPU
- **Maximum Scale:** Millions of logs/day (ClickHouse mode)

---

## Call to Action Templates

### GitHub README
```markdown
**Star us on GitHub** if you believe log management shouldn't cost more than your hardware.
```

### Twitter/X
```
Tired of Splunk pricing? ELK complexity? Cloud logging costs?

LogNog: Self-hosted log management that doesn't suck.
- Splunk-like queries
- One docker-compose
- Actually free

github.com/taskmasterpeace/lognog
```

### Reddit r/homelab
```
[Project] LogNog - Open source Splunk alternative for homelabs

Frustrated with Splunk's pricing and ELK's complexity, I built LogNog.

- Splunk-familiar query language
- One docker-compose deployment
- Built-in dashboards and alerts
- Windows native support (no Docker required)
- Templates for pfSense, Ubiquiti, Synology, and more

Free and MIT licensed. Feedback welcome!
```

### Discord
```
🔔 **LogNog** - Your Logs, Your Control

Self-hosted Splunk alternative for homelabs.

✅ Splunk-like queries
✅ 10 minute setup
✅ No cloud required
✅ Free forever

Link: github.com/taskmasterpeace/lognog
```

---

## FAQ for Marketing

**Q: Is this really free?**
A: Yes. MIT license. No premium tier. No "contact sales."

**Q: What's the catch?**
A: You host it yourself. That's the trade-off for privacy and control.

**Q: Can it handle enterprise scale?**
A: With ClickHouse backend, yes. Millions of logs per day.

**Q: Do I need to know Splunk?**
A: Helpful but not required. If you can Google, you can use LogNog.

**Q: What about support?**
A: GitHub issues and community Discord. No paid support tier (yet).

**Q: Will you add [feature X]?**
A: Maybe! Open an issue or PR. We're actively developing.

---

*Last updated: 2025-01-13*
*By Machine King Labs*
