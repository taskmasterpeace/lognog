# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Run Commands

```bash
# Start all services
docker-compose up -d

# Build and start (force rebuild)
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop all services
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

### API Development

```bash
cd api
npm install
npm run dev          # Development with hot reload
npm run build        # Build TypeScript
npm run test         # Run tests
npm run test:run     # Run tests once
```

### UI Development

```bash
cd ui
npm install
npm run dev          # Vite dev server on port 3000
npm run build        # Production build
```

### Testing the DSL Parser

```bash
cd api
npm run test -- src/dsl/   # Run only DSL tests
```

### Send Test Syslog Message

```bash
echo "<14>Test message from LogNog" | nc -u localhost 514
```

## Project Overview

**LogNog** - Your Logs, Your Control - is a self-hosted, fully-local Splunk alternative for homelab log management. The project runs entirely through Docker Compose with zero cloud dependencies.

## Architecture

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Syslog    │───▶│   Vector    │───▶│ ClickHouse  │
│   Clients   │    │  (ingest)   │    │  (storage)  │
└─────────────┘    └─────────────┘    └─────────────┘
                                             │
                   ┌─────────────┐           │
                   │  React UI   │◀──┐       │
                   │   (Vite)    │   │       ▼
                   └─────────────┘   │  ┌─────────────┐
                                     └──│  Node.js    │
                   ┌─────────────┐      │    API      │
                   │   Nginx     │      └─────────────┘
                   │  (proxy)    │           │
                   └─────────────┘      ┌────┴────┐
                                        │ SQLite  │
                                        │(metadata)│
                                        └─────────┘
```

## Technology Stack

| Layer | Technology |
|-------|------------|
| Ingestion | Vector (syslog-ng alternative) |
| Storage | ClickHouse (columnar, log-optimized) |
| Query | Custom DSL compiler → ClickHouse SQL |
| API | Node.js + Express + TypeScript |
| UI | React + TypeScript + Vite |
| Auth | JWT + bcrypt + API Keys |
| Scheduling | Node cron + Nodemailer |
| Orchestration | Docker Compose (single file) |
| Metadata | SQLite (embedded) |

## Query DSL (Surfing Language)

The project uses a custom Splunk-like DSL that compiles to ClickHouse SQL:

```
search host=router severity>=warning
  | filter app~"firewall"
  | stats count by source_ip
  | sort desc | limit 10
```

The DSL parser uses hand-written recursive descent (not ANTLR4/Chevrotain) for simplicity and zero dependencies.

## Authentication

LogNog includes a complete authentication system:
- JWT-based authentication with refresh tokens
- API keys for agents (LogNog In) and integrations
- Role-based access control (admin, user, readonly)
- Rate limiting
- Audit logging

First run requires creating an admin account via the setup page.

## Key Design Decisions

- **100% local**: No cloud dependencies, everything in Docker
- **Single docker-compose.yml**: One file deployment
- **Custom DSL compiler**: ~1000 lines TypeScript, <3ms parse overhead
- **ClickHouse optimizations**: `ORDER BY (timestamp, hostname, app_name)`, monthly partitions, TTL auto-cleanup
- **Async inserts**: 10K event batching with 5-second flush for low-latency ingest

## Performance Targets

- Deploy in <10 minutes (`docker-compose up`)
- Handle 1K-10K logs/sec (typical homelab)
- Search latency <1 second
- Retention: configurable 7-365 days per index

## Project Structure

```
lognog/
├── docker-compose.yml      # Main orchestration file
├── api/                    # Node.js backend
│   └── src/
│       ├── auth/          # Authentication (JWT, API keys)
│       ├── dsl/           # DSL lexer, parser, compiler
│       ├── db/            # ClickHouse + SQLite clients
│       ├── routes/        # Express routes
│       └── index.ts       # Entry point
├── ui/                    # React frontend
│   └── src/
│       ├── api/           # API client
│       ├── contexts/      # Auth context, Theme context
│       ├── pages/         # Page components
│       └── App.tsx        # Main app
├── clickhouse/            # ClickHouse config
│   └── init/             # Schema initialization
├── vector/               # Vector config
│   └── vector.toml       # Syslog ingestion config
├── agent/                # LogNog In agent (Python)
│   └── assets/           # Agent assets (icons)
└── nginx/                # Nginx reverse proxy
    └── nginx.conf
```

## DSL Commands Reference

| Command | Description | Example |
|---------|-------------|---------|
| `search` | Filter logs | `search host=router severity>=warning` |
| `filter` | Additional filtering | `filter app~"firewall"` |
| `stats` | Aggregation | `stats count sum(bytes) by hostname` |
| `sort` | Order results | `sort desc timestamp` |
| `limit` | Limit results | `limit 100` |
| `dedup` | Deduplicate | `dedup hostname app_name` |
| `table` | Select fields | `table timestamp hostname message` |
| `rename` | Rename fields | `rename hostname as host` |

## Available Slash Commands

- `/status` - Check project build status
- `/architecture` - Review architecture compliance
- `/build` - Build and test all containers
- `/checklist` - View implementation progress
- `/component <name>` - Work on specific component (clickhouse, vector, api, parser, ui, docker)
