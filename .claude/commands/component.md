# Work on Component

Focus on a specific Spunk component. Specify which one: $ARGUMENTS

## Available Components

### 1. `clickhouse` - ClickHouse Database
- Schema design (logs table)
- TTL configuration
- Partitioning strategy
- Query optimization

### 2. `vector` - Log Ingestion
- Syslog source (RFC3164/RFC5424)
- ClickHouse sink configuration
- Transforms and parsing
- Docker logging integration

### 3. `api` - Node.js Backend
- Express server setup
- ClickHouse client
- DSL parser/compiler
- SQLite metadata store
- REST endpoints

### 4. `parser` - DSL Query Parser
- Lexer implementation
- Recursive descent parser
- AST definition
- SQL compiler
- Test cases

### 5. `ui` - React Frontend
- Vite project setup
- Log explorer component
- Dashboard components
- Query builder
- Time picker

### 6. `docker` - Docker Compose
- Service definitions
- Network configuration
- Volume mounts
- Environment variables

Based on the argument provided, focus exclusively on that component and implement/fix/test it.
