# LogNog - Project Intake Form

**Purpose**: Capture essential project information for institutional memory, cross-team coordination, and strategic decision-making.

**Last Updated**: 2026-02-07

---

## PROJECT BASICS

### Project Name

```
LogNog
```

### One-Line Description

```
Self-hosted log management platform with Splunk-like DSL query language for homelabs, small teams, and developers who need enterprise-grade log analysis without enterprise pricing.
```

### Project Owner

```
Machine King Labs | https://github.com/machinekinglabs | Open Source Maintainers
```

### Current Status

- [x] Active (Currently in development/iteration)
- [ ] Paused (Temporarily halted but may resume)
- [ ] Planned (Scheduled to begin)
- [ ] Maintenance (Live but receiving only bug fixes)
- [ ] Archived (No longer active)

---

## TECHNICAL FOUNDATION

### Tech Stack

```
Language(s): TypeScript (API + UI), Python (Agent)
Framework(s): Express 4.18, React 18.2, Vite 5.0
Database(s): ClickHouse 24.1 (Full), SQLite/better-sqlite3 (Lite)
Infrastructure: Docker Compose, Nginx, Vector (log shipping)
Key Libraries:
  - Charts: ECharts 6.0, echarts-wordcloud
  - AI/ML: LlamaIndex 0.12, Ollama, OpenRouter
  - Auth: JWT, bcrypt
  - Grid: react-grid-layout
  - Notifications: Apprise (113+ services)
  - MCP: @modelcontextprotocol/sdk 1.0
```

### Repository Information

```
Repo URL: https://github.com/machinekinglabs/lognog
Branch Strategy: Trunk-based (main)
Primary Branch: main
Deployment Method: Docker Compose (Full) / Windows EXE (Lite)
```

### Architecture Overview

```
Three-tier architecture with Node.js/Express API backend, React SPA frontend, and
ClickHouse or SQLite database. Vector handles syslog ingestion (UDP/TCP 514),
API exposes 34 REST endpoints for search, dashboards, alerts, and AI features.
Nginx reverse proxy serves UI and routes API requests. Optional Ollama container
provides local LLM capabilities for natural language queries and anomaly analysis.
```

---

## BUSINESS MODEL

### Revenue Model

```
Revenue Type: Open Source (MIT License) / Potential Enterprise Add-ons
Pricing Model: Free / Self-hosted
Current Status: No revenue - Open source project
```

### Pricing Structure

```
Community Edition: All features included | Free forever
Enterprise (Future): Managed cloud, priority support, SSO | TBD

Free Trial: N/A (fully open source)
Annual Discount: N/A
```

### Financial Targets

```
Monthly Revenue Target: N/A (open source)
Current MRR: $0
Customer Acquisition Cost (CAC): $0
Customer Lifetime Value (LTV): N/A
Target Break-Even: N/A - community project
```

### Costs

```
Infrastructure Costs: $0/month (self-hosted by users)
Third-Party API Costs: $0/month (optional OpenRouter for cloud AI)
Developer Time: Volunteer/community contributions
Other Costs: Domain, GitHub hosting (minimal)
Total Monthly Burn: ~$0 (community-driven)
```

---

## MARKET & AUDIENCE

### Target Audience

```
Primary User: Homelab enthusiasts, DevOps engineers, small development teams
  - Demographics: Technical professionals, 25-55, self-hosting community
  - Use Case: Centralized log management without Splunk/Datadog costs
  - Size: Millions of self-hosting enthusiasts globally

Secondary Audiences:
  - Security researchers needing log analysis
  - Compliance teams at small companies
  - Indie developers monitoring side projects
```

### Competitive Landscape

```
Direct Competitors: Splunk, Datadog, Elastic/Kibana, Graylog, Loki, Seq
Competitive Advantage: Splunk-like DSL, zero cost, AI-powered, simple deployment
Market Position: Challenger/Niche (self-hosted alternative)
Differentiation:
  - Familiar Splunk-style query language
  - Built-in AI features (NLQ, anomaly detection, UEBA)
  - No telemetry, fully local
  - Windows Lite edition for single machines
  - MCP integration for Claude Desktop
```

### Go-To-Market Strategy

```
Acquisition Channel(s):
  - GitHub: Organic discovery, stars, community
  - Reddit/HN: r/selfhosted, r/homelab, Hacker News
  - YouTube: Homelab creator partnerships

Marketing Channels: Organic (GitHub, Reddit, Discord communities)
Launch Strategy: Open source community-first growth
```

---

## TEAM & RESOURCES

### Core Team

```
Role: [Name] | [Hours/week] | [Rate/Status] | [Focus Areas]
---
Lead Developer: Machine King Labs | Variable | Open Source | Full stack
Community: Contributors | Variable | Volunteer | PRs, issues, docs
```

### Skills & Expertise Map

```
Frontend Development: TypeScript, React, Tailwind, ECharts
Backend Development: Node.js, Express, TypeScript
DevOps/Infrastructure: Docker, ClickHouse, Vector, Nginx
Product Management: Community-driven roadmap
Design/UX: Tailwind-based, dark/light themes
Marketing: Community engagement, GitHub presence
Sales: N/A (open source)
```

### Resource Constraints

```
Available Budget: Community-funded/volunteer
Available Developer Hours: Variable (community contributions)
Blocked By: Contributor availability, feature prioritization
```

---

## PROJECT GOALS & METRICS

### Strategic Goals

```
Goal 1: Achieve 1,000+ GitHub stars (community validation)
Goal 2: 100+ active deployments in the wild
Goal 3: Build thriving contributor community (10+ regular contributors)
```

### Key Metrics

```
Metric: [Description] | Current: [__] | Target: [__] | Timeline: [___]
---
GitHub Stars: Community interest | Current: TBD | Target: 1000 | By: Q4 2026
Docker Pulls: Deployment adoption | Current: TBD | Target: 5000 | By: Q4 2026
Test Coverage: Code quality | Current: 224 tests | Target: 300+ | By: Q3 2026
Contributors: Community health | Current: TBD | Target: 15 | By: Q4 2026
```

### Success Criteria

```
- Active community with regular contributions
- Used in production by 100+ organizations/individuals
- Featured in self-hosted/homelab communities
- Stable v1.0 release with comprehensive documentation
```

---

## DEPENDENCIES & INTEGRATION

### Dependencies on Other Projects

```
ClickHouse: Log storage (Full deployment) | Critical | Fallback: SQLite (Lite mode)
Vector: Syslog ingestion | High | Fallback: Direct HTTP ingest
Ollama: Local AI features | Medium | Fallback: OpenRouter cloud AI
Apprise: Notifications | Low | Fallback: Direct email/webhook
```

### External Integrations

```
Service: [Description] | [Cost] | [Criticality] | [Fallback]
---
ClickHouse: Columnar database | Free/OSS | Critical | SQLite
Vector: Log shipping | Free/OSS | High | HTTP ingest
Ollama: Local LLM | Free/OSS | Medium | OpenRouter ($)
OpenRouter: Cloud AI | Usage-based | Low | Ollama local
Apprise: Notifications | Free/OSS | Low | Direct webhooks
MaxMind GeoIP: IP enrichment | Free tier | Low | None
```

### Projects Depending on This

```
LogNog In Agent: Ships logs to LogNog server | High | Agent can buffer locally
Custom Dashboards: Projects embedding LogNog panels | Medium | Export/import JSON
```

---

## BLOCKERS & CHALLENGES

### Current Blockers

```
Blocker 1: Community growth | Impact: Medium | Resolution: Marketing, content creation
Blocker 2: Documentation completeness | Impact: Medium | Resolution: In progress (40+ docs)
Blocker 3: Windows Lite testing | Impact: Low | Resolution: Broader beta testing
```

### Technical Debt

```
Issue 1: Test coverage expansion | Impact: Medium | Fix Priority: Soon
Issue 2: Error handling standardization | Impact: Low | Fix Priority: Later
Issue 3: API response time monitoring | Impact: Low | Fix Priority: Nice-to-have
```

### Risks

```
Risk 1: ClickHouse breaking changes | Likelihood: Low | Mitigation: Pin versions, test upgrades
Risk 2: LlamaIndex API changes | Likelihood: Medium | Mitigation: Abstract AI layer
Risk 3: Low adoption | Likelihood: Medium | Mitigation: Community engagement, content
```

---

## RECENT DECISIONS

### Major Decisions Made

```
Decision 1: SQLite for Lite edition | 2025 | Enable single-binary Windows deployment | Team
Decision 2: MCP integration | 2025 | Enable Claude Desktop access to logs | Team
Decision 3: UEBA/Anomaly detection | 2025 | Differentiate from basic log tools | Team
Decision 4: Apprise for notifications | 2025 | Support 113+ notification services | Team
```

### Pivot Points

```
Initial focus was Docker-only; pivoted to include Windows Lite edition for broader
accessibility. Added AI features (NLQ, UEBA) to differentiate from simpler alternatives.
```

### Upcoming Key Decisions

```
Decision: Enterprise features scope | Timeline: Q2 2026 | Owner: Community input
Decision: Cloud-hosted option | Timeline: Q3 2026 | Owner: Team
Decision: Mobile app/responsive UI | Timeline: Q4 2026 | Owner: Team
```

---

## DOCUMENTATION & RESOURCES

### Key Documentation

```
README: /docs/README.md
Technical Architecture: /CLAUDE.md, /docs/ARCHITECTURE.md
Product Requirements: Community-driven (GitHub Issues)
Design System: Tailwind CSS + dark/light themes
API Documentation: /docs/API-REFERENCE.md (in codebase)
User Guide: /docs/ (40+ markdown files)
Setup Guide: /docs/DEPLOYMENT-GUIDE.md
```

### Live Resources

```
Production URL: Self-hosted (user-deployed)
Staging URL: Local Docker Compose
Admin Dashboard: http://localhost/settings (self-hosted)
Analytics Dashboard: Built-in /stats page
```

### Communication Channels

```
Primary Channel: GitHub Issues & Discussions
Secondary Channel: Community Discord (if established)
Email List: N/A
Meeting Cadence: Async (open source community)
```

---

## ROADMAP & TIMELINE

### Near-Term (Next 30 Days)

```
- [Feature]: Complete projects/panel copying system | Owner: Active | Status: In Progress
- [Feature]: HYH dashboard templates | Owner: Active | Status: In Progress
- [Bug Fix]: GaugeChart improvements | Owner: Active | Status: In Progress
- [Docs]: Update DASHBOARDS.md | Owner: Active | Status: In Progress
```

### Medium-Term (30-90 Days)

```
- [Feature]: Enhanced CIM field mappings | Owner: TBD | Status: Planned
- [Feature]: Additional alert templates | Owner: TBD | Status: Planned
- [Feature]: Performance optimization | Owner: TBD | Status: Planned
- [Docs]: Video tutorials | Owner: TBD | Status: Planned
```

### Long-Term (90+ Days)

```
- [Feature]: Role-based dashboard sharing
- [Feature]: Multi-tenant support
- [Feature]: Log archival to S3/object storage
- [Feature]: Mobile-responsive UI improvements
- [Milestone]: v2.0 release
```

---

## ADDITIONAL NOTES

### Open Questions

```
- Community feedback on enterprise feature priorities | Owner: Team | Deadline: Ongoing
- Best practices for ClickHouse scaling documentation | Owner: Team | Deadline: Q2 2026
```

### Lessons Learned

```
- Learning 1: SQLite Lite edition opened access to Windows-only users significantly
- Learning 2: AI features (NLQ, UEBA) are major differentiators worth investment
- Learning 3: Splunk-like DSL familiarity reduces onboarding friction substantially
```

### Last Updated

```
Date: 2026-02-07
Updated By: Claude Code (automated intake)
Next Review: 2026-03-07
```

---

## OFFICER BRIEFING CHECKLIST

Use this checklist to confirm all officers have essential context:

- [x] **Tyrion (Strategic Coordinator)** : Understands goals (community growth, 1000 stars), timeline (active development), key decisions (Lite edition, AI features), dependencies (ClickHouse, Vector, Ollama)
- [x] **Petyr (Master of Coin)** : Knows revenue model (open source/free), costs ($0 infrastructure - user self-hosted), financial targets (N/A - community project), budget constraints (volunteer-driven)
- [x] **Wack (Competitive Intelligence)** : Familiar with competitive landscape (Splunk, Datadog, Elastic, Graylog, Loki), market positioning (self-hosted alternative), go-to-market (GitHub, Reddit, homelab community)
- [x] **Data (Technical Intelligence)** : Has tech stack (TS/Express/React/ClickHouse), architecture overview (3-tier + Docker), API documentation (34 endpoints, MCP integration)
- [x] **Phoenix (Content Strategy)** : Knows target audience (homelab, DevOps, small teams), messaging (enterprise features, zero cost), marketing channels (organic/GitHub), content needs (docs, video tutorials)
- [x] **Bran (Memory Keeper)** : Has complete intake form for institutional memory and historical context

---

## QUICK REFERENCE

### Key Commands
```bash
# API Development
cd api && npm run dev          # Dev server (port 4001)
cd api && npm run test         # Run tests (224 tests)

# UI Development
cd ui && npm run dev           # Vite dev (port 3000)

# Docker Full Stack
docker-compose up -d           # Start all services
docker-compose --profile ai up -d  # Include Ollama AI

# Agent
cd agent && pytest             # Run agent tests (68 tests)
```

### DSL Query Examples
```
search severity<=3 | stats count by hostname | sort desc count | limit 10
search app_name="nginx" | timechart count by status_code
search message~"error" | rex "user=(?<username>\w+)" | stats dc(username)
```

### Key Endpoints
- `POST /api/search` - Execute DSL query
- `POST /api/ingest/http` - HTTP log ingestion
- `GET /api/dashboards` - List dashboards
- `POST /api/alerts` - Create alert
- `GET /mcp/sse` - Claude Desktop MCP integration

### Key Files
- `/api/src/dsl/parser.ts` - Query language parser
- `/api/src/routes/` - 34 API endpoints
- `/ui/src/pages/` - 23 UI pages
- `/clickhouse/init/01-schema.sql` - Database schema
- `/docker-compose.yml` - Full stack definition
