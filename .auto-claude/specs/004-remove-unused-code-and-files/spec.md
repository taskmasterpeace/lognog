# Specification: Remove Unused Code and Files

## Overview

This task involves systematically identifying and removing unused code, orphaned files, dead code paths, and unnecessary dependencies across the entire monorepo. The codebase includes 5 services (agent, api, log-generator, test-data-generator, ui) and the goal is to reduce technical debt, improve maintainability, and decrease build times by eliminating code that serves no purpose. Since no specific targets were pre-identified, this task requires a discovery-first approach to safely identify cleanup candidates before removal.

## Workflow Type

**Type**: refactor

**Rationale**: This is a code cleanup and technical debt reduction task. It involves modifying existing code by removing unused portions without adding new functionality. The "refactor" workflow is appropriate because:
- No new features are being added
- Existing functionality must be preserved
- Changes span multiple services and files
- Requires careful verification before deletions

## Task Scope

### Services Involved
- **api** (primary) - TypeScript Express backend, largest service with most potential cleanup
- **ui** (primary) - React frontend, likely has unused components/utilities
- **agent** (secondary) - Python service, check for unused modules
- **log-generator** (secondary) - JavaScript utility, minimal scope
- **test-data-generator** (secondary) - TypeScript utility, minimal scope

### This Task Will:
- [ ] Identify and remove unused TypeScript/JavaScript files
- [ ] Remove unused Python modules in agent service
- [ ] Clean up unused React components and hooks in UI
- [ ] Remove dead code (unreachable functions, commented code blocks)
- [ ] Identify and remove unused npm/pip dependencies
- [ ] Clean up orphaned test files without corresponding source
- [ ] Remove unused configuration files
- [ ] Clean up any temporary or generated files that shouldn't be committed

### Out of Scope:
- Refactoring working code to improve quality
- Adding new features or functionality
- Modifying build configurations (unless clearly unused)
- Removing files that appear unused but serve documentation purposes
- Changing API contracts or routes

## Service Context

### API Service

**Tech Stack:**
- Language: TypeScript
- Framework: Express
- Key directories: `src/`, `src/routes/`

**Entry Point:** `api/src/index.ts`

**How to Run:**
```bash
cd api && npm run dev
```

**Port:** 4000

**Dependencies to Review:**
- @clickhouse/client, @llamaindex/ollama, @modelcontextprotocol/sdk
- bcrypt, better-sqlite3, cors, express, express-ws
- jsonwebtoken, llamaindex, maxmind, nodemailer
- stacktrace-parser, uuid, zod

### UI Service

**Tech Stack:**
- Language: TypeScript
- Framework: React with Vite
- Styling: Tailwind CSS
- Key directories: `src/`, `src/components/`

**Entry Point:** `ui/src/App.tsx`

**How to Run:**
```bash
cd ui && npm run dev
```

**Port:** 3000

**Dependencies to Review:**
- @floating-ui/react, @tanstack/react-query
- ansi-to-html, echarts, echarts-for-react
- lucide-react, react-datepicker, react-grid-layout
- react-router-dom, react-window, recharts, use-debounce

### Agent Service

**Tech Stack:**
- Language: Python
- Framework: None specified
- Key directories: `src/`, `tests/`

**How to Run:**
```bash
cd agent && python -m pytest
```

### Log Generator Service

**Tech Stack:**
- Language: JavaScript
- Key directories: Root level

**How to Run:**
```bash
cd log-generator && npm run start
```

### Test Data Generator Service

**Tech Stack:**
- Language: TypeScript
- Key directories: `src/`

**Entry Point:** `test-data-generator/src/index.ts`

**How to Run:**
```bash
cd test-data-generator && npm run dev
```

## Files to Modify

| File | Service | What to Change |
|------|---------|---------------|
| `api/package.json` | api | Remove unused dependencies identified during analysis |
| `ui/package.json` | ui | Remove unused dependencies identified during analysis |
| `agent/requirements.txt` | agent | Remove unused Python packages (if exists) |
| Various `.ts/.tsx/.py/.js` files | all | Delete unused files identified during discovery |

## Files to Reference

These files show patterns to follow:

| File | Pattern to Copy |
|------|----------------|
| `api/src/index.ts` | Main entry point - shows which routes/modules are actively imported |
| `ui/src/App.tsx` | Main React entry - shows which components are actively used |
| `api/src/routes/*.ts` | Route files - verify all exports are used |
| `docker-compose.yml` | Infrastructure - verify all services are still needed |

## Discovery Strategy

### Phase 1: Static Analysis

**For TypeScript/JavaScript (api, ui, log-generator, test-data-generator):**
```bash
# Find files with no imports (orphaned)
# Check for unused exports
# Identify commented-out code blocks
# Find console.log statements that should be removed
```

**For Python (agent):**
```bash
# Find unused imports
# Identify dead functions (never called)
# Check for __pycache__ or .pyc files to clean
```

### Phase 2: Dependency Analysis

**npm packages:**
```bash
# Check each dependency in package.json
# Verify it's actually imported somewhere
# Consider using: npx depcheck
```

**Python packages:**
```bash
# Check imports vs installed packages
# Consider using: pip-autoremove or pipreqs
```

### Phase 3: Build/Test Verification

After each removal:
- Run `npm run build` to verify TypeScript compilation
- Run `npm test` to verify no tests break
- Run `npm run dev` to verify runtime behavior

## Requirements

### Functional Requirements

1. **Preserve Working Functionality**
   - Description: All existing features must continue to work after cleanup
   - Acceptance: All existing tests pass, application runs without errors

2. **Remove Unused Files**
   - Description: Delete files that are not imported or referenced anywhere
   - Acceptance: No orphaned files remain in codebase

3. **Clean Dead Code**
   - Description: Remove unreachable code, commented blocks, debug statements
   - Acceptance: Code is cleaner with no obvious dead code paths

4. **Update Dependencies**
   - Description: Remove packages from package.json/requirements.txt that aren't used
   - Acceptance: `npm install` installs only necessary packages

### Edge Cases

1. **Dynamically imported modules** - Verify with runtime testing before removal
2. **Test-only utilities** - Keep files only used in tests if tests are valid
3. **Build-time only dependencies** - Don't remove devDependencies used in build
4. **Environment-specific code** - Verify code isn't used in production-only paths
5. **Lazy-loaded components** - Check for React.lazy() or dynamic imports

## Implementation Notes

### DO
- Always verify a file is truly unused before deletion (grep for imports/references)
- Run tests after each significant deletion
- Keep backup/version control before mass deletions
- Check for dynamic imports (`import()`, `require()` with variables)
- Review routes in `api/src/routes/` carefully - all 365 routes should be checked
- Use IDE "Find Usages" feature when available
- Remove in small batches, not all at once

### DON'T
- Delete configuration files without understanding their purpose
- Remove dependencies before verifying they're not used at runtime
- Delete files just because they "look" unused
- Remove type definition files (.d.ts) that may be needed
- Delete test files without checking if they test valid functionality
- Ignore webpack/vite config files that may include code
- Remove docker-related files without checking docker-compose.yml

## Development Environment

### Start Services

```bash
# Start all services with Docker
docker-compose up

# Or start individual services
cd api && npm run dev
cd ui && npm run dev
```

### Service URLs
- API: http://localhost:4000
- UI: http://localhost:3000
- ClickHouse: Docker container

### Required Environment Variables
- `TUNNEL_TOKEN`: Optional cloudflare tunnel token
- `OLLAMA_HOST`: Optional Ollama AI host

## Success Criteria

The task is complete when:

1. [ ] All unused files have been identified and removed
2. [ ] Dead code (unreachable functions, commented blocks) removed
3. [ ] Unused dependencies removed from package.json files
4. [ ] All existing tests still pass
5. [ ] Application builds without errors (`npm run build` succeeds)
6. [ ] Application runs without runtime errors
7. [ ] No console errors in browser for UI
8. [ ] Docker services still build and run correctly

## QA Acceptance Criteria

**CRITICAL**: These criteria must be verified by the QA Agent before sign-off.

### Unit Tests
| Test | File | What to Verify |
|------|------|----------------|
| API Tests | `api/src/**/*.test.ts` | All existing API tests pass |
| UI Tests | `ui/src/**/*.test.tsx` | All existing UI tests pass (if any) |
| Agent Tests | `agent/tests/` | All Python tests pass |

### Integration Tests
| Test | Services | What to Verify |
|------|----------|----------------|
| API Build | api | `npm run build` completes successfully |
| UI Build | ui | `npm run build` completes successfully |
| Docker Build | all | `docker-compose build` succeeds |

### End-to-End Tests
| Flow | Steps | Expected Outcome |
|------|-------|------------------|
| Full Stack | 1. Start all services 2. Access UI 3. Test core features | All features work as before cleanup |
| API Health | 1. Start API 2. Call /health | Returns 200 OK |
| UI Load | 1. Start UI 2. Load in browser | No console errors, renders correctly |

### Browser Verification (if frontend)
| Page/Component | URL | Checks |
|----------------|-----|--------|
| Main Dashboard | `http://localhost:3000/` | Loads without errors |
| All Routes | Various | Navigate through app without crashes |

### Verification Commands
| Check | Command | Expected |
|-------|---------|----------|
| API Build | `cd api && npm run build` | Exit code 0 |
| UI Build | `cd ui && npm run build` | Exit code 0 |
| API Tests | `cd api && npm test` | All tests pass |
| Docker | `docker-compose up --build` | All services start |

### QA Sign-off Requirements
- [ ] All unit tests pass
- [ ] All integration tests pass (builds succeed)
- [ ] All E2E tests pass (services start and function)
- [ ] Browser verification complete - no console errors
- [ ] No regressions in existing functionality
- [ ] Code follows established patterns
- [ ] No security vulnerabilities introduced
- [ ] Removed files were truly unused (verified through multiple methods)

## Risk Mitigation

### Before Starting
- [ ] Ensure git working tree is clean
- [ ] Create a backup branch: `git checkout -b backup/pre-cleanup`
- [ ] Document current test status

### During Cleanup
- [ ] Remove files in small batches
- [ ] Commit frequently with descriptive messages
- [ ] Test after each batch of removals

### If Issues Arise
- [ ] Revert to last known good commit
- [ ] Re-analyze the removed file for hidden dependencies
- [ ] Check for dynamic imports or lazy loading
