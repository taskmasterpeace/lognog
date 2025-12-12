# Implementation Checklist

Track progress on building Spunk (Home Splunk):

## Phase 1: Infrastructure (Week 1)
- [ ] docker-compose.yml with all services defined
- [ ] ClickHouse container with logs table schema
- [ ] Vector container with syslog source → ClickHouse sink
- [ ] Network configuration for inter-service communication
- [ ] Volume mounts for data persistence

## Phase 2: API Foundation (Week 2)
- [ ] Node.js + Express + TypeScript project setup
- [ ] ClickHouse client connection
- [ ] Basic query endpoint (raw SQL passthrough)
- [ ] Health check endpoint
- [ ] SQLite for metadata (saved searches, dashboards)

## Phase 3: DSL Parser (Week 3)
- [ ] Lexer (~300 lines) - tokenize DSL input
- [ ] Parser (~400 lines) - build AST with recursive descent
- [ ] Compiler (~300 lines) - AST → ClickHouse SQL
- [ ] Query endpoint using DSL
- [ ] Error handling with line/column info

## Phase 4: React UI (Week 4)
- [ ] Vite + React + TypeScript project setup
- [ ] Log explorer page (search, filter, time range)
- [ ] Live tail view
- [ ] Dashboard builder
- [ ] Starter dashboards (System, Network, Security)

## Phase 5: Polish
- [ ] Nginx reverse proxy
- [ ] Authentication (basic auth or JWT)
- [ ] Report scheduling (cron + Nodemailer)
- [ ] Documentation

Review each phase and mark items complete as they are built.
