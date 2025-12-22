# Specification: Implement Low-Code UI/UX Improvements

## Overview

This task implements 10 UI/UX improvements to the LogNog search interface to enhance user productivity and experience. The improvements span keyboard shortcuts, input enhancements, data export features, and visual feedback. After analysis, several features are already implemented, so this spec focuses on the **remaining 4 features** that need implementation: Query History Dropdown, Relative Time Tooltips, Copy as JSON, and Show Execution Time.

## Workflow Type

**Type**: feature

**Rationale**: These are additive UI enhancements that improve user experience without changing core functionality. All changes are low-risk, isolated to the frontend, and can be implemented incrementally.

## Task Scope

### Services Involved
- **ui** (primary) - React/TypeScript frontend where all UI improvements will be implemented
- **api** (integration) - May need to add execution time to search response

### Already Implemented (Verified in Codebase):
- [x] **Keyboard shortcut (Ctrl+Enter)** - Already in SearchPage.tsx lines 115-123
- [x] **Auto-focus search input** - Already using `autoFocus` attribute
- [x] **Clear search button** - X button already implemented in search bar
- [x] **Remember time range** - localStorage persistence in TimePicker.tsx
- [x] **Better empty state** - Implemented with suggestions in SearchPage.tsx lines 675-697
- [x] **Export to CSV** - `exportToCSV` function already exists in SearchPage.tsx

### This Task Will Implement:
- [ ] Query history dropdown (~30 lines) - Store and display recent queries
- [ ] Relative time tooltips (~5 lines) - Show human-readable timestamps on time presets
- [ ] Copy as JSON button (~10 lines) - Add clipboard copy for JSON results
- [ ] Show execution time (~10 lines) - Display query performance metrics

### Out of Scope:
- Backend query optimization
- Changes to the DSL parser
- New API endpoints (only adding field to existing response)
- Mobile responsiveness improvements

## Service Context

### UI Service (Primary)

**Tech Stack:**
- Language: TypeScript
- Framework: React with Vite
- Styling: Tailwind CSS
- State Management: @tanstack/react-query
- Key directories: `ui/src/pages/`, `ui/src/components/`

**Entry Point:** `ui/src/App.tsx`

**How to Run:**
```bash
cd ui && npm run dev
```

**Port:** 3000

### API Service (Integration)

**Tech Stack:**
- Language: TypeScript
- Framework: Express

**Entry Point:** `api/src/index.ts`

**How to Run:**
```bash
cd api && npm run dev
```

**Port:** 4000

## Files to Modify

| File | Service | What to Change |
|------|---------|---------------|
| `ui/src/pages/SearchPage.tsx` | ui | Add query history state, dropdown component, copy JSON button, execution time display |
| `ui/src/components/TimePicker.tsx` | ui | Add relative time tooltips to preset items |
| `ui/src/api/client.ts` | ui | Update SearchResult interface to include executionTime field |
| `api/src/routes/search.ts` | api | Add execution time measurement to query response |

## Files to Reference

These files show patterns to follow:

| File | Pattern to Copy |
|------|----------------|
| `ui/src/components/ui/Tooltip.tsx` | Tooltip component using @floating-ui/react |
| `ui/src/components/TimePicker.tsx` | localStorage persistence pattern, dropdown menu styling |
| `ui/src/pages/SearchPage.tsx` | Existing UI patterns, button styling, state management |

## Patterns to Follow

### Tooltip Pattern

From `ui/src/components/ui/Tooltip.tsx`:

```tsx
import { Tooltip } from '../components/ui/Tooltip';

<Tooltip content="5 minutes ago" placement="right">
  <button>Last 5 minutes</button>
</Tooltip>
```

**Key Points:**
- Use existing Tooltip component
- Supports placement prop: 'top', 'bottom', 'left', 'right'
- Content can be string or ReactNode

### localStorage Persistence Pattern

From `ui/src/components/TimePicker.tsx`:

```tsx
// Save to localStorage
localStorage.setItem('lognog_time_range', preset.value);

// Read from localStorage with fallback
const saved = localStorage.getItem('lognog_time_range');
if (saved) {
  const preset = TIME_PRESETS.find(p => p.value === saved);
  if (preset) return preset;
}
```

**Key Points:**
- Prefix keys with `lognog_` namespace
- Always provide fallback for missing data
- Parse JSON when storing objects

### Button Styling Pattern

From `ui/src/pages/SearchPage.tsx`:

```tsx
<button className="btn-ghost text-xs" title="Export to CSV">
  <Download className="w-4 h-4" />
  Export CSV
</button>
```

**Key Points:**
- Use `btn-ghost`, `btn-primary`, `btn-secondary` classes
- Include icon from lucide-react
- Add title attribute for accessibility

## Requirements

### Functional Requirements

1. **Query History Dropdown**
   - Description: Store up to 10 recent queries in localStorage and display in a dropdown
   - Acceptance: User can see and re-use previous queries from a dropdown menu
   - Implementation:
     - Store queries on search execution
     - Display History icon button next to search
     - Show dropdown with recent queries
     - Click to populate search input

2. **Relative Time Tooltips**
   - Description: Show human-readable relative time (e.g., "5 minutes ago") on time preset hover
   - Acceptance: Hovering over time presets shows relative time description
   - Implementation:
     - Wrap TIME_PRESETS items with Tooltip component
     - Calculate relative time from preset value

3. **Copy as JSON**
   - Description: Add button to copy search results as JSON to clipboard
   - Acceptance: Clicking "Copy JSON" copies formatted results to clipboard with toast notification
   - Implementation:
     - Add button next to "Export CSV" button
     - Use `navigator.clipboard.writeText()`
     - Show success feedback

4. **Show Execution Time**
   - Description: Display query execution time in milliseconds
   - Acceptance: After search, execution time appears in results header (e.g., "1,234 results in 42ms")
   - Implementation:
     - Add `executionTime` field to API response
     - Display in results stats area

### Edge Cases

1. **Empty query history** - Show "No recent queries" message in dropdown
2. **localStorage full** - Gracefully handle storage errors, limit to 10 items
3. **Clipboard API unavailable** - Show error message, fall back gracefully
4. **Missing execution time** - Don't display if API doesn't return value

## Implementation Notes

### DO
- Follow existing button styling patterns from SearchPage.tsx
- Use existing Tooltip component for relative time tooltips
- Use localStorage with `lognog_` prefix for query history
- Use lucide-react icons (History, Copy, Clock icons)
- Add proper TypeScript types for new state

### DON'T
- Create new components when inline implementation works
- Add external libraries for clipboard (native API available)
- Store sensitive data in query history
- Block the UI during clipboard operations

## Development Environment

### Start Services

```bash
# Terminal 1 - API
cd api && npm run dev

# Terminal 2 - UI
cd ui && npm run dev
```

### Service URLs
- UI: http://localhost:3000
- API: http://localhost:4000

### Required Environment Variables
- None required for these UI improvements

## Success Criteria

The task is complete when:

1. [ ] Query history dropdown shows recent queries and allows selection
2. [ ] Time picker presets show relative time tooltips on hover
3. [ ] Copy JSON button copies results to clipboard with confirmation
4. [ ] Execution time displays in results header
5. [ ] No console errors
6. [ ] Existing tests still pass
7. [ ] New functionality verified via browser

## QA Acceptance Criteria

**CRITICAL**: These criteria must be verified by the QA Agent before sign-off.

### Unit Tests
| Test | File | What to Verify |
|------|------|----------------|
| Query history localStorage | `ui/src/pages/SearchPage.test.tsx` | Queries saved/loaded from localStorage |
| Clipboard copy function | `ui/src/pages/SearchPage.test.tsx` | JSON copied correctly to clipboard |

### Integration Tests
| Test | Services | What to Verify |
|------|----------|----------------|
| Execution time in response | api ↔ ui | API returns executionTime, UI displays it |
| Search flow with history | ui | Execute search, verify history updated |

### End-to-End Tests
| Flow | Steps | Expected Outcome |
|------|-------|------------------|
| Query History | 1. Execute search 2. Open history dropdown 3. Click previous query | Search input populated with selected query |
| Copy JSON | 1. Execute search 2. Switch to JSON view 3. Click Copy JSON | JSON copied to clipboard, toast shown |
| Execution Time | 1. Execute search 2. View results | Execution time shown (e.g., "1,234 results in 42ms") |

### Browser Verification (if frontend)
| Page/Component | URL | Checks |
|----------------|-----|--------|
| Search Page | `http://localhost:3000/search` | All 4 features visible and functional |
| Time Picker | `http://localhost:3000/search` | Tooltips show on hover over time presets |

### Database Verification (if applicable)
N/A - These features use localStorage, not database

### QA Sign-off Requirements
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] All E2E tests pass
- [ ] Browser verification complete
- [ ] No regressions in existing functionality
- [ ] Code follows established patterns
- [ ] No security vulnerabilities introduced

## Detailed Implementation Plan

### Feature 1: Query History Dropdown (~30 lines)

**Location**: `ui/src/pages/SearchPage.tsx`

**State to add**:
```tsx
const [queryHistory, setQueryHistory] = useState<string[]>(() => {
  const saved = localStorage.getItem('lognog_query_history');
  return saved ? JSON.parse(saved) : [];
});
const [showHistory, setShowHistory] = useState(false);
```

**Save on search**:
```tsx
const handleSearch = useCallback(() => {
  // Add to history (dedupe, limit to 10)
  setQueryHistory(prev => {
    const updated = [query, ...prev.filter(q => q !== query)].slice(0, 10);
    localStorage.setItem('lognog_query_history', JSON.stringify(updated));
    return updated;
  });
  searchMutation.mutate();
}, [query, searchMutation]);
```

**UI**: Add History button and dropdown next to search input

### Feature 2: Relative Time Tooltips (~5 lines)

**Location**: `ui/src/components/TimePicker.tsx`

**Add helper function**:
```tsx
const getRelativeDescription = (value: string): string => {
  const match = value.match(/^-(\d+)([mhd])$/);
  if (!match) return '';
  const [, num, unit] = match;
  const units = { m: 'minute', h: 'hour', d: 'day' };
  return `${num} ${units[unit as keyof typeof units]}${Number(num) > 1 ? 's' : ''} ago`;
};
```

**Wrap preset buttons with Tooltip**

### Feature 3: Copy as JSON (~10 lines)

**Location**: `ui/src/pages/SearchPage.tsx`

**Add handler**:
```tsx
const copyAsJSON = useCallback(async (data: unknown[]) => {
  try {
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    // Show success toast
  } catch (err) {
    console.error('Failed to copy:', err);
  }
}, []);
```

**Add button next to Export CSV**

### Feature 4: Show Execution Time (~10 lines)

**API change** (`api/src/routes/search.ts`):
```typescript
const startTime = performance.now();
// ... execute query
const executionTime = Math.round(performance.now() - startTime);
return res.json({ query, sql, results, count, executionTime });
```

**UI type update** (`ui/src/api/client.ts`):
```typescript
export interface SearchResult {
  // ... existing fields
  executionTime?: number;
}
```

**Display in results**:
```tsx
<span className="text-slate-500">
  in {searchMutation.data?.executionTime}ms
</span>
```
