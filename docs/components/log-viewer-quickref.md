# LogViewer - Quick Reference

## Import
```tsx
import LogViewer from '../components/LogViewer';
```

## Basic Usage
```tsx
<LogViewer
  logs={logArray}
  onAddFilter={(field, value, exclude) => handleFilter(field, value, exclude)}
  searchTerms={['error', 'warning']}
  isLoading={false}
/>
```

## Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `logs` | `LogEntry[]` | ✅ Yes | - | Array of log objects |
| `onAddFilter` | `(field, value, exclude?) => void` | ❌ No | - | Filter callback |
| `searchTerms` | `string[]` | ❌ No | `[]` | Terms to highlight |
| `isLoading` | `boolean` | ❌ No | `false` | Show loading state |

## LogEntry Interface
```tsx
interface LogEntry {
  timestamp: string;      // Required
  hostname?: string;
  app_name?: string;
  severity?: number;      // 0-7 (syslog levels)
  message?: string;
  [key: string]: any;     // Any additional fields
}
```

## Severity Levels
| Level | Name | Color | Value |
|-------|------|-------|-------|
| Emergency | Emergency | Red | 0 |
| Alert | Alert | Red | 1 |
| Critical | Critical | Orange | 2 |
| Error | Error | Red | 3 |
| Warning | Warning | Yellow | 4 |
| Notice | Notice | Blue | 5 |
| Info | Info | Blue | 6 |
| Debug | Debug | Gray | 7 |

## Features Checklist

- ✅ **Expandable Rows**: Click chevron to expand
- ✅ **Severity Coloring**: Color-coded badges and backgrounds
- ✅ **Virtualization**: Custom efficient rendering
- ✅ **Quick Actions**: Include/Exclude/Copy on hover
- ✅ **Search Highlighting**: Yellow highlights for search terms
- ✅ **Timestamp Formatting**: Human-readable + relative time
- ✅ **Loading/Empty States**: Professional feedback

## Common Patterns

### With SearchPage Integration
```tsx
const [query, setQuery] = useState('search *');

const handleAddFilter = useCallback((field, value, exclude) => {
  const operator = exclude ? '!=' : '=';
  const newFilter = `${field}${operator}"${value}"`;

  if (query.includes('|')) {
    const parts = query.split('|');
    parts[0] = `${parts[0].trim()} ${newFilter}`;
    setQuery(parts.join(' |'));
  } else {
    setQuery(`${query.trim()} ${newFilter}`);
  }
}, [query]);

const extractSearchTerms = useCallback((query: string) => {
  const terms: string[] = [];
  const quotedMatches = query.match(/"([^"]+)"/g);
  if (quotedMatches) {
    quotedMatches.forEach(m => terms.push(m.replace(/"/g, '')));
  }
  return terms;
}, []);

<LogViewer
  logs={results}
  onAddFilter={handleAddFilter}
  searchTerms={extractSearchTerms(query)}
/>
```

### With Custom Height Container
```tsx
<div style={{ height: '600px' }}>
  <LogViewer logs={logs} />
</div>
```

### Loading State
```tsx
<LogViewer
  logs={[]}
  isLoading={searchMutation.isPending}
/>
```

### Empty State (Automatic)
```tsx
<LogViewer
  logs={[]}  // Empty array triggers empty state
  isLoading={false}
/>
```

## Styling Classes

### Severity Classes (in index.css)
```css
.severity-0 { /* Red - Emergency */ }
.severity-1 { /* Red - Alert */ }
.severity-2 { /* Orange - Critical */ }
.severity-3 { /* Red - Error */ }
.severity-4 { /* Amber - Warning */ }
.severity-5 { /* Blue - Notice */ }
.severity-6 { /* Sky - Info */ }
.severity-7 { /* Slate - Debug */ }
```

### Custom Scrollbar
```css
.scrollbar-thin::-webkit-scrollbar { width: 6px; }
.scrollbar-thin::-webkit-scrollbar-thumb { bg: slate-300; }
```

## Performance Tips

1. **Limit Logs**: Keep initial dataset to 1000-5000 entries
2. **Pagination**: Use server-side pagination for large datasets
3. **Memoization**: Ensure parent doesn't re-render unnecessarily
4. **Search Terms**: Limit to 5-10 terms max

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Click | Expand/collapse row |
| Tab | Navigate through rows |
| Enter | (Future) Expand focused row |

## Troubleshooting

### Logs not showing
- Check `logs` prop is array
- Verify `isLoading={false}`
- Check browser console for errors

### Quick actions not working
- Ensure `onAddFilter` callback is provided
- Check callback function is defined

### Highlighting not working
- Verify `searchTerms` is string array
- Check terms are not empty
- Terms are case-insensitive

### Performance issues
- Reduce log count (virtualization helps but has limits)
- Check for unnecessary parent re-renders
- Limit expanded rows (use "Collapse All")

## Example Log Data

```tsx
const sampleLogs: LogEntry[] = [
  {
    timestamp: new Date().toISOString(),
    hostname: 'web-server-01',
    app_name: 'nginx',
    severity: 6,
    message: 'GET /api/users 200 OK',
    method: 'GET',
    path: '/api/users',
    status_code: 200,
  },
  {
    timestamp: new Date().toISOString(),
    hostname: 'db-server-01',
    app_name: 'postgresql',
    severity: 3,
    message: 'Connection timeout',
    error: 'ETIMEDOUT',
  },
];
```

## Common Gotchas

1. **Container Height**: Component needs explicit height (uses flex-1)
2. **Timestamp Format**: Must be valid ISO 8601 string
3. **Severity Range**: Only 0-7 are styled (others default to gray)
4. **Filter Callback**: Optional but needed for quick actions

## Related Components

- `SearchPage.tsx` - Main integration point
- `FacetFilters.tsx` - Complementary filtering
- `TimePicker.tsx` - Time range selection

## Version
- Created: 2025-12-11
- Component Version: 1.0.0
- Dependencies: React 18+, TailwindCSS 3+, lucide-react

---

**Need more details?** See `LogViewer.README.md` for full documentation.
