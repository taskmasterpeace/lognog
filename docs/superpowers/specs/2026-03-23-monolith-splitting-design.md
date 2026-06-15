# Monolith Splitting Design

Split 4 large monolithic files into focused modules. Test with unit tests and Playwright browser tests after each phase.

## Order of Operations

1. ai.ts (3,444 lines) → 10 route modules + shared utilities
2. SettingsPage.tsx (2,648 lines) → 8 tab components + hooks
3. DocsPage.tsx (3,670 lines) → 15 section components
4. sqlite.ts (6,229 lines) → ~10 domain modules

---

## Phase 1: Split ai.ts (3,444 lines → ~10 files)

**Current**: Single route file handling DSL generation, interviews, RAG, LlamaIndex, NogChat, agents, error diagnosis, and dashboard insights.

**Strategy**: Extract a shared utilities module, then split each route domain into its own file. The main `ai.ts` becomes a thin router that mounts sub-routers.

### New file structure

```
api/src/routes/
├── ai.ts                    (~50 lines - thin router mounting sub-routers)
├── ai/
│   ├── shared.ts            (~250 lines - generateText, generateEmbedding, extractJSON, etc.)
│   ├── dsl-generation.ts    (~70 lines - POST /generate-query)
│   ├── insights.ts          (~220 lines - POST /insights, GET /status)
│   ├── interview.ts         (~900 lines - 9 routes + helpers + questionnaire constant)
│   ├── rag.ts               (~280 lines - 9 CRUD routes for simple RAG)
│   ├── llamaindex.ts        (~820 lines - 7 routes + seed docs)
│   ├── assistant.ts         (~250 lines - POST /assistant/chat + system prompt)
│   ├── nogchat.ts           (~220 lines - POST /nogchat + system prompt)
│   ├── agents.ts            (~180 lines - 8 agent framework routes)
│   └── error-diagnosis.ts   (~200 lines - POST /diagnose-error)
```

### Shared module (`ai/shared.ts`)

Exports used by multiple route files:
- `getOllamaUrl()`, `getOllamaModel()`, `getOllamaReasoningModel()`, `getOllamaEmbedModel()`
- `getOpenRouterApiKey()`, `getOpenRouterModel()`
- `isOllamaAvailable()`, `isAnyAIAvailable()`
- `generateWithOllama()`, `generateWithOpenRouter()`, `generateText()`
- `generateEmbedding()`, `extractJSON()`, `cosineSimilarity()`, `findSimilarDocuments()`, `chunkText()`
- `logEvent()`, `logAIRequest()`, `shipToLogNog()` (deduplicated — currently defined twice)

### Router composition (`ai.ts`)

```typescript
import dslGeneration from './ai/dsl-generation.js';
import insights from './ai/insights.js';
import interview from './ai/interview.js';
// ... etc
const router = Router();
router.use('/', dslGeneration);
router.use('/', insights);
router.use('/', interview);
// ... etc
export default router;
```

### Known fix: `shipToLogNog()` is duplicated at lines 871 and 1398. Deduplicate into shared.ts.

### Testing
- Run `npx vitest run src/routes/ai.test.ts src/routes/nogchat.test.ts` — must pass
- Playwright: verify Search page AI assist, dashboard AI insights, and settings AI tab all work

---

## Phase 2: Split SettingsPage.tsx (2,648 lines → ~18 files)

**Current**: Single page component with 8 tabs, 38+ useState calls, 15+ async handlers.

**Strategy**: Extract each tab into its own component file. Extract state+handlers into custom hooks. Main SettingsPage becomes a thin tab router.

### New file structure

```
ui/src/pages/settings/
├── SettingsPage.tsx          (~100 lines - tab navigation + renders active tab)
├── tabs/
│   ├── PreferencesTab.tsx    (~300 lines)
│   ├── AccountTab.tsx        (~400 lines)
│   ├── NotificationsTab.tsx  (~10 lines - wraps NotificationChannelsSection)
│   ├── DataTab.tsx           (~550 lines)
│   ├── GeoIPTab.tsx          (~200 lines)
│   ├── UsersTab.tsx          (~300 lines)
│   ├── SystemTab.tsx         (~250 lines)
│   └── AiTab.tsx             (~250 lines)
```

### Key decisions
- Each tab component owns its own state (useState calls move into the tab)
- Shared dependencies: `authFetch` from AuthContext, `useAuth` hook — passed via context, not props
- Tab components are lazy-importable but start with direct imports for simplicity
- Original `ui/src/pages/SettingsPage.tsx` becomes a re-export from `settings/SettingsPage.tsx` to avoid changing App.tsx routes

### Testing
- `npx tsc --noEmit` in ui/ — must compile clean
- Playwright: navigate to Settings, click each tab, verify no crashes, verify preferences save works

---

## Phase 3: Split DocsPage.tsx (3,670 lines → ~17 files)

**Current**: 15 section components + 3 utility components, all in one file. Pure JSX, no API calls, no shared state between sections.

**Strategy**: Extract each section into its own file. Keep CodeBlock and nav components as shared utilities.

### New file structure

```
ui/src/pages/docs/
├── DocsPage.tsx              (~80 lines - section routing + nav)
├── components/
│   ├── CodeBlock.tsx         (~30 lines)
│   ├── SectionNav.tsx        (~35 lines)
│   └── QuerySubNav.tsx       (~35 lines)
├── sections/
│   ├── GettingStartedSection.tsx     (~80 lines)
│   ├── QueryLanguageSection.tsx      (~30 lines - container with subsection routing)
│   ├── MCPSection.tsx                (~250 lines)
│   ├── SyslogFormatSection.tsx       (~475 lines)
│   ├── APIReferenceSection.tsx       (~330 lines)
│   ├── LogIngestionSection.tsx       (~510 lines)
│   ├── DashboardsSection.tsx         (~540 lines)
│   └── KnowledgeSection.tsx          (~200 lines)
├── query-sections/
│   ├── QueryLanguageIntro.tsx        (~100 lines)
│   ├── BasicSearching.tsx            (~95 lines)
│   ├── FilteringTransforming.tsx     (~85 lines)
│   ├── AggregationsStats.tsx         (~120 lines)
│   ├── EvalFunctions.tsx             (~110 lines)
│   ├── AdvancedCommands.tsx          (~90 lines)
│   └── UseCaseExamples.tsx           (~115 lines)
```

### Key decisions
- Type definitions (`DocSection`, `QuerySubsection`) exported from DocsPage.tsx
- `CodeBlock` receives `code` and `language` props — no changes needed
- Original `ui/src/pages/DocsPage.tsx` becomes a re-export to avoid changing App.tsx

### Testing
- `npx tsc --noEmit` — must compile
- Playwright: navigate to /docs, click each section nav item, verify content renders

---

## Phase 4: Split sqlite.ts (6,229 lines → ~12 files)

**Current**: 24 business domains, 200+ exported functions, all in one file.

**Strategy**: Extract domain-grouped modules. Keep schema initialization and the database singleton in the main file. Each domain module imports `getSQLiteDB()` from main.

### New file structure

```
api/src/db/
├── sqlite.ts                 (~1000 lines - schema init, migrations, getSQLiteDB singleton)
├── sqlite-saved-searches.ts  (~350 lines)
├── sqlite-dashboards.ts      (~500 lines - dashboards + panels + pages + variables + annotations + templates)
├── sqlite-alerts.ts          (~400 lines - alerts + history + silences)
├── sqlite-notifications.ts   (~200 lines - agent + login notifications)
├── sqlite-assets.ts          (~350 lines - assets + identities + links)
├── sqlite-cim.ts             (~370 lines - CIM models + field mappings)
├── sqlite-synthetic.ts       (~420 lines - synthetic tests + results)
├── sqlite-source-config.ts   (~400 lines - source configs + extractions + transforms + routing)
├── sqlite-rag.ts             (~210 lines - RAG documents + FTS)
├── sqlite-enrichment.ts      (~300 lines - tags + lookups + workflow actions + source annotations)
├── sqlite-settings.ts        (~250 lines - user prefs + field prefs + notification channels + system settings)
├── sqlite-interview.ts       (~130 lines - interview sessions)
├── sqlite-agents.ts          (~130 lines - AI agent conversations)
```

### Key decisions
- `getSQLiteDB()` stays in `sqlite.ts` and is imported by all domain modules
- `initializeSchema()` stays in `sqlite.ts` — it creates ALL tables
- Each domain module exports the same function names (no API changes for consumers)
- `sqlite.ts` re-exports everything from domain modules so existing imports (`from '../db/sqlite.js'`) still work
- Types/interfaces move with their domain functions
- Helper functions (`rowToAsset`, `rowToIdentity`, etc.) move with their domain

### Re-export pattern in sqlite.ts
```typescript
// After schema init and getSQLiteDB...
export * from './sqlite-saved-searches.js';
export * from './sqlite-dashboards.js';
export * from './sqlite-alerts.js';
// ... etc
```

### Testing
- `npx vitest run` — all existing tests must pass (they import from sqlite.ts which re-exports)
- `npx vitest run src/routes/dashboards.test.ts` — dashboard-specific tests
- Playwright: full app smoke test (login, search, dashboards, alerts, settings)

---

## Browser Test Plan (Playwright)

After each phase, run this comprehensive browser test:

1. **Login** — authenticate as admin
2. **Search** — load search page, verify TimePicker and query input
3. **Dashboards** — list dashboards, open HYH dashboard, verify charts render with no parse errors
4. **Alerts** — load alerts page
5. **Settings** — click through all 8 tabs (preferences, account, notifications, data, geoip, users, system, ai)
6. **Docs** — click through all 8 doc sections
7. **Reports** — load page
8. **Saved Searches** — load page
9. **Analytics** — load page

---

## Success Criteria

- All unit tests pass (145 DSL + service tests)
- TypeScript compiles with zero errors (both api/ and ui/)
- Playwright browser test passes all 11+ checks
- No new files over 1,000 lines (except sqlite.ts schema init which is inherently large)
- All existing imports continue to work (re-export pattern)
- No functional changes — pure structural refactor
