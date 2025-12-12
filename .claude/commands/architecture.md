# Architecture Review

Review the Spunk architecture to ensure we're following the design:

## Target Architecture
```
Syslog Clients → Vector (UDP/TCP 514) → ClickHouse (port 8123/9000)
                                              ↓
React UI (port 3000) ← Nginx (port 80) ← Node.js API (port 4000)
                                              ↓
                                         SQLite (metadata)
```

## Checklist
1. Verify docker-compose.yml matches this architecture
2. Ensure all services can communicate (check networks)
3. Verify ports are correctly mapped
4. Check that Vector is configured to send to ClickHouse
5. Check that API can query ClickHouse
6. Check that UI can reach API through Nginx

## Tech Stack Compliance
- Ingestion: Vector (NOT syslog-ng)
- Storage: ClickHouse (columnar)
- API: Node.js + Express + TypeScript
- UI: React + TypeScript + Vite
- Metadata: SQLite (embedded in API container)

Report any deviations from the planned architecture.
