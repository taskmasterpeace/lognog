# LogViewer Component

A professional, feature-rich log viewer component for the LogNog UI, inspired by Splunk and Datadog.

## Features

### 1. Expandable Rows
- Click any row to expand and view all fields
- Collapsed view shows key fields: timestamp, severity, hostname, app_name, message
- Expanded view shows all fields organized into primary and additional sections

### 2. Severity Color Coding
- **Emergency/Alert/Error (0-3)**: Red background and badge
- **Critical (2)**: Orange background and badge
- **Warning (4)**: Yellow/Amber background and badge
- **Notice/Info (5-6)**: Blue background and badge
- **Debug (7)**: Gray background and badge

### 3. Virtualized List
- Custom lightweight virtualization for large datasets (1000+ logs)
- Only renders visible rows plus buffer for smooth scrolling
- Efficient memory usage with minimal overhead
- Smooth scrolling performance without external dependencies

### 4. Field Highlighting & Quick Actions
Hover over any field value to reveal quick action buttons:
- **Include** (green): Add field=value to search filter
- **Exclude** (red): Add field!=value to search filter
- **Copy** (gray): Copy value to clipboard

### 5. Search Term Highlighting
- Automatically highlights matching terms in yellow
- Supports quoted strings and field values from queries
- Case-insensitive matching

### 6. Timestamp Formatting
- Human-readable format: "Dec 11, 14:30:45"
- Hover to see relative time: "5m ago", "2h ago", etc.
- Automatic timezone handling

### 7. Loading & Empty States
- Professional loading spinner with message
- Empty state with helpful guidance
- Error state handling (handled by parent component)

## Usage

### Basic Example

```tsx
import LogViewer from '../components/LogViewer';

function MySearchPage() {
  const [logs, setLogs] = useState([]);

  const handleAddFilter = (field: string, value: string, exclude = false) => {
    console.log(`Filter: ${field}${exclude ? '!=' : '='}${value}`);
    // Add filter logic here
  };

  return (
    <div style={{ height: '600px' }}>
      <LogViewer
        logs={logs}
        onAddFilter={handleAddFilter}
        searchTerms={['error', 'warning']}
        isLoading={false}
      />
    </div>
  );
}
```

### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `logs` | `LogEntry[]` | Yes | Array of log objects to display |
| `onAddFilter` | `(field: string, value: string, exclude?: boolean) => void` | No | Callback when user adds a filter via quick actions |
| `searchTerms` | `string[]` | No | Array of terms to highlight in yellow |
| `isLoading` | `boolean` | No | Shows loading spinner when true |

### LogEntry Interface

```typescript
export interface LogEntry {
  timestamp: string;      // ISO 8601 timestamp
  hostname?: string;      // Server hostname
  app_name?: string;      // Application name
  severity?: number;      // 0-7 (syslog severity levels)
  message?: string;       // Log message
  [key: string]: any;     // Any additional fields
}
```

## Integration with SearchPage

The component is integrated into the SearchPage with a view toggle:

```tsx
// In SearchPage.tsx
const [viewMode, setViewMode] = useState<'enhanced' | 'table'>('enhanced');

{viewMode === 'enhanced' ? (
  <div className="card overflow-hidden" style={{ height: '600px' }}>
    <LogViewer
      logs={results}
      onAddFilter={handleAddFilter}
      searchTerms={extractSearchTerms(query)}
      isLoading={false}
    />
  </div>
) : (
  // Traditional table view
)}
```

## Styling

The component uses TailwindCSS with the following design system:

- **Colors**: Slate (neutral), Sky (primary), Red (errors), Amber (warnings)
- **Typography**: Inter for UI, Mono for code/logs
- **Spacing**: 4px base unit (Tailwind default)
- **Animations**: Smooth fade-in for quick actions popup

## Performance Considerations

1. **Virtualization**: Custom lightweight virtualization renders only visible rows (plus 10-row buffer)
2. **Memoization**: Visible log slice memoized with `useMemo` for efficiency
3. **Scroll Optimization**: Scroll handler updates viewport efficiently with minimal re-renders
4. **Lazy Expansion**: Only expands rows when user clicks (not auto-expanded)

## Accessibility

- Semantic HTML with proper ARIA labels
- Keyboard navigation support (expand/collapse with Enter)
- Color contrast ratios meet WCAG AA standards
- Screen reader friendly field labels

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## Dependencies

- `lucide-react@^0.312.0` - Icons
- TailwindCSS 3.4+ - Styling
- No external virtualization library needed (custom implementation)

## Examples

See `LogViewer.example.tsx` for a standalone demo with sample data.

## Future Enhancements

Possible additions:
- [ ] Multi-select rows for bulk actions
- [ ] Export selected logs (JSON/CSV)
- [ ] Column customization (show/hide fields)
- [ ] Field value statistics on hover
- [ ] Regex-based highlighting
- [ ] Dark mode support
- [ ] Keyboard shortcuts (j/k navigation)
