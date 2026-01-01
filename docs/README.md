# LogNog Documentation

> **Your Logs, Your Control** - The complete guide to mastering LogNog

Welcome to the LogNog documentation! Whether you're just getting started or looking to build advanced automation, you'll find everything you need here.

---

## Quick Navigation

### Getting Started

| Guide | Description | Time |
|-------|-------------|------|
| **[Quick Start](./QUICK_START.md)** | From zero to searching in 10 minutes | 10 min |
| **[DSL Reference](./DSL_REFERENCE.md)** | Master the query language | 30 min |

### Core Features

| Guide | Description |
|-------|-------------|
| **[Knowledge Management](./KNOWLEDGE_MANAGEMENT.md)** | Field extractions, event types, tags, lookups, workflows |
| **[Dashboards](./DASHBOARDS.md)** | Build powerful visualizations |
| **[Field Extraction](./FIELD_EXTRACTION.md)** | Parse any log format |

### Real-World Applications

| Guide | Description |
|-------|-------------|
| **[Use Cases & Recipes](./USE_CASES.md)** | Security, networking, apps, IoT, gaming |

---

## Learning Paths

### Path 1: I Just Want to Search Logs

1. [Quick Start](./QUICK_START.md) - Get LogNog running
2. [DSL Reference](./DSL_REFERENCE.md) - Learn to query
3. Done! You're searching.

### Path 2: I Want Powerful Analytics

1. [Quick Start](./QUICK_START.md) - Get LogNog running
2. [DSL Reference](./DSL_REFERENCE.md) - Learn to query
3. [Dashboards](./DASHBOARDS.md) - Build visualizations
4. [Field Extraction](./FIELD_EXTRACTION.md) - Parse custom logs

### Path 3: I Want Full Automation

1. Complete Path 2 first
2. [Knowledge Management](./KNOWLEDGE_MANAGEMENT.md) - Full tutorial
3. [Use Cases](./USE_CASES.md) - Copy real-world recipes
4. Build your own workflows!

---

## Documentation Overview

### [Quick Start Guide](./QUICK_START.md)

Get LogNog up and running in minutes:
- Docker Compose deployment
- Sending your first log
- Configuring log sources
- Basic searches
- Verification steps

### [DSL Reference](./DSL_REFERENCE.md)

Complete query language documentation:
- Search command syntax
- Filter and stats commands
- Aggregation functions
- Field reference
- Operators and patterns
- Performance optimization
- Query templates

### [Knowledge Management](./KNOWLEDGE_MANAGEMENT.md)

The brain behind your logs:
- **Field Extractions** - Parse structured data from raw text
- **Event Types** - Classify logs by their meaning
- **Tags** - Label specific field values
- **Lookups** - Enrich data from external sources
- **Workflow Actions** - Automate responses including Python scripts

### [Dashboards](./DASHBOARDS.md)

Visualization mastery:
- Panel types (gauge, bar, time series, pie, table, heatmap)
- Query optimization for dashboards
- Layout best practices
- Pre-built dashboard templates
- Advanced techniques

### [Field Extraction](./FIELD_EXTRACTION.md)

Deep dive into parsing:
- Grok pattern library
- Regex extraction
- JSON log parsing
- Stack trace parsing
- Testing and debugging

### [Use Cases & Recipes](./USE_CASES.md)

Real-world solutions:
- Security Operations (brute force, firewall, privilege monitoring)
- Network Monitoring (bandwidth, DNS, DHCP)
- Application Performance (web servers, Docker)
- Infrastructure Health (disk, services)
- Home Automation (IoT, smart home)
- Gaming & Media (Plex, game servers)
- Advanced Workflows (multi-stage response, enrichment)

---

## Feature Matrix

| Feature | Status | Documentation |
|---------|--------|---------------|
| Syslog Ingestion | ✅ Complete | Quick Start |
| DSL Query Language | ✅ Complete | DSL Reference |
| Saved Searches | ✅ Complete | DSL Reference |
| Dashboards | ✅ Complete | Dashboards |
| Dashboard Duplicate | ✅ Complete | Dashboards |
| Field Extractions | ✅ Complete | Knowledge Management |
| Event Types | ✅ Complete | Knowledge Management |
| Tags | ✅ Complete | Knowledge Management |
| Lookups | ✅ Complete | Knowledge Management |
| Workflow Actions | ✅ Complete | Knowledge Management |
| Python Scripts | ✅ Complete | Knowledge Management |
| Scheduled Reports | ✅ Complete | Reports Page |
| Alerts | ✅ Complete | Alert Actions |
| Alert Actions (Apprise) | ✅ Complete | [Alert Actions](./ALERT-ACTIONS.md) |
| AI Summaries (Ollama) | ✅ Complete | Alert Actions |
| User Auth (JWT) | ✅ Complete | Settings |
| API Keys | ✅ Complete | Settings |
| Field Discovery Sidebar | ✅ Complete | Search Page |
| Data Source Onboarding | ✅ Complete | Data Sources |
| Active Sources Dashboard | ✅ Complete | Data Sources |
| Custom Index Headers | ✅ Complete | Data Sources |
| Search-to-Action Buttons | ✅ Complete | Search Page |
| Mobile Responsive UI | ✅ Complete | All Pages |
| Next.js Integration | ✅ Complete | [Next.js Integration](./NEXTJS-INTEGRATION.md) |
| Vercel Log Drains | ✅ Complete | [Vercel Integration](./VERCEL-INTEGRATION.md) |
| Supabase Log Drains | ✅ Complete | [Supabase Integration](./SUPABASE-INTEGRATION.md) |
| MCP (Claude Desktop) | ✅ Complete | [MCP Integration](./MCP-INTEGRATION.md) |

---

## API Reference

All features are accessible via REST API:

| Endpoint | Purpose |
|----------|---------|
| `GET/POST /search/query` | Execute queries |
| `GET/POST /search/saved` | Saved searches |
| `GET/POST /dashboards` | Dashboard CRUD |
| `GET/POST /knowledge/*` | Knowledge objects |
| `GET/POST /reports` | Scheduled reports |
| `GET /stats/*` | Analytics data |
| `WS /ws/tail` | Live log streaming |

See individual guides for detailed API examples.

---

## Architecture

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Syslog    │───▶│   Vector    │───▶│ ClickHouse  │
│   Sources   │    │  (ingest)   │    │  (storage)  │
└─────────────┘    └─────────────┘    └─────────────┘
                                             │
┌─────────────┐    ┌─────────────┐           │
│   Browser   │───▶│    Nginx    │           │
│     (UI)    │    │   (proxy)   │           │
└─────────────┘    └─────────────┘           │
                          │                  │
                   ┌─────────────┐           │
                   │  Node.js    │◀──────────┘
                   │    API      │
                   └─────────────┘
                          │
                   ┌─────────────┐
                   │   SQLite    │
                   │ (metadata)  │
                   └─────────────┘
```

---

## Community

- **GitHub Issues**: Report bugs and request features
- **Contributing**: PRs welcome!
- **License**: Open source

---

## Glossary

| Term | Definition |
|------|------------|
| **DSL** | Domain Specific Language - LogNog's query language |
| **Field Extraction** | Pattern that parses fields from log messages |
| **Event Type** | Category applied to logs matching a search |
| **Tag** | Label attached to specific field values |
| **Lookup** | Table for enriching log data |
| **Workflow Action** | Automated action triggered from logs |
| **Index** | Collection of logs (by source type) |
| **Severity** | Syslog severity level (0=emergency, 7=debug) |

---

*Welcome to the LogNog community! Happy logging.*
